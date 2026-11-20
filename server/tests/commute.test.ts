// Travel times for the commute criterion of the perfect job
// (services/commute.ts, PUT /perfect-job, the job match step, and the reads of
// matching: from the cache only, and warm-ups in the background) against a
// real MongoDB (MONGO_URL, local or from TEST_MONGO_URL) and fake geocoding,
// route and public transport services: nothing leaves the machine. Each test
// creates its own users and postings, named with a suffix unique to that
// test, and removes them after: tests pass in any order (--randomize).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import mongoose from 'mongoose';
import { discoveryConsentCutoff } from 'portfolio-common';
import { env } from '../env';
import { createApp } from '../app';
import {
  CommuteCache,
  DiscoveryProfile,
  Domain,
  JobPosting,
  PerfectJob,
  RateLimitCounter,
  User,
  Workflow,
  WorkflowInstance
} from '../models/database';
import {
  cachedCommuteContext,
  commuteAvailability,
  commuteContext,
  commuteModes,
  commuteWarmUpPossible,
  commuteWarmUps,
  DISCOVERY_COMMUTE_CALLS,
  discoveryCommuteKey,
  forgetDroppedWarmUps,
  MATCHING_COMMUTE_SHARE,
  warmCommute,
  warmOffice
} from '../services/commute';
import type { CommuteReading } from '../services/commute';
import { logger } from '../services/logger';
import { peekRateLimit, takeRateLimit } from '../services/rateLimit';
import { commuteArrival } from '../services/transitous';
import { jobSharesKey } from '../services/workflowSteps/job';
import { authCookie, openRecruiterSpace } from './helpers';
import { assertDisposableDatabase } from './testDatabase';

const testNames = () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const id = (name: string) => `cm-${name}-${suffix}`;
  return { suffix, id, email: (name: string) => `${id(name)}@example.com` };
};

let app: ReturnType<typeof createApp>;
let t: ReturnType<typeof testNames>;
let connected = false;
/** The candidates of matching a test stored (their perfect job and discovery), removed after it */
let candidates: string[] = [];

// ── Fake services ───────────────────────────────────────────

const HOME = { label: '1 Rue du Test 69001 Lyon', lat: 45.767, lon: 4.834 };
const OFFICE = { label: '9 Rue du Bureau 69003 Lyon', lat: 45.7601, lon: 4.8591 };
/** A key no response and no log line may hold */
const HERE_KEY = 'hEre-test-Key_0123456789abcdefghijklmnopqr';

interface Services {
  /** Each request, and when it was sent (performance.now()) */
  requests: { service: 'geocode' | 'route' | 'transit'; url: URL; headers: Headers; redirect: string | undefined; at: number }[];
  /** When each answer was given, in the order given */
  answeredAt: number[];
  /** Where each query is found (by a word of the query); nothing: no such place */
  places: Record<string, { label: string; lat: number; lon: number }>;
  car: { duration: number; distance: number } | 'none' | 'down';
  foot: { duration: number; distance: number } | 'none' | 'down';
  /** Seconds of each journey found */
  transit: number[] | 'down' | 'untimed';
  geocoding: 'up' | 'down';
  /** `unknown`: only towns are found (a query for a street gets a guess) */
  streets: 'known' | 'unknown';
  /** How long each answer takes, in milliseconds */
  delayMs: number;
  /** The most requests that were on their way at once */
  mostAtOnce: number;
}

let services: Services;

