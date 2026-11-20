// Discovery (Path 2, behind MATCHING): GET/PUT /discovery and POST/DELETE
// /discovery/consent (plugins/matches.ts, services/discovery.ts) against a real
// MongoDB (MONGO_URL, local or from TEST_MONGO_URL). Each test creates its own
// accounts, portfolios, perfect jobs, journeys and meeting types, named with a
// suffix unique to that test, and removes them after: tests pass in any order
// (--randomize). Google is never asked anything: the calendar a candidate has
// is a grant stored in the database, as readiness reads it.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import mongoose, { Types } from 'mongoose';
import { readFileSync } from 'node:fs';
import {
  DISCOVERY_CONSENT_KEYS,
  DISCOVERY_CONSENT_RENEWAL_DAYS,
  DISCOVERY_INACTIVITY_DAYS,
  LEGAL_VERSION,
  currentDiscoveryConsent,
  discoveryConsentCutoff,
  discoveryConsentExpiry,
  ExperienceType,
  journeyTemplate,
  matchingMessages,
  withLocale
} from 'portfolio-common';
import { env } from '../env';
import { createApp } from '../app';
import {
  AppointmentSchedule,
  DiscoveryProfile,
  Domain,
  Experience,
  PerfectJob,
  RateLimitCounter,
  User,
  Workflow
} from '../models/database';
import {
  DISCOVERY_GRANTS_PER_DAY,
  discoveryGrantsKey,
  discoveryWithdrawal,
  touchDiscovery
} from '../services/discovery';
import { recordConsent } from '../services/legal';
import { logger } from '../services/logger';
import { CONSENT, authCookie, parseCookie, signGoogleIdToken, useTestGoogleKeys } from './helpers';
import { assertDisposableDatabase } from './testDatabase';

/** Names unique to one test: everything it creates carries its suffix */
const testNames = () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const id = (name: string) => `disc-${name}-${suffix}`;
  return { suffix, id, email: (name: string) => `${id(name)}@example.com` };
};

const DAY = 24 * 60 * 60 * 1000;

let app: ReturnType<typeof createApp>;
let t: ReturnType<typeof testNames>;
let connected = false;
const saved = { matching: env.matchingEnabled, calendar: env.googleCalendarEnabled };

const call = async (
  method: string,
  path: string,
  { body, raw, cookie, language }: { body?: unknown; raw?: string; cookie?: string; language?: string } = {}
) => {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  if (language) headers['Accept-Language'] = language;
  // `raw`: a body sent as it is, JSON or not
  const text = raw ?? (body === undefined ? undefined : JSON.stringify(body));
  if (text !== undefined) headers['Content-Type'] = 'application/json';
  const response = await app.fetch(new Request(`http://localhost${path}`, { method, headers, body: text }));
  const responseText = await response.text();
  return {
    status: response.status,
    text: responseText,
    headers: response.headers,
    json: <T = any>() => JSON.parse(responseText) as T
  };
};

interface TestUser {
  id: string;
  cookie: string;
  domain?: string;
  experiences: string[];
}

/** An account, with a portfolio of `experiences` experiences when `domain` */
const createUser = async (
  name: string,
  { domain = false, experiences = 0 }: { domain?: boolean; experiences?: number } = {}
): Promise<TestUser> => {
  const user = await User.create({ email: t.email(name), googleId: t.id(`sub-${name}`), name });
  const id = user._id.toString();
  let domainName: string | undefined;
  let experienceIds: string[] = [];
  if (domain) {
    domainName = t.id(name);
    // Stored directly, titled with the test's suffix (the experience routes are covered by tests/experiences.test.ts)
    const created = await Experience.insertMany(
      Array.from({ length: experiences }, (_, index) => ({
        type: ExperienceType.Professional,
        title: `${t.id(name)} ${index}`
      }))
    );
    experienceIds = created.map((experience) => experience._id.toString());
    await Domain.create({ name: domainName, admin: user._id, experiences: experienceIds });
  }
  return { id, cookie: await authCookie(id), domain: domainName, experiences: experienceIds };
};

/** What the candidates rate: three criteria, the pay among them */
const CRITERIA = {
  pay: { importance: 5, dealBreaker: true, perYear: 65_000 },
  workMode: { importance: 4, modes: ['hybrid'], minRemoteDays: 2 },
  contractTypes: { importance: 3, types: ['cdi'] }
};

const ratePerfectJob = async (user: TestUser, criteria: Record<string, unknown> = CRITERIA) => {
  const answer = await call('PUT', '/perfect-job', { body: { criteria }, cookie: user.cookie });
  expect(answer.status).toBe(200);
};

const saveJourney = async (user: TestUser, steps: unknown[] = journeyTemplate('gate')) => {
  const answer = await call('PUT', '/workflow', { body: { steps }, cookie: user.cookie });
  expect(answer.status).toBe(200);
};

