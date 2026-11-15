// Travel times for the commute criterion of the perfect job
// (services/commute.ts, PUT /perfect-job, the job match step) against a real
// MongoDB (MONGO_URL, local or from TEST_MONGO_URL) and fake geocoding, route
// and public transport services: nothing leaves the machine. Each test
// creates its own users and postings, named with a suffix unique to that
// test, and removes them after: tests pass in any order (--randomize).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import mongoose from 'mongoose';
import { env } from '../env';
import { createApp } from '../app';
import {
  CommuteCache,
  Domain,
  JobPosting,
  PerfectJob,
  RateLimitCounter,
  User,
  Workflow,
  WorkflowInstance
} from '../models/database';
import { logger } from '../services/logger';
import { enableRecruiterSpace } from '../services/recruiters';
import { commuteArrival } from '../services/transitous';
import { authCookie } from './helpers';
import { assertDisposableDatabase } from './testDatabase';

const testNames = () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const id = (name: string) => `cm-${name}-${suffix}`;
  return { suffix, id, email: (name: string) => `${id(name)}@example.com` };
};

let app: ReturnType<typeof createApp>;
let t: ReturnType<typeof testNames>;
let connected = false;

// ── Fake services ───────────────────────────────────────────

const HOME = { label: '1 Rue du Test 69001 Lyon', lat: 45.767, lon: 4.834 };
const OFFICE = { label: '9 Rue du Bureau 69003 Lyon', lat: 45.7601, lon: 4.8591 };
/** A key no response and no log line may hold */
const HERE_KEY = 'hEre-test-Key_0123456789abcdefghijklmnopqr';

interface Services {
  requests: { service: 'geocode' | 'route' | 'transit'; url: URL; headers: Headers; redirect: string | undefined }[];
  /** Where each query is found (by a word of the query); nothing: no such place */
  places: Record<string, { label: string; lat: number; lon: number }>;
  car: { duration: number; distance: number } | 'none' | 'down';
  foot: { duration: number; distance: number } | 'none' | 'down';
  /** Seconds of each journey found */
  transit: number[] | 'down';
  geocoding: 'up' | 'down';
  /** `unknown`: only towns are found (a query for a street gets a guess) */
  streets: 'known' | 'unknown';
}

let services: Services;

const installFakeServices = () => {
  services = {
    requests: [],
    places: { test: HOME, bureau: OFFICE },
    car: { duration: 20, distance: 9000 },
    foot: { duration: 60, distance: 5000 },
    transit: [1800, 1500],
    geocoding: 'up',
    streets: 'known'
  };
  spyOn(globalThis, 'fetch').mockImplementation((async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const record = (service: Services['requests'][number]['service']) =>
      services.requests.push({ service, url, headers: new Headers(init?.headers), redirect: init?.redirect });
    if (url.href.startsWith('https://data.geopf.fr/geocodage/search')) {
      record('geocode');
      if (services.geocoding === 'down') return new Response('Bad gateway', { status: 502 });
      const query = (url.searchParams.get('q') ?? '').toLowerCase();
      const town = url.searchParams.get('type') === 'municipality';
      const found =
        services.streets === 'known' || town
          ? Object.entries(services.places).find(([word]) => query.includes(word))?.[1]
          : undefined;
      const features = found
        ? [{ geometry: { coordinates: [found.lon, found.lat] }, properties: { label: found.label, score: 0.9 } }]
        : // The geocoder always has a guess: a place it does not know comes back as another, with a low score
          [{ geometry: { coordinates: [5.9, 45.7] }, properties: { label: 'Aix-les-Bains', score: 0.55 } }];
      return Response.json({ type: 'FeatureCollection', features });
    }
    if (url.href.startsWith('https://data.geopf.fr/navigation/itineraire')) {
      record('route');
      const answer = url.searchParams.get('profile') === 'car' ? services.car : services.foot;
      if (answer === 'down') return new Response('Unavailable', { status: 503 });
      if (answer === 'none') return Response.json({ error: { message: ' No path found ' } }, { status: 404 });
      return Response.json(answer);
    }
    if (url.href.startsWith('https://transit.router.hereapi.com/v8/routes')) {
      record('transit');
      if (services.transit === 'down') return new Response(JSON.stringify({ title: 'Unauthorized', status: 401 }), { status: 401 });
      // Each journey: a walk to the stop, a ride, a walk to the door, in the office's time
      const routes = services.transit.map((seconds, index) => ({
        id: `R${index}`,
        sections: [
          { type: 'pedestrian', departure: { time: '2026-11-17T07:00:00+01:00' }, arrival: { time: '2026-11-17T07:04:00+01:00' } },
          { type: 'transit', departure: { time: '2026-11-17T07:04:00+01:00' }, arrival: { time: '2026-11-17T07:20:00+01:00' } },
          {
            type: 'pedestrian',
            departure: { time: '2026-11-17T07:20:00+01:00' },
            // Told in another offset: an instant all the same
            arrival: { time: new Date(Date.parse('2026-11-17T07:00:00+01:00') + seconds * 1000).toISOString() }
          }
        ]
      }));
      return Response.json(routes.length > 0 ? { routes } : { routes, notices: [{ code: 'noCoverage', title: 'No coverage' }] });
    }
    if (url.href.startsWith('https://api.transitous.org/api/v1/plan')) {
      record('transit');
      if (services.transit === 'down') return new Response('Unavailable', { status: 503 });
      return Response.json({ itineraries: services.transit.map((duration) => ({ duration })), direct: [] });
    }
    throw new Error(`Unexpected request to ${url.origin}`);
  }) as typeof fetch);
};

