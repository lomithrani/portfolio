// The address search (services/addressSearch.ts, POST /addresses/search and
// POST /addresses/office) against a real MongoDB (MONGO_URL, local or from
// TEST_MONGO_URL) and a fake geocoder: nothing leaves the machine. Each test
// creates its own users, named with a suffix unique to that test, and removes
// them after: tests pass in any order (--randomize).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import mongoose from 'mongoose';
import { env } from '../env';
import { createApp } from '../app';
import { CommuteCache, RateLimitCounter, User } from '../models/database';
import {
  ADDRESS_SEARCHES_PER_DAY,
  ADDRESS_SEARCHES_PER_USER,
  ADDRESS_SEARCHES_PER_USER_PER_DAY,
  OFFICE_LOOKUPS_PER_USER
} from '../services/addressSearch';
import { logger } from '../services/logger';
import { authCookie } from './helpers';
import { assertDisposableDatabase } from './testDatabase';

const testNames = () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return { suffix, email: (name: string) => `as-${name}-${suffix}@example.com` };
};

let app: ReturnType<typeof createApp>;
let t: ReturnType<typeof testNames>;
let connected = false;
let logLines: string[] = [];

// ── A fake geocoder ─────────────────────────────────────────

interface Feature {
  label: string;
  type: string;
  name: string;
  postcode: string;
  city: string;
  score: number;
}

const feature = (found: Feature) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [4.8357, 45.764] },
  properties: { ...found, id: '69382_6120_00012', x: 842_000, y: 6_519_000, context: '69, Rhône, Auvergne-Rhône-Alpes' }
});

const REPUBLIQUE: Feature = {
  label: '12 Rue de la République 69002 Lyon',
  type: 'housenumber',
  name: '12 Rue de la République',
  postcode: '69002',
  city: 'Lyon',
  score: 0.88
};
const PLACE: Feature = {
  label: 'Place de la République 69002 Lyon',
  type: 'street',
  name: 'Place de la République',
  postcode: '69002',
  city: 'Lyon',
  score: 0.41
};
const LYON: Feature = { label: 'Lyon', type: 'municipality', name: 'Lyon', postcode: '69001', city: 'Lyon', score: 0.95 };

let geocoder: {
  requests: { url: URL; redirect: string | undefined }[];
  state: 'up' | 'down';
  /** What a search for a street answers with; a search for a town finds Lyon */
  streets: Feature[];
};

/** The towns the fake knows as communes: like the real one, it refuses (400) a `city` it does not */
const COMMUNES = ['lyon'];

const installFakeGeocoder = () => {
  geocoder = { requests: [], state: 'up', streets: [REPUBLIQUE, PLACE] };
  spyOn(globalThis, 'fetch').mockImplementation((async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (!url.href.startsWith('https://data.geopf.fr/geocodage/search')) throw new Error(`Unexpected request to ${url.origin}`);
    geocoder.requests.push({ url, redirect: init?.redirect });
    if (geocoder.state === 'down') return new Response('Bad gateway', { status: 502 });
    const city = url.searchParams.get('city');
    if (city && !COMMUNES.includes(city.toLowerCase())) {
      return Response.json({ code: 400, message: 'Failed parsing query', detail: ['city: No matching cities found'] }, { status: 400 });
    }
    // The postal code and the town are filters: what is elsewhere is not answered
    const postcode = url.searchParams.get('postcode');
    const found = (url.searchParams.get('type') === 'municipality' ? [LYON] : geocoder.streets).filter(
      (place) => (!postcode || place.postcode === postcode) && (!city || place.city.toLowerCase() === city.toLowerCase())
    );
    const limit = Number(url.searchParams.get('limit'));
    return Response.json({ type: 'FeatureCollection', features: found.slice(0, limit).map(feature) });
  }) as typeof fetch);
};

// ── App and users ───────────────────────────────────────────

