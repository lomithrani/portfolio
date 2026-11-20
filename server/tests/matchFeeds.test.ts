// The feeds of matching (Path 2, behind MATCHING): the jobs proposed to a
// candidate (GET /opportunities), the anonymous cards of the candidates
// proposed for a recruiter's job (GET /recruiter/jobs/:id/candidates), the
// tokens that stand for those candidates (services/matchTokens.ts), and the
// private page of a job proposed to a candidate (`access: 'feed'` of
// GET /opportunities/jobs/:id), against a real MongoDB (MONGO_URL, local or
// from TEST_MONGO_URL). Each test creates its own accounts, portfolios,
// perfect jobs, journeys, postings and decisions, named with a suffix unique to
// that test, and removes them after: tests pass in any order (--randomize).
// Every job of a test is titled with its suffix, which its candidates ask for
// (a deal-breaker): what another test left behind is never proposed here.
// Nothing asks an outside service: fetch fails the test unless a test answers
// it (the geocoder and the routes, for the one warm-up that runs), and the
// warm-ups a feed asks for are recorded instead.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import mongoose, { Types } from 'mongoose';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CARD_WITHHELD_CRITERIA,
  ExperienceType,
  MATCHING_LIMITS,
  currentDiscoveryConsent,
  discoveryConsentCutoff,
  journeyTemplate,
  matchDecisionExpiry
} from 'portfolio-common';
import { env } from '../env';
import { createApp } from '../app';
import {
  AppointmentSchedule,
  CommuteCache,
  DiscoveryProfile,
  Domain,
  Experience,
  JobPosting,
  Match,
  PerfectJob,
  RateLimitCounter,
  Skill,
  User,
  Workflow,
  WorkflowInstance
} from '../models/database';
import type { JobPosting as StoredJobPosting } from '../models/database/jobPosting';
import { JOB_NOT_PROPOSED, NOT_PROPOSED_TO_RECRUITERS } from '../protocol';
import { CANDIDATE_CARD_FIELDS } from '../services/candidateCard';
import { commuteWarmUps, warmCommute } from '../services/commute';
import type { CommutePair } from '../services/commute';
import { discoveryGrantsKey } from '../services/discovery';
import { isLiveInMatching, jobMatchingWarmUp } from '../services/jobMatching';
import { reviewedVersion } from '../services/jobVersion';
import { JOB_NOT_FOUND } from '../services/jobPostings';
import { MATCHING_FEED_READS, matchFeedWarmUps, matchingFeedKey } from '../services/matchFeeds';
import { MATCH_TOKEN_TTL_MS, openMatchToken, sealMatchToken } from '../services/matchTokens';
import { hashValue, takeRateLimit } from '../services/rateLimit';
import { recordConsent } from '../services/legal';
import { CONSENT, authCookie, openRecruiterSpace } from './helpers';
import { assertDisposableDatabase } from './testDatabase';

/** Names unique to one test: everything it creates carries its suffix */
const testNames = () => {
  // A letter between the time and the random part: never a run of 9 digits, which a card reads as
  // a phone number and leaves out (what the card checks its texts against is named with the suffix)
  const suffix = `${Date.now().toString(36)}x${Math.random().toString(36).slice(2, 8)}`;
  const id = (name: string) => `feed-${name}-${suffix}`;
  // The skills' own tag: letters no account's address holds (a card leaves out a skill named like
  // its candidate, and their address names them)
  const skillTag = `Sk${Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')}`;
  return { suffix, id, skillTag, email: (name: string) => `${id(name)}@example.com` };
};

const DAY = 24 * 60 * 60 * 1000;

let app: ReturnType<typeof createApp>;
let t: ReturnType<typeof testNames>;
let connected = false;
/** The pairs the feeds asked to warm up, and for whose account */
let warmUps: { pair: CommutePair; accountId: string }[] = [];
/** Every request fetch was asked, outside the tests that answer it */
let fetched: string[] = [];
const saved = {
  matching: env.matchingEnabled,
  calendar: env.googleCalendarEnabled,
  commute: env.commuteTimesEnabled,
  transit: env.COMMUTE_TRANSIT,
  warmUps: { ...commuteWarmUps }
};

const call = async (
  method: string,
  path: string,
  { body, cookie, language }: { body?: unknown; cookie?: string; language?: string } = {}
) => {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  if (language) headers['Accept-Language'] = language;
  const text = body === undefined ? undefined : JSON.stringify(body);
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
  email: string;
}

/** An account of this test, with a recruiter space (and the terms in force) when `recruiter` */
const createUser = async (name: string, { recruiter = false } = {}): Promise<TestUser> => {
  const email = t.email(name);
  const user = await User.create({ email, googleId: t.id(`sub-${name}`), name: `${name}first`, surname: `${name}last` });
  const id = user._id.toString();
  if (recruiter) expect(await openRecruiterSpace(id)).toBe(true);
  return { id, cookie: await authCookie(id), email };
};

const createRecruiter = (name = 'recruiter') => createUser(name, { recruiter: true });

/** The skill of this test's portfolios, in the site's catalogue: named with its skill tag (removed after) */
let testSkill: Promise<Types.ObjectId> | undefined;
const kotlin = () => {
  const displayName = `Kotlin ${t.skillTag}`;
  return (testSkill ??= Skill.create({ displayName, names: [displayName] }).then((skill) => skill._id));
};

/**
 * A portfolio for `user`: one professional role at a company, in a place, with a project using a
 * skill (what the card may show of it: the role's title, its months, the skill), its address name
 * and title named after the account. The experiences are tagged with the test's suffix (`icon`),
 * which afterEach removes
 */
const createPortfolio = async (user: TestUser, name: string) => {
  const skill = await kotlin();
  const [experience] = await Experience.insertMany([
    {
      icon: t.id('exp'),
      type: ExperienceType.Professional,
      title: 'Platform engineer',
      company: { name: `Globex${name}` },
      location: 'Quimperlé',
      start: new Date(Date.UTC(2020, 0, 1)),
      projects: [{ name: `Project Falcon ${name}`, summary: 'The ledger', start: new Date(Date.UTC(2020, 0, 1)), hardSkills: [{ skill }] }]
    }
  ]);
  const domain = t.id(`${name}-portfolio`);
  await Domain.create({ name: domain, admin: user.id, headerTitle: `Quill${name}`, experiences: [experience._id] });
  return { domain, experience: String(experience._id) };
};