const asked = (service?: Services['requests'][number]['service']) =>
  services.requests.filter((request) => !service || request.service === service).length;

// ── App, users, records ─────────────────────────────────────

const call = async (method: string, path: string, { body, cookie }: { body?: unknown; cookie?: string } = {}) => {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  const text = body === undefined ? undefined : JSON.stringify(body);
  if (text !== undefined) headers['Content-Type'] = 'application/json';
  const response = await app.fetch(new Request(`http://localhost${path}`, { method, headers, body: text }));
  const responseText = await response.text();
  return { status: response.status, text: responseText, json: <T = any>() => JSON.parse(responseText) as T };
};

interface TestUser {
  id: string;
  cookie: string;
  domain?: string;
}

const createUser = async (name: string, { recruiter = false, domain = false } = {}): Promise<TestUser> => {
  const user = await User.create({ email: t.email(name), googleId: t.id(`sub-${name}`), name });
  const id = user._id.toString();
  if (recruiter) expect(await enableRecruiterSpace(id)).toBe(true);
  let domainName: string | undefined;
  if (domain) {
    domainName = t.id(name);
    await Domain.create({ name: domainName, admin: user._id, experiences: [] });
  }
  return { id, cookie: await authCookie(id), domain: domainName };
};

/** A posting of `recruiter` at the office: on site unless `location` says otherwise */
const createJob = async (recruiter: TestUser, location: Record<string, unknown> = {}) => {
  const job = await JobPosting.create({
    recruiter: recruiter.id,
    title: 'Staff Engineer',
    description: 'Build things.',
    status: 'open',
    location: { country: 'FR', city: 'Lyon', postalCode: '69003', address: `9 rue du Bureau ${t.suffix}`, workMode: 'on_site', ...location },
    contract: { type: 'cdi' },
    workingTime: { arrangement: 'weekly_hours', hoursPerWeek: 35 },
    pay: { min: 50000, max: 60000, currency: 'EUR', period: 'year' }
  });
  return job._id.toString();
};

const commute = (fields: Record<string, unknown> = {}) => ({
  importance: 3,
  from: `1 rue du Test ${t.suffix}`,
  modes: ['car'],
  maxMinutesPerWeek: 300,
  ...fields
});

const savePerfectJob = (owner: TestUser, criteria: Record<string, unknown>) =>
  call('PUT', '/perfect-job', { body: { criteria }, cookie: owner.cookie });

/** An owner whose journey scores the job against `criteria`, details shown */
const ownerWith = async (criteria: Record<string, unknown>, minScore = 50) => {
  const owner = await createUser('owner', { domain: true });
  expect((await savePerfectJob(owner, criteria)).status).toBe(200);
  const steps = [
    { id: 'job', type: 'job', config: {} },
    { id: 'job-match', type: 'job-match', config: { minScore, showDetails: true } },
    { id: 'meeting', type: 'meeting', config: {} }
  ];
  expect((await call('PUT', '/workflow', { body: { steps }, cookie: owner.cookie })).status).toBe(200);
  return owner;
};