const installFakeServices = () => {
  services = {
    requests: [],
    answeredAt: [],
    places: { test: HOME, bureau: OFFICE },
    car: { duration: 20, distance: 9000 },
    foot: { duration: 60, distance: 5000 },
    transit: [1800, 1500],
    geocoding: 'up',
    streets: 'known',
    delayMs: 0,
    mostAtOnce: 0
  };
  let atOnce = 0;
  const answer = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const record = (service: Services['requests'][number]['service']) =>
      services.requests.push({ service, url, headers: new Headers(init?.headers), redirect: init?.redirect, at: performance.now() });
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
      // Journeys whose times are missing (HERE's schema does not promise them)
      if (services.transit === 'untimed') {
        return Response.json({ routes: [{ id: 'R0', sections: [{ type: 'transit', departure: { place: {} }, arrival: { place: {} } }] }] });
      }
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
      if (services.transit === 'untimed') return Response.json({ itineraries: [{}], direct: [] });
      return Response.json({ itineraries: services.transit.map((duration) => ({ duration })), direct: [] });
    }
    throw new Error(`Unexpected request to ${url.origin}`);
  };
  spyOn(globalThis, 'fetch').mockImplementation((async (input: string | URL | Request, init?: RequestInit) => {
    services.mostAtOnce = Math.max(services.mostAtOnce, ++atOnce);
    try {
      if (services.delayMs > 0) await Bun.sleep(services.delayMs);
      return await answer(input, init);
    } finally {
      atOnce--;
      services.answeredAt.push(performance.now());
    }
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
  if (recruiter) expect(await openRecruiterSpace(id)).toBe(true);
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

type MatchStep = { status: string; view: { score: number; criteria: { criterion: string; outcome: string; notStated?: true }[] } };

/**
 * The recruiter shares `jobId` on the owner's journey: the job match step as they get it. Each
 * share of another job is counted (JOB_SHARES_PER_DAY a day per owner and recruiter): to score the
 * same job again, read it again (rescored)
 */
const matchOf = async (owner: TestUser, recruiter: TestUser, jobId: string) => {
  const picked = await call('POST', `/workflow/domains/${owner.domain}/steps/job`, {
    body: { input: { jobId } },
    cookie: recruiter.cookie
  });
  // The answer's text in the failure: a 429 says the day's shares are taken
  expect({ status: picked.status, text: picked.status === 200 ? '' : picked.text }).toEqual({ status: 200, text: '' });
  return picked.json().steps[1] as MatchStep;
};

/** The job match step as the recruiter reads it again: the version shared, scored again at each read */
const rescored = async (owner: TestUser, recruiter: TestUser) => {
  const journey = await call('GET', `/workflow/domains/${owner.domain}`, { cookie: recruiter.cookie });
  expect(journey.status).toBe(200);
  return journey.json().steps[1] as MatchStep;
};

const outcome = (step: MatchStep) =>
  step.view.criteria.find((entry) => entry.criterion === 'commute');

const clearCommuteData = async () => {
  await CommuteCache.deleteMany({});
  // The site's requests of the day, what the reads of each account had asked in the background, and
  // what all warm-ups had (matching's share of the day)
  await RateLimitCounter.deleteMany({ _id: { $regex: '^(commute-calls|discovery-commute|discovery-commute-site):' } });
};

const saved = {
  enabled: env.commuteTimesEnabled,
  transit: env.COMMUTE_TRANSIT,
  contact: env.COMMUTE_CONTACT,
  hereKey: env.HERE_API_KEY,
  limit: env.COMMUTE_DAILY_LIMIT,
  warmUps: { ...commuteWarmUps }
};

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  await Promise.all([
    User.init(),
    Domain.init(),
    Workflow.init(),
    WorkflowInstance.init(),
    PerfectJob.init(),
    CommuteCache.init(),
    DiscoveryProfile.init()
  ]);
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
  // No pause between warm-ups: the tests wait for each; and each warm-up dropped said
  commuteWarmUps.pauseMs = 0;
  commuteWarmUps.dropLogMs = 0;
  forgetDroppedWarmUps();
  candidates = [];
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
  Object.assign(commuteWarmUps, saved.warmUps);
  forgetDroppedWarmUps();
  if (!connected) return;
  await clearCommuteData();
  await Promise.all([
    PerfectJob.deleteMany({ user: { $in: candidates } }),
    DiscoveryProfile.deleteMany({ user: { $in: candidates } })
  ]);
  const users = (await User.find({ email: new RegExp(`-${t.suffix}@`) }, '_id').lean()).map((user) => user._id);
  // The jobs shared counted between them (keyed by a hash of the owner and the recruiter)
  const ids = users.map(String);
  const shareKeys = ids.flatMap((ownerId) => ids.map((visitorId) => jobSharesKey(ownerId, visitorId)));
  if (shareKeys.length) await RateLimitCounter.deleteMany({ _id: new RegExp(`^(${shareKeys.join('|')}):`) });
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
    expect((await rescored(owner, recruiter)).view.score).toBe(33);

    expect((await savePerfectJob(owner, { commute: commute({ modes: ['walk', 'bike'], maxMinutesPerWeek: 200 }) })).status).toBe(200);
    // 20 minutes by bike: 200 a week
    expect((await rescored(owner, recruiter)).view.score).toBe(100);

    // No road by car: the other mode is the way
    services.car = 'none';
    await clearCommuteData();
    expect((await savePerfectJob(owner, { commute: commute({ modes: ['car', 'bike'], maxMinutesPerWeek: 200 }) })).status).toBe(200);
    expect((await rescored(owner, recruiter)).view.score).toBe(100);
    // No way at all: it does not match
    services.foot = 'none';
    await clearCommuteData();
    expect(outcome(await rescored(owner, recruiter))).toEqual({ criterion: 'commute', outcome: 'miss' });
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
    const withTransit = await rescored(owner, recruiter);
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
    expect(outcome(await rescored(owner, recruiter))).toEqual({ criterion: 'commute', outcome: 'miss' });
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
    expect(outcome(await rescored(owner, recruiter))).toEqual({ criterion: 'commute', outcome: 'miss' });

    // A key HERE refuses: the commute does not count, and the log says the status, not the key
    services.transit = 'down';
    await clearCommuteData();
    const refused = await rescored(owner, recruiter);
    expect(outcome(refused)).toEqual({ criterion: 'commute', outcome: 'unknown' });
    expect(lines.filter((line) => line.includes('Travel times: no answer'))).toEqual([
      'Travel times: no answer {"kind":"transit","reason":"GeoServiceError","detail":"transit answered 401"}'
    ]);
    const told = [JSON.stringify(found), JSON.stringify(refused), ...lines].join('\n');
    expect(told).not.toContain(HERE_KEY);
    expect(JSON.stringify(await CommuteCache.find({}).lean())).not.toContain(HERE_KEY);
  });

  it('takes journeys HERE cannot time for a failure, asked again later, not for "no journey" kept 30 days', async () => {
    env.COMMUTE_TRANSIT = 'here';
    env.HERE_API_KEY = HERE_KEY;
    const owner = await ownerWith({ commute: commute({ modes: ['transit'], maxMinutesPerWeek: 250 }) });
    const recruiter = await createUser('recruiter', { recruiter: true });
    const jobId = await createJob(recruiter);
    services.transit = 'untimed';
    expect(outcome(await matchOf(owner, recruiter, jobId))).toEqual({ criterion: 'commute', outcome: 'unknown' });
    const kept = await CommuteCache.find({ _id: { $regex: '^transit:' } }).lean();
    expect(kept.map(({ value }) => value)).toEqual([{ failed: true }]);
    // Remembered as a failure for minutes, not days
    expect(kept[0].expiresAt.getTime() - Date.now()).toBeLessThan(11 * 60_000);
  });

  it('keeps the answers of each public transport service apart: a site that changes service asks again', async () => {
    env.COMMUTE_TRANSIT = 'transitous';
    env.COMMUTE_CONTACT = 'https://portfolio.example/contact';
    const owner = await ownerWith({ commute: commute({ modes: ['transit'], maxMinutesPerWeek: 250 }) });
    const recruiter = await createUser('recruiter', { recruiter: true });
    const jobId = await createJob(recruiter);
    // Transitous finds no journey: walking all the way (an hour) misses
    services.transit = [];
    expect(outcome(await matchOf(owner, recruiter, jobId))).toEqual({ criterion: 'commute', outcome: 'miss' });
    expect(asked('transit')).toBe(1);

    // HERE has one of 25 minutes: its own answer counts, not what Transitous said
    env.COMMUTE_TRANSIT = 'here';
    env.HERE_API_KEY = HERE_KEY;
    services.transit = [1500];
    const withHere = await rescored(owner, recruiter);
    expect(outcome(withHere)).toEqual({ criterion: 'commute', outcome: 'match' });
    expect((withHere.view as { transit?: string }).transit).toBe('here');
    expect(asked('transit')).toBe(2);
  });

  it('credits no public transport service while travel times are off', async () => {
    env.COMMUTE_TRANSIT = 'here';
    env.HERE_API_KEY = HERE_KEY;
    const owner = await ownerWith({ commute: commute({ modes: ['transit'], maxMinutesPerWeek: 250 }) });
    const recruiter = await createUser('recruiter', { recruiter: true });
    const jobId = await createJob(recruiter);
    env.commuteTimesEnabled = false;
    const off = await matchOf(owner, recruiter, jobId);
    expect(outcome(off)).toEqual({ criterion: 'commute', outcome: 'unknown' });
    expect((off.view as { transit?: string }).transit).toBeUndefined();
    expect(asked('transit')).toBe(0);
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
    expect((await rescored(owner, recruiter)).view.score).toBe(100);
    expect(asked('route')).toBe(routes);

    // Answering again, once the failure is forgotten
    services.car = { duration: 90, distance: 100000 };
    await clearCommuteData();
    expect(await rescored(owner, recruiter)).toMatchObject({ status: 'failed', view: { score: 0 } });
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

describe('the travel times of matching: read from the cache, asked in the background', () => {
  /** An owner's commute, their address found (as PUT /perfect-job stores it) */
  const criterionWith = (fields: Record<string, unknown> = {}) =>
    ({ ...commute(), place: HOME, ...fields }) as Parameters<typeof commuteContext>[0];
  /** A posting's office: on site at the office, unless `fields` say otherwise */
  const officeAt = (fields: Record<string, unknown> = {}) =>
    ({
      country: 'FR',
      city: 'Lyon',
      postalCode: '69003',
      address: `9 rue du Bureau ${t.suffix}`,
      workMode: 'on_site',
      ...fields
    }) as Parameters<typeof commuteContext>[1];
  const account = () => new mongoose.Types.ObjectId().toString();
  /**
   * A candidate who opted in to matching, the commute of their perfect job `criterionWith(fields)`:
   * what a warm-up reads when it runs
   */
  const candidateWith = async (fields: Record<string, unknown> = {}) => {
    const id = account();
    candidates.push(id);
    const criterion = criterionWith(fields);
    await Promise.all([
      PerfectJob.create({ user: id, criteria: { commute: criterion } }),
      DiscoveryProfile.create({ user: id, enabledAt: new Date() })
    ]);
    return { id, criterion };
  };
  /** Has the commute of `candidate` to `office` warmed for the read of `accountId` (theirs by default) */
  const warm = (candidate: { id: string }, office = officeAt(), accountId = candidate.id) =>
    warmCommute({ candidateId: candidate.id, location: office }, accountId);
  const day = { windowMs: DISCOVERY_COMMUTE_CALLS.windowMs };
  const counted = async (accountId: string) => (await peekRateLimit(discoveryCommuteKey(accountId), day)).count;
  /** The requests of the day counted against COMMUTE_DAILY_LIMIT */
  const siteCount = async () => (await peekRateLimit('commute-calls', day)).count;
  /** Those of them warm-ups asked (matching's share of the day) */
  const matchingCount = async () => (await peekRateLimit('discovery-commute-site', day)).count;
  const known = (minutes: number): CommuteReading => ({ context: { commute: { minutes } }, state: 'known' });
  const logged = () => {
    const lines: string[] = [];
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      spyOn(logger, level).mockImplementation((text, attributes) => {
        lines.push(`${text} ${JSON.stringify(attributes ?? {})}`);
      });
    }
    return lines;
  };
  /** Nothing of the owner's address in what was kept or logged */
  const keepsNothingOfTheOwner = async (lines: string[]) => {
    const told = [JSON.stringify(await CommuteCache.find({}).lean()), ...lines].join('\n');
    for (const secret of [HOME.label, String(HOME.lat), String(HOME.lon), 'rue du Test']) expect(told).not.toContain(secret);
  };

  it('reads only what is kept: no outside call, nothing counted or written, and says what is missing', async () => {
    const criterion = criterionWith();
    const office = officeAt();
    // Not known yet: a warm-up can find it
    expect(await cachedCommuteContext(criterion, office, 'matching')).toEqual({ context: {}, state: 'missing' });
    expect(asked()).toBe(0);
    expect(await CommuteCache.countDocuments({})).toBe(0);
    expect(await siteCount()).toBe(0);

    // Once a journey's job match step asked (and waited)
    expect(await commuteContext(criterion, office)).toEqual({ commute: { minutes: 20 } });
    const first = asked();
    expect(first).toBe(2);
    expect(await cachedCommuteContext(criterion, office, 'matching')).toEqual(known(20));
    expect(asked()).toBe(first);

    // An office known not to be found is known too
    const lost = officeAt({ address: undefined, postalCode: undefined, city: 'Somewhere nice' });
    expect(await commuteContext(criterion, lost)).toEqual({ commute: { located: false } });
    const looked = asked();
    expect(await cachedCommuteContext(criterion, lost, 'matching')).toEqual({ context: { commute: { located: false } }, state: 'known' });
    // A service that did not answer a few minutes ago: not known, not asked, and said
    services.places.loin = { label: 'Far away', lat: 45.9, lon: 4.9 };
    services.car = 'down';
    const far = officeAt({ address: `2 rue du Loin ${t.suffix}` });
    expect(await commuteContext(criterion, far)).toEqual({});
    const failed = asked();
    expect(failed).toBe(looked + 2);
    expect(await cachedCommuteContext(criterion, far, 'matching')).toEqual({ context: {}, state: 'failed' });
    expect(asked()).toBe(failed);
    // Its office kept, a way never asked: missing
    expect(await cachedCommuteContext(criterionWith({ modes: ['walk'] }), far, 'matching')).toEqual({ context: {}, state: 'missing' });
    expect(asked()).toBe(failed);
  });

  it('says which pairs are not computed at all: no warm-up changes those', async () => {
    const none: CommuteReading = { context: {}, state: 'none' };
    const criterion = criterionWith({ modes: ['car', 'walk'] });
    expect(commuteModes(criterion, officeAt(), 'matching')).toEqual(['car', 'walk']);
    // Fully remote: nowhere to go (which always matches)
    const remote = officeAt({ workMode: 'remote' });
    expect(commuteModes(criterion, remote, 'matching')).toEqual([]);
    expect(await cachedCommuteContext(criterion, remote, 'matching')).toEqual(none);
    // The owner's address not found yet, or no commute asked for
    expect(commuteModes(criterionWith({ place: undefined }), officeAt(), 'matching')).toEqual([]);
    expect(await cachedCommuteContext(criterionWith({ place: undefined }), officeAt(), 'matching')).toEqual(none);
    expect(commuteModes(undefined, officeAt(), 'matching')).toEqual([]);
    expect(await cachedCommuteContext(undefined, officeAt(), 'matching')).toEqual(none);
    // A mode the site does not offer, to journeys either
    expect(commuteModes(criterionWith({ modes: ['transit'] }), officeAt(), 'matching')).toEqual([]);
    expect(await cachedCommuteContext(criterionWith({ modes: ['transit'] }), officeAt(), 'matching')).toEqual(none);
    // Travel times off
    const candidate = await candidateWith();
    env.commuteTimesEnabled = false;
    expect(commuteModes(criterion, officeAt(), 'matching')).toEqual([]);
    expect(await cachedCommuteContext(criterion, officeAt(), 'matching')).toEqual(none);
    expect(await commuteWarmUpPossible(candidate.id)).toBe(false);
    await warm(candidate);
    await warmOffice(officeAt(), account());
    expect(asked()).toBe(0);
  });

  it('asks only what mayAsk lets out, for the office and for each way, public transport included', async () => {
    env.COMMUTE_TRANSIT = 'here';
    env.HERE_API_KEY = HERE_KEY;
    const criterion = criterionWith({ modes: ['car', 'bike', 'transit'] });
    const requests = () => ({ geocode: asked('geocode'), route: asked('route'), transit: asked('transit') });
    let questions = 0;
    // The office, and nothing more: each way is put to mayAsk, and kept in
    expect(await commuteContext(criterion, officeAt(), { mayAsk: async () => ++questions <= 1 })).toEqual({});
    expect({ ...requests(), questions }).toEqual({ geocode: 1, route: 0, transit: 0, questions: 4 });
    // The office is kept: only the ways are put to mayAsk (by car, on foot, by public transport)
    questions = 0;
    expect(await commuteContext(criterion, officeAt(), { mayAsk: async () => (++questions, true) })).toEqual({
      commute: { minutes: 20 }
    });
    expect({ ...requests(), questions }).toEqual({ geocode: 1, route: 2, transit: 1, questions: 3 });
    // All kept: mayAsk is not called
    questions = 0;
    expect(await commuteContext(criterion, officeAt(), { mayAsk: async () => (++questions, false) })).toEqual({
      commute: { minutes: 20 }
    });
    expect(questions).toBe(0);
  });

  it('keeps a question in when mayAsk cannot tell, and remembers no failure of the service', async () => {
    const lines = logged();
    const criterion = criterionWith();
    const cannotTell = async (): Promise<boolean> => {
      throw new Error('Lost connection');
    };
    expect(await commuteContext(criterion, officeAt(), { mayAsk: cannotTell })).toEqual({});
    expect(asked()).toBe(0);
    expect(await CommuteCache.countDocuments({})).toBe(0);
    expect(lines).toEqual([]);
    // A journey's job match step then asks, and gets its travel time
    expect(await commuteContext(criterion, officeAt())).toEqual({ commute: { minutes: 20 } });
    expect(asked()).toBe(2);
  });

  it('asks in the background what a pair needs, counted against the account whose read wanted it', async () => {
    const lines = logged();
    const candidate = await candidateWith({ modes: ['car', 'bike'] });
    const recruiter = account();
    expect(await commuteWarmUpPossible(recruiter)).toBe(true);
    await warm(candidate, officeAt(), recruiter);
    // The office's place, the way by car, the way on foot (the bike's distance)
    expect({ geocode: asked('geocode'), route: asked('route') }).toEqual({ geocode: 1, route: 2 });
    expect(await counted(recruiter)).toBe(3);
    expect(await counted(candidate.id)).toBe(0);
    // Each one counted against the site's day, and against matching's share of it
    expect(await siteCount()).toBe(3);
    expect(await matchingCount()).toBe(3);
    expect(await cachedCommuteContext(candidate.criterion, officeAt(), 'matching')).toEqual(known(20));

    // Warmed again: what is kept is read, never asked again, nor counted
    await warm(candidate, officeAt(), recruiter);
    expect(asked()).toBe(3);
    expect(await counted(recruiter)).toBe(3);
    // The counter is keyed by a hash of the account
    expect(discoveryCommuteKey(recruiter)).not.toContain(recruiter);
    expect(lines).toEqual([]);
    await keepsNothingOfTheOwner(lines);
  });

  it("stops at the account's allowance for the day, without a word in the logs", async () => {
    const lines = logged();
    const spent = account();
    await Promise.all(
      Array.from({ length: DISCOVERY_COMMUTE_CALLS.limit }, () => takeRateLimit(discoveryCommuteKey(spent), DISCOVERY_COMMUTE_CALLS))
    );
    // A feed can stop waiting for its pairs: no warm-up finds them today
    expect(await commuteWarmUpPossible(spent)).toBe(false);
    const candidate = await candidateWith();
    await warm(candidate, officeAt(), spent);
    await warmOffice(officeAt(), spent);
    expect(asked()).toBe(0);
    expect(await CommuteCache.countDocuments({})).toBe(0);
    expect(await siteCount()).toBe(0);
    // Matching's share of the day is given back: the account's day was over
    expect(await matchingCount()).toBe(0);
    expect(lines).toEqual([]);
    expect(await cachedCommuteContext(candidate.criterion, officeAt(), 'matching')).toEqual({ context: {}, state: 'missing' });

    // Another account's allowance is its own
    const other = account();
    expect(await commuteWarmUpPossible(other)).toBe(true);
    await warm(candidate, officeAt(), other);
    expect(asked()).toBe(2);
    expect(await cachedCommuteContext(candidate.criterion, officeAt(), 'matching')).toEqual(known(20));
  });

  it("keeps journeys their part of the site's day: warm-ups stop at matching's share of it", async () => {
    env.COMMUTE_DAILY_LIMIT = 4;
    expect(Math.floor(env.COMMUTE_DAILY_LIMIT * MATCHING_COMMUTE_SHARE)).toBe(2);
    services.places.loin = { label: 'Far away', lat: 45.9, lon: 4.9 };
    const candidate = await candidateWith();
    const far = officeAt({ address: `2 rue du Loin ${t.suffix}` });
    // The office and the way by car: matching's share of the day
    await warm(candidate);
    expect(asked()).toBe(2);
    expect(await commuteWarmUpPossible(account())).toBe(false);
    // Another pair, for another account: nothing more today
    await warm(candidate, far, account());
    expect(asked()).toBe(2);
    expect(await cachedCommuteContext(candidate.criterion, far, 'matching')).toEqual({ context: {}, state: 'missing' });
    // A journey's job match step still asks, and gets its travel time
    expect(await commuteContext(candidate.criterion, far)).toEqual({ commute: { minutes: 20 } });
    expect(asked()).toBe(4);
    expect(await siteCount()).toBe(4);
  });

  it("keeps within the site's daily limit, and leaves a service that did not answer alone for a few minutes", async () => {
    const candidate = await candidateWith();
    // Journeys asked all the day allows
    env.COMMUTE_DAILY_LIMIT = 2;
    for (let request = 0; request < 2; request++) await takeRateLimit('commute-calls', { limit: 2, ...day });
    expect(await commuteWarmUpPossible(candidate.id)).toBe(false);
    await warm(candidate);
    expect(asked()).toBe(0);
    expect(await cachedCommuteContext(candidate.criterion, officeAt(), 'matching')).toEqual({ context: {}, state: 'missing' });

    // The next day, a service that does not answer: asked once, then left alone
    await RateLimitCounter.deleteMany({ _id: { $regex: '^(commute-calls|discovery-commute-site):' } });
    env.COMMUTE_DAILY_LIMIT = 500;
    services.car = 'down';
    await warm(candidate);
    await warm(candidate);
    expect(asked('route')).toBe(1);
    expect(await cachedCommuteContext(candidate.criterion, officeAt(), 'matching')).toEqual({ context: {}, state: 'failed' });
  });

  it('never asks Transitous, nor reads what it answered a journey, and says when matching cannot tell', async () => {
    env.COMMUTE_TRANSIT = 'transitous';
    env.COMMUTE_CONTACT = 'https://portfolio.example/contact';
    // Public transport (25 minutes) or on foot (60): 600 minutes a week on foot are within what is accepted
    const candidate = await candidateWith({ modes: ['transit', 'walk'], maxMinutesPerWeek: 600 });
    expect(commuteAvailability('matching')).toEqual({ enabled: true, modes: ['bike', 'car', 'walk'] });
    expect(commuteModes(candidate.criterion, officeAt(), 'matching')).toEqual(['walk']);
    await warm(candidate);
    expect({ transit: asked('transit'), route: asked('route') }).toEqual({ transit: 0, route: 1 });
    // On foot, the commute matches: public transport could only be quicker, which changes nothing
    expect(await cachedCommuteContext(candidate.criterion, officeAt(), 'matching')).toEqual(known(60));

    // A journey's job match step asks it: matching still does not read its answer
    expect(await commuteContext(candidate.criterion, officeAt())).toEqual({ commute: { minutes: 25 } });
    expect(asked('transit')).toBe(1);
    expect(await cachedCommuteContext(candidate.criterion, officeAt(), 'matching')).toEqual(known(60));

    // 300 minutes a week accepted: too far on foot, maybe not by public transport. Matching cannot
    // tell, and says so (a feed holds a deal-breaker commute back), never that it does not count
    const tighter = criterionWith({ modes: ['transit', 'walk'], maxMinutesPerWeek: 300 });
    expect(await cachedCommuteContext(tighter, officeAt(), 'matching')).toEqual({ context: {}, state: 'unknowable' });
    expect(await commuteContext(tighter, officeAt())).toEqual({ commute: { minutes: 25 } });
    // Public transport alone: matching computes no way, and cannot tell either
    const transitOnly = await candidateWith({ modes: ['transit'] });
    expect(commuteModes(transitOnly.criterion, officeAt(), 'journey')).toEqual(['transit']);
    expect(commuteModes(transitOnly.criterion, officeAt(), 'matching')).toEqual([]);
    const elsewhere = officeAt({ address: `5 rue du Bureau ${t.suffix}` });
    expect(await cachedCommuteContext(transitOnly.criterion, elsewhere, 'matching')).toEqual({ context: {}, state: 'unknowable' });
    const before = asked();
    await warm(transitOnly, elsewhere);
    expect(asked()).toBe(before);

    // HERE's terms allow it: matching asks it, in the background only
    env.COMMUTE_TRANSIT = 'here';
    env.HERE_API_KEY = HERE_KEY;
    expect(commuteAvailability('matching')).toEqual({ enabled: true, modes: ['transit', 'bike', 'car', 'walk'], transit: 'here' });
    // The way on foot is kept, HERE's answer is not: a read from the cache does not ask it
    expect(await cachedCommuteContext(candidate.criterion, officeAt(), 'matching')).toEqual({ context: {}, state: 'missing' });
    expect(asked('transit')).toBe(1);
    const spent = await counted(candidate.id);
    await warm(candidate);
    // One request, HERE's, counted against the account
    expect(await counted(candidate.id)).toBe(spent + 1);
    expect(services.requests.filter((request) => request.service === 'transit').map(({ url }) => url.hostname)).toEqual([
      'api.transitous.org',
      'transit.router.hereapi.com'
    ]);
    expect(await cachedCommuteContext(candidate.criterion, officeAt(), 'matching')).toEqual(known(25));
    // Which tells the tighter commute too: within 300 minutes a week
    expect(await cachedCommuteContext(tighter, officeAt(), 'matching')).toEqual(known(25));
  });

  it("looks a job's office up once in the background: each candidate then needs only the ways", async () => {
    const recruiter = account();
    await warmOffice(officeAt(), recruiter);
    expect({ geocode: asked('geocode'), route: asked('route') }).toEqual({ geocode: 1, route: 0 });
    expect(await counted(recruiter)).toBe(1);
    await warmOffice(officeAt(), recruiter);
    expect(asked()).toBe(1);

    const candidate = await candidateWith();
    await warm(candidate);
    expect({ geocode: asked('geocode'), route: asked('route') }).toEqual({ geocode: 1, route: 1 });
    expect(await counted(candidate.id)).toBe(1);
    // A fully remote job has no office to look for
    await warmOffice(officeAt({ workMode: 'remote', address: `7 rue du Bureau ${t.suffix}` }), recruiter);
    expect(asked()).toBe(2);
  });

  it('reads the candidate when the warm-up runs: nothing for one who withdrew or left, and from where they are now', async () => {
    services.delayMs = 100;
    const head = await candidateWith();
    // Candidates waiting behind it, each from a home of their own
    const homeAt = (label: string, lat: number, lon: number) => ({ place: { label, lat, lon } });
    const withdrawn = await candidateWith(homeAt('Withdrawn', 45.71, 4.81));
    const deleted = await candidateWith(homeAt('Deleted', 45.72, 4.82));
    const lapsed = await candidateWith(homeAt('Lapsed', 45.73, 4.83));
    const moved = await candidateWith(homeAt('Moved', 45.74, 4.84));
    const running = warm(head);
    const waiting = [withdrawn, deleted, lapsed, moved].map((candidate) => warm(candidate));
    // While they wait: a withdrawal, an account deleted, a consent that lapsed, a new address
    await Promise.all([
      DiscoveryProfile.updateOne({ user: withdrawn.id }, { $unset: { enabledAt: 1 } }),
      PerfectJob.deleteOne({ user: deleted.id }),
      DiscoveryProfile.deleteOne({ user: deleted.id }),
      DiscoveryProfile.updateOne({ user: lapsed.id }, { $set: { enabledAt: new Date(discoveryConsentCutoff().getTime() - 60_000) } }),
      PerfectJob.updateOne({ user: moved.id }, { $set: { 'criteria.commute.place': { label: 'New home', lat: 45.75, lon: 4.85 } } })
    ]);
    await Promise.all([running, ...waiting]);
    const from = services.requests.filter(({ service }) => service === 'route').map(({ url }) => url.searchParams.get('start'));
    expect(from).toEqual([`${HOME.lon},${HOME.lat}`, '4.85,45.75']);
    // The office and the head's way, then the way from the new home: nothing else kept
    expect(await CommuteCache.countDocuments({})).toBe(3);
  });

  it('takes warm-ups one at a time, in order, and drops those beyond the queue', async () => {
    services.delayMs = 5;
    services.places.loin = { label: 'Far away', lat: 45.9, lon: 4.9 };
    services.places.bout = { label: 'The end of the world', lat: 46.5, lon: 5.5 };
    const candidate = await candidateWith({ modes: ['car', 'walk'] });
    const offices = ['9 rue du Bureau', '2 rue du Loin', '3 rue du Bout'].map((street) => officeAt({ address: `${street} ${t.suffix}` }));
    await Promise.all(offices.map((office) => warm(candidate, office)));
    // Each pair: its office, then its two ways at once; never two pairs at once
    expect(services.requests.map(({ service }) => service)).toEqual(['geocode', 'route', 'route', 'geocode', 'route', 'route', 'geocode', 'route', 'route']);
    expect(services.mostAtOnce).toBeLessThanOrEqual(2);
    expect(
      services.requests.filter(({ service }) => service === 'geocode').map(({ url }) => url.searchParams.get('q')?.split(' ').slice(0, 4).join(' '))
    ).toEqual(['9 rue du Bureau', '2 rue du Loin', '3 rue du Bout']);

    // Beyond the queue: dropped (a later read asks for it again), and said
    const lines = logged();
    commuteWarmUps.queue = 1;
    await clearCommuteData();
    const before = asked();
    await Promise.all(offices.map((office) => warm(candidate, office)));
    expect(asked() - before).toBe(3);
    expect(lines).toEqual([
      'Travel times: warm-up dropped {"reason":"queue full","dropped":1}',
      'Travel times: warm-up dropped {"reason":"queue full","dropped":1}'
    ]);
  });

  it('takes one place for a pair already waiting, and keeps each account to its share of the queue', async () => {
    const lines = logged();
    const candidate = await candidateWith();
    // The same pair wanted three times while it waits, by two reads: one place, asked once
    commuteWarmUps.queue = 1;
    const reader = account();
    await Promise.all([warm(candidate, officeAt(), reader), warm(candidate, officeAt(), reader), warm(candidate, officeAt(), account())]);
    expect({ geocode: asked('geocode'), route: asked('route') }).toEqual({ geocode: 1, route: 1 });
    expect(await counted(reader)).toBe(2);
    expect(lines).toEqual([]);

    // An account at its share of the queue does not take the place of another's warm-up
    commuteWarmUps.queue = 3;
    commuteWarmUps.perAccount = 2;
    const streets = ['loin', 'bout', 'coin', 'pont', 'quai'];
    streets.forEach((street, index) => (services.places[street] = { label: street, lat: 45.8 + index / 100, lon: 4.8 }));
    const [first, second, third, fourth, theirs] = streets.map((street) => officeAt({ address: `2 rue du ${street} ${t.suffix}` }));
    const busy = account();
    const other = account();
    const before = asked('geocode');
    await Promise.all([
      ...[first, second, third, fourth].map((office) => warm(candidate, office, busy)),
      warm(candidate, theirs, other)
    ]);
    // Two of the busy account's pairs, and the other account's
    expect(asked('geocode') - before).toBe(3);
    expect(await counted(busy)).toBe(4);
    expect(await counted(other)).toBe(2);
    expect(lines).toEqual([
      'Travel times: warm-up dropped {"reason":"account share","dropped":1}',
      'Travel times: warm-up dropped {"reason":"account share","dropped":1}'
    ]);
  });

  it('says warm-ups were dropped in one line at most every so often, with how many', async () => {
    const lines = logged();
    services.delayMs = 300;
    commuteWarmUps.queue = 1;
    commuteWarmUps.dropLogMs = 100;
    const candidate = await candidateWith();
    const streets = ['loin', 'bout', 'coin', 'pont'];
    streets.forEach((street, index) => (services.places[street] = { label: street, lat: 45.8 + index / 100, lon: 4.8 }));
    const offices = streets.map((street) => officeAt({ address: `2 rue du ${street} ${t.suffix}` }));
    // The first holds the queue for 600 ms at least: three dropped at once, one said
    const running = warm(candidate);
    await Promise.all(offices.slice(0, 3).map((office) => warm(candidate, office)));
    expect(lines).toEqual(['Travel times: warm-up dropped {"reason":"queue full","dropped":1}']);
    // Later, one more: said with those not said yet
    await Bun.sleep(150);
    await warm(candidate, offices[3]);
    await running;
    expect(lines).toEqual([
      'Travel times: warm-up dropped {"reason":"queue full","dropped":1}',
      'Travel times: warm-up dropped {"reason":"queue full","dropped":3}'
    ]);
  });

  it('pauses after a warm-up that asked, never after one that asked nothing', async () => {
    commuteWarmUps.pauseMs = 300;
    services.places.loin = { label: 'Far away', lat: 45.9, lon: 4.9 };
    const candidate = await candidateWith();
    const far = officeAt({ address: `2 rue du Loin ${t.suffix}` });
    await Promise.all([warm(candidate), warm(candidate, far)]);
    // Each pair: its office, then its way by car; the second pair starts after the pause
    expect(services.requests.map(({ service }) => service)).toEqual(['geocode', 'route', 'geocode', 'route']);
    expect(services.requests[2].at - services.answeredAt[1]).toBeGreaterThanOrEqual(commuteWarmUps.pauseMs - 5);

    // Both kept: nothing asked, no pause
    const started = performance.now();
    await Promise.all([warm(candidate), warm(candidate, far)]);
    expect(asked()).toBe(4);
    expect(performance.now() - started).toBeLessThan(commuteWarmUps.pauseMs);
  });

  it('never fails its caller, logs nothing of the owner, and goes on with the next warm-up', async () => {
    const lines = logged();
    const candidate = await candidateWith();
    const lookup = spyOn(CommuteCache, 'findById').mockImplementation(() => {
      throw new Error(`Lost connection while reading ${HOME.label}`);
    });
    await warm(candidate);
    expect(lines).toEqual(['Travel times: warm-up failed {"reason":"Error"}']);
    expect(asked()).toBe(0);

    lookup.mockRestore();
    await warm(candidate);
    expect(await cachedCommuteContext(candidate.criterion, officeAt(), 'matching')).toEqual(known(20));
    await keepsNothingOfTheOwner(lines);
  });

  it('goes on with the next warm-up even when a line cannot be logged', async () => {
    const candidate = await candidateWith();
    spyOn(logger, 'warn').mockImplementation(() => {
      throw new Error('Exporter gone');
    });
    const lookup = spyOn(CommuteCache, 'findById').mockImplementation(() => {
      throw new Error('Lost connection');
    });
    // Resolves: the caller never gets a rejection
    expect(await warm(candidate)).toBeUndefined();
    lookup.mockRestore();
    await warm(candidate);
    expect(asked()).toBe(2);
    expect(await cachedCommuteContext(candidate.criterion, officeAt(), 'matching')).toEqual(known(20));
  });

  it('holds nothing against a pair when its own counters cannot be counted: journeys still ask', async () => {
    const lines = logged();
    const candidate = await candidateWith();
    const take = RateLimitCounter.findOneAndUpdate.bind(RateLimitCounter) as (...args: unknown[]) => unknown;
    spyOn(RateLimitCounter, 'findOneAndUpdate').mockImplementation(((filter: { _id: string }, ...rest: unknown[]) => {
      if (filter._id.startsWith('discovery-commute')) throw new Error('Lost connection');
      return take(filter, ...rest);
    }) as unknown as typeof RateLimitCounter.findOneAndUpdate);
    await warm(candidate);
    expect(lines).toEqual(['Travel times: warm-up failed {"reason":"Error"}']);
    expect(asked()).toBe(0);
    // Not remembered as failed: a journey's job match step asks, and gets its travel time
    expect(await CommuteCache.countDocuments({})).toBe(0);
    expect(await commuteContext(candidate.criterion, officeAt())).toEqual({ commute: { minutes: 20 } });
    expect(asked()).toBe(2);
  });
});