/**
 * What a candidate of this test rates: the test's jobs only (their title, a deal-breaker), the pay
 * (`perYear`), a hybrid job with 2 days at home, a CDI
 */
const criteria = ({ perYear = 50_000, payDealBreaker = true, ...extra }: Record<string, any> = {}) => ({
  titles: { importance: 1, dealBreaker: true, keywords: [t.suffix] },
  pay: { importance: 5, ...(payDealBreaker ? { dealBreaker: true } : {}), perYear },
  workMode: { importance: 4, modes: ['hybrid'], minRemoteDays: 2 },
  contractTypes: { importance: 3, types: ['cdi'] },
  ...extra
});

/** The gate journey, its job match with `minScore` and `showDetails` */
const gate = (minScore: number, showDetails: boolean) =>
  journeyTemplate('gate').map((step) =>
    step.type === 'job-match' ? { ...step, config: { minScore, showDetails } } : step
  );

/** A Google Calendar grant, as the API stores it once connected (never used: nothing asks Google) */
const connectCalendar = (user: TestUser) =>
  User.updateOne(
    { _id: user.id },
    { $set: { 'googleCalendar.refreshToken': t.id('refresh-token'), 'googleCalendar.connectedAt': new Date() } }
  );

/**
 * A candidate proposed to recruiters, as they set it up: a portfolio, the terms, their perfect job
 * (stored directly when it has a commute: its place is the API's to find), the gate journey, a
 * calendar and a meeting type with hours, then the discovery consent
 */
const proposedCandidate = async (
  name: string,
  {
    rated = criteria(),
    minScore = 70,
    showDetails = true
  }: { rated?: Record<string, unknown>; minScore?: number; showDetails?: boolean } = {}
) => {
  const user = await createUser(name);
  const portfolio = await createPortfolio(user, name);
  await recordConsent(user.id, CONSENT, 'account');
  if ('commute' in rated) {
    await PerfectJob.updateOne({ user: user.id }, { $set: { criteria: rated } }, { upsert: true });
  } else {
    expect((await call('PUT', '/perfect-job', { body: { criteria: rated }, cookie: user.cookie })).status).toBe(200);
  }
  expect((await call('PUT', '/workflow', { body: { steps: gate(minScore, showDetails) }, cookie: user.cookie })).status).toBe(200);
  await connectCalendar(user);
  await AppointmentSchedule.create({
    user: user.id,
    title: t.id('call'),
    timezone: 'Europe/Paris',
    enabled: true,
    availability: [{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00' }]
  });
  const granted = await call('POST', '/discovery/consent', { body: { consent: currentDiscoveryConsent() }, cookie: user.cookie });
  expect(granted.json().state).toBe('on');
  return { ...user, ...portfolio };
};

type Candidate = Awaited<ReturnType<typeof proposedCandidate>>;

/** A valid open posting of this test: CDI in Lyon, hybrid 2 days, 45-55 k€ a year */
const sampleJob = (overrides: Record<string, unknown> = {}) => ({
  title: `Senior Backend Engineer ${t.suffix}`,
  description: '## The job\n\nBuild the billing platform.',
  company: 'Acme Feeds',
  status: 'open',
  location: { country: 'FR', city: 'Lyon', postalCode: '69002', workMode: 'hybrid', remoteDaysPerWeek: 2 },
  contract: { type: 'cdi' },
  workingTime: { arrangement: 'weekly_hours', hoursPerWeek: 39 },
  pay: { min: 45000, max: 55000, currency: 'EUR', period: 'year' },
  ...overrides
});

type Review = 'approved' | 'pending' | 'rejected';

/**
 * A posting of `recruiter`, stored directly: in matching and reviewed as `review` (the switch and
 * the review have tests of their own, tests/matches.test.ts), unless `matching` is false
 */
const storeJob = async (
  recruiter: TestUser,
  {
    overrides = {},
    review = 'approved',
    matching = true,
    publishedAt = new Date()
  }: { overrides?: Record<string, unknown>; review?: Review; matching?: boolean; publishedAt?: Date } = {}
) => {
  const [job] = await JobPosting.insertMany([{ recruiter: recruiter.id, ...sampleJob(overrides), publishedAt }]);
  if (matching) {
    const stored = (await JobPosting.findById(job._id).lean<StoredJobPosting>())!;
    await JobPosting.updateOne(
      { _id: job._id },
      {
        $set: {
          matching: {
            enabledAt: new Date(),
            review: {
              status: review,
              requestedAt: new Date(),
              ...(review === 'pending' ? {} : { reviewedAt: new Date(), version: reviewedVersion(stored) }),
              ...(review === 'rejected' ? { reason: 'Not a real job' } : {})
            }
          }
        }
      },
      { timestamps: false }
    );
  }
  return String(job._id);
};

/** A decision of each side on `jobId`, stored directly (tests/matches.test.ts covers the decisions' routes) */
const storeDecision = (
  jobId: string,
  recruiter: TestUser,
  candidate: TestUser,
  sides: { candidate?: 'interested' | 'pass'; recruiter?: 'interested' | 'pass' }
) => {
  const at = new Date(Date.now() - DAY);
  return Match.create({
    job: jobId,
    recruiter: recruiter.id,
    candidate: candidate.id,
    ...(sides.candidate ? { candidateDecision: { value: sides.candidate, at } } : {}),
    ...(sides.recruiter ? { recruiterDecision: { value: sides.recruiter, at } } : {}),
    expiresAt: matchDecisionExpiry(at)
  });
};

/** The recruiter shared `jobId` on the candidate's page for recruiters (their job step), stored directly */
const pickOnJourney = (candidate: TestUser, recruiter: TestUser, jobId: string) =>
  WorkflowInstance.create({
    owner: candidate.id,
    visitor: recruiter.id,
    steps: { job: { data: { job: jobId, selectedAt: new Date() }, updatedAt: new Date() } }
  });

const candidateFeed = (user: TestUser, query = '', language?: string) =>
  call('GET', `/opportunities${query}`, { cookie: user.cookie, language });

const recruiterFeed = (recruiter: TestUser, jobId: string, language?: string) =>
  call('GET', `/recruiter/jobs/${jobId}/candidates`, { cookie: recruiter.cookie, language });

/** The ids of the candidates a recruiter's cards stand for, in order (their tokens opened) */
const candidatesOf = (body: { cards: { token: string }[] }, recruiter: TestUser, jobId: string) =>
  body.cards.map((card) => openMatchToken(card.token, { recruiterId: recruiter.id, jobId }));

/** The ids in the order the recruiter's feed draws them for `jobId`, those interested aside */
const hashOrder = (jobId: string, candidates: { id: string }[]) =>
  [...candidates]
    .map((candidate) => ({ id: candidate.id, rank: hashValue(`${jobId}:${candidate.id}`) }))
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
    .map((candidate) => candidate.id);

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  await Promise.all([
    User.init(),
    Domain.init(),
    JobPosting.init(),
    Match.init(),
    DiscoveryProfile.init(),
    Workflow.init(),
    WorkflowInstance.init(),
    PerfectJob.init()
  ]);
});