/** A Google Calendar grant, as the API stores it once connected (never used: nothing asks Google) */
const connectCalendar = (user: TestUser) =>
  User.updateOne(
    { _id: user.id },
    { $set: { 'googleCalendar.refreshToken': t.id('refresh-token'), 'googleCalendar.connectedAt': new Date() } }
  );

/** A meeting type with hours: Mondays, 9 to 12 */
const createSchedule = (user: TestUser, enabled = true) =>
  AppointmentSchedule.create({
    user: user.id,
    title: t.id('call'),
    timezone: 'Europe/Paris',
    enabled,
    availability: [{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00' }]
  });

/** A candidate with everything discovery asks for: a portfolio, the terms, the criteria, the gate, a calendar */
const readyCandidate = async (name: string, { experiences = 2 } = {}) => {
  const user = await createUser(name, { domain: true, experiences });
  await recordConsent(user.id, CONSENT, 'account');
  await ratePerfectJob(user);
  await saveJourney(user);
  await connectCalendar(user);
  await createSchedule(user);
  return user;
};

const status = async (user: TestUser) => {
  const answer = await call('GET', '/discovery', { cookie: user.cookie });
  expect(answer.status).toBe(200);
  return answer.json();
};

const grant = (user: TestUser, consent: unknown = currentDiscoveryConsent(), language?: string) =>
  call('POST', '/discovery/consent', { body: { consent }, cookie: user.cookie, language });

const withdraw = (user: TestUser) => call('DELETE', '/discovery/consent', { cookie: user.cookie });

const profileOf = (user: TestUser) => DiscoveryProfile.findOne({ user: user.id }).lean();

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  await Promise.all([User.init(), Domain.init(), Workflow.init(), PerfectJob.init(), DiscoveryProfile.init()]);
});

afterAll(async () => {
  env.matchingEnabled = saved.matching;
  env.googleCalendarEnabled = saved.calendar;
  if (connected) await mongoose.disconnect();
});

beforeEach(() => {
  t = testNames();
  // Before the app is built: it registers the matching routes only while the flag is on
  env.matchingEnabled = true;
  env.googleCalendarEnabled = true;
  app = createApp();
});

afterEach(async () => {
  mock.restore();
  env.matchingEnabled = saved.matching;
  env.googleCalendarEnabled = saved.calendar;
  if (!connected) return;
  const named = new RegExp(`-${t.suffix}(@|$)`);
  const users = (await User.find({ email: named }, '_id').lean()).map((user) => user._id);
  await Experience.deleteMany({ title: new RegExp(`-${t.suffix} \\d+$`) });
  await AppointmentSchedule.deleteMany({ user: { $in: users } });
  await PerfectJob.deleteMany({ user: { $in: users } });
  await Workflow.deleteMany({ user: { $in: users } });
  await Domain.deleteMany({ admin: { $in: users } });
  await DiscoveryProfile.deleteMany({ user: { $in: users } });
  for (const user of users) {
    await RateLimitCounter.deleteMany({ _id: new RegExp(`^${discoveryGrantsKey(user.toString())}:`) });
  }
  await User.deleteMany({ _id: { $in: users } });
});

const MATCHING_ROUTES: [string, string, unknown][] = [
  ['GET', '/discovery', undefined],
  ['PUT', '/discovery', { card: { headline: 'Backend engineer' } }],
  ['POST', '/discovery/consent', { consent: currentDiscoveryConsent() }],
  ['DELETE', '/discovery/consent', undefined]
];