/** The recruiter picks `jobId` on the owner's journey: the job match step as they get it */
const matchOf = async (owner: TestUser, recruiter: TestUser, jobId: string) => {
  const picked = await call('POST', `/workflow/domains/${owner.domain}/steps/job`, {
    body: { input: { jobId } },
    cookie: recruiter.cookie
  });
  expect(picked.status).toBe(200);
  return picked.json().steps[1] as { status: string; view: { score: number; criteria: { criterion: string; outcome: string; notStated?: true }[] } };
};

const outcome = (step: Awaited<ReturnType<typeof matchOf>>) =>
  step.view.criteria.find((entry) => entry.criterion === 'commute');

const clearCommuteData = async () => {
  await CommuteCache.deleteMany({});
  await RateLimitCounter.deleteMany({ _id: { $regex: '^commute-calls:' } });
};

const saved = {
  enabled: env.commuteTimesEnabled,
  transit: env.COMMUTE_TRANSIT,
  contact: env.COMMUTE_CONTACT,
  hereKey: env.HERE_API_KEY,
  limit: env.COMMUTE_DAILY_LIMIT
};

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  await Promise.all([User.init(), Domain.init(), Workflow.init(), WorkflowInstance.init(), PerfectJob.init(), CommuteCache.init()]);
});

afterAll(async () => {
  if (connected) await mongoose.disconnect();
});

beforeEach(async () => {
  t = testNames();
  app = createApp();
  env.commuteTimesEnabled = true;
  env.COMMUTE_TRANSIT = undefined;
  env.COMMUTE_CONTACT = undefined;
  env.HERE_API_KEY = undefined;
  env.COMMUTE_DAILY_LIMIT = 500;
  installFakeServices();
  if (connected) await clearCommuteData();
});

afterEach(async () => {
  mock.restore();
  env.commuteTimesEnabled = saved.enabled;
  env.COMMUTE_TRANSIT = saved.transit;
  env.COMMUTE_CONTACT = saved.contact;
  env.HERE_API_KEY = saved.hereKey;
  env.COMMUTE_DAILY_LIMIT = saved.limit;
  if (!connected) return;
  await clearCommuteData();
  const users = (await User.find({ email: new RegExp(`-${t.suffix}@`) }, '_id').lean()).map((user) => user._id);
  await WorkflowInstance.deleteMany({ $or: [{ owner: { $in: users } }, { visitor: { $in: users } }] });
  await Workflow.deleteMany({ user: { $in: users } });
  await PerfectJob.deleteMany({ user: { $in: users } });
  await JobPosting.deleteMany({ recruiter: { $in: users } });
  await Domain.deleteMany({ admin: { $in: users } });
  await User.deleteMany({ _id: { $in: users } });
});