afterAll(async () => {
  env.matchingEnabled = saved.matching;
  env.googleCalendarEnabled = saved.calendar;
  env.commuteTimesEnabled = saved.commute;
  env.COMMUTE_TRANSIT = saved.transit;
  Object.assign(commuteWarmUps, saved.warmUps);
  if (connected) await mongoose.disconnect();
});

beforeEach(() => {
  t = testNames();
  testSkill = undefined;
  // Before the app is built: it registers the matching routes only while the flag is on
  env.matchingEnabled = true;
  env.googleCalendarEnabled = true;
  env.commuteTimesEnabled = false;
  env.COMMUTE_TRANSIT = undefined;
  app = createApp();
  warmUps = [];
  fetched = [];
  spyOn(jobMatchingWarmUp, 'office').mockImplementation(async () => {});
  spyOn(matchFeedWarmUps, 'commute').mockImplementation(async (pair, accountId) => {
    warmUps.push({ pair, accountId });
  });
  spyOn(globalThis, 'fetch').mockImplementation((async (input: string | URL | Request) => {
    fetched.push(String(input instanceof Request ? input.url : input));
    throw new Error('No outside request in these tests');
  }) as unknown as typeof fetch);
});

afterEach(async () => {
  mock.restore();
  env.matchingEnabled = saved.matching;
  env.googleCalendarEnabled = saved.calendar;
  env.commuteTimesEnabled = saved.commute;
  env.COMMUTE_TRANSIT = saved.transit;
  Object.assign(commuteWarmUps, saved.warmUps);
  if (!connected) return;
  const users = (await User.find({ email: new RegExp(`-${t.suffix}@`) }, '_id').lean()).map((user) => user._id);
  const jobs = (await JobPosting.find({ recruiter: { $in: users } }, '_id').lean()).map((job) => job._id);
  await Match.deleteMany({ $or: [{ candidate: { $in: users } }, { recruiter: { $in: users } }, { job: { $in: jobs } }] });
  await JobPosting.deleteMany({ _id: { $in: jobs } });
  await WorkflowInstance.deleteMany({ $or: [{ owner: { $in: users } }, { visitor: { $in: users } }] });
  await Experience.deleteMany({ icon: new RegExp(`-${t.suffix}$`) });
  await Skill.deleteMany({ displayName: new RegExp(` ${t.skillTag}$`) });
  await CommuteCache.deleteMany({});
  await AppointmentSchedule.deleteMany({ user: { $in: users } });
  await PerfectJob.deleteMany({ user: { $in: users } });
  await Workflow.deleteMany({ user: { $in: users } });
  await Domain.deleteMany({ admin: { $in: users } });
  await DiscoveryProfile.deleteMany({ user: { $in: users } });
  for (const user of users) {
    for (const key of [matchingFeedKey(String(user)), discoveryGrantsKey(String(user))]) {
      await RateLimitCounter.deleteMany({ _id: new RegExp(`^${key}:`) });
    }
  }
  await RateLimitCounter.deleteMany({ _id: { $regex: '^(commute-calls|discovery-commute|discovery-commute-site):' } });
  await User.deleteMany({ _id: { $in: users } });
});

// ── The flag ────────────────────────────────────────────────

describe('while MATCHING is off', () => {
  it('registers neither feed: the 404 of a route that does not exist, and nothing counted', async () => {
    env.matchingEnabled = false;
    app = createApp();
    const candidate = await createUser('candidate');
    const recruiter = await createRecruiter();
    const jobId = await storeJob(recruiter);
    expect(app.routes.some((route) => route.path === '/opportunities' || route.path.endsWith('/candidates'))).toBe(false);

    for (const [user, path] of [
      [candidate, '/opportunities'],
      [recruiter, `/recruiter/jobs/${jobId}/candidates`]
    ] as const) {
      const unknownRoute = await call('GET', `${path}-that-does-not-exist`, { cookie: user.cookie });
      for (const cookie of [undefined, user.cookie]) {
        const answer = await call('GET', path, { cookie });
        expect(answer.status).toBe(unknownRoute.status);
        expect(answer.text).toBe(unknownRoute.text);
      }
      expect(await RateLimitCounter.exists({ _id: new RegExp(`^${matchingFeedKey(user.id)}:`) })).toBeNull();
    }
  });

  it('answers the 404 once it is turned off after the app is built, before the session is read', async () => {
    const recruiter = await createRecruiter();
    const jobId = await storeJob(recruiter);
    env.matchingEnabled = false;

    expect((await call('GET', '/opportunities')).status).toBe(404);
    expect((await recruiterFeed(recruiter, jobId)).status).toBe(404);
    expect(await RateLimitCounter.exists({ _id: new RegExp(`^${matchingFeedKey(recruiter.id)}:`) })).toBeNull();
  });

  it('shows no job proposed to a candidate on its private page', async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate('candidate');
    const jobId = await storeJob(recruiter);
    expect((await call('GET', `/opportunities/jobs/${jobId}`, { cookie: candidate.cookie })).json().access).toBe('feed');

    env.matchingEnabled = false;
    app = createApp();
    const answer = await call('GET', `/opportunities/jobs/${jobId}`, { cookie: candidate.cookie });
    expect(answer.status).toBe(404);
    expect(answer.text).toBe(JOB_NOT_FOUND);
  });
});

// ── The candidate's feed ────────────────────────────────────