describe('while MATCHING is off', () => {
  it.each(MATCHING_ROUTES)(
    '%s %s is not registered: the 404 of a route that does not exist, whatever the session or the body, and nothing written',
    async (method, path, body) => {
      env.matchingEnabled = false;
      app = createApp();
      const candidate = await readyCandidate('off');
      expect(app.routes.some((route) => route.path.startsWith('/discovery'))).toBe(false);
      // A body that is not JSON, and one too large without a Content-Length, would be refused before a registered route's guard ran
      const bodies = body === undefined ? [undefined] : [JSON.stringify(body), '{"card": {', 'x'.repeat(2 * 1024 * 1024)];

      for (const raw of bodies) {
        const unknownRoute = await call(method, `${path}-that-does-not-exist`, { raw, cookie: candidate.cookie });
        for (const cookie of [undefined, candidate.cookie]) {
          const answer = await call(method, path, { raw, cookie });
          expect(answer.status).toBe(unknownRoute.status);
          expect(answer.text).toBe(unknownRoute.text);
        }
      }
      expect((await call(method, path, { body, cookie: candidate.cookie })).status).toBe(404);
      expect(await DiscoveryProfile.exists({ user: candidate.id })).toBeNull();
      expect(await RateLimitCounter.exists({ _id: new RegExp(`^${discoveryGrantsKey(candidate.id)}:`) })).toBeNull();
    }
  );

  it.each(MATCHING_ROUTES)(
    '%s %s still answers the 404 of a route that does not exist when the flag is turned off once the app is built',
    async (method, path, body) => {
      const candidate = await readyCandidate('later');
      env.matchingEnabled = false;
      const unknownRoute = await call(method, `${path}-that-does-not-exist`, { body, cookie: candidate.cookie });

      for (const cookie of [undefined, candidate.cookie]) {
        const answer = await call(method, path, { body, cookie });
        expect(answer.status).toBe(404);
        expect(answer.text).toBe(unknownRoute.text);
      }
      expect(await DiscoveryProfile.exists({ user: candidate.id })).toBeNull();
    }
  );

  it('records no activity at sign-in', async () => {
    useTestGoogleKeys();
    const candidate = await readyCandidate('quiet');
    expect((await grant(candidate)).status).toBe(200);
    const long = new Date(Date.now() - 200 * DAY);
    await DiscoveryProfile.updateOne({ user: candidate.id }, { $set: { lastActiveAt: long } });
    env.matchingEnabled = false;

    const token = await signGoogleIdToken({ claims: { sub: t.id('sub-quiet'), email: t.email('quiet') } });
    expect((await call('POST', '/login', { body: { token } })).status).toBe(200);
    await touchDiscovery(candidate.id);

    expect((await profileOf(candidate))?.lastActiveAt).toEqual(long);
  });
});

describe('GET /discovery', () => {
  it('needs a session, of an account that still exists', async () => {
    expect((await call('GET', '/discovery')).status).toBe(401);
    const gone = await authCookie(new Types.ObjectId().toString());
    expect((await call('GET', '/discovery', { cookie: gone })).status).toBe(401);
  });

  it('says a new account is off and misses everything, and stores nothing', async () => {
    const user = await createUser('new');
    expect(await status(user)).toEqual({
      state: 'off',
      enabledAt: null,
      consentExpiresAt: null,
      missing: ['portfolio', 'terms', 'criteria', 'pay', 'journey', 'calendar', 'schedule'],
      minScore: null,
      card: { headline: null, hiddenExperiences: [] }
    });
    expect(await DiscoveryProfile.exists({ user: user.id })).toBeNull();
  });

  it("gives the minimum of the journey's job match: the one bar a job is held to", async () => {
    const candidate = await createUser('min', { domain: true });
    const steps = journeyTemplate('gate').map((step) =>
      step.type === 'job-match' ? { ...step, config: { minScore: 82, showDetails: false } } : step
    );
    await saveJourney(candidate, steps);
    expect((await status(candidate)).minScore).toBe(82);
  });

  it('writes nothing for a candidate who is on, nor for one paused for inactivity', async () => {
    const candidate = await readyCandidate('reader');
    expect((await grant(candidate)).status).toBe(200);
    const asleep = new Date(Date.now() - (DISCOVERY_INACTIVITY_DAYS + 1) * DAY);
    await DiscoveryProfile.updateOne({ user: candidate.id }, { $set: { lastActiveAt: asleep } });
    const before = await profileOf(candidate);

    expect(await status(candidate)).toMatchObject({ state: 'paused', missing: ['active'] });

    const after = await profileOf(candidate);
    expect(after?.lastActiveAt).toEqual(asleep);
    expect(after?.updatedAt).toEqual(before?.updatedAt);
  });

  it("reads the session's account only", async () => {
    const candidate = await readyCandidate('owner');
    expect((await grant(candidate)).status).toBe(200);
    const other = await createUser('other');
    const asked = await call('GET', `/discovery?user=${candidate.id}`, { cookie: other.cookie });
    expect(asked.json()).toMatchObject({ state: 'off', enabledAt: null });
  });
});