const call = async (method: 'GET' | 'POST', path: string, body?: unknown, cookie?: string) => {
  const headers: Record<string, string> = cookie ? { Cookie: cookie } : {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const request = new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const response = await app.fetch(request);
  const text = await response.text();
  return { status: response.status, text, headers: response.headers, json: <T = any>() => JSON.parse(text) as T };
};

const createUser = async (name: string) => {
  const user = await User.create({ email: t.email(name), googleId: `as-sub-${name}-${t.suffix}`, name });
  return { id: user._id.toString(), cookie: await authCookie(user._id.toString()) };
};

// POSTs: what is typed travels in a body, never in a URL
const search = (body: Record<string, string>, cookie?: string) => call('POST', '/addresses/search', body, cookie);
const office = (body: Record<string, string>, cookie?: string) => call('POST', '/addresses/office', body, cookie);

const clearCounters = async () => {
  await CommuteCache.deleteMany({});
  await RateLimitCounter.deleteMany({ _id: { $regex: '^(commute-calls|address-search|office-lookup)' } });
};

const saved = {
  enabled: env.commuteTimesEnabled,
  limit: env.COMMUTE_DAILY_LIMIT,
  perUser: { ...ADDRESS_SEARCHES_PER_USER },
  perUserDay: { ...ADDRESS_SEARCHES_PER_USER_PER_DAY },
  perDay: { ...ADDRESS_SEARCHES_PER_DAY },
  offices: { ...OFFICE_LOOKUPS_PER_USER }
};

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  await Promise.all([User.init(), CommuteCache.init()]);
});

afterAll(async () => {
  if (connected) await mongoose.disconnect();
});

beforeEach(async () => {
  t = testNames();
  app = createApp();
  env.commuteTimesEnabled = true;
  env.COMMUTE_DAILY_LIMIT = 500;
  logLines = [];
  for (const level of ['debug', 'info', 'warn', 'error'] as const) {
    spyOn(logger, level).mockImplementation((text, attributes) => {
      logLines.push(`${level} ${text} ${JSON.stringify(attributes ?? {})}`);
    });
  }
  installFakeGeocoder();
  if (connected) await clearCounters();
});

afterEach(async () => {
  mock.restore();
  env.commuteTimesEnabled = saved.enabled;
  env.COMMUTE_DAILY_LIMIT = saved.limit;
  Object.assign(ADDRESS_SEARCHES_PER_USER, saved.perUser);
  Object.assign(ADDRESS_SEARCHES_PER_USER_PER_DAY, saved.perUserDay);
  Object.assign(ADDRESS_SEARCHES_PER_DAY, saved.perDay);
  Object.assign(OFFICE_LOOKUPS_PER_USER, saved.offices);
  if (!connected) return;
  await clearCounters();
  await User.deleteMany({ email: new RegExp(`-${t.suffix}@`) });
});