describe('GET /opportunities', () => {
  it('needs a session', async () => {
    expect((await call('GET', '/opportunities')).status).toBe(401);
  });

  it('answers 403 to an account not proposed to recruiters: never on, withdrawn, or paused', async () => {
    const never = await createUser('never');
    expect((await candidateFeed(never)).status).toBe(403);
    expect((await candidateFeed(never)).text).toBe(NOT_PROPOSED_TO_RECRUITERS);

    const withdrawn = await proposedCandidate('withdrawn');
    expect((await candidateFeed(withdrawn)).status).toBe(200);
    expect((await call('DELETE', '/discovery/consent', { cookie: withdrawn.cookie })).status).toBe(200);
    expect((await candidateFeed(withdrawn)).status).toBe(403);

    // A requirement gone since: the calendar disconnected
    const paused = await proposedCandidate('paused');
    await User.updateOne({ _id: paused.id }, { $unset: { 'googleCalendar.refreshToken': 1 } });
    expect((await candidateFeed(paused)).status).toBe(403);
  });

  it('lists the jobs proposed now, the most recently published first, scored against the candidate own criteria', async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate('candidate', {
      rated: criteria({ perYear: 54_500, payDealBreaker: false }),
      minScore: 70
    });
    const older = await storeJob(recruiter, { publishedAt: new Date(Date.now() - 3 * DAY) });
    const newer = await storeJob(recruiter, { publishedAt: new Date(Date.now() - DAY) });

    const answer = await candidateFeed(candidate);

    expect(answer.status).toBe(200);
    const body = answer.json();
    expect(Object.keys(body).sort()).toEqual(['jobs', 'more', 'next', 'pending']);
    expect(body.jobs.map((card: any) => card.job._id)).toEqual([newer, older]);
    expect(body).toMatchObject({ more: false, next: null, pending: false });
    const [card] = body.jobs;
    // In the top tenth of the range: 0.7 of the pay's 5, the rest matching (1 + 3.5 + 4 + 3 of 13)
    expect(card).toMatchObject({ score: 88, minScore: 70 });
    expect(card.criteria).toEqual([
      { criterion: 'titles', outcome: 'match' },
      { criterion: 'workMode', outcome: 'match' },
      { criterion: 'contractTypes', outcome: 'match' },
      { criterion: 'pay', outcome: 'partial' }
    ]);
    // The posting as scored, with when it was published: never who posted it
    expect(card.job).toMatchObject({
      title: `Senior Backend Engineer ${t.suffix}`,
      company: 'Acme Feeds',
      description: '## The job\n\nBuild the billing platform.',
      pay: { min: 45000, max: 55000, currency: 'EUR', period: 'year' }
    });
    expect(new Date(card.job.publishedAt).getTime()).toBeGreaterThan(Date.now() - 2 * DAY);
    expect(card.job).not.toHaveProperty('status');
    expect(card.job).not.toHaveProperty('recruiter');
    // Nothing of the recruiter (the founder's decision 17): not their id, address, its domain or their name
    for (const secret of [recruiter.id, recruiter.email, 'example.com', 'recruiterfirst', 'recruiterlast']) {
      expect(answer.text.toLowerCase()).not.toContain(secret.toLowerCase());
    }
  });

  it('leaves out every job that is not proposed to the candidate, or that they or its recruiter answered', async () => {
    const recruiter = await createRecruiter();
    const other = await createRecruiter('other');
    const candidate = await proposedCandidate('candidate');
    const proposed = await storeJob(recruiter);
    // Not proposed to anyone now
    await storeJob(recruiter, { review: 'pending' });
    await storeJob(recruiter, { review: 'rejected' });
    await storeJob(recruiter, { matching: false });
    await storeJob(recruiter, { overrides: { status: 'on_hold' } });
    // Not the candidate's: a pay under what they ask for (a deal-breaker), a job on site (69 under 70)
    await storeJob(recruiter, { overrides: { pay: { min: 30000, max: 40000, currency: 'EUR', period: 'year' } } });
    await storeJob(other, { overrides: onSiteInLyon() });
    // Answered: a pass and an interest of theirs, a pass of the recruiter's
    const passed = await storeJob(other);
    await storeDecision(passed, other, candidate, { candidate: 'pass' });
    const interested = await storeJob(other);
    await storeDecision(interested, other, candidate, { candidate: 'interested' });
    const refused = await storeJob(other);
    await storeDecision(refused, other, candidate, { recruiter: 'pass' });
    // Shared on their page for recruiters already: they are in touch through it
    const shared = await storeJob(other);
    await pickOnJourney(candidate, other, shared);
    // Their own job, in matching (the candidate is a recruiter too)
    expect(await openRecruiterSpace(candidate.id)).toBe(true);
    await storeJob(candidate);
    // A recruiter interested in them, without their answer: proposed still
    const wanted = await storeJob(other);
    await storeDecision(wanted, other, candidate, { recruiter: 'interested' });
    // Of a recruiter who has not accepted the terms in force since they changed (interested in the
    // candidate before): proposed to nobody until they do
    const behind = await createRecruiter('behind');
    const behindJob = await storeJob(behind);
    await storeDecision(behindJob, behind, candidate, { recruiter: 'interested' });
    await User.updateOne({ _id: behind.id }, { $set: { 'legalAcceptances.$[].version': '2025-01-01' } });

    const body = (await candidateFeed(candidate)).json();

    expect(body.jobs.map((card: any) => card.job._id).sort()).toEqual([proposed, wanted].sort());
    expect(await isLiveInMatching((await JobPosting.findById(behindJob).lean<StoredJobPosting>())!)).toBe(false);

    // Once they accept them again, it is
    await recordConsent(behind.id, CONSENT, 'recruiter');
    const again = (await candidateFeed(candidate)).json();
    expect(again.jobs.map((card: any) => card.job._id).sort()).toEqual([proposed, wanted, behindJob].sort());
  });

  it('goes page by page, without a job twice, and leaves out a job closed since', async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate('candidate');
    const page = MATCHING_LIMITS.candidateFeedPage;
    // One more than a page, a minute apart, and two at the same time
    const ids: string[] = [];
    const at = Date.now() - DAY;
    for (let index = 0; index < page + 1; index++) {
      ids.push(await storeJob(recruiter, { publishedAt: new Date(at - Math.min(index, page - 1) * 60_000) }));
    }

    const first = (await candidateFeed(candidate)).json();
    expect(first.jobs).toHaveLength(page);
    expect(first.more).toBe(true);
    expect(first.next).toMatch(/^[0-9a-z]+\.[0-9a-f]{24}$/);
    const second = (await candidateFeed(candidate, `?after=${first.next}`)).json();
    expect(second).toMatchObject({ more: false, next: null });
    const read = [...first.jobs, ...second.jobs].map((card: any) => card.job._id);
    expect(read).toHaveLength(page + 1);
    expect(new Set(read).size).toBe(page + 1);
    expect(read.sort()).toEqual([...ids].sort());

    // Filled since: out of the next read
    await JobPosting.updateOne({ _id: first.jobs[0].job._id }, { $set: { status: 'filled' } });
    const again = (await candidateFeed(candidate)).json();
    expect(again.jobs.map((card: any) => card.job._id)).not.toContain(first.jobs[0].job._id);

    // A cursor that is not one: refused with the query's 422
    expect((await candidateFeed(candidate, '?after=not-a-cursor')).status).toBe(422);
  });

  it('reads travel times from the cache only, shows a commute not known yet as unknown, and has it asked in the background', async () => {
    env.commuteTimesEnabled = true;
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate('candidate', {
      rated: criteria({ commute: commuteCriterion({ dealBreaker: true }) })
    });
    const jobId = await storeJob(recruiter, { overrides: atTheOffice() });

    const answer = await candidateFeed(candidate);

    expect(fetched).toEqual([]);
    const body = answer.json();
    expect(body.pending).toBe(true);
    expect(body.jobs.map((card: any) => card.job._id)).toEqual([jobId]);
    // The candidate decides: the commute is theirs to read, unknown for now
    expect(body.jobs[0].criteria).toContainEqual({ criterion: 'commute', outcome: 'unknown' });
    expect(body.jobs[0]).not.toHaveProperty('transit');
    expect(warmUps).toEqual([{ pair: { candidateId: candidate.id, location: expect.objectContaining({ city: 'Lyon' }) }, accountId: candidate.id }]);

    // Nothing more can be asked today: nothing pending, nothing asked
    warmUps = [];
    spyOn(matchFeedWarmUps, 'possible').mockImplementation(async () => false);
    const spent = (await candidateFeed(candidate)).json();
    expect(spent.pending).toBe(false);
    expect(spent.jobs).toHaveLength(1);
    expect(warmUps).toEqual([]);
  });

  it('is activity: the candidate stays proposed', async () => {
    const candidate = await proposedCandidate('candidate');
    const twoDaysAgo = new Date(Date.now() - 2 * DAY);
    await DiscoveryProfile.updateOne({ user: candidate.id }, { $set: { lastActiveAt: twoDaysAgo } });

    expect((await candidateFeed(candidate)).status).toBe(200);

    const profile = await DiscoveryProfile.findOne({ user: candidate.id }).lean();
    expect(profile!.lastActiveAt!.getTime()).toBeGreaterThan(twoDaysAgo.getTime() + DAY);
  });

  it('answers 429 over the reads of an hour, in the visitor language', async () => {
    const candidate = await proposedCandidate('candidate');
    await Promise.all(
      Array.from({ length: MATCHING_FEED_READS.limit }, () => takeRateLimit(matchingFeedKey(candidate.id), MATCHING_FEED_READS))
    );

    const answer = await candidateFeed(candidate, '', 'fr');

    expect(answer.status).toBe(429);
    expect(Number(answer.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(answer.text).toBe(
      `Vous pouvez consulter ce qui vous est proposé ${MATCHING_FEED_READS.limit} fois par heure. Réessayez plus tard.`
    );
  });
});