describe('POST /discovery/consent', () => {
  it('needs a session', async () => {
    expect((await call('POST', '/discovery/consent', { body: { consent: currentDiscoveryConsent() } })).status).toBe(401);
  });

  it.each([
    ['no consent', undefined, 'consent'],
    ['the box not ticked', { termsVersion: LEGAL_VERSION, adultConfirmed: false }, 'consent.adultConfirmed'],
    ['the confirmation of the terms instead', CONSENT, 'consent.adultConfirmed'],
    ['an older version of the terms', { termsVersion: '2020-01-01', adultConfirmed: true }, 'consent.termsVersion']
  ])('refuses %s (422), before anything else, and records nothing', async (_label, consent, property) => {
    const user = await createUser('refused');
    const answer = await call('POST', '/discovery/consent', {
      body: consent === undefined ? {} : { consent },
      cookie: user.cookie
    });
    expect(answer.status).toBe(422);
    expect(answer.json()).toMatchObject({ type: 'validation', property });
    expect(await DiscoveryProfile.exists({ user: user.id })).toBeNull();
    expect(await RateLimitCounter.exists({ _id: new RegExp(`^${discoveryGrantsKey(user.id)}:`) })).toBeNull();
  });

  it('names each requirement still missing in turn, in the language of the request', async () => {
    const candidate = await createUser('steps');
    const refusedOn = async (requirement: string) => {
      const answer = await grant(candidate);
      expect(answer.status).toBe(422);
      expect(answer.json()).toMatchObject({ type: 'validation', on: 'body', property: `requirements.${requirement}` });
      return answer.json().message as string;
    };

    expect(await refusedOn('portfolio')).toBe('Claim the address of your portfolio first.');
    const french = await grant(candidate, currentDiscoveryConsent(), 'fr');
    expect(french.json().message).toBe("Réservez d'abord l'adresse de votre portfolio.");

    await Domain.create({ name: t.id('steps'), admin: candidate.id, experiences: [] });
    await refusedOn('terms');
    await recordConsent(candidate.id, CONSENT, 'account');
    // Two criteria: not enough, the pay among them or not
    await ratePerfectJob(candidate, { workMode: CRITERIA.workMode, contractTypes: CRITERIA.contractTypes });
    expect(await refusedOn('criteria')).toBe('Switch on at least 3 criteria in your perfect job.');
    await ratePerfectJob(candidate, { ...CRITERIA, pay: undefined, cities: { importance: 3, places: ['Lyon'] } });
    await refusedOn('pay');
    await ratePerfectJob(candidate);
    // The default journey, then one that scores no job before the meeting
    await refusedOn('journey');
    await saveJourney(candidate, [
      { id: 'job', type: 'job', config: {} },
      { id: 'meeting', type: 'meeting', config: {} }
    ]);
    await refusedOn('journey');
    await saveJourney(candidate);
    await refusedOn('calendar');
    // A site that takes no calendar: nothing to connect
    await connectCalendar(candidate);
    env.googleCalendarEnabled = false;
    await refusedOn('calendar');
    env.googleCalendarEnabled = true;
    // A meeting type turned off offers no slot
    await createSchedule(candidate, false);
    await refusedOn('schedule');
    await createSchedule(candidate);

    // Refused, none of them used the day's opt-ins: a candidate setting up is never locked out
    expect(await DiscoveryProfile.exists({ user: candidate.id })).toBeNull();
    expect(await RateLimitCounter.exists({ _id: new RegExp(`^${discoveryGrantsKey(candidate.id)}:`) })).toBeNull();
    const answer = await grant(candidate);
    expect(answer.status).toBe(200);
    expect(answer.json()).toMatchObject({ state: 'on', missing: [] });
  });

  it('turns discovery on and records the consent once, with the key of the wording read', async () => {
    const candidate = await readyCandidate('on');
    const before = Date.now();

    const answer = await grant(candidate, currentDiscoveryConsent(), 'fr-FR,fr;q=0.9');

    expect(answer.status).toBe(200);
    const body = answer.json();
    expect(body).toMatchObject({ state: 'on', missing: [], minScore: 70 });
    const enabledAt = new Date(body.enabledAt);
    expect(enabledAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(body.consentExpiresAt)).toEqual(discoveryConsentExpiry(enabledAt));
    const profile = await profileOf(candidate);
    expect(profile?.enabledAt).toEqual(enabledAt);
    expect(profile?.lastActiveAt).toEqual(enabledAt);
    expect(profile?.consents as unknown[]).toEqual([
      { action: 'granted', at: enabledAt, termsVersion: LEGAL_VERSION, wordingKey: DISCOVERY_CONSENT_KEYS.fr }
    ]);
    expect(await status(candidate)).toMatchObject({ state: 'on', enabledAt: body.enabledAt });
  });

  it('records one consent for two requests at once, and none for a candidate already on', async () => {
    const candidate = await readyCandidate('twice');

    const answers = await Promise.all([grant(candidate), grant(candidate)]);

    expect(answers.map((answer) => answer.status)).toEqual([200, 200]);
    const first = await profileOf(candidate);
    expect(first?.consents).toHaveLength(1);
    expect(first?.consents?.[0]).toMatchObject({ action: 'granted', wordingKey: DISCOVERY_CONSENT_KEYS.en });

    // Already on: nothing recorded again, but it is activity
    await DiscoveryProfile.updateOne({ user: candidate.id }, { $set: { lastActiveAt: new Date(Date.now() - 3 * DAY) } });
    expect((await grant(candidate)).json()).toMatchObject({ state: 'on' });
    const again = await profileOf(candidate);
    expect(again?.consents).toHaveLength(1);
    expect(again?.enabledAt).toEqual(first?.enabledAt);
    expect(Date.now() - again!.lastActiveAt!.getTime()).toBeLessThan(60_000);
  });

  it(`takes ${DISCOVERY_GRANTS_PER_DAY.limit} consents a day, then answers 429 with when to try again`, async () => {
    const candidate = await readyCandidate('toggle');
    for (let index = 0; index < DISCOVERY_GRANTS_PER_DAY.limit; index += 1) {
      // On each time: an opt-in asked after a withdrawal wins over it
      expect((await grant(candidate)).json()).toMatchObject({ state: 'on' });
      expect((await withdraw(candidate)).json()).toMatchObject({ state: 'off' });
    }

    const refused = await grant(candidate);

    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(refused.text).toBe('You can make yourself visible to recruiters 10 times a day. Try again tomorrow.');
    expect((await status(candidate)).state).toBe('off');
    // Withdrawing is never limited
    expect((await withdraw(candidate)).status).toBe(200);
  });

  it('asks for a new consent once the last one lapsed, and records it', async () => {
    const candidate = await readyCandidate('lapse');
    expect((await grant(candidate)).status).toBe(200);
    const given = new Date(Date.now() - 25 * 30 * DAY);
    await DiscoveryProfile.updateOne({ user: candidate.id }, { $set: { enabledAt: given } });
    expect(await status(candidate)).toMatchObject({ state: 'lapsed', missing: [] });

    const answer = await grant(candidate);

    expect(answer.json()).toMatchObject({ state: 'on' });
    const profile = await profileOf(candidate);
    expect(profile?.consents?.map((consent) => consent.action)).toEqual(['granted', 'granted']);
    expect(profile!.enabledAt!.getTime()).toBeGreaterThan(given.getTime());
  });

  it(`confirms a consent again in its last ${DISCOVERY_CONSENT_RENEWAL_DAYS} days, once for two requests at once`, async () => {
    const candidate = await readyCandidate('renew');
    expect((await grant(candidate)).status).toBe(200);
    // Lapsing in 10 days: on still, and confirmed again
    const lapsingSoon = discoveryConsentCutoff(new Date(Date.now() + 10 * DAY));
    await DiscoveryProfile.updateOne({ user: candidate.id }, { $set: { enabledAt: lapsingSoon } });
    expect(await status(candidate)).toMatchObject({ state: 'on', enabledAt: lapsingSoon.toISOString() });

    const answers = await Promise.all([grant(candidate, currentDiscoveryConsent(), 'fr'), grant(candidate)]);

    expect(answers.map((answer) => answer.json().state)).toEqual(['on', 'on']);
    const profile = await profileOf(candidate);
    expect(profile?.consents?.map((consent) => consent.action)).toEqual(['granted', 'granted']);
    expect(profile?.consents?.[1]).toMatchObject({ termsVersion: LEGAL_VERSION });
    const renewed = profile!.enabledAt!;
    expect(renewed.getTime()).toBeGreaterThan(lapsingSoon.getTime());
    expect(Date.now() - renewed.getTime()).toBeLessThan(60_000);
    expect(new Date((await status(candidate)).consentExpiresAt)).toEqual(discoveryConsentExpiry(renewed));
  });

  it(`records nothing again for a consent that lapses in more than ${DISCOVERY_CONSENT_RENEWAL_DAYS} days`, async () => {
    const candidate = await readyCandidate('early');
    expect((await grant(candidate)).status).toBe(200);
    const lapsingLater = discoveryConsentCutoff(new Date(Date.now() + (DISCOVERY_CONSENT_RENEWAL_DAYS + 2) * DAY));
    await DiscoveryProfile.updateOne({ user: candidate.id }, { $set: { enabledAt: lapsingLater } });

    expect((await grant(candidate)).json()).toMatchObject({ state: 'on', enabledAt: lapsingLater.toISOString() });

    const profile = await profileOf(candidate);
    expect(profile?.enabledAt).toEqual(lapsingLater);
    expect(profile?.consents).toHaveLength(1);
  });
});