describe("the owner's address (PUT /perfect-job)", () => {
  it('says whether travel times are computed, and by which modes', async () => {
    const owner = await createUser('owner');
    expect((await call('GET', '/perfect-job', { cookie: owner.cookie })).json()).toEqual({
      criteria: {},
      commute: { enabled: true, modes: ['bike', 'car', 'walk'] }
    });
    env.COMMUTE_TRANSIT = 'transitous';
    env.COMMUTE_CONTACT = 'ops@example.com';
    expect((await call('GET', '/perfect-job', { cookie: owner.cookie })).json().commute).toEqual({
      enabled: true,
      modes: ['transit', 'bike', 'car', 'walk'],
      transit: 'transitous'
    });
    env.COMMUTE_TRANSIT = 'here';
    // Chosen without its key: no public transport
    expect((await call('GET', '/perfect-job', { cookie: owner.cookie })).json().commute.modes).toEqual(['bike', 'car', 'walk']);
    env.HERE_API_KEY = HERE_KEY;
    expect((await call('GET', '/perfect-job', { cookie: owner.cookie })).json().commute).toEqual({
      enabled: true,
      modes: ['transit', 'bike', 'car', 'walk'],
      transit: 'here'
    });
    env.commuteTimesEnabled = false;
    expect((await call('GET', '/perfect-job', { cookie: owner.cookie })).json().commute).toEqual({ enabled: false, modes: [] });
    expect(asked()).toBe(0);
  });

  it('finds the address when it is saved, once, whatever place the client sends', async () => {
    const owner = await createUser('owner');
    const first = await savePerfectJob(owner, { commute: commute({ place: { label: 'Elsewhere', lat: 1, lon: 2 } }) });
    expect(first.status).toBe(200);
    expect(first.json().criteria.commute).toEqual({ ...commute(), place: HOME });
    expect(asked('geocode')).toBe(1);
    expect(services.requests[0].url.searchParams.get('q')).toBe(`1 rue du Test ${t.suffix}`);
    // A redirect would carry the address elsewhere
    expect(services.requests[0].redirect).toBe('manual');
    expect((await call('GET', '/perfect-job', { cookie: owner.cookie })).json().criteria.commute.place).toEqual(HOME);

    // The same address: the place stored is kept, and nothing is asked
    expect((await savePerfectJob(owner, { commute: commute({ importance: 5, modes: ['bike'] }) })).json().criteria.commute).toEqual({
      ...commute({ importance: 5, modes: ['bike'] }),
      place: HOME
    });
    expect(asked('geocode')).toBe(1);

    // Another address: looked up again
    services.places.gare = { label: 'Gare Part-Dieu', lat: 45.7606, lon: 4.8599 };
    const moved = await savePerfectJob(owner, { commute: commute({ from: 'Gare Part-Dieu' }) });
    expect(moved.json().criteria.commute.place.label).toBe('Gare Part-Dieu');
    expect(asked('geocode')).toBe(2);
    // The owner's place is theirs alone: it is in no cache
    expect(await CommuteCache.countDocuments({})).toBe(0);
  });

  it('refuses an address it cannot find, and says when the lookup did not answer', async () => {
    const owner = await createUser('owner');
    expect((await savePerfectJob(owner, { commute: commute() })).status).toBe(200);

    const unknown = await savePerfectJob(owner, { commute: commute({ from: 'Nowhere at all' }) });
    expect({ status: unknown.status, body: unknown.json() }).toEqual({
      status: 422,
      body: {
        type: 'validation',
        on: 'body',
        property: 'criteria.commute.from',
        message: 'This address was not found. Check it, or give a town or a place nearby.'
      }
    });
    services.geocoding = 'down';
    const down = await savePerfectJob(owner, { commute: commute({ from: 'Somewhere else' }) });
    expect({ status: down.status, text: down.text }).toEqual({
      status: 503,
      text: 'The address could not be looked up right now. Try again in a moment.'
    });
    // What was saved before is kept
    expect((await call('GET', '/perfect-job', { cookie: owner.cookie })).json().criteria.commute.place).toEqual(HOME);

    for (const [field, value] of [
      ['from', '   '],
      ['from', 'x'.repeat(201)],
      ['modes', []],
      ['modes', ['car', 'plane']],
      ['maxMinutesPerWeek', 5],
      ['maxMinutesPerWeek', 3001],
      ['maxMinutesPerWeek', '300']
    ] as const) {
      const refused = await savePerfectJob(owner, { commute: commute({ [field]: value }) });
      expect({ field, value, status: refused.status, property: refused.json().property }).toEqual({
        field,
        value,
        status: 422,
        property: `criteria.commute.${field}`
      });
    }
  });

  it('takes no new address while travel times are off, and keeps the one it has', async () => {
    const owner = await createUser('owner');
    expect((await savePerfectJob(owner, { commute: commute() })).status).toBe(200);
    env.commuteTimesEnabled = false;
    const before = asked();

    expect((await savePerfectJob(owner, { commute: commute({ importance: 4 }), travel: { importance: 2, max: 'none' } })).status).toBe(200);
    const refused = await savePerfectJob(owner, { commute: commute({ from: 'Gare Part-Dieu' }) });
    expect({ status: refused.status, body: refused.json() }).toMatchObject({
      status: 422,
      body: { property: 'criteria.commute.from', message: 'Travel times are not available on this site.' }
    });
    expect(asked()).toBe(before);
  });
});