// ── The recruiter's feed ────────────────────────────────────

describe('GET /recruiter/jobs/:id/candidates', () => {
  it('is a recruiter route: a recruiter space, their own job, proposed to candidates now', async () => {
    const recruiter = await createRecruiter();
    const other = await createRecruiter('other');
    const noSpace = await createUser('nospace');
    const jobId = await storeJob(recruiter);

    expect((await call('GET', `/recruiter/jobs/${jobId}/candidates`)).status).toBe(401);
    expect((await recruiterFeed(noSpace, jobId)).status).toBe(403);
    const notTheirs = await recruiterFeed(other, jobId);
    expect(notTheirs.status).toBe(404);
    expect(notTheirs.text).toBe(JOB_NOT_FOUND);
    expect((await recruiterFeed(recruiter, new Types.ObjectId().toString())).status).toBe(404);
    expect((await recruiterFeed(recruiter, jobId)).status).toBe(200);

    for (const job of [
      await storeJob(recruiter, { review: 'pending' }),
      await storeJob(recruiter, { review: 'rejected' }),
      await storeJob(recruiter, { matching: false }),
      await storeJob(recruiter, { overrides: { status: 'on_hold' } })
    ]) {
      const answer = await recruiterFeed(recruiter, job);
      expect(answer.status).toBe(409);
      expect(answer.text).toBe(JOB_NOT_PROPOSED);
    }
  });

  it('proposes only candidates proposed now whom the job meets, in a neutral order, those interested first', async () => {
    const recruiter = await createRecruiter();
    const jobId = await storeJob(recruiter);
    // Three scores: 100, 88 and 73
    const shown: Candidate[] = [
      await proposedCandidate('a', { rated: criteria({ perYear: 50_000 }) }),
      await proposedCandidate('b', { rated: criteria({ perYear: 54_500, payDealBreaker: false }) }),
      await proposedCandidate('c', { rated: criteria({ perYear: 58_000, payDealBreaker: false }) })
    ];
    // Not proposed for this job: under their minimum, a deal-breaker missed, never on, withdrawn,
    // paused, inactive, their consent lapsed, the recruiter's own account
    await proposedCandidate('under', { rated: criteria({ perYear: 58_000, payDealBreaker: false }), minScore: 80 });
    await proposedCandidate('broken', { rated: criteria({ perYear: 80_000 }), minScore: 0 });
    const never = await createUser('never');
    await createPortfolio(never, 'never');
    const withdrawn = await proposedCandidate('withdrawn');
    expect((await call('DELETE', '/discovery/consent', { cookie: withdrawn.cookie })).status).toBe(200);
    const paused = await proposedCandidate('paused');
    await AppointmentSchedule.deleteMany({ user: paused.id });
    const inactive = await proposedCandidate('inactive');
    await DiscoveryProfile.updateOne({ user: inactive.id }, { $set: { lastActiveAt: new Date(Date.now() - 181 * DAY) } });
    const lapsed = await proposedCandidate('lapsed');
    await DiscoveryProfile.updateOne(
      { user: lapsed.id },
      { $set: { enabledAt: new Date(discoveryConsentCutoff().getTime() - 60_000) } }
    );
    // A candidate who is a recruiter too: proposed for others' jobs, never for their own
    const self = await proposedCandidate('self');
    expect(await openRecruiterSpace(self.id)).toBe(true);
    const ownJob = await storeJob(self);
    expect(candidatesOf((await recruiterFeed(self, ownJob)).json(), self, ownJob)).toEqual(hashOrder(ownJob, shown));
    shown.push(self);

    const answer = await recruiterFeed(recruiter, jobId);

    expect(answer.status).toBe(200);
    const body = answer.json();
    expect(candidatesOf(body, recruiter, jobId)).toEqual(hashOrder(jobId, shown));
    expect(body).toMatchObject({ more: false, pending: false });
    expect(body.cards.every((card: any) => card.interested === false)).toBe(true);

    // The same at every read; a score changed since changes nothing of it
    expect(candidatesOf((await recruiterFeed(recruiter, jobId)).json(), recruiter, jobId)).toEqual(hashOrder(jobId, shown));
    const rerated = criteria({ perYear: 50_000 });
    expect((await call('PUT', '/perfect-job', { body: { criteria: rerated }, cookie: shown[2].cookie })).status).toBe(200);
    expect(candidatesOf((await recruiterFeed(recruiter, jobId)).json(), recruiter, jobId)).toEqual(hashOrder(jobId, shown));

    // Another job of theirs: its own order, from the same candidates
    const second = await storeJob(recruiter);
    expect(candidatesOf((await recruiterFeed(recruiter, second)).json(), recruiter, second)).toEqual(hashOrder(second, shown));

    // A candidate interested in the job comes first, and says so
    const last = hashOrder(jobId, shown).at(-1)!;
    await storeDecision(jobId, recruiter, { id: last } as TestUser, { candidate: 'interested' });
    const interested = (await recruiterFeed(recruiter, jobId)).json();
    expect(candidatesOf(interested, recruiter, jobId)).toEqual([last, ...hashOrder(jobId, shown).slice(0, -1)]);
    expect(interested.cards.map((card: any) => card.interested)).toEqual([true, false, false, false]);
  });

  it('leaves out the candidates the recruiter answered, those who passed the job, and those they met through its link', async () => {
    const recruiter = await createRecruiter();
    const jobId = await storeJob(recruiter);
    const [kept, answered, passed, met] = [
      await proposedCandidate('kept'),
      await proposedCandidate('answered'),
      await proposedCandidate('passed'),
      await proposedCandidate('met')
    ];
    await storeDecision(jobId, recruiter, answered, { recruiter: 'pass' });
    await storeDecision(jobId, recruiter, passed, { candidate: 'pass' });
    await pickOnJourney(met, recruiter, jobId);

    expect(candidatesOf((await recruiterFeed(recruiter, jobId)).json(), recruiter, jobId)).toEqual([kept.id]);

    // An interest of the recruiter's, unanswered: answered all the same
    await Match.deleteOne({ job: jobId, candidate: answered.id });
    await storeDecision(jobId, recruiter, answered, { recruiter: 'interested' });
    expect(candidatesOf((await recruiterFeed(recruiter, jobId)).json(), recruiter, jobId)).toEqual([kept.id]);
  });

  it('gives a few cards at a time and whether there are more, never how many', async () => {
    const recruiter = await createRecruiter();
    const jobId = await storeJob(recruiter);
    const limit = MATCHING_LIMITS.recruiterCardsPerRead;
    const candidates: Candidate[] = [];
    for (let index = 0; index <= limit; index++) candidates.push(await proposedCandidate(`c${index}`));

    const body = (await recruiterFeed(recruiter, jobId)).json();

    expect(Object.keys(body).sort()).toEqual(['cards', 'more', 'pending']);
    expect(body.more).toBe(true);
    expect(candidatesOf(body, recruiter, jobId)).toEqual(hashOrder(jobId, candidates).slice(0, limit));
    for (const card of body.cards) expect(Object.keys(card).sort()).toEqual(['card', 'interested', 'outcomes', 'token']);

    // Once one is answered, the last comes, and nothing more
    await storeDecision(jobId, recruiter, { id: hashOrder(jobId, candidates)[0] } as TestUser, { recruiter: 'pass' });
    const next = (await recruiterFeed(recruiter, jobId)).json();
    expect(candidatesOf(next, recruiter, jobId)).toEqual(hashOrder(jobId, candidates).slice(1));
    expect(next.more).toBe(false);
  });

  it('shows the anonymous card alone: no name, address, portfolio, company, place, project, id, score, commute or deal-breaker', async () => {
    const recruiter = await createRecruiter();
    const jobId = await storeJob(recruiter);
    const candidate = await proposedCandidate('leak', {
      rated: criteria({
        cities: { importance: 2, places: ['Lyon'] },
        commute: commuteCriterion()
      }),
      showDetails: true
    });

    const answer = await recruiterFeed(recruiter, jobId);

    const [card] = answer.json().cards;
    expect(Object.keys(card.card).sort()).toEqual([...CANDIDATE_CARD_FIELDS].sort());
    expect(card.card.roles).toEqual([{ title: 'Platform engineer', months: expect.any(Number), current: true }]);
    expect(card.card.skills).toEqual([{ name: `Kotlin ${t.skillTag}`, months: expect.any(Number) }]);
    // The outcomes the job match shows on their page for recruiters, but the commute and the places
    expect(card.outcomes).toEqual([
      { criterion: 'titles', outcome: 'match' },
      { criterion: 'workMode', outcome: 'match' },
      { criterion: 'contractTypes', outcome: 'match' },
      { criterion: 'pay', outcome: 'match' }
    ]);
    const read = answer.text.toLowerCase();
    for (const secret of [
      candidate.id,
      candidate.email,
      candidate.email.split('@')[0],
      'leakfirst',
      'leaklast',
      candidate.domain,
      'quillleak',
      'globexleak',
      'quimperlé',
      'falcon',
      'ledger',
      candidate.experience,
      '50000',
      'score',
      'dealbreaker',
      ...CARD_WITHHELD_CRITERIA
    ]) {
      expect(read).not.toContain(secret.toLowerCase());
    }
  });

  it('shows no outcome when the candidate journey shows no details', async () => {
    const recruiter = await createRecruiter();
    const jobId = await storeJob(recruiter);
    await proposedCandidate('quiet', { showDetails: false });

    const [card] = (await recruiterFeed(recruiter, jobId)).json().cards;

    expect(card.outcomes).toEqual([]);
  });

  it('stands for each candidate by a token bound to the recruiter and the job, different at every read', async () => {
    const recruiter = await createRecruiter();
    const other = await createRecruiter('other');
    const jobId = await storeJob(recruiter);
    const otherJob = await storeJob(recruiter);
    const candidate = await proposedCandidate('candidate');

    const [first] = (await recruiterFeed(recruiter, jobId)).json().cards;
    const [second] = (await recruiterFeed(recruiter, jobId)).json().cards;

    expect(openMatchToken(first.token, { recruiterId: recruiter.id, jobId })).toBe(candidate.id);
    expect(openMatchToken(second.token, { recruiterId: recruiter.id, jobId })).toBe(candidate.id);
    expect(second.token).not.toBe(first.token);
    expect(first.token).not.toContain(candidate.id);
    // For another job, another recruiter: nothing
    expect(openMatchToken(first.token, { recruiterId: recruiter.id, jobId: otherJob })).toBeNull();
    expect(openMatchToken(first.token, { recruiterId: other.id, jobId })).toBeNull();
    // Changed by one sign, cut, or too old: nothing
    const flipped = `${first.token.slice(0, 10)}${first.token[10] === 'A' ? 'B' : 'A'}${first.token.slice(11)}`;
    expect(openMatchToken(flipped, { recruiterId: recruiter.id, jobId })).toBeNull();
    expect(openMatchToken(first.token.slice(0, -2), { recruiterId: recruiter.id, jobId })).toBeNull();
    const later = new Date(Date.now() + MATCH_TOKEN_TTL_MS + 60_000);
    expect(openMatchToken(first.token, { recruiterId: recruiter.id, jobId }, later)).toBeNull();
    for (const notOne of [undefined, null, 42, '', 'not a token', candidate.id]) {
      expect(openMatchToken(notOne, { recruiterId: recruiter.id, jobId })).toBeNull();
    }
  });

  it('holds back a candidate whose travel time is not kept yet, from the cache only, and asks it in the background', async () => {
    env.commuteTimesEnabled = true;
    const recruiter = await createRecruiter();
    const jobId = await storeJob(recruiter, { overrides: atTheOffice() });
    const near = await proposedCandidate('near', { rated: criteria({ commute: commuteCriterion() }) });
    const strict = await proposedCandidate('strict', { rated: criteria({ commute: commuteCriterion({ dealBreaker: true }) }) });
    // Under what they ask for whatever the commute: nothing to wait for, nothing asked
    await proposedCandidate('hopeless', { rated: criteria({ perYear: 80_000, commute: commuteCriterion() }) });

    const body = (await recruiterFeed(recruiter, jobId)).json();

    expect(fetched).toEqual([]);
    expect(body).toEqual({ cards: [], more: false, pending: true });
    expect(warmUps.map(({ pair, accountId }) => [pair.candidateId, accountId]).sort()).toEqual(
      [
        [near.id, recruiter.id],
        [strict.id, recruiter.id]
      ].sort()
    );

    // Nothing more can be asked today: a commute that is a deal-breaker keeps its candidate out,
    // another is left out of the score
    spyOn(matchFeedWarmUps, 'possible').mockImplementation(async () => false);
    const spent = (await recruiterFeed(recruiter, jobId)).json();
    expect(candidatesOf(spent, recruiter, jobId)).toEqual([near.id]);
    expect(spent.pending).toBe(false);
    expect(fetched).toEqual([]);
  });

  it('shows or leaves out the candidate once the warm-up found the travel time', async () => {
    env.commuteTimesEnabled = true;
    commuteWarmUps.pauseMs = 0;
    const recruiter = await createRecruiter();
    const jobId = await storeJob(recruiter, { overrides: atTheOffice() });
    // 20 minutes from one, 90 from the other: 120 and 540 minutes a week (3 days at the office), for
    // 300 accepted (450 and more is no match at all)
    const near = await proposedCandidate('near', { rated: criteria({ commute: commuteCriterion({ dealBreaker: true }) }) });
    const far = await proposedCandidate('far', {
      rated: criteria({ commute: commuteCriterion({ dealBreaker: true, place: { label: 'Far 38000 Grenoble', lat: 45.19, lon: 5.72 } }) })
    });
    answerGeoplateforme();
    const running: Promise<void>[] = [];
    spyOn(matchFeedWarmUps, 'commute').mockImplementation(async (pair, accountId) => {
      running.push(warmCommute(pair, accountId));
    });

    expect((await recruiterFeed(recruiter, jobId)).json()).toEqual({ cards: [], more: false, pending: true });
    await Promise.all(running);

    const body = (await recruiterFeed(recruiter, jobId)).json();
    expect(candidatesOf(body, recruiter, jobId)).toEqual([near.id]);
    expect(body.pending).toBe(false);
    expect(far.id).not.toBe(near.id);
  });

  it('answers 429 over the reads of an hour', async () => {
    const recruiter = await createRecruiter();
    const jobId = await storeJob(recruiter);
    await Promise.all(
      Array.from({ length: MATCHING_FEED_READS.limit }, () => takeRateLimit(matchingFeedKey(recruiter.id), MATCHING_FEED_READS))
    );

    const answer = await recruiterFeed(recruiter, jobId);

    expect(answer.status).toBe(429);
    expect(answer.text).toBe(
      `You can read what is proposed to you ${MATCHING_FEED_READS.limit} times an hour. Try again later.`
    );
  });
});