describe('DELETE /discovery/consent', () => {
  it('turns discovery off at once, records it, and drops the pending decisions', async () => {
    const candidate = await readyCandidate('withdraw');
    expect((await grant(candidate)).status).toBe(200);
    const dropped = spyOn(discoveryWithdrawal, 'dropPendingDecisions');

    const answer = await withdraw(candidate);

    expect(answer.status).toBe(200);
    expect(answer.json()).toMatchObject({ state: 'off', enabledAt: null, consentExpiresAt: null, missing: [] });
    expect(dropped).toHaveBeenCalledWith(candidate.id);
    const profile = await profileOf(candidate);
    expect(profile?.enabledAt).toBeUndefined();
    expect(profile?.consents?.map((consent) => consent.action)).toEqual(['granted', 'withdrawn']);
    expect(profile?.consents?.[1]).not.toHaveProperty('wordingKey');
  });

  it('works whatever is missing, and records nothing for a candidate already off', async () => {
    const candidate = await readyCandidate('paused');
    expect((await grant(candidate)).status).toBe(200);
    await User.updateOne({ _id: candidate.id }, { $unset: { 'googleCalendar.refreshToken': 1 } });
    await Domain.deleteOne({ admin: candidate.id });
    expect(await status(candidate)).toMatchObject({ state: 'paused', missing: ['portfolio', 'calendar'] });

    expect((await withdraw(candidate)).json()).toMatchObject({ state: 'off' });
    expect((await withdraw(candidate)).json()).toMatchObject({ state: 'off' });

    const never = await createUser('never');
    expect((await withdraw(never)).json()).toMatchObject({ state: 'off' });
    expect((await profileOf(candidate))?.consents?.map((consent) => consent.action)).toEqual(['granted', 'withdrawn']);
    // When it was asked, and nothing else: no consent was ever given
    const kept = await profileOf(never);
    expect(kept?.withdrawnAt).toBeInstanceOf(Date);
    expect(kept?.enabledAt).toBeUndefined();
    expect(kept?.consents).toBeUndefined();
  });

  it('wins over an opt-in under way when it was asked: the candidate ends off', async () => {
    const candidate = await readyCandidate('race');
    // The opt-in held just before it writes, past its reads and its rate limit
    const updateOne = DiscoveryProfile.updateOne.bind(DiscoveryProfile);
    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached = () => {};
    const atWrite = new Promise<void>((resolve) => {
      reached = resolve;
    });
    spyOn(DiscoveryProfile, 'updateOne').mockImplementation(((...args: Parameters<typeof updateOne>) => {
      if (args[1] && '$setOnInsert' in args[1]) {
        reached();
        return released.then(() => updateOne(...args));
      }
      return updateOne(...args);
    }) as never);

    const granting = grant(candidate);
    await atWrite;
    expect((await withdraw(candidate)).json()).toMatchObject({ state: 'off' });
    release();

    expect((await granting).json()).toMatchObject({ state: 'off', enabledAt: null });
    expect(await status(candidate)).toMatchObject({ state: 'off' });
    const profile = await profileOf(candidate);
    expect(profile?.enabledAt).toBeUndefined();
    expect(profile?.consents).toBeUndefined();
  });

  it('wins over an opt-in under way for a candidate who was on: off, the withdrawal recorded last', async () => {
    const candidate = await readyCandidate('race-on');
    expect((await grant(candidate)).status).toBe(200);
    // Lapsed: the next opt-in records a consent again, held just before its write
    await DiscoveryProfile.updateOne({ user: candidate.id }, { $set: { enabledAt: new Date(Date.now() - 25 * 30 * DAY) } });
    const updateOne = DiscoveryProfile.updateOne.bind(DiscoveryProfile);
    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached = () => {};
    const atWrite = new Promise<void>((resolve) => {
      reached = resolve;
    });
    spyOn(DiscoveryProfile, 'updateOne').mockImplementation(((...args: Parameters<typeof updateOne>) => {
      if (args[1] && '$setOnInsert' in args[1]) {
        reached();
        return released.then(() => updateOne(...args));
      }
      return updateOne(...args);
    }) as never);

    const granting = grant(candidate);
    await atWrite;
    expect((await withdraw(candidate)).json()).toMatchObject({ state: 'off' });
    release();

    expect((await granting).json()).toMatchObject({ state: 'off' });
    const profile = await profileOf(candidate);
    expect(profile?.enabledAt).toBeUndefined();
    expect(profile?.consents?.map((consent) => consent.action)).toEqual(['granted', 'withdrawn']);
  });
});