describe('the addresses that what was typed could be (POST /addresses/search)', () => {
  it('is for signed-in accounts, and takes what is typed in a body only, never in a URL', async () => {
    expect((await search({ q: '12 rue de la rep' })).status).toBe(401);
    expect((await office({ city: 'Lyon' })).status).toBe(401);
    const user = await createUser('url');
    for (const path of ['/addresses/search?q=12%20rue%20de%20la%20rep', '/addresses/office?city=Lyon']) {
      expect((await call('GET', path, undefined, user.cookie)).status).toBe(404);
    }
    expect(geocoder.requests).toHaveLength(0);
  });

  it('answers with the addresses the map service knows, without where they are', async () => {
    const user = await createUser('typing');
    const answer = await search({ q: '  12 rue   de la rep ' }, user.cookie);
    expect(answer.status).toBe(200);
    expect(answer.json()).toEqual({
      enabled: true,
      suggestions: [
        {
          label: '12 Rue de la République 69002 Lyon',
          kind: 'housenumber',
          street: '12 Rue de la République',
          postalCode: '69002',
          city: 'Lyon'
        },
        {
          label: 'Place de la République 69002 Lyon',
          kind: 'street',
          street: 'Place de la République',
          postalCode: '69002',
          city: 'Lyon'
        }
      ]
    });
    expect(geocoder.requests).toHaveLength(1);
    const [{ url, redirect }] = geocoder.requests;
    expect(url.searchParams.get('q')).toBe('12 rue de la rep');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.has('postcode')).toBe(false);
    expect(url.searchParams.has('city')).toBe(false);
    // The question goes nowhere else
    expect(redirect).toBe('manual');
  });

  it('narrows the search to the postal code and the town given with it, while it finds the address there', async () => {
    const user = await createUser('narrow');
    const narrowed = await search({ q: '12 rue de la rep', postalCode: '69002', city: ' Lyon ' }, user.cookie);
    expect(narrowed.json().suggestions.map(({ label }: { label: string }) => label)).toEqual([
      REPUBLIQUE.label,
      PLACE.label
    ]);
    await search({ q: '12 rue de la rep', postalCode: '690' }, user.cookie);
    const [first, typing] = geocoder.requests.map(({ url }) => url.searchParams);
    expect(first.get('postcode')).toBe('69002');
    expect(first.get('city')).toBe('Lyon');
    // A good match where it was narrowed: asked once
    expect(geocoder.requests).toHaveLength(2);
    // A postal code still being typed does not narrow anything: the map service refuses it
    expect(typing.has('postcode')).toBe(false);
  });

  it('looks elsewhere in the town when its postal code has no such street (an office that moved, an earlier pick)', async () => {
    const user = await createUser('moved');
    const answer = await search({ q: '12 rue de la rep', postalCode: '69003', city: 'Lyon' }, user.cookie);
    expect(answer.json().suggestions.map(({ label }: { label: string }) => label)).toEqual([REPUBLIQUE.label, PLACE.label]);
    const asked = geocoder.requests.map(({ url }) => [url.searchParams.get('postcode'), url.searchParams.get('city')]);
    expect(asked).toEqual([
      ['69003', 'Lyon'],
      [null, 'Lyon']
    ]);
  });

  it('searches without a town the map service does not know as a commune ("La Défense"), rather than find nothing', async () => {
    const user = await createUser('defense');
    const answer = await search({ q: '12 rue de la rep', postalCode: '69002', city: 'Sophia Antipolis' }, user.cookie);
    expect(answer.status).toBe(200);
    expect(answer.json().suggestions.map(({ label }: { label: string }) => label)).toEqual([REPUBLIQUE.label, PLACE.label]);
    // Refused with the town, then asked with the postal code alone
    const asked = geocoder.requests.map(({ url }) => [url.searchParams.get('postcode'), url.searchParams.get('city')]);
    expect(asked).toEqual([
      ['69002', 'Sophia Antipolis'],
      ['69002', null]
    ]);
  });

  it('asks at most three times, and answers what came closest', async () => {
    const user = await createUser('far');
    // Only a guess anywhere: the narrowed one is kept, the most precise
    geocoder.streets = [{ ...PLACE, score: 0.41 }];
    const answer = await search({ q: 'place de la rep', postalCode: '69002', city: 'Lyon' }, user.cookie);
    expect(answer.json().suggestions.map(({ label }: { label: string }) => label)).toEqual([PLACE.label]);
    const asked = geocoder.requests.map(({ url }) => [url.searchParams.get('postcode'), url.searchParams.get('city')]);
    expect(asked).toEqual([
      ['69002', 'Lyon'],
      [null, 'Lyon'],
      [null, null]
    ]);
  });

  it('names a town with its postal code, so that saving it finds that town again, and an address once', async () => {
    const user = await createUser('town');
    geocoder.streets = [LYON, REPUBLIQUE, REPUBLIQUE];
    expect((await search({ q: 'lyon' }, user.cookie)).json().suggestions).toEqual([
      { label: 'Lyon 69001', kind: 'municipality', postalCode: '69001', city: 'Lyon' },
      expect.objectContaining({ label: '12 Rue de la République 69002 Lyon' })
    ]);
  });

  it('looks nothing up for a text too short to search', async () => {
    const user = await createUser('short');
    for (const q of ['', ' ', '12', ' 1  ']) {
      expect((await search({ q }, user.cookie)).json()).toEqual({ enabled: true, suggestions: [] });
    }
    expect(geocoder.requests).toHaveLength(0);
  });

  it('sends nothing to the map service while travel times are off', async () => {
    const user = await createUser('off');
    env.commuteTimesEnabled = false;
    expect((await search({ q: '12 rue de la rep' }, user.cookie)).json()).toEqual({ enabled: false, suggestions: [] });
    expect((await office({ address: '12 rue de la République', city: 'Lyon' }, user.cookie)).json()).toEqual({
      enabled: false,
      found: 'unknown'
    });
    expect(geocoder.requests).toHaveLength(0);
  });

  it('stops an account that searches too much in a minute, and only that account', async () => {
    const [user, other] = [await createUser('eager'), await createUser('other')];
    // A window no minute's end can split while the test runs
    Object.assign(ADDRESS_SEARCHES_PER_USER, { limit: 2, windowMs: 24 * 60 * 60_000 });
    expect((await search({ q: 'rue un' }, user.cookie)).status).toBe(200);
    expect((await search({ q: 'rue deux' }, user.cookie)).status).toBe(200);
    const refused = await search({ q: 'rue trois' }, user.cookie);
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(refused.text).toContain('Too many address searches');
    expect(geocoder.requests).toHaveLength(2);
    expect((await search({ q: 'rue un' }, other.cookie)).status).toBe(200);
  });

  it("stops an account that searches too much in a day, before it uses up the site's day", async () => {
    const user = await createUser('scripted');
    ADDRESS_SEARCHES_PER_USER_PER_DAY.limit = 2;
    expect((await search({ q: 'rue un' }, user.cookie)).status).toBe(200);
    expect((await search({ q: 'rue deux' }, user.cookie)).status).toBe(200);
    const refused = await search({ q: 'rue trois' }, user.cookie);
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(geocoder.requests).toHaveLength(2);
  });

  it("keys the account's counters by a hash, never by its id", async () => {
    const user = await createUser('hashed');
    await search({ q: 'rue un' }, user.cookie);
    await office({ address: '1 rue Une', city: 'Lyon' }, user.cookie);
    const counters = await RateLimitCounter.find({ _id: { $regex: '^(address-search|office-lookup):user' } }).lean();
    expect(counters.length).toBeGreaterThanOrEqual(3);
    expect(counters.filter((counter) => String(counter._id).includes(user.id))).toEqual([]);
  });

  it('says so when the site searched enough for the day, or the map service does not answer', async () => {
    const user = await createUser('unlucky');
    geocoder.state = 'down';
    const down = await search({ q: '7 impasse du Secret' }, user.cookie);
    expect(down.status).toBe(503);
    expect(down.text).toContain('Addresses cannot be searched right now');

    geocoder.state = 'up';
    ADDRESS_SEARCHES_PER_DAY.limit = 0;
    const over = await search({ q: '7 impasse du Secret' }, user.cookie);
    expect(over.status).toBe(503);
    expect(geocoder.requests).toHaveLength(1);
  });

  it('never logs or keeps what was typed, and does not count against the travel times of the day', async () => {
    const user = await createUser('private');
    await search({ q: '7 impasse du Secret', city: 'Villesecrète' }, user.cookie);
    geocoder.state = 'down';
    await search({ q: '7 impasse du Secret', city: 'Villesecrète' }, user.cookie);
    expect(logLines.some((line) => line.includes('Address search: no answer'))).toBe(true);
    expect(logLines.filter((line) => /secret|villesecr/i.test(line))).toEqual([]);
    expect(await CommuteCache.countDocuments({})).toBe(0);
    expect(await RateLimitCounter.countDocuments({ _id: { $regex: '^commute-calls:' } })).toBe(0);
    const counters = await RateLimitCounter.find({ _id: { $regex: '^address-search' } }).lean();
    expect(counters.filter((counter) => /secret/i.test(String(counter._id)))).toEqual([]);
  });
});