// ── The job's private page ──────────────────────────────────

describe("GET /opportunities/jobs/:id (access 'feed')", () => {
  it('shows a job proposed to the candidate, whatever they answered, and nothing else', async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate('candidate');
    const jobId = await storeJob(recruiter);

    const answer = await call('GET', `/opportunities/jobs/${jobId}`, { cookie: candidate.cookie });
    expect(answer.status).toBe(200);
    expect(answer.json()).toMatchObject({ access: 'feed', job: { _id: jobId, status: 'open', company: 'Acme Feeds' } });
    for (const secret of [recruiter.id, recruiter.email, 'example.com']) expect(answer.text).not.toContain(secret);

    // Answered: theirs to read still
    await storeDecision(jobId, recruiter, candidate, { candidate: 'interested' });
    expect((await call('GET', `/opportunities/jobs/${jobId}`, { cookie: candidate.cookie })).json().access).toBe('feed');
  });

  it('answers the 404 of an unknown job when it is not proposed to the caller', async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate('candidate');
    const notMet = await storeJob(recruiter, { overrides: onSiteInLyon() });
    const pending = await storeJob(recruiter, { review: 'pending' });
    const refused = await storeJob(recruiter);
    await storeDecision(refused, recruiter, candidate, { recruiter: 'pass' });
    const stranger = await createUser('stranger');
    const live = await storeJob(recruiter);
    // Of a recruiter who has not accepted the terms in force since they changed
    const behind = await createRecruiter('behind');
    const behindJob = await storeJob(behind);
    await User.updateOne({ _id: behind.id }, { $set: { 'legalAcceptances.$[].version': '2025-01-01' } });

    for (const [user, jobId] of [
      [candidate, notMet],
      [candidate, pending],
      [candidate, refused],
      [candidate, behindJob],
      [stranger, live]
    ] as const) {
      const answer = await call('GET', `/opportunities/jobs/${jobId}`, { cookie: user.cookie });
      expect(answer.status).toBe(404);
      expect(answer.text).toBe(JOB_NOT_FOUND);
    }

    // Withdrawn: none of them any more
    expect((await call('DELETE', '/discovery/consent', { cookie: candidate.cookie })).status).toBe(200);
    expect((await call('GET', `/opportunities/jobs/${live}`, { cookie: candidate.cookie })).status).toBe(404);
  });
});