describe('paused, and active again', () => {
  it('pauses a candidate who lost a requirement, and resumes them once it is back', async () => {
    const candidate = await readyCandidate('lost');
    expect((await grant(candidate)).status).toBe(200);

    await AppointmentSchedule.updateMany({ user: candidate.id }, { $set: { enabled: false } });
    expect(await status(candidate)).toMatchObject({ state: 'paused', missing: ['schedule'] });

    await AppointmentSchedule.updateMany({ user: candidate.id }, { $set: { enabled: true } });
    expect(await status(candidate)).toMatchObject({ state: 'on', missing: [] });
  });

  it(`pauses a candidate who has not signed in for ${DISCOVERY_INACTIVITY_DAYS} days, until they sign in`, async () => {
    useTestGoogleKeys();
    const candidate = await readyCandidate('asleep');
    expect((await grant(candidate)).status).toBe(200);
    await DiscoveryProfile.updateOne(
      { user: candidate.id },
      { $set: { lastActiveAt: new Date(Date.now() - (DISCOVERY_INACTIVITY_DAYS + 1) * DAY) } }
    );
    expect(await status(candidate)).toMatchObject({ state: 'paused', missing: ['active'] });

    const token = await signGoogleIdToken({ claims: { sub: t.id('sub-asleep'), email: t.email('asleep') } });
    const login = await call('POST', '/login', { body: { token } });
    expect(login.status).toBe(200);

    const cookie = `auth=${parseCookie(login.headers.get('Set-Cookie') ?? '')['auth']}`;
    expect(await status({ ...candidate, cookie })).toMatchObject({ state: 'on', missing: [] });
  });

  it('counts saving the card as activity: a candidate paused for inactivity is on again', async () => {
    const candidate = await readyCandidate('back');
    expect((await grant(candidate)).status).toBe(200);
    await DiscoveryProfile.updateOne(
      { user: candidate.id },
      { $set: { lastActiveAt: new Date(Date.now() - (DISCOVERY_INACTIVITY_DAYS + 1) * DAY) } }
    );
    expect(await status(candidate)).toMatchObject({ state: 'paused', missing: ['active'] });

    const saved = await call('PUT', '/discovery', { body: { card: { headline: 'Backend engineer' } }, cookie: candidate.cookie });

    expect(saved.json()).toMatchObject({ state: 'on', missing: [] });
    expect(Date.now() - (await profileOf(candidate))!.lastActiveAt!.getTime()).toBeLessThan(60_000);
  });

  it('writes the activity at most once a day, and only while discovery is on', async () => {
    const candidate = await readyCandidate('busy');
    expect((await grant(candidate)).status).toBe(200);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await DiscoveryProfile.updateOne({ user: candidate.id }, { $set: { lastActiveAt: hourAgo } });

    await touchDiscovery(candidate.id);
    expect((await profileOf(candidate))?.lastActiveAt).toEqual(hourAgo);

    expect((await withdraw(candidate)).status).toBe(200);
    const long = new Date(Date.now() - 3 * DAY);
    await DiscoveryProfile.updateOne({ user: candidate.id }, { $set: { lastActiveAt: long } });
    await touchDiscovery(candidate.id);
    expect((await profileOf(candidate))?.lastActiveAt).toEqual(long);
  });

  it('never fails a sign-in on it', async () => {
    useTestGoogleKeys();
    const warn = spyOn(logger, 'warn').mockImplementation(() => {});
    spyOn(DiscoveryProfile, 'updateOne').mockImplementation((() => {
      throw new Error('connection lost');
    }) as never);
    const candidate = await createUser('signin');

    const token = await signGoogleIdToken({ claims: { sub: t.id('sub-signin'), email: t.email('signin') } });
    expect((await call('POST', '/login', { body: { token } })).status).toBe(200);
    expect(warn).toHaveBeenCalledWith('Discovery activity could not be recorded', { userId: candidate.id, error: 'Error' });
  });
});