describe("where a job's office is found (POST /addresses/office)", () => {
  it('finds the street, as scoring a posting with it will, and asks once', async () => {
    const user = await createUser('recruiter');
    const asked = { address: '12 rue de la République', postalCode: '69002', city: 'Lyon' };
    const found = await office(asked, user.cookie);
    expect(found.status).toBe(200);
    expect(found.json()).toEqual({ enabled: true, found: 'street', label: '12 Rue de la République 69002 Lyon' });
    const [{ url }] = geocoder.requests;
    expect(url.searchParams.get('q')).toBe('12 rue de la République 69002 Lyon');
    expect(url.searchParams.get('postcode')).toBe('69002');
    expect(url.searchParams.get('limit')).toBe('1');

    expect((await office(asked, user.cookie)).json().found).toBe('street');
    expect(geocoder.requests).toHaveLength(1);
  });

  it('goes to the town when the street is not found, or not given', async () => {
    const user = await createUser('recruiter');
    // The geocoder always has a guess: a street it does not know comes back as another, with a low score
    geocoder.streets = [{ ...PLACE, score: 0.41 }];
    expect((await office({ address: '99 rue Inconnue', city: 'Lyon' }, user.cookie)).json()).toEqual({
      enabled: true,
      found: 'town',
      label: 'Lyon'
    });
    expect((await office({ city: 'Lyon' }, user.cookie)).json()).toEqual({ enabled: true, found: 'town', label: 'Lyon' });
    expect(geocoder.requests.map(({ url }) => url.searchParams.get('type'))).toEqual([null, 'municipality']);
  });

  it('says when nothing is found, and when it is not known right now', async () => {
    const user = await createUser('recruiter');
    expect((await office({}, user.cookie)).json()).toEqual({ enabled: true, found: 'none' });
    expect((await office({ postalCode: '69002' }, user.cookie)).json()).toEqual({ enabled: true, found: 'none' });
    expect(geocoder.requests).toHaveLength(0);

    geocoder.streets = [];
    expect((await office({ address: '99 rue Inconnue' }, user.cookie)).json()).toEqual({ enabled: true, found: 'none' });

    geocoder.state = 'down';
    expect((await office({ address: '1 rue Ailleurs', city: 'Lyon' }, user.cookie)).json()).toEqual({
      enabled: true,
      found: 'unknown'
    });
  });

  it('counts a new office against the travel times of the day, and stops an account that has too many looked up', async () => {
    const user = await createUser('recruiter');
    OFFICE_LOOKUPS_PER_USER.limit = 2;
    expect((await office({ address: '1 rue Une', city: 'Lyon' }, user.cookie)).json().found).toBe('street');
    expect((await office({ address: '2 rue Deux', city: 'Lyon' }, user.cookie)).json().found).toBe('street');
    const refused = await office({ address: '3 rue Trois', city: 'Lyon' }, user.cookie);
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(geocoder.requests).toHaveLength(2);
    // An office already found is not looked up: it is still answered
    expect((await office({ address: '1 rue Une', city: 'Lyon' }, user.cookie)).json().found).toBe('street');
    expect(logLines.filter((line) => line.includes('Travel times: no answer'))).toEqual([]);

    const other = await createUser('other');
    env.COMMUTE_DAILY_LIMIT = 2;
    expect((await office({ address: '4 rue Quatre', city: 'Lyon' }, other.cookie)).json()).toEqual({
      enabled: true,
      found: 'unknown'
    });
    expect(geocoder.requests).toHaveLength(2);
  });

  it('counts a street not found and its town as two lookups of the account', async () => {
    const user = await createUser('recruiter');
    OFFICE_LOOKUPS_PER_USER.limit = 2;
    geocoder.streets = [{ ...PLACE, score: 0.41 }];
    expect((await office({ address: '99 rue Inconnue', city: 'Lyon' }, user.cookie)).json().found).toBe('town');
    expect(geocoder.requests).toHaveLength(2);
    expect((await office({ address: '98 rue Inconnue', city: 'Lyon' }, user.cookie)).status).toBe(429);
    expect(geocoder.requests).toHaveLength(2);
  });
});