// ── Tokens ──────────────────────────────────────────────────

describe('match tokens', () => {
  it('seal ids only, and open for the scope they were made for', () => {
    const scope = { recruiterId: new Types.ObjectId().toString(), jobId: new Types.ObjectId().toString() };
    const candidate = new Types.ObjectId().toString();
    const token = sealMatchToken(candidate, scope);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(openMatchToken(token, scope)).toBe(candidate);
    // The ids' case is the ids'
    expect(openMatchToken(token, { recruiterId: scope.recruiterId.toUpperCase(), jobId: scope.jobId.toUpperCase() })).toBe(candidate);
    expect(() => sealMatchToken('not an id', scope)).toThrow();
  });
});

// ── What matching is built on ───────────────────────────────

/**
 * The server's files `file` imports, and theirs, and so on (relative imports only: the packages
 * they import are named in `packages`)
 */
const importGraph = (entries: string[]) => {
  const files = new Set<string>();
  const packages = new Map<string, Set<string>>();
  const pending = [...entries];
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const specifier = match[1] ?? match[2];
      if (!specifier) continue;
      if (!specifier.startsWith('.')) {
        const importers = packages.get(specifier) ?? new Set<string>();
        importers.add(file);
        packages.set(specifier, importers);
        continue;
      }
      const base = resolve(dirname(file), specifier);
      const found = [`${base}.ts`, join(base, 'index.ts'), base].find((candidate) => existsSync(candidate) && candidate.endsWith('.ts'));
      if (found) pending.push(found);
    }
  }
  return { files, packages };
};