describe('PUT /discovery', () => {
  it('saves the card, on or off: a headline cleaned, the experiences of the portfolio hidden', async () => {
    const candidate = await createUser('card', { domain: true, experiences: 3 });
    const other = await createUser('stranger', { domain: true, experiences: 1 });
    const [first, second] = candidate.experiences;

    const answer = await call('PUT', '/discovery', {
      body: {
        card: {
          headline: '  Payments​ engineer,\n 8 years  ',
          // Its own (twice, in another case), one of another portfolio, one that does not exist
          hiddenExperiences: [first, first.toUpperCase(), second, other.experiences[0], new Types.ObjectId().toString()]
        }
      },
      cookie: candidate.cookie
    });

    expect(answer.status).toBe(200);
    expect(answer.json()).toMatchObject({
      state: 'off',
      card: { headline: 'Payments engineer, 8 years', hiddenExperiences: [first, second] }
    });
    expect((await profileOf(candidate))?.card?.hiddenExperiences?.map(String)).toEqual([first, second]);

    // An experience deleted since is no longer listed
    await Domain.updateOne({ admin: candidate.id }, { $pull: { experiences: new Types.ObjectId(first) } });
    expect((await status(candidate)).card).toEqual({ headline: 'Payments engineer, 8 years', hiddenExperiences: [second] });

    // An empty headline clears it
    const cleared = await call('PUT', '/discovery', { body: { card: { headline: ' ' } }, cookie: candidate.cookie });
    expect(cleared.json().card).toEqual({ headline: null, hiddenExperiences: [] });
    expect((await profileOf(candidate))?.card?.headline).toBeUndefined();
  });

  it.each([
    ['settings that are not an object', 'Backend engineer', 'card'],
    ['a headline too long', { headline: 'a'.repeat(81) }, 'card.headline'],
    ['a link in the headline', { headline: 'See https://jane.dev' }, 'card.headline'],
    ['an email address in the headline', { headline: 'jane@example.com' }, 'card.headline'],
    ['an address in look-alike signs', { headline: 'jane＠example.com' }, 'card.headline'],
    ['a profile on another site', { headline: 'linkedin.com/in/jane' }, 'card.headline'],
    ["a portfolio's address", { headline: 'portfolio.gentil.tech/louis.gentil' }, 'card.headline'],
    ['a phone number', { headline: 'Backend, 06 12 34 56 78' }, 'card.headline'],
    ['ids that are not ids', { hiddenExperiences: ['abc'] }, 'card.hiddenExperiences']
  ])('refuses %s (422) and saves nothing', async (_label, card, property) => {
    const candidate = await createUser('bad', { domain: true, experiences: 1 });
    const answer = await call('PUT', '/discovery', { body: { card }, cookie: candidate.cookie });
    expect(answer.status).toBe(422);
    expect(answer.json()).toMatchObject({ type: 'validation', property });
    expect(await DiscoveryProfile.exists({ user: candidate.id })).toBeNull();
  });

  it('says the rules in the language of the request', async () => {
    const candidate = await createUser('fr', { domain: true });
    const answer = await call('PUT', '/discovery', {
      body: { card: { headline: 'a'.repeat(81) } },
      cookie: candidate.cookie,
      language: 'fr'
    });
    expect(answer.json().message).toBe('Votre accroche peut faire 80 caractères au plus.');
  });

  it("refuses a headline that names the candidate or their portfolio, and keeps one that does not", async () => {
    const candidate = await createUser('named', { domain: true });
    await Domain.updateOne({ admin: candidate.id }, { $set: { headerTitle: 'Léa Quillfeather' } });
    await User.updateOne({ _id: candidate.id }, { $set: { name: 'Zoé', surname: 'Marchetti' } });
    const host = new URL(env.ALLOWED_DOMAINS[0]).host;
    const save = (headline: string, language?: string) =>
      call('PUT', '/discovery', { body: { card: { headline } }, cookie: candidate.cookie, language });

    for (const headline of [
      // Its address name, the title of its portfolio (whatever the case or the accents), its name, a page of the site
      `${candidate.domain} — backend`,
      `${candidate.domain!.toUpperCase()}, backend`,
      'lea quillfeather, backend engineer',
      'Backend engineer (Zoé Marchetti)',
      `See ${host}/someone`
    ]) {
      const answer = await save(headline);
      expect(answer.status).toBe(422);
      expect(answer.json()).toMatchObject({ property: 'card.headline', message: matchingMessages.card.headlineIdentity });
    }
    expect((await save('lea quillfeather', 'fr')).json().message).toBe(
      withLocale('fr', () => matchingMessages.card.headlineIdentity)
    );
    expect(await DiscoveryProfile.exists({ user: candidate.id })).toBeNull();

    // A word of them inside another word is no name: kept
    const kept = await save('Quillfeathered backend engineer, Node.js/React');
    expect(kept.status).toBe(200);
    expect(kept.json().card.headline).toBe('Quillfeathered backend engineer, Node.js/React');
  });

  it('logs nothing the candidate set: neither a headline nor the experiences hidden', async () => {
    const lines: unknown[][] = [];
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      spyOn(logger, level).mockImplementation((...args: unknown[]) => {
        lines.push(args);
      });
    }
    const candidate = await readyCandidate('private', { experiences: 2 });
    const headline = `Quillwright ${t.suffix}`;

    const saved = await call('PUT', '/discovery', {
      body: { card: { headline, hiddenExperiences: candidate.experiences } },
      cookie: candidate.cookie
    });
    const refused = await call('PUT', '/discovery', {
      body: { card: { headline: `${headline} https://jane.dev`, hiddenExperiences: candidate.experiences } },
      cookie: candidate.cookie
    });
    const named = await call('PUT', '/discovery', { body: { card: { headline: candidate.domain } }, cookie: candidate.cookie });
    expect([saved.status, refused.status, named.status]).toEqual([200, 422, 422]);
    expect((await grant(candidate)).status).toBe(200);
    expect((await withdraw(candidate)).status).toBe(200);

    // The 422s were logged, without what was sent
    expect(lines.length).toBeGreaterThan(0);
    const logged = JSON.stringify(lines);
    for (const secret of [headline, candidate.domain!, ...candidate.experiences]) {
      expect(logged).not.toContain(secret);
    }
  });
});

describe('what discovery is built on', () => {
  it('asks no model anything: no Claude SDK, no PDF extraction', () => {
    for (const file of ['../services/discovery.ts', '../plugins/matches.ts']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source).not.toContain('@anthropic-ai/sdk');
      expect(source).not.toContain('claudePdfExtraction');
    }
  });
});