describe('the commute in the score of a job', () => {
  it('counts the way there and back for each day at the office, against the time accepted a week', async () => {
    // 300 minutes a week accepted; 20 minutes by car, one way
    const owner = await ownerWith({ commute: commute() });
    const recruiter = await createUser('recruiter', { recruiter: true });

    // On site: 5 days, 200 minutes a week
    const near = await matchOf(owner, recruiter, await createJob(recruiter));
    expect({ status: near.status, score: near.view.score, commute: outcome(near) }).toEqual({
      status: 'succeeded',
      score: 100,
      commute: { criterion: 'commute', outcome: 'match' }
    });
    const route = services.requests.find((request) => request.service === 'route')!;
    expect(route.url.searchParams.get('profile')).toBe('car');
    expect(route.url.searchParams.get('start')).toBe(`${HOME.lon},${HOME.lat}`);
    expect(route.url.searchParams.get('end')).toBe(`${OFFICE.lon},${OFFICE.lat}`);
    expect(route.redirect).toBe('manual');

    // Twice as far: 400 minutes a week on site, a third of the way to "50% over"
    services.places.loin = { label: 'Far away', lat: 45.9, lon: 4.9 };
    services.car = { duration: 40, distance: 30000 };
    const far = await matchOf(owner, recruiter, await createJob(recruiter, { address: `2 rue du Loin ${t.suffix}` }));
    expect({ score: far.view.score, commute: outcome(far) }).toEqual({
      score: 33,
      commute: { criterion: 'commute', outcome: 'partial' }
    });
    // The same office once a week (4 remote days): 80 minutes a week
    const onceAWeek = await matchOf(
      owner,
      recruiter,
      await createJob(recruiter, { address: `2 rue du Loin ${t.suffix}`, workMode: 'hybrid', remoteDaysPerWeek: 4 })
    );
    expect(onceAWeek.view.score).toBe(100);
    // A hybrid job that does not say how many days: 4 at the office, 320 minutes
    const vague = await matchOf(owner, recruiter, await createJob(recruiter, { address: `2 rue du Loin ${t.suffix}`, workMode: 'hybrid' }));
    expect(vague.view.score).toBe(87);

    // 90 minutes each way: far over, whatever the rest
    services.places.bout = { label: 'The end of the world', lat: 46.5, lon: 5.5 };
    services.car = { duration: 90, distance: 120000 };
    const tooFar = await matchOf(owner, recruiter, await createJob(recruiter, { address: `3 rue du Bout ${t.suffix}` }));
    expect({ status: tooFar.status, score: tooFar.view.score, commute: outcome(tooFar) }).toEqual({
      status: 'failed',
      score: 0,
      commute: { criterion: 'commute', outcome: 'miss' }
    });
  });

  it('has no commute for a fully remote job, and asks nothing', async () => {
    const owner = await ownerWith({ commute: commute() });
    const recruiter = await createUser('recruiter', { recruiter: true });
    const before = asked();
    const remote = await matchOf(owner, recruiter, await createJob(recruiter, { workMode: 'remote', city: undefined, address: undefined }));
    expect({ score: remote.view.score, commute: outcome(remote) }).toEqual({
      score: 100,
      commute: { criterion: 'commute', outcome: 'match' }
    });
    expect(asked()).toBe(before);
  });

  it('takes the fastest of the modes the owner accepts', async () => {
    // On foot: 60 minutes, 5 km (20 minutes by bike at 15 km/h); by car: 45
    services.car = { duration: 45, distance: 20000 };
    const owner = await ownerWith({ commute: commute({ modes: ['car', 'walk'], maxMinutesPerWeek: 450 }) });
    const recruiter = await createUser('recruiter', { recruiter: true });
    const jobId = await createJob(recruiter);
    // 45 minutes: 450 a week
    expect((await matchOf(owner, recruiter, jobId)).view.score).toBe(100);

    expect((await savePerfectJob(owner, { commute: commute({ modes: ['walk'], maxMinutesPerWeek: 450 }) })).status).toBe(200);
    // 60 minutes: 600 a week, 150 over, of the 225 that make it not match at all
    expect((await matchOf(owner, recruiter, jobId)).view.score).toBe(33);

    expect((await savePerfectJob(owner, { commute: commute({ modes: ['walk', 'bike'], maxMinutesPerWeek: 200 }) })).status).toBe(200);
    // 20 minutes by bike: 200 a week
    expect((await matchOf(owner, recruiter, jobId)).view.score).toBe(100);

    // No road by car: the other mode is the way
    services.car = 'none';
    await clearCommuteData();
    expect((await savePerfectJob(owner, { commute: commute({ modes: ['car', 'bike'], maxMinutesPerWeek: 200 }) })).status).toBe(200);
    expect((await matchOf(owner, recruiter, jobId)).view.score).toBe(100);
    // No way at all: it does not match
    services.foot = 'none';
    await clearCommuteData();
    expect(outcome(await matchOf(owner, recruiter, jobId))).toEqual({ criterion: 'commute', outcome: 'miss' });
  });

  it('asks for public transport only when the site has it, and says who asks', async () => {
    const owner = await ownerWith({ commute: commute({ modes: ['transit'], maxMinutesPerWeek: 250 }) });
    const recruiter = await createUser('recruiter', { recruiter: true });
    const jobId = await createJob(recruiter);

    // Not offered: the criterion has no mode left, and does not count
    const without = await matchOf(owner, recruiter, jobId);
    expect({ score: without.view.score, commute: outcome(without) }).toEqual({
      score: 100,
      commute: { criterion: 'commute', outcome: 'unknown' }
    });
    expect(asked('transit')).toBe(0);

    env.COMMUTE_TRANSIT = 'transitous';
    env.COMMUTE_CONTACT = 'https://portfolio.example/contact';
    // The shortest journey: 25 minutes, 250 a week
    const withTransit = await matchOf(owner, recruiter, jobId);
    expect({ score: withTransit.view.score, commute: outcome(withTransit) }).toEqual({
      score: 100,
      commute: { criterion: 'commute', outcome: 'match' }
    });
    const plan = services.requests.find((request) => request.service === 'transit')!;
    expect(plan.headers.get('user-agent')).toBe('portfolio-commute/1 (https://portfolio.example/contact)');
    expect(plan.url.searchParams.get('fromPlace')).toBe(`${HOME.lat},${HOME.lon}`);
    expect(plan.url.searchParams.get('toPlace')).toBe(`${OFFICE.lat},${OFFICE.lon}`);
    expect(plan.url.searchParams.get('arriveBy')).toBe('true');
    expect(plan.url.searchParams.get('time')).toBe(commuteArrival().toISOString());
    expect(plan.redirect).toBe('manual');

    // No journey found, and an hour on foot: walking all the way is the way
    services.transit = [];
    await clearCommuteData();
    expect(outcome(await matchOf(owner, recruiter, jobId))).toEqual({ criterion: 'commute', outcome: 'miss' });
  });

  it('asks HERE for public transport with the key of the site, which nothing it answers or logs holds', async () => {
    const lines: string[] = [];
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      spyOn(logger, level).mockImplementation((text, attributes) => {
        lines.push(`${text} ${JSON.stringify(attributes ?? {})}`);
      });
    }
    env.COMMUTE_TRANSIT = 'here';
    env.HERE_API_KEY = HERE_KEY;
    const owner = await ownerWith({ commute: commute({ modes: ['transit'], maxMinutesPerWeek: 250 }) });
    const recruiter = await createUser('recruiter', { recruiter: true });
    const jobId = await createJob(recruiter);

    // The shortest journey, door to door: 25 minutes, 250 a week
    const found = await matchOf(owner, recruiter, jobId);
    expect({ score: found.view.score, commute: outcome(found) }).toEqual({
      score: 100,
      commute: { criterion: 'commute', outcome: 'match' }
    });
    // The service to credit: the site's, told with the commute
    expect((found.view as { transit?: string }).transit).toBe('here');
    const routes = services.requests.find((request) => request.service === 'transit')!;
    expect(routes.url.origin + routes.url.pathname).toBe('https://transit.router.hereapi.com/v8/routes');
    expect(routes.url.searchParams.get('origin')).toBe(`${HOME.lat},${HOME.lon}`);
    expect(routes.url.searchParams.get('destination')).toBe(`${OFFICE.lat},${OFFICE.lon}`);
    // 08:30 at the office, on the Tuesday asked of any service
    expect(routes.url.searchParams.get('arrivalTime')).toBe(`${commuteArrival().toISOString().slice(0, 10)}T08:30:00`);
    expect(routes.url.searchParams.get('apiKey')).toBe(HERE_KEY);
    expect(routes.redirect).toBe('manual');
    expect(asked('transit')).toBe(1);

    // No journey there, and an hour on foot: walking all the way is the way
    services.transit = [];
    await clearCommuteData();
    expect(outcome(await matchOf(owner, recruiter, jobId))).toEqual({ criterion: 'commute', outcome: 'miss' });

    // A key HERE refuses: the commute does not count, and the log says the status, not the key
    services.transit = 'down';
    await clearCommuteData();
    const refused = await matchOf(owner, recruiter, jobId);
    expect(outcome(refused)).toEqual({ criterion: 'commute', outcome: 'unknown' });
    expect(lines.filter((line) => line.includes('Travel times: no answer'))).toEqual([
      'Travel times: no answer {"kind":"transit","reason":"GeoServiceError","detail":"transit answered 401"}'
    ]);
    const told = [JSON.stringify(found), JSON.stringify(refused), ...lines].join('\n');
    expect(told).not.toContain(HERE_KEY);
    expect(JSON.stringify(await CommuteCache.find({}).lean())).not.toContain(HERE_KEY);
  });

  it('arrives on a Tuesday morning at least two days away', () => {
    for (const today of ['2026-11-14T16:00:00Z', '2026-11-16T23:59:00Z', '2026-11-17T00:00:00Z', '2026-12-30T10:00:00Z']) {
      const arrival = commuteArrival(new Date(today));
      expect(arrival.getUTCDay()).toBe(2);
      expect(arrival.toISOString().slice(11)).toBe('07:30:00.000Z');
      const days = (arrival.getTime() - new Date(today).getTime()) / 86_400_000;
      expect(days).toBeGreaterThan(1);
      expect(days).toBeLessThan(9);
    }
    expect(commuteArrival(new Date('2026-11-14T16:00:00Z')).toISOString()).toBe('2026-11-17T07:30:00.000Z');
  });

  it('asks each question once', async () => {
    const owner = await ownerWith({ commute: commute({ modes: ['car', 'bike'] }) });
    const recruiter = await createUser('recruiter', { recruiter: true });
    const jobId = await createJob(recruiter);
    expect((await matchOf(owner, recruiter, jobId)).view.score).toBe(100);
    // The office's place, the way by car, the way on foot
    const first = asked();
    expect({ geocode: asked('geocode'), route: asked('route') }).toEqual({ geocode: 2, route: 2 });

    for (let read = 0; read < 3; read++) {
      const journey = await call('GET', `/workflow/domains/${owner.domain}`, { cookie: recruiter.cookie });
      expect(journey.json().steps[1].view.score).toBe(100);
    }
    expect(asked()).toBe(first);
    // Another posting at the same address: its place is known, and so are the ways
    expect((await matchOf(owner, recruiter, await createJob(recruiter))).view.score).toBe(100);
    expect(asked()).toBe(first);
  });

  it('leaves the commute out of the score while a service does not answer, without asking again at each read', async () => {
    services.car = 'down';
    const owner = await ownerWith({
      commute: commute({ dealBreaker: true }),
      contractTypes: { importance: 1, types: ['cdi'] }
    });
    const recruiter = await createUser('recruiter', { recruiter: true });
    const jobId = await createJob(recruiter);

    const unknown = await matchOf(owner, recruiter, jobId);
    // Not a miss, and not a deal-breaker missed: the contract alone is scored
    expect({ status: unknown.status, score: unknown.view.score, commute: outcome(unknown) }).toEqual({
      status: 'succeeded',
      score: 100,
      commute: { criterion: 'commute', outcome: 'unknown' }
    });
    const routes = asked('route');
    expect((await matchOf(owner, recruiter, jobId)).view.score).toBe(100);
    expect(asked('route')).toBe(routes);

    // Answering again, once the failure is forgotten
    services.car = { duration: 90, distance: 100000 };
    await clearCommuteData();
    expect(await matchOf(owner, recruiter, jobId)).toMatchObject({ status: 'failed', view: { score: 0 } });
  });

  it('stops asking once the site asked enough for the day', async () => {
    env.COMMUTE_DAILY_LIMIT = 2;
    const owner = await ownerWith({ commute: commute() });
    const recruiter = await createUser('recruiter', { recruiter: true });
    // Asked so far: the owner's address. The office's place is the second; the way would be the third
    const limited = await matchOf(owner, recruiter, await createJob(recruiter));
    expect(outcome(limited)).toEqual({ criterion: 'commute', outcome: 'unknown' });
    expect({ geocode: asked('geocode'), route: asked('route') }).toEqual({ geocode: 2, route: 0 });
    // Not remembered as a failure: asked the next day
    await RateLimitCounter.deleteMany({ _id: { $regex: '^commute-calls:' } });
    expect(outcome(await matchOf(owner, recruiter, await createJob(recruiter)))).toEqual({ criterion: 'commute', outcome: 'match' });
  });

  it('counts a job whose address cannot be found like one that does not say where it is', async () => {
    const owner = await ownerWith({ commute: commute() });
    const recruiter = await createUser('recruiter', { recruiter: true });
    const lost = await matchOf(owner, recruiter, await createJob(recruiter, { address: undefined, postalCode: undefined, city: 'Somewhere nice' }));
    expect({ status: lost.status, score: lost.view.score, commute: outcome(lost) }).toEqual({
      status: 'failed',
      score: 0,
      commute: { criterion: 'commute', outcome: 'miss', notStated: true }
    });
    // A posting that names a town and no street is looked for among towns
    const town = services.requests.filter((request) => request.service === 'geocode').at(-1)!;
    expect(town.url.searchParams.get('type')).toBe('municipality');
    expect(asked('route')).toBe(0);
  });

  it('goes to the town of a posting whose street is not found', async () => {
    const owner = await ownerWith({ commute: commute() });
    const recruiter = await createUser('recruiter', { recruiter: true });
    services.places.villeurbanne = { label: 'Villeurbanne', lat: 45.7667, lon: 4.8833 };
    const before = asked('geocode');
    const job = await createJob(recruiter, { address: `Tour Inconnue ${t.suffix}`, postalCode: '69100', city: 'Villeurbanne' });
    services.streets = 'unknown';
    const found = await matchOf(owner, recruiter, job);
    expect(outcome(found)).toEqual({ criterion: 'commute', outcome: 'match' });
    const lookups = services.requests.filter((request) => request.service === 'geocode').slice(before);
    expect(lookups.map((request) => [request.url.searchParams.get('q'), request.url.searchParams.get('type')])).toEqual([
      [`Tour Inconnue ${t.suffix} 69100 Villeurbanne`, null],
      ['69100 Villeurbanne', 'municipality']
    ]);
    expect(lookups[1].url.searchParams.get('postcode')).toBe('69100');
    const route = services.requests.find((request) => request.service === 'route')!;
    expect(route.url.searchParams.get('end')).toBe('4.8833,45.7667');
  });

  it('does not count while travel times are off, and tells the recruiter nothing of where the owner is', async () => {
    const owner = await ownerWith({ commute: commute(), contractTypes: { importance: 1, types: ['freelance'] } }, 0);
    const recruiter = await createUser('recruiter', { recruiter: true });
    const jobId = await createJob(recruiter);
    const on = await matchOf(owner, recruiter, jobId);
    expect(on.view.score).toBe(75);

    env.commuteTimesEnabled = false;
    const before = asked();
    const off = await call('GET', `/workflow/domains/${owner.domain}`, { cookie: recruiter.cookie });
    expect(off.json().steps[1].view).toMatchObject({
      score: 0,
      criteria: [
        { criterion: 'commute', outcome: 'unknown' },
        { criterion: 'contractTypes', outcome: 'miss' }
      ]
    });
    expect(asked()).toBe(before);
    for (const text of [JSON.stringify(on), off.text]) {
      expect(text).not.toContain('Rue du Test');
      expect(text).not.toContain(String(HOME.lat));
      expect(text).not.toContain('place');
      expect(text).not.toContain('maxMinutesPerWeek');
    }
  });
});