describe('what matching is built on', () => {
  it('asks no model anything: no Claude SDK and no PDF extraction, in the matching services or anything they import', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const services = [
      '../services/matchFeeds.ts',
      '../services/matchTokens.ts',
      '../services/discovery.ts',
      '../services/candidateCard.ts',
      '../services/jobMatching.ts',
      '../services/matchingReviews.ts',
      '../services/matches.ts',
      '../services/mutualInterests.ts',
      '../models/database/match.ts',
      '../plugins/matches.ts'
    ].map((file) => resolve(here, file));
    for (const file of services) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toContain('@anthropic-ai/sdk');
      expect(source).not.toContain('claudePdfExtraction');
    }

    const { files, packages } = importGraph(services);
    // The walk went somewhere: the feeds read the commute, the journeys, the card
    expect([...files].some((file) => file.endsWith('/services/commute.ts'))).toBe(true);
    expect([...files].some((file) => file.endsWith('/services/workflows.ts'))).toBe(true);
    // The services that call Claude
    const models = [...files].filter((file) =>
      /\/services\/(?:claudePdfExtraction|resumeImport|resumeExtraction|jobImport|jobExtraction|feedback)\.ts$/.test(file)
    );
    expect(models).toEqual([]);
    expect([...packages.keys()].filter((name) => name.startsWith('@anthropic-ai/'))).toEqual([]);
  });
});

// ── Travel times ────────────────────────────────────────────

/** The commute criterion of a candidate who travels from a place the API found */
function commuteCriterion(fields: Record<string, unknown> = {}) {
  return {
    importance: 3,
    from: `1 rue du Test ${t.suffix}`,
    place: { label: '1 Rue du Test 69001 Lyon', lat: 45.767, lon: 4.834 },
    modes: ['car'],
    maxMinutesPerWeek: 300,
    ...fields
  };
}

/** A job at its office every day, without a street: the work mode the candidates of this file do not want */
function onSiteInLyon() {
  return { location: { country: 'FR', city: 'Lyon', postalCode: '69002', workMode: 'on_site' } };
}

/** A job at its office 3 days a week (the work mode the candidates of this file want), with a street to find */
function atTheOffice() {
  return {
    location: {
      country: 'FR',
      city: 'Lyon',
      postalCode: '69003',
      address: `9 rue du Bureau ${t.suffix}`,
      workMode: 'hybrid',
      remoteDaysPerWeek: 2
    }
  };
}

/**
 * The Géoplateforme, answered here for the one test whose warm-up runs: the office is found, and
 * the way there by car takes 20 minutes from Lyon, 90 from anywhere else
 */
function answerGeoplateforme() {
  spyOn(globalThis, 'fetch').mockImplementation((async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.href.startsWith('https://data.geopf.fr/geocodage/search')) {
      const feature = { geometry: { coordinates: [4.8591, 45.7601] }, properties: { label: '9 Rue du Bureau 69003 Lyon', score: 0.9 } };
      return Response.json({ type: 'FeatureCollection', features: [feature] });
    }
    if (url.href.startsWith('https://data.geopf.fr/navigation/itineraire')) {
      const fromLyon = (url.searchParams.get('start') ?? '').startsWith('4.8');
      return Response.json({ duration: fromLyon ? 20 : 90, distance: fromLyon ? 9000 : 100_000 });
    }
    throw new Error(`Unexpected request to ${url.origin}`);
  }) as unknown as typeof fetch);
}
