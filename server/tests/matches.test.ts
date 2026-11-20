// Matching (Path 2, behind MATCHING) from the job's side and the matches': the
// recruiter's switch (PUT /jobs/:id/matching, POST /jobs's `matching`), the
// review of each job by the operator's reviewers (GET/PUT /matching/reviews),
// what a job's changes do to its matches and its review
// (services/jobMatching.ts, services/matchingReviews.ts, plugins/jobs.ts), the
// decisions of each side and the mutual interest they make, in either order or
// at the same moment, where it leads (the candidate's own hiring journey) and
// how each side reads, sees and ends it (services/matches.ts), with the Match
// model (models/database/match.ts), against a real MongoDB (MONGO_URL, local
// or from TEST_MONGO_URL). The lifecycle tests store the matches they need
// directly; the decisions' go through the routes. Each test creates its own
// accounts, portfolios, postings and matches, named with a suffix unique to
// that test, and removes them after: tests pass in any order (--randomize).
// Nothing asks an outside service: the office lookup a job's entry starts is
// replaced, fetch fails the test, and travel times are off.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import mongoose, { Types } from 'mongoose';
import {
  DISCOVERY_CONSENT_KEYS,
  LEGAL_VERSION,
  MATCHING_LIMITS,
  MATCH_RETENTION,
  currentDiscoveryConsent,
  endedMatchExpiry,
  journeyTemplate,
  jobLiveInMatching,
  matchDecisionExpiry,
  parsePerfectJob
} from 'portfolio-common';
import { env } from '../env';
import { createApp } from '../app';
import {
  AppointmentSchedule,
  DiscoveryProfile,
  Domain,
  JobPosting,
  Match,
  PerfectJob,
  RateLimitCounter,
  User,
  Workflow,
  WorkflowInstance
} from '../models/database';
import type { JobPosting as StoredJobPosting } from '../models/database/jobPosting';
import {
  CANDIDATE_UNAVAILABLE,
  DECISION_NOT_FOUND,
  JOB_CHANGED,
  JOB_NOT_PROPOSED,
  JOB_OF_MUTUAL_INTEREST,
  MATCHING_NEEDS_OPEN_JOB,
  MATCH_NOT_FOUND,
  MUTUAL_INTEREST_EXISTS,
  NOT_A_MATCHING_REVIEWER,
  NOT_PROPOSED_TO_RECRUITERS
} from '../protocol';
import { deleteAccount } from '../services/accountDeletion';
import { discoveryGrantsKey } from '../services/discovery';
import { isLiveInMatching, jobMatchingWarmUp, liveJobsQuery, reviewedVersion } from '../services/jobMatching';
import { JOB_NOT_FOUND, toJobPostingDto, toJobSnapshot } from '../services/jobPostings';
import { recordConsent } from '../services/legal';
import { logger } from '../services/logger';
import { MATCHING_DECISIONS, matchingDecisionsKey } from '../services/matches';
import { matchFeedWarmUps, matchingFeedKey } from '../services/matchFeeds';
import { sealMatchToken } from '../services/matchTokens';
import { takeRateLimit } from '../services/rateLimit';
import { assertStepOpen } from '../services/workflows';
import { jobSharesKey } from '../services/workflowSteps/job';
import { JourneyStepLockedError } from '../errors';
import { CONSENT, authCookie, openRecruiterSpace, workflowRequestBody } from './helpers';
import { assertDisposableDatabase } from './testDatabase';

/** Names unique to one test: everything it creates carries its suffix */
const testNames = () => {
  // A letter between the time and the random part: never 9 digits in a row (read as a phone number)
  const suffix = `${Date.now().toString(36)}x${Math.random().toString(36).slice(2, 8)}`;
  const id = (name: string) => `match-${name}-${suffix}`;
  return { suffix, id, email: (name: string) => `${id(name)}@example.com` };
};

const UNKNOWN_ID = new Types.ObjectId().toString();
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** A valid open posting: CDI in Lyon, hybrid 2 days, 45-55 k€ a year */
const sampleJob = (overrides: Record<string, unknown> = {}) => ({
  title: 'Senior Backend Engineer',
  description: '## The job\n\nBuild the billing platform.',
  company: 'Acme',
  status: 'open',
  location: { country: 'FR', city: 'Lyon', postalCode: '69002', workMode: 'hybrid', remoteDaysPerWeek: 2 },
  contract: { type: 'cdi' },
  workingTime: { arrangement: 'weekly_hours', hoursPerWeek: 39 },
  pay: { min: 45000, max: 55000, currency: 'EUR', period: 'year' },
  ...overrides
});

let app: ReturnType<typeof createApp>;
let t: ReturnType<typeof testNames>;
let connected = false;
let warmed: { location: unknown; accountId: string }[] = [];
const saved = {
  matching: env.matchingEnabled,
  reviewers: env.matchingReviewers,
  calendar: env.googleCalendarEnabled,
  commute: env.commuteTimesEnabled
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
    json: <T = any>() => JSON.parse(responseText) as T
  };
};

interface TestUser {
  id: string;
  cookie: string;
  email: string;
}

/** An account of this test, with a recruiter space when `recruiter` */
const createUser = async (name: string, { recruiter = false } = {}): Promise<TestUser> => {
  const email = t.email(name);
  const user = await User.create({ email, googleId: t.id(`sub-${name}`), name: `${name}-first`, surname: `${name}-last` });
  const id = user._id.toString();
  if (recruiter) expect(await openRecruiterSpace(id)).toBe(true);
  return { id, cookie: await authCookie(id), email };
};

const createRecruiter = (name = 'recruiter') => createUser(name, { recruiter: true });

/** POST /jobs as `recruiter`; expects success */
const createJob = async (recruiter: TestUser, body: Record<string, unknown> = sampleJob()) => {
  const result = await call('POST', '/jobs', { body, cookie: recruiter.cookie });
  expect(result.status).toBe(200);
  return result.json();
};

const setMatching = (recruiter: TestUser, jobId: string, enabled: boolean, language?: string) =>
  call('PUT', `/jobs/${jobId}/matching`, { body: { enabled }, cookie: recruiter.cookie, language });

/** An open job of `recruiter` put into matching through the API */
const jobInMatching = async (recruiter: TestUser, body: Record<string, unknown> = sampleJob()) => {
  const job = await createJob(recruiter, body);
  const answer = await setMatching(recruiter, job._id, true);
  expect(answer.status).toBe(200);
  return answer.json();
};

const stored = async (jobId: string) => (await JobPosting.findById(jobId).lean<StoredJobPosting>())!;

/** The job approved as it is now, as a reviewer would (stored directly: the review routes have tests of their own) */
const approve = async (jobId: string, at = new Date()) => {
  const job = await stored(jobId);
  await JobPosting.updateOne(
    { _id: jobId },
    { $set: { 'matching.review': { status: 'approved', requestedAt: at, reviewedAt: at, version: reviewedVersion(job) } } },
    { timestamps: false }
  );
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * A match of `candidate` on the job `jobId` of `recruiter`, stored directly: a decision of each
 * side (`interested`, `pass` or none), and a mutual interest with `snapshot` when `matched`
 */
const storeMatch = async (
  jobId: string,
  recruiter: TestUser,
  candidate: TestUser,
  fields: {
    candidate?: 'interested' | 'pass';
    recruiter?: 'interested' | 'pass';
    matched?: boolean;
    snapshot?: unknown;
    ended?: Date;
  } = {}
) => {
  const at = new Date(Date.now() - DAY);
  const match = await Match.create({
    job: jobId,
    recruiter: recruiter.id,
    candidate: candidate.id,
    ...(fields.candidate ? { candidateDecision: { value: fields.candidate, at } } : {}),
    ...(fields.recruiter ? { recruiterDecision: { value: fields.recruiter, at } } : {}),
    ...(fields.matched
      ? {
          matchedAt: at,
          revealedAt: at,
          snapshot: { posting: fields.snapshot ?? {}, score: 90, minScore: 70, criteria: [] }
        }
      : { expiresAt: matchDecisionExpiry(at) }),
    ...(fields.ended ? { endedAt: fields.ended, endReason: 'candidate', expiresAt: endedMatchExpiry(fields.ended) } : {})
  });
  return match._id;
};

const matchOf = (id: Types.ObjectId) => Match.findById(id).lean();

/** Every line the API logs from now on, as text */
const capturedLogs = () => {
  const lines: string[] = [];
  const capture = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  };
  for (const level of ['debug', 'info', 'warn', 'error'] as const) {
    spyOn(logger, level).mockImplementation(capture as never);
  }
  return lines;
};

// ── Decisions: candidates proposed, jobs live, and both sides' answers ──

type Candidate = TestUser & { domain: string };

/**
 * What a candidate of this test rates: this test's jobs only (their title, a deal-breaker), the pay
 * (50 k€ a year, a deal-breaker), a hybrid job with 2 days at home, a CDI: sampleJob scores 100
 */
const criteria = (extra: Record<string, unknown> = {}) => ({
  titles: { importance: 1, dealBreaker: true, keywords: [t.suffix] },
  pay: { importance: 5, dealBreaker: true, perYear: 50_000 },
  workMode: { importance: 4, modes: ['hybrid'], minRemoteDays: 2 },
  contractTypes: { importance: 3, types: ['cdi'] },
  ...extra
});

/** The gate journey (a note, the job, its score, the meeting), its job match with `minScore`; without its note when `note` is false */
const gate = ({ minScore = 70, showDetails = true, note = true }: { minScore?: number; showDetails?: boolean; note?: boolean } = {}) =>
  journeyTemplate('gate')
    .filter((step) => note || step.type !== 'note')
    .map((step) => (step.type === 'job-match' ? { ...step, config: { minScore, showDetails } } : step));

/**
 * A candidate proposed to recruiters, as they set it up: a portfolio, the terms, their criteria,
 * `journey` (the gate), a calendar and a meeting type with hours, then the discovery consent
 */
const proposedCandidate = async (name = 'candidate', journey: unknown[] = gate()): Promise<Candidate> => {
  const user = await createUser(name);
  const domain = t.id(`${name}-portfolio`);
  await Domain.create({ name: domain, admin: user.id, headerTitle: `Quill ${name}`, experiences: [] });
  await recordConsent(user.id, CONSENT, 'account');
  expect((await call('PUT', '/perfect-job', { body: { criteria: criteria() }, cookie: user.cookie })).status).toBe(200);
  expect((await call('PUT', '/workflow', { body: { steps: journey }, cookie: user.cookie })).status).toBe(200);
  await User.updateOne(
    { _id: user.id },
    { $set: { 'googleCalendar.refreshToken': t.id('refresh-token'), 'googleCalendar.connectedAt': new Date() } }
  );
  await AppointmentSchedule.create({
    user: user.id,
    title: t.id('call'),
    timezone: 'Europe/Paris',
    enabled: true,
    availability: [{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00' }]
  });
  const granted = await call('POST', '/discovery/consent', { body: { consent: currentDiscoveryConsent() }, cookie: user.cookie });
  expect(granted.json().state).toBe('on');
  return { ...user, domain };
};

/** An open job of `recruiter` this test's candidates ask for (titled with its suffix), in matching and approved: live */
const liveJob = async (recruiter: TestUser, overrides: Record<string, unknown> = {}): Promise<string> => {
  const job = await jobInMatching(recruiter, sampleJob({ title: `Senior Backend Engineer ${t.suffix}`, ...overrides }));
  await approve(job._id);
  return job._id;
};

const candidateDecides = (candidate: TestUser, jobId: string, decision: string, language?: string) =>
  call('PUT', `/opportunities/jobs/${jobId}/decision`, { body: { decision }, cookie: candidate.cookie, language });

const candidateUndoes = (candidate: TestUser, jobId: string) =>
  call('DELETE', `/opportunities/jobs/${jobId}/decision`, { cookie: candidate.cookie });

/** The token of `candidate`'s card as `recruiter` reads it for `jobId` (what the feed gives them) */
const cardToken = (recruiter: TestUser, jobId: string, candidate: TestUser) =>
  sealMatchToken(candidate.id, { recruiterId: recruiter.id, jobId });

const recruiterDecides = (recruiter: TestUser, jobId: string, candidate: TestUser, decision: string, token?: string) =>
  call('PUT', `/recruiter/jobs/${jobId}/candidates/decision`, {
    body: { token: token ?? cardToken(recruiter, jobId, candidate), decision },
    cookie: recruiter.cookie
  });

const recruiterUndoes = (recruiter: TestUser, jobId: string, candidate: TestUser) =>
  call('DELETE', `/recruiter/jobs/${jobId}/candidates/decision`, {
    body: { token: cardToken(recruiter, jobId, candidate) },
    cookie: recruiter.cookie
  });

/** Both sides interested in `jobId`, the candidate first: the mutual interest's id */
const bothInterested = async (recruiter: TestUser, candidate: TestUser, jobId: string) => {
  expect((await candidateDecides(candidate, jobId, 'interested')).status).toBe(200);
  const made = await recruiterDecides(recruiter, jobId, candidate, 'interested');
  expect(made.status).toBe(200);
  return made.json().match._id as string;
};

/** The candidate's page for recruiters as `visitor` (none: signed out) reads it */
const journeyOf = async (candidate: Candidate, visitor?: TestUser) => {
  const answer = await call('GET', `/workflow/domains/${candidate.domain}`, { cookie: visitor?.cookie });
  expect(answer.status).toBe(200);
  return answer.json();
};

/** The status of each step of the candidate's journey as `visitor` stands in it, by step id */
const statuses = async (candidate: Candidate, visitor: TestUser) =>
  Object.fromEntries(
    (await journeyOf(candidate, visitor)).steps.map((step: { id: string; status: string }) => [step.id, step.status])
  );

/** `visitor` submits `input` on the step `stepId` of the candidate's journey */
const submitStep = (candidate: Candidate, visitor: TestUser, stepId: string, input: unknown) =>
  call('POST', `/workflow/domains/${candidate.domain}/steps/${stepId}`, { body: { input }, cookie: visitor.cookie });

/** Whether `visitor` may book the meeting of the candidate's journey now */
const meetingOpen = async (candidate: Candidate, visitor: TestUser) =>
  assertStepOpen(candidate.id, visitor.id, 'meeting').then(
    () => true,
    (error: unknown) => {
      if (error instanceof JourneyStepLockedError) return false;
      throw error;
    }
  );

const progressOf = async (candidate: TestUser, recruiter: TestUser) =>
  (await WorkflowInstance.findOne({ owner: candidate.id, visitor: recruiter.id }).lean())?.steps ?? {};

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  await Promise.all([
    User.init(),
    JobPosting.init(),
    Match.init(),
    DiscoveryProfile.init(),
    Workflow.init(),
    WorkflowInstance.init(),
    PerfectJob.init()
  ]);
});

const restoreEnv = () => {
  env.matchingEnabled = saved.matching;
  env.matchingReviewers = saved.reviewers;
  env.googleCalendarEnabled = saved.calendar;
  env.commuteTimesEnabled = saved.commute;
};

afterAll(async () => {
  restoreEnv();
  if (connected) await mongoose.disconnect();
});

beforeEach(() => {
  t = testNames();
  // Before the app is built: it registers the matching routes only while the flag is on
  env.matchingEnabled = true;
  env.matchingReviewers = new Set([t.email('reviewer')]);
  // Discovery asks for a calendar on a site that takes them; travel times are never asked
  env.googleCalendarEnabled = true;
  env.commuteTimesEnabled = false;
  app = createApp();
  warmed = [];
  spyOn(jobMatchingWarmUp, 'office').mockImplementation(async (location, accountId) => {
    warmed.push({ location, accountId });
  });
  spyOn(matchFeedWarmUps, 'commute').mockImplementation(async () => {});
  spyOn(globalThis, 'fetch').mockImplementation((async () => {
    throw new Error('No outside request in these tests');
  }) as unknown as typeof fetch);
});

afterEach(async () => {
  mock.restore();
  restoreEnv();
  if (!connected) return;
  // Whatever the case of the address (a test writes one in capitals)
  const users = (await User.find({ email: new RegExp(`-${t.suffix}@`, 'i') }, '_id').lean()).map((user) => user._id);
  const jobs = (await JobPosting.find({ recruiter: { $in: users } }, '_id').lean()).map((job) => job._id);
  await Match.deleteMany({ $or: [{ candidate: { $in: users } }, { recruiter: { $in: users } }, { job: { $in: jobs } }] });
  await JobPosting.deleteMany({ _id: { $in: jobs } });
  await DiscoveryProfile.deleteMany({ user: { $in: users } });
  await PerfectJob.deleteMany({ user: { $in: users } });
  await Workflow.deleteMany({ user: { $in: users } });
  await WorkflowInstance.deleteMany({ $or: [{ owner: { $in: users } }, { visitor: { $in: users } }] });
  await AppointmentSchedule.deleteMany({ user: { $in: users } });
  await Domain.deleteMany({ admin: { $in: users } });
  const keys = users.flatMap((user) => [
    matchingDecisionsKey(String(user)),
    matchingFeedKey(String(user)),
    discoveryGrantsKey(String(user)),
    ...users.map((visitor) => jobSharesKey(String(user), String(visitor)))
  ]);
  for (const key of keys) await RateLimitCounter.deleteMany({ _id: new RegExp(`^${key}:`) });
  await User.deleteMany({ _id: { $in: users } });
});

// ── The flag ────────────────────────────────────────────────

describe('while MATCHING is off', () => {
  it('answers 404 for the switch and the reviews, ignores `matching` on POST /jobs, and says nothing of it', async () => {
    env.matchingEnabled = false;
    app = createApp();
    const recruiter = await createRecruiter();
    const reviewer = await createUser('reviewer');
    const job = await createJob(recruiter, { ...sampleJob(), matching: true });

    expect(job).not.toHaveProperty('matching');
    expect((await stored(job._id)).matching).toBeUndefined();
    expect((await setMatching(recruiter, job._id, true)).status).toBe(404);
    expect((await call('GET', '/matching/reviews', { cookie: reviewer.cookie })).status).toBe(404);
    const review = { decision: 'approve', version: 'v' };
    expect((await call('PUT', `/matching/reviews/${job._id}`, { body: review, cookie: reviewer.cookie })).status).toBe(404);
    expect((await call('GET', '/recruiter/jobs', { cookie: recruiter.cookie })).json().jobs[0]).not.toHaveProperty('matching');
    expect((await call('GET', `/recruiter/jobs/${job._id}`, { cookie: recruiter.cookie })).json()).not.toHaveProperty('matching');
    expect(warmed).toEqual([]);
  });

  it('answers 404 once it is turned off after the app is built, before the session is read, and writes nothing', async () => {
    const recruiter = await createRecruiter();
    const job = await createJob(recruiter);
    env.matchingEnabled = false;

    expect((await setMatching(recruiter, job._id, true)).status).toBe(404);
    expect((await call('PUT', `/jobs/${job._id}/matching`, { body: { enabled: true } })).status).toBe(404);
    expect((await call('GET', '/matching/reviews')).status).toBe(404);
    expect((await stored(job._id)).matching).toBeUndefined();
  });
});

// ── The switch ──────────────────────────────────────────────

describe('PUT /jobs/:id/matching', () => {
  it('puts an open job that names its company into matching, sent for review, and has its office looked up', async () => {
    const recruiter = await createRecruiter();
    const job = await createJob(recruiter);
    const before = await stored(job._id);

    const answer = await setMatching(recruiter, job._id, true);

    expect(answer.status).toBe(200);
    const { matching } = answer.json();
    expect(matching.enabledAt).toMatch(ISO_INSTANT);
    expect(matching.review).toEqual({ status: 'pending', requestedAt: matching.enabledAt, reviewedAt: null, reason: null });
    const after = await stored(job._id);
    expect(after.matching?.enabledAt?.toISOString()).toBe(matching.enabledAt);
    // Not part of the posting: an edit started before is not refused for it
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(jobLiveInMatching(after as never)).toBe(false);
    expect(warmed).toEqual([{ location: job.location, accountId: recruiter.id }]);

    // Already on: nothing written, nothing asked again
    const again = await setMatching(recruiter, job._id, true);
    expect(again.json().matching).toEqual(matching);
    expect(warmed).toHaveLength(1);
    expect((await call('GET', `/recruiter/jobs/${job._id}`, { cookie: recruiter.cookie })).json().matching).toEqual(matching);
  });

  it('refuses a job that is not open (409), one without a company or a description (422), in the request language', async () => {
    const recruiter = await createRecruiter();
    for (const status of ['draft', 'on_hold', 'filled', 'closed']) {
      const job = await createJob(recruiter, sampleJob({ status }));
      const answer = await setMatching(recruiter, job._id, true);
      expect([status, answer.status, answer.text]).toEqual([status, 409, MATCHING_NEEDS_OPEN_JOB]);
    }

    const anonymous = await createJob(recruiter, sampleJob({ company: undefined }));
    expect((await setMatching(recruiter, anonymous._id, true)).json()).toEqual({
      type: 'validation',
      on: 'body',
      property: 'company',
      message: 'Name the company: candidates decide whether they are interested before they know who you are.'
    });
    expect((await setMatching(recruiter, anonymous._id, true, 'fr')).json()).toMatchObject({
      property: 'company',
      message: "Indiquez l'entreprise\u00a0: les candidats disent s'ils sont intéressés avant de savoir qui vous êtes."
    });

    // A description of blanks, as only an older version could have stored
    const blank = await createJob(recruiter);
    await JobPosting.updateOne({ _id: blank._id }, { $set: { description: '   ' } });
    expect((await setMatching(recruiter, blank._id, true)).json()).toMatchObject({ property: 'description' });

    expect(await JobPosting.countDocuments({ recruiter: recruiter.id, matching: { $exists: true } })).toBe(0);
    expect(warmed).toEqual([]);
  });

  it('refuses a job whose stored version breaks a rule a posting is saved under today (422), until it is saved again', async () => {
    const recruiter = await createRecruiter();
    const job = await createJob(recruiter);
    // Opened before the pay cap with 45-80 k€: it keeps its status changes, scored as 45-67.5 k€
    await JobPosting.updateOne({ _id: job._id }, { $set: { 'pay.max': 80000 } });

    for (const [language, message] of [
      ['en', 'Maximum pay must be at most €67,500 (1.5 times the minimum)'],
      ['fr', 'Rémunération maximale\u00a0: indiquez 67\u202f500\u00a0€ au maximum (1,5 fois la minimale)']
    ]) {
      const refused = await setMatching(recruiter, job._id, true, language);
      expect(refused.json()).toEqual({ type: 'validation', on: 'body', property: 'pay.max', message });
    }
    expect((await stored(job._id)).matching).toBeUndefined();
    expect(warmed).toEqual([]);

    // Saved again with the top it is scored with (what its editor shows): it goes in
    const narrowed = sampleJob({ pay: { min: 45000, max: 67500, currency: 'EUR', period: 'year' } });
    expect((await call('PUT', `/jobs/${job._id}`, { body: narrowed, cookie: recruiter.cookie })).status).toBe(200);
    expect((await setMatching(recruiter, job._id, true)).json().matching.review.status).toBe('pending');
  });

  it("puts a job its recruiter first shared on a candidate's page for recruiters into matching, the journey left as it was", async () => {
    const recruiter = await createRecruiter();
    const candidate = await createUser('candidate');
    const domain = t.id('candidate');
    await Domain.create({ name: domain, admin: candidate.id, experiences: [] });
    expect((await call('PUT', '/workflow', { body: workflowRequestBody, cookie: candidate.cookie })).status).toBe(200);
    // Written from the page for recruiters: created without `matching`, so off
    const job = await createJob(recruiter);
    expect(job.matching).toEqual({ enabledAt: null, review: null });
    const picked = await call('POST', `/workflow/domains/${domain}/steps/job`, {
      body: { input: { jobId: job._id } },
      cookie: recruiter.cookie
    });
    expect(picked.status).toBe(200);
    const shared = await WorkflowInstance.findOne({ owner: candidate.id, visitor: recruiter.id }).lean();
    expect(shared?.steps).toBeDefined();

    const answer = await setMatching(recruiter, job._id, true);

    expect(answer.status).toBe(200);
    expect(answer.json().matching.review).toMatchObject({ status: 'pending' });
    // The version shared on the journey stays as it was shared
    expect((await WorkflowInstance.findOne({ owner: candidate.id, visitor: recruiter.id }).lean())?.steps).toEqual(shared!.steps);
  });

  it("answers 404 for another recruiter's posting or an unknown one, 403 without a recruiter space, 422 on consent without the terms in force", async () => {
    const recruiter = await createRecruiter();
    const other = await createRecruiter('other');
    const job = await createJob(recruiter);

    expect((await setMatching(other, job._id, true)).status).toBe(404);
    expect((await setMatching(recruiter, UNKNOWN_ID, true)).status).toBe(404);
    expect((await call('PUT', `/jobs/${job._id}/matching`, { body: { enabled: true } })).status).toBe(401);
    expect((await setMatching(await createUser('candidate'), job._id, true)).status).toBe(403);
    expect((await call('PUT', '/jobs/not-an-id/matching', { body: { enabled: true }, cookie: recruiter.cookie })).status).toBe(422);
    expect((await call('PUT', `/jobs/${job._id}/matching`, { body: { enabled: 'yes' }, cookie: recruiter.cookie })).status).toBe(422);

    const older = { version: '2025-01-01', acceptedAt: new Date('2025-01-02'), ageConfirmationKey: 'age-v0', source: 'recruiter' };
    await User.updateOne({ _id: recruiter.id }, { $set: { legalAcceptances: [older] } });
    expect((await setMatching(recruiter, job._id, true)).json()).toMatchObject({ property: 'consent' });
    expect((await stored(job._id)).matching).toBeUndefined();
  });

  it(`keeps at most ${MATCHING_LIMITS.matchingJobsPerRecruiter} jobs of a recruiter in matching, also when they are turned on at once`, async () => {
    const max = MATCHING_LIMITS.matchingJobsPerRecruiter;
    const recruiter = await createRecruiter();
    const posted = await JobPosting.insertMany(
      Array.from({ length: max + 1 }, (_, index) => ({
        ...sampleJob({ title: `Job ${index}` }),
        recruiter: recruiter.id,
        publishedAt: new Date()
      }))
    );
    const ids = posted.map((job) => job._id.toString());
    for (const id of ids.slice(0, max)) expect((await setMatching(recruiter, id, true)).status).toBe(200);

    const over = await setMatching(recruiter, ids[max]!, true);
    expect([over.status, over.text]).toEqual([409, `You can propose ${max} jobs to candidates at once: stop proposing one to propose another.`]);
    // A job off matching takes no place: once one is off, another one goes in
    expect((await setMatching(recruiter, ids[0]!, false)).status).toBe(200);
    expect((await setMatching(recruiter, ids[max]!, true)).status).toBe(200);

    const racer = await createRecruiter('racer');
    // Every other job approved once, then off and changed since: it would be sent for review again
    const earlier = new Date(Date.now() - DAY);
    const decided = { review: { status: 'approved', requestedAt: earlier, reviewedAt: earlier, version: 'an older version' } };
    const raced = await JobPosting.insertMany(
      Array.from({ length: max + 3 }, (_, index) => ({
        ...sampleJob({ title: `Raced ${index}` }),
        recruiter: racer.id,
        publishedAt: new Date(),
        ...(index % 2 === 0 ? { matching: decided } : {})
      }))
    );
    const before = new Map(
      await Promise.all(raced.map(async (job) => [job._id.toString(), (await stored(job._id.toString())).matching] as const))
    );
    const answers = await Promise.all(raced.map((job) => setMatching(racer, job._id.toString(), true)));
    expect(answers.every((answer) => answer.status === 200 || answer.status === 409)).toBe(true);
    expect(await JobPosting.countDocuments({ recruiter: racer.id, 'matching.enabledAt': { $exists: true } })).toBeLessThanOrEqual(max);
    // A job refused is left as it was: off, with the review it had (or none at all)
    for (const [index, answer] of answers.entries()) {
      if (answer.status !== 409) continue;
      const id = raced[index]!._id.toString();
      expect((await stored(id)).matching).toEqual(before.get(id));
    }
  });

  it('turns matching off in any status: every interest no mutual interest came of goes, passes and mutual interests stay', async () => {
    const recruiter = await createRecruiter();
    const job = await jobInMatching(recruiter);
    const other = await jobInMatching(recruiter, sampleJob({ title: 'Other job' }));
    const candidates = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((name) => createUser(name)));
    const [a, b, c, d, e] = candidates as [TestUser, TestUser, TestUser, TestUser, TestUser];
    const candidateInterest = await storeMatch(job._id, recruiter, a, { candidate: 'interested' });
    const recruiterInterest = await storeMatch(job._id, recruiter, b, { recruiter: 'interested' });
    const candidatePass = await storeMatch(job._id, recruiter, c, { candidate: 'pass' });
    // Answered with a pass: the interest goes all the same, the pass stays
    const answeredWithPass = await storeMatch(job._id, recruiter, d, { candidate: 'interested', recruiter: 'pass' });
    const mutual = await storeMatch(job._id, recruiter, e, { candidate: 'interested', recruiter: 'interested', matched: true });
    const elsewhere = await storeMatch(other._id, recruiter, a, { candidate: 'interested' });

    const answer = await setMatching(recruiter, job._id, false);

    expect(answer.status).toBe(200);
    expect(answer.json().matching).toMatchObject({ enabledAt: null, review: { status: 'pending' } });
    const after = await stored(job._id);
    expect(after.matching?.enabledAt).toBeUndefined();
    // Its review stays, for when it is turned on again
    expect(after.matching?.review?.status).toBe('pending');
    expect(await matchOf(candidateInterest)).toBeNull();
    expect(await matchOf(recruiterInterest)).toBeNull();
    expect((await matchOf(candidatePass))?.candidateDecision?.value).toBe('pass');
    const passed = await matchOf(answeredWithPass);
    expect(passed?.candidateDecision).toBeUndefined();
    expect(passed?.recruiterDecision?.value).toBe('pass');
    expect((await matchOf(mutual))?.matchedAt).toBeInstanceOf(Date);
    expect(await matchOf(elsewhere)).not.toBeNull();

    // Off again, on hold or closed: in any status, nothing more to do
    expect((await setMatching(recruiter, job._id, false)).status).toBe(200);
    await call('PUT', `/jobs/${other._id}/status`, { body: { status: 'closed' }, cookie: recruiter.cookie });
    expect((await setMatching(recruiter, other._id, false)).json().matching.enabledAt).toBeNull();
  });

  it('keeps a decision only for the version decided on when a job is turned off then on again', async () => {
    const recruiter = await createRecruiter();
    const job = await jobInMatching(recruiter);
    await approve(job._id, new Date(Date.now() - DAY));
    const approved = (await stored(job._id)).matching?.review;

    await setMatching(recruiter, job._id, false);
    const back = await setMatching(recruiter, job._id, true);
    expect(back.json().matching.review).toMatchObject({ status: 'approved', reviewedAt: approved?.reviewedAt?.toISOString() });
    expect(jobLiveInMatching(await stored(job._id) as never)).toBe(true);

    // Changed while off: sent for review again once back
    await setMatching(recruiter, job._id, false);
    const edit = await call('PUT', `/jobs/${job._id}`, {
      body: sampleJob({ description: '## The job\n\nBuild the billing platform, in Go.' }),
      cookie: recruiter.cookie
    });
    expect(edit.json().matching.review.status).toBe('approved');
    const changed = await setMatching(recruiter, job._id, true);
    expect(changed.json().matching.review).toMatchObject({ status: 'pending', reviewedAt: approved?.reviewedAt?.toISOString() });
    expect(changed.json().matching.review.requestedAt).toBe(changed.json().matching.enabledAt);

    // Rejected and unchanged: still rejected, with its reason
    const reason = { 'matching.review.status': 'rejected', 'matching.review.reason': 'Say who the client is.' };
    await JobPosting.updateOne(
      { _id: job._id },
      { $set: { ...reason, 'matching.review.version': reviewedVersion(await stored(job._id)) } },
      { timestamps: false }
    );
    await setMatching(recruiter, job._id, false);
    expect((await setMatching(recruiter, job._id, true)).json().matching.review).toMatchObject({
      status: 'rejected',
      reason: 'Say who the client is.'
    });
  });
});

// ── Creating a job in matching ──────────────────────────────

describe('POST /jobs with `matching`', () => {
  it('creates a job off matching unless asked, and in matching, sent for review, when asked', async () => {
    const recruiter = await createRecruiter();

    expect((await createJob(recruiter)).matching).toEqual({ enabledAt: null, review: null });
    expect((await createJob(recruiter, { ...sampleJob(), matching: false })).matching).toEqual({ enabledAt: null, review: null });

    const created = await createJob(recruiter, { ...sampleJob(), matching: true });
    expect(created.matching.enabledAt).toMatch(ISO_INSTANT);
    expect(created.matching.review).toEqual({
      status: 'pending',
      requestedAt: created.matching.enabledAt,
      reviewedAt: null,
      reason: null
    });
    expect(created.status).toBe('open');
    expect(warmed).toEqual([{ location: created.location, accountId: recruiter.id }]);
  });

  it('refuses matching for a job not created open, one without a company, and over the limit: nothing is created', async () => {
    const recruiter = await createRecruiter();

    const draft = await call('POST', '/jobs', { body: { ...sampleJob({ status: 'draft' }), matching: true }, cookie: recruiter.cookie });
    expect(draft.json()).toEqual({
      type: 'validation',
      on: 'body',
      property: 'matching',
      message: 'Only an open job can be proposed to candidates: create it open, or propose it once it is.'
    });
    const anonymous = await call('POST', '/jobs', {
      body: { ...sampleJob({ company: '  ' }), matching: true },
      cookie: recruiter.cookie,
      language: 'fr'
    });
    expect(anonymous.json()).toMatchObject({ property: 'company' });
    // The posting's own rules come first
    const invalid = await call('POST', '/jobs', { body: { ...sampleJob({ title: '' }), matching: true }, cookie: recruiter.cookie });
    expect(invalid.status).toBe(422);
    expect(invalid.json().property).not.toBe('matching');

    await JobPosting.insertMany(
      Array.from({ length: MATCHING_LIMITS.matchingJobsPerRecruiter }, (_, index) => ({
        ...sampleJob({ title: `In matching ${index}` }),
        recruiter: recruiter.id,
        publishedAt: new Date(),
        matching: { enabledAt: new Date(), review: { status: 'pending', requestedAt: new Date() } }
      }))
    );
    const over = await call('POST', '/jobs', { body: { ...sampleJob({ title: 'One more' }), matching: true }, cookie: recruiter.cookie });
    expect(over.status).toBe(409);
    expect(await JobPosting.exists({ recruiter: recruiter.id, title: 'One more' })).toBeNull();
    expect(await JobPosting.countDocuments({ recruiter: recruiter.id })).toBe(MATCHING_LIMITS.matchingJobsPerRecruiter);
    expect(warmed).toEqual([]);
  });

  it(`keeps at most ${MATCHING_LIMITS.matchingJobsPerRecruiter} jobs in matching when they are created in it at once: a creation refused leaves nothing`, async () => {
    const max = MATCHING_LIMITS.matchingJobsPerRecruiter;
    const recruiter = await createRecruiter();
    const titles = Array.from({ length: max + 3 }, (_, index) => `Created ${index}`);

    const answers = await Promise.all(
      titles.map((title) => call('POST', '/jobs', { body: { ...sampleJob({ title }), matching: true }, cookie: recruiter.cookie }))
    );

    expect(answers.every((answer) => answer.status === 200 || answer.status === 409)).toBe(true);
    const created = answers.filter((answer) => answer.status === 200).length;
    expect(created).toBeLessThanOrEqual(max);
    for (const [index, answer] of answers.entries()) {
      if (answer.status === 409) expect(await JobPosting.exists({ recruiter: recruiter.id, title: titles[index] })).toBeNull();
    }
    // Every posting left was created in matching
    expect(await JobPosting.countDocuments({ recruiter: recruiter.id })).toBe(created);
    expect(await JobPosting.countDocuments({ recruiter: recruiter.id, 'matching.enabledAt': { $exists: true } })).toBe(created);
  });
});

// ── A job's status ──────────────────────────────────────────

/** A job in matching, approved, with a pending interest, a pass, a mutual interest and one ended */
const jobWithMatches = async (recruiter: TestUser, prefix = 'with') => {
  const job = await jobInMatching(recruiter);
  await approve(job._id);
  const [a, b, c, d] = (await Promise.all(['a', 'b', 'c', 'd'].map((name) => createUser(`${prefix}-${name}`)))) as TestUser[];
  const endedAt = new Date(Date.now() - 2 * DAY);
  return {
    job,
    pendingInterest: await storeMatch(job._id, recruiter, a!, { candidate: 'interested' }),
    pass: await storeMatch(job._id, recruiter, b!, { recruiter: 'pass' }),
    mutual: await storeMatch(job._id, recruiter, c!, { candidate: 'interested', recruiter: 'interested', matched: true }),
    ended: await storeMatch(job._id, recruiter, d!, { matched: true, ended: endedAt }),
    endedAt
  };
};

describe("a job's status and its matches", () => {
  it.each(['filled', 'closed', 'draft'])(
    'takes a job %s out of matching: its decisions go, its mutual interests end',
    async (status) => {
      const recruiter = await createRecruiter();
      const { job, pendingInterest, pass, mutual, ended, endedAt } = await jobWithMatches(recruiter);
      const before = Date.now();

      const answer = await call('PUT', `/jobs/${job._id}/status`, { body: { status }, cookie: recruiter.cookie });

      expect(answer.status).toBe(200);
      expect(answer.json().matching).toMatchObject({ enabledAt: null, review: { status: 'approved' } });
      expect((await stored(job._id)).matching?.enabledAt).toBeUndefined();
      expect(await matchOf(pendingInterest)).toBeNull();
      expect(await matchOf(pass)).toBeNull();
      const closed = await matchOf(mutual);
      expect(closed?.endReason).toBe('job_closed');
      expect(closed!.endedAt!.getTime()).toBeGreaterThanOrEqual(before);
      expect(closed?.expiresAt).toEqual(endedMatchExpiry(closed!.endedAt!));
      // Kept with what each side saw, MATCH_RETENTION.endedMatchMonths more
      expect(closed?.snapshot?.score).toBe(90);
      const already = await matchOf(ended);
      expect([already?.endReason, already?.endedAt]).toEqual(['candidate', endedAt]);
      // Opened again, it is not back in matching by itself
      const reopened = await call('PUT', `/jobs/${job._id}/status`, { body: { status: 'open' }, cookie: recruiter.cookie });
      expect(reopened.json().matching.enabledAt).toBeNull();
    }
  );

  it('keeps a job on hold in matching, proposed to nobody, with its matches; open again, it is proposed again', async () => {
    const recruiter = await createRecruiter();
    const { job, pendingInterest, pass, mutual } = await jobWithMatches(recruiter);

    const held = await call('PUT', `/jobs/${job._id}/status`, { body: { status: 'on_hold' }, cookie: recruiter.cookie });

    expect(held.json().matching.enabledAt).toMatch(ISO_INSTANT);
    expect(jobLiveInMatching(await stored(job._id) as never)).toBe(false);
    for (const id of [pendingInterest, pass, mutual]) expect(await matchOf(id)).not.toBeNull();
    expect((await matchOf(mutual))?.endedAt).toBeUndefined();

    await call('PUT', `/jobs/${job._id}/status`, { body: { status: 'open' }, cookie: recruiter.cookie });
    expect(jobLiveInMatching(await stored(job._id) as never)).toBe(true);
  });

  it('does the same when an edit closes the job, and whatever the MATCHING flag', async () => {
    const recruiter = await createRecruiter();
    const edited = await jobWithMatches(recruiter);
    const answer = await call('PUT', `/jobs/${edited.job._id}`, { body: sampleJob({ status: 'closed' }), cookie: recruiter.cookie });
    expect(answer.status).toBe(200);
    expect(answer.json().matching.enabledAt).toBeNull();
    expect((await matchOf(edited.mutual))?.endReason).toBe('job_closed');
    expect(await matchOf(edited.pendingInterest)).toBeNull();

    const offline = await jobWithMatches(recruiter, 'offline');
    const deleted = await jobWithMatches(recruiter, 'deleted');
    const reworded = await jobWithMatches(recruiter, 'reworded');
    env.matchingEnabled = false;
    app = createApp();
    expect((await call('PUT', `/jobs/${offline.job._id}/status`, { body: { status: 'filled' }, cookie: recruiter.cookie })).status).toBe(200);
    expect((await stored(offline.job._id)).matching?.enabledAt).toBeUndefined();
    expect((await matchOf(offline.mutual))?.endReason).toBe('job_closed');
    expect(await matchOf(offline.pass)).toBeNull();
    // Deleted: its matches go
    expect((await call('DELETE', `/jobs/${deleted.job._id}`, { cookie: recruiter.cookie })).status).toBe(200);
    expect(await Match.countDocuments({ job: deleted.job._id })).toBe(0);
    // Edited: sent back for review, its matches kept
    const edit = await call('PUT', `/jobs/${reworded.job._id}`, {
      body: sampleJob({ description: '## The job\n\nReworded while matching is off.' }),
      cookie: recruiter.cookie
    });
    expect(edit.status).toBe(200);
    expect(edit.json()).not.toHaveProperty('matching');
    expect((await stored(reworded.job._id)).matching?.review?.status).toBe('pending');
    expect(await matchOf(reworded.pendingInterest)).not.toBeNull();
  });
});

describe('DELETE /jobs/:id', () => {
  it('deletes every match of the job, mutual interests included, and nothing of another job', async () => {
    const recruiter = await createRecruiter();
    const { job, pendingInterest, mutual, ended } = await jobWithMatches(recruiter);
    const other = await jobInMatching(recruiter, sampleJob({ title: 'Other job' }));
    const kept = await storeMatch(other._id, recruiter, await createUser('kept'), { candidate: 'interested' });

    expect((await call('DELETE', `/jobs/${job._id}`, { cookie: recruiter.cookie })).status).toBe(200);

    for (const id of [pendingInterest, mutual, ended]) expect(await matchOf(id)).toBeNull();
    expect(await Match.countDocuments({ job: job._id })).toBe(0);
    expect(await matchOf(kept)).not.toBeNull();
  });
});

// ── Edits ───────────────────────────────────────────────────

describe('an edit of a job in matching', () => {
  it('refuses to take its company out (422) while MATCHING is on; while off, takes the job out of matching instead', async () => {
    const recruiter = await createRecruiter();
    const job = await jobInMatching(recruiter);
    const interest = await storeMatch(job._id, recruiter, await createUser('a'), { candidate: 'interested' });

    const refused = await call('PUT', `/jobs/${job._id}`, { body: sampleJob({ company: undefined }), cookie: recruiter.cookie });
    expect(refused.json()).toEqual({
      type: 'validation',
      on: 'body',
      property: 'company',
      message:
        'This job is proposed to candidates, so it names its company: stop proposing it before you remove the company.'
    });
    expect((await stored(job._id)).company).toBe('Acme');
    // Closed by the same edit, it leaves matching anyway: nothing refused
    const other = await jobInMatching(recruiter, sampleJob({ title: 'Other job' }));
    expect((await call('PUT', `/jobs/${other._id}`, { body: sampleJob({ title: 'Other job', company: undefined, status: 'closed' }), cookie: recruiter.cookie })).status).toBe(200);

    env.matchingEnabled = false;
    app = createApp();
    const edit = await call('PUT', `/jobs/${job._id}`, { body: sampleJob({ company: undefined }), cookie: recruiter.cookie });
    expect(edit.status).toBe(200);
    const after = await stored(job._id);
    expect(after.company).toBeUndefined();
    expect(after.matching?.enabledAt).toBeUndefined();
    expect(await matchOf(interest)).toBeNull();
  });

  it('sends an approved or rejected job that changed back for review; its decisions and mutual interests stay', async () => {
    const recruiter = await createRecruiter();
    const { job, pendingInterest, mutual } = await jobWithMatches(recruiter);

    // Nothing changed: still approved
    const same = await call('PUT', `/jobs/${job._id}`, { body: sampleJob(), cookie: recruiter.cookie });
    expect(same.json().matching.review.status).toBe('approved');

    const before = Date.now();
    const edit = await call('PUT', `/jobs/${job._id}`, {
      body: sampleJob({ description: '## The job\n\nBuild the billing platform. Now with Kafka.' }),
      cookie: recruiter.cookie
    });
    const review = edit.json().matching.review;
    expect(review.status).toBe('pending');
    expect(new Date(review.requestedAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(review.reviewedAt).toMatch(ISO_INSTANT);
    expect(jobLiveInMatching(await stored(job._id) as never)).toBe(false);
    expect(await matchOf(pendingInterest)).not.toBeNull();
    expect((await matchOf(mutual))?.endedAt).toBeUndefined();

    // Rejected, then changed: pending again, the reason gone
    await JobPosting.updateOne(
      { _id: job._id },
      {
        $set: {
          'matching.review': {
            status: 'rejected',
            requestedAt: new Date(),
            reviewedAt: new Date(),
            reason: 'Say who the client is.',
            version: reviewedVersion(await stored(job._id))
          }
        }
      },
      { timestamps: false }
    );
    const fixed = await call('PUT', `/jobs/${job._id}`, { body: sampleJob({ benefits: ['Meal vouchers'] }), cookie: recruiter.cookie });
    expect(fixed.json().matching.review).toMatchObject({ status: 'pending', reason: null });
    expect((await stored(job._id)).matching?.review?.reason).toBeUndefined();
  });

  it('sends it back for review from what is stored: a decision or a switch made while the edit ran', async () => {
    const recruiter = await createRecruiter();
    const reviewer = await createUser('reviewer');
    const description = (text: string) => sampleJob({ description: `## The job\n\n${text}` });
    const save = JobPosting.prototype.save;
    /** The edit's save, once `meanwhile` ran: after the edit read the posting, before it writes */
    const beforeTheSave = (meanwhile: () => Promise<void>) =>
      spyOn(JobPosting.prototype, 'save').mockImplementationOnce(async function (this: any, ...args: any[]) {
        await meanwhile();
        return save.apply(this, args as never);
      } as never);

    // A reviewer approves the version they read, the edit then saves another
    const reviewed = await jobInMatching(recruiter);
    const version = reviewedVersion(await stored(reviewed._id));
    beforeTheSave(async () => {
      const approval = { body: { decision: 'approve', version }, cookie: reviewer.cookie };
      expect((await call('PUT', `/matching/reviews/${reviewed._id}`, approval)).status).toBe(200);
    });
    const edit = await call('PUT', `/jobs/${reviewed._id}`, { body: description('Edited while it was reviewed.'), cookie: recruiter.cookie });
    expect(edit.json().matching.review.status).toBe('pending');
    expect(jobLiveInMatching((await stored(reviewed._id)) as never)).toBe(false);

    // Approved, off, then turned on again (its approval kept: unchanged) while an edit ran
    const switched = await jobInMatching(recruiter, sampleJob({ title: 'Switched' }));
    await approve(switched._id);
    await setMatching(recruiter, switched._id, false);
    mock.restore();
    spyOn(jobMatchingWarmUp, 'office').mockImplementation(async () => {});
    beforeTheSave(async () => {
      expect((await setMatching(recruiter, switched._id, true)).json().matching.review.status).toBe('approved');
    });
    const late = await call('PUT', `/jobs/${switched._id}`, {
      body: sampleJob({ title: 'Switched', description: '## The job\n\nEdited while it was turned on.' }),
      cookie: recruiter.cookie
    });
    expect(late.json().matching).toMatchObject({ enabledAt: expect.stringMatching(ISO_INSTANT), review: { status: 'pending' } });
    expect(jobLiveInMatching((await stored(switched._id)) as never)).toBe(false);
  });

  it('turns matching on for the version an edit saved while it was being turned on', async () => {
    const recruiter = await createRecruiter();
    const job = await jobInMatching(recruiter);
    await approve(job._id);
    await setMatching(recruiter, job._id, false);
    // The edit saved between the switch's read and its write (while it counts the jobs in matching)
    const count = JobPosting.countDocuments.bind(JobPosting);
    let edited = false;
    spyOn(JobPosting, 'countDocuments').mockImplementation(((...args: Parameters<typeof count>) => {
      if (edited) return count(...args);
      edited = true;
      return (async () => {
        const edit = await call('PUT', `/jobs/${job._id}`, {
          body: sampleJob({ description: '## The job\n\nEdited while it was turned on.' }),
          cookie: recruiter.cookie
        });
        expect(edit.status).toBe(200);
        return count(...args);
      })();
    }) as never);

    const on = await setMatching(recruiter, job._id, true);

    expect(edited).toBe(true);
    expect(on.status).toBe(200);
    // Read again: the approval was of the version before the edit
    expect(on.json().matching.review.status).toBe('pending');
    const after = await stored(job._id);
    expect(after.description).toContain('Edited while it was turned on.');
    expect(jobLiveInMatching(after as never)).toBe(false);
  });

  it('marks a mutual interest whose snapshot is no longer the posting, and unmarks it once it is again', async () => {
    const recruiter = await createRecruiter();
    const job = await jobInMatching(recruiter);
    const original = toJobSnapshot(await stored(job._id));
    const mutual = await storeMatch(job._id, recruiter, await createUser('a'), { matched: true, snapshot: original });
    const unreadable = await storeMatch(job._id, recruiter, await createUser('b'), { matched: true, snapshot: { title: 'Not a posting' } });
    const ended = await storeMatch(job._id, recruiter, await createUser('c'), {
      matched: true,
      snapshot: original,
      ended: new Date(Date.now() - DAY)
    });
    const description = (text: string) => sampleJob({ description: `## The job\n\n${text}` });

    await call('PUT', `/jobs/${job._id}`, { body: description('Changed once.'), cookie: recruiter.cookie });
    const first = (await matchOf(mutual))?.changedAt;
    expect(first).toBeInstanceOf(Date);
    expect((await matchOf(unreadable))?.changedAt).toBeInstanceOf(Date);
    expect((await matchOf(ended))?.changedAt).toBeUndefined();
    // The snapshot never changes: each side keeps what it saw
    expect((await matchOf(mutual))?.snapshot?.posting).toEqual(original);

    // An edit that changes nothing more keeps the date of the change
    await call('PUT', `/jobs/${job._id}`, { body: description('Changed once.'), cookie: recruiter.cookie });
    expect((await matchOf(mutual))?.changedAt).toEqual(first);
    // Another change moves it
    await Bun.sleep(5);
    await call('PUT', `/jobs/${job._id}`, { body: description('Changed twice.'), cookie: recruiter.cookie });
    expect((await matchOf(mutual))!.changedAt!.getTime()).toBeGreaterThan(first!.getTime());

    // Back to what was matched: not changed any more
    await call('PUT', `/jobs/${job._id}`, { body: sampleJob(), cookie: recruiter.cookie });
    expect((await matchOf(mutual))?.changedAt).toBeUndefined();
    expect((await matchOf(unreadable))?.changedAt).toBeInstanceOf(Date);
  });
});

// ── The review ──────────────────────────────────────────────

describe('the review of the jobs in matching', () => {
  it('lists the jobs waiting for a review to the reviewers alone (403 for anyone else), and nothing of any candidate', async () => {
    const recruiter = await createRecruiter();
    const reviewer = await createUser('reviewer');
    const stranger = await createUser('stranger');
    const first = await jobInMatching(recruiter, sampleJob({ title: 'First' }));
    const second = await jobInMatching(recruiter, sampleJob({ title: 'Second' }));
    // Asked before anything else waiting (the list is the oldest first, a page at most): this
    // test's jobs are in it whatever other jobs wait in the database
    const asked = [new Date(1), new Date(2)];
    for (const [index, job] of [first, second].entries()) {
      await JobPosting.updateOne({ _id: job._id }, { $set: { 'matching.review.requestedAt': asked[index] } }, { timestamps: false });
    }
    const approved = await jobInMatching(recruiter, sampleJob({ title: 'Approved' }));
    await approve(approved._id);
    const off = await jobInMatching(recruiter, sampleJob({ title: 'Off' }));
    await setMatching(recruiter, off._id, false);

    // Candidates of the first job: one interested, one in a mutual interest, each with a portfolio,
    // a perfect job and an anonymous card
    const candidates = await Promise.all(['interested', 'mutual'].map((name) => createUser(`candidate-${name}`)));
    const headline = `Distinctive headline ${t.suffix}`;
    const ask = 51_234;
    for (const candidate of candidates) {
      await Domain.create({ name: t.id(`portfolio-${candidate.id}`), admin: candidate.id, experiences: [] });
      await PerfectJob.create({ user: candidate.id, criteria: parsePerfectJob({ pay: { importance: 5, perYear: ask } }).criteria });
      await DiscoveryProfile.create({
        user: candidate.id,
        enabledAt: new Date(),
        lastActiveAt: new Date(),
        card: { headline, hiddenExperiences: [] },
        consents: [{ action: 'granted', at: new Date(), termsVersion: LEGAL_VERSION, wordingKey: DISCOVERY_CONSENT_KEYS.en }]
      });
    }
    const [interested, mutual] = candidates as [TestUser, TestUser];
    const matches = [
      await storeMatch(first._id, recruiter, interested, { candidate: 'interested' }),
      await storeMatch(first._id, recruiter, mutual, {
        candidate: 'interested',
        recruiter: 'interested',
        matched: true,
        snapshot: toJobSnapshot(await stored(first._id))
      })
    ];

    for (const user of [stranger, recruiter]) {
      const refused = await call('GET', '/matching/reviews', { cookie: user.cookie });
      expect([refused.status, refused.text]).toEqual([403, NOT_A_MATCHING_REVIEWER]);
    }
    expect((await call('GET', '/matching/reviews')).status).toBe(401);
    // The emails are compared without their case
    env.matchingReviewers = new Set([reviewer.email.toLowerCase()]);
    await User.updateOne({ _id: reviewer.id }, { $set: { email: reviewer.email.toUpperCase() } });

    const answer = await call('GET', '/matching/reviews', { cookie: reviewer.cookie });

    expect(answer.status).toBe(200);
    const mine = answer.json().jobs.filter((entry: any) => [first._id, second._id, approved._id, off._id].includes(entry.job._id));
    expect(mine.map((entry: any) => entry.job.title)).toEqual(['First', 'Second']);
    const [entry] = mine;
    // The posting as its recruiter saved it, and nothing more: no candidate, no count of them
    expect(entry).toEqual({
      job: JSON.parse(JSON.stringify(toJobPostingDto(await stored(first._id)))),
      recruiter: { emailDomain: 'example.com' },
      matchingSince: first.matching.enabledAt,
      review: { status: 'pending', requestedAt: asked[0]!.toISOString(), reviewedAt: null, reason: null },
      version: reviewedVersion(await stored(first._id))
    });
    // Who is behind the job, by the domain of their address only
    for (const leak of [recruiter.id, recruiter.email, 'recruiter-first', 'recruiter-last']) {
      expect(answer.text).not.toContain(leak);
    }
    // Nothing of the candidates its matches name
    const domains = await Domain.find({ admin: { $in: candidates.map((candidate) => candidate.id) } }).lean();
    expect(domains).toHaveLength(2);
    for (const leak of [
      ...candidates.flatMap((candidate) => [candidate.id, candidate.email]),
      'candidate-interested-first',
      'candidate-mutual-last',
      ...domains.map((domain) => domain.name),
      ...matches.map(String),
      headline,
      String(ask)
    ]) {
      expect(answer.text).not.toContain(leak);
    }

    // Nobody is a reviewer without MATCHING_REVIEWERS
    env.matchingReviewers = new Set();
    expect((await call('GET', '/matching/reviews', { cookie: reviewer.cookie })).status).toBe(403);
  });

  it('approves the version read, or rejects it with a reason its recruiter reads', async () => {
    const recruiter = await createRecruiter();
    const reviewer = await createUser('reviewer');
    const job = await jobInMatching(recruiter);
    const version = reviewedVersion(await stored(job._id));
    const logs = capturedLogs();

    const approval = await call('PUT', `/matching/reviews/${job._id}`, {
      body: { decision: 'approve', reason: 'Ignored', version },
      cookie: reviewer.cookie
    });

    expect(approval.status).toBe(200);
    expect(approval.json().review).toMatchObject({ status: 'approved', reason: null });
    expect(approval.json().review.reviewedAt).toMatch(ISO_INSTANT);
    expect(jobLiveInMatching(await stored(job._id) as never)).toBe(true);
    expect((await call('GET', `/recruiter/jobs/${job._id}`, { cookie: recruiter.cookie })).json().matching.review).toMatchObject({
      status: 'approved',
      reason: null
    });
    expect(logs.some((line) => line.includes('Matching: job reviewed') && line.includes(job._id))).toBe(true);
    expect(logs.join('\n')).not.toContain(reviewer.email);
    expect(logs.join('\n')).not.toContain(recruiter.email);

    const missing = await call('PUT', `/matching/reviews/${job._id}`, { body: { decision: 'reject', version }, cookie: reviewer.cookie });
    expect(missing.json()).toEqual({
      type: 'validation',
      on: 'body',
      property: 'reason',
      message: 'Say why the job is not accepted: its recruiter reads it.'
    });
    const blank = await call('PUT', `/matching/reviews/${job._id}`, {
      body: { decision: 'reject', reason: ' ​ ', version },
      cookie: reviewer.cookie,
      language: 'fr'
    });
    expect(blank.json()).toMatchObject({ property: 'reason', message: "Dites pourquoi l'offre n'est pas acceptée\u00a0: son recruteur le lira." });
    const long = await call('PUT', `/matching/reviews/${job._id}`, {
      body: { decision: 'reject', reason: 'x'.repeat(MATCHING_LIMITS.reviewReason + 1), version },
      cookie: reviewer.cookie
    });
    expect(long.json()).toMatchObject({ property: 'reason' });
    expect((await stored(job._id)).matching?.review?.status).toBe('approved');

    const rejection = await call('PUT', `/matching/reviews/${job._id}`, {
      body: { decision: 'reject', reason: '  Say who​ the client is.\n\nThen ask again. ', version },
      cookie: reviewer.cookie
    });
    expect(rejection.json().review).toMatchObject({ status: 'rejected', reason: 'Say who the client is. Then ask again.' });
    expect(jobLiveInMatching(await stored(job._id) as never)).toBe(false);
    expect((await call('GET', '/recruiter/jobs', { cookie: recruiter.cookie })).json().jobs[0].matching.review).toMatchObject({
      status: 'rejected',
      reason: 'Say who the client is. Then ask again.'
    });
  });

  it('refuses a decision on a version that is no longer the posting (409), and on a job not in matching (404)', async () => {
    const recruiter = await createRecruiter();
    const reviewer = await createUser('reviewer');
    const job = await jobInMatching(recruiter);
    const version = reviewedVersion(await stored(job._id));
    await call('PUT', `/jobs/${job._id}`, { body: sampleJob({ description: '## The job\n\nNow different.' }), cookie: recruiter.cookie });

    const stale = await call('PUT', `/matching/reviews/${job._id}`, { body: { decision: 'approve', version }, cookie: reviewer.cookie });
    expect([stale.status, stale.text]).toEqual([409, JOB_CHANGED]);
    expect((await stored(job._id)).matching?.review?.status).toBe('pending');

    const fresh = reviewedVersion(await stored(job._id));
    // A decision left out is no approval (no default fills it in)
    const undecided = await call('PUT', `/matching/reviews/${job._id}`, { body: { version: fresh }, cookie: reviewer.cookie });
    expect(undecided.status).toBe(422);
    expect((await stored(job._id)).matching?.review?.status).toBe('pending');
    await setMatching(recruiter, job._id, false);
    expect((await call('PUT', `/matching/reviews/${job._id}`, { body: { decision: 'approve', version: fresh }, cookie: reviewer.cookie })).status).toBe(404);
    expect((await call('PUT', `/matching/reviews/${UNKNOWN_ID}`, { body: { decision: 'approve', version: fresh }, cookie: reviewer.cookie })).status).toBe(404);
    expect((await call('PUT', `/matching/reviews/${job._id}`, { body: { decision: 'maybe', version: fresh }, cookie: reviewer.cookie })).status).toBe(422);
    expect((await call('PUT', `/matching/reviews/${job._id}`, { body: { decision: 'approve' }, cookie: reviewer.cookie })).status).toBe(422);
    const stranger = await createUser('stranger');
    expect((await call('PUT', `/matching/reviews/${job._id}`, { body: { decision: 'approve', version: fresh }, cookie: stranger.cookie })).status).toBe(403);
  });
});

describe('the review and account deletion', () => {
  it('keeps no trace of the reviewer, and goes with the job when its recruiter deletes their account', async () => {
    const recruiter = await createRecruiter();
    const reviewer = await createUser('reviewer');
    const job = await jobInMatching(recruiter);
    await storeMatch(job._id, recruiter, await createUser('candidate'), { candidate: 'interested' });
    const version = reviewedVersion(await stored(job._id));
    expect((await call('PUT', `/matching/reviews/${job._id}`, { body: { decision: 'approve', version }, cookie: reviewer.cookie })).status).toBe(200);

    const kept = JSON.stringify(await stored(job._id));
    for (const trace of [reviewer.id, reviewer.email, 'reviewer-first']) expect(kept).not.toContain(trace);
    // The reviewer's account goes alone: the review stays as it was
    await deleteAccount(reviewer.id);
    expect((await stored(job._id)).matching?.review?.status).toBe('approved');

    const summary = await deleteAccount(recruiter.id);
    expect(summary).toMatchObject({ jobPostings: 1, matches: 1 });
    expect(await JobPosting.exists({ _id: job._id })).toBeNull();
    expect(await Match.countDocuments({ job: job._id })).toBe(0);
  });
});

// ── Withdrawal ──────────────────────────────────────────────

describe('a withdrawal of discovery', () => {
  it('drops the decisions about the candidate no mutual interest came of, both sides, and keeps the mutual interests', async () => {
    const recruiter = await createRecruiter();
    const job = await jobInMatching(recruiter);
    const other = await jobInMatching(recruiter, sampleJob({ title: 'Other job' }));
    const candidate = await createUser('candidate');
    const someoneElse = await createUser('else');
    const theirs = await storeMatch(job._id, recruiter, candidate, { candidate: 'interested' });
    const onThem = await storeMatch(other._id, recruiter, candidate, { recruiter: 'pass' });
    const mutual = await storeMatch(
      (await jobInMatching(recruiter, sampleJob({ title: 'Third job' })))._id,
      recruiter,
      candidate,
      { candidate: 'interested', recruiter: 'interested', matched: true }
    );
    const notTheirs = await storeMatch(job._id, recruiter, someoneElse, { candidate: 'interested' });

    expect((await call('DELETE', '/discovery/consent', { cookie: candidate.cookie })).status).toBe(200);

    expect(await matchOf(theirs)).toBeNull();
    expect(await matchOf(onThem)).toBeNull();
    expect(await matchOf(mutual)).not.toBeNull();
    expect(await matchOf(notTheirs)).not.toBeNull();
  });
});

// ── The jobs proposed ───────────────────────────────────────

describe('the jobs proposed to candidates', () => {
  it('are the jobs live in matching of a recruiter who accepted the terms in force, never the reader own', async () => {
    const recruiter = await createRecruiter();
    const job = await jobInMatching(recruiter);
    await approve(job._id);
    const proposed = async (except?: string) => JobPosting.countDocuments({ ...(await liveJobsQuery(except)), _id: job._id });
    expect(await isLiveInMatching(await stored(job._id))).toBe(true);
    expect(await proposed()).toBe(1);
    expect(await proposed(recruiter.id)).toBe(0);

    // The terms changed since they accepted them: proposed to nobody until they accept them again
    await User.updateOne({ _id: recruiter.id }, { $set: { 'legalAcceptances.$[].version': '2025-01-01' } });
    expect(await isLiveInMatching(await stored(job._id))).toBe(false);
    expect(await proposed()).toBe(0);
    // Its own state says nothing of it: still open, in matching and approved
    expect(jobLiveInMatching((await stored(job._id)) as never)).toBe(true);

    await recordConsent(recruiter.id, CONSENT, 'recruiter');
    expect(await isLiveInMatching(await stored(job._id))).toBe(true);
    expect(await proposed()).toBe(1);
  });
});

// ── The model ───────────────────────────────────────────────

describe('the Match model', () => {
  it('holds one match per job and candidate', async () => {
    const recruiter = await createRecruiter();
    const job = await jobInMatching(recruiter);
    const candidate = await createUser('candidate');
    await storeMatch(job._id, recruiter, candidate, { candidate: 'pass' });

    const twice = storeMatch(job._id, recruiter, candidate, { recruiter: 'interested' });

    await expect(twice).rejects.toMatchObject({ code: 11000 });
    expect(await Match.countDocuments({ job: job._id, candidate: candidate.id })).toBe(1);
  });

  it('is removed by MongoDB once its expiresAt is past, kept as long as MATCH_RETENTION says', async () => {
    const indexes = await Match.collection.indexes();
    expect(indexes.find((index) => index.key.expiresAt === 1)).toMatchObject({ expireAfterSeconds: 0 });
    expect(indexes.find((index) => index.key.job === 1 && index.key.candidate === 1)).toMatchObject({ unique: true });
    expect(MATCH_RETENTION).toEqual({ decisionMonths: 6, endedMatchMonths: 3 });
    const jobIndexes = await JobPosting.collection.indexes();
    expect(jobIndexes.some((index) => index.key['matching.review.status'] === 1)).toBe(true);
  });
});

// ── Decisions ───────────────────────────────────────────────

describe('decisions while MATCHING is off', () => {
  it('registers none of the routes of decisions and mutual interests: the 404 of a route that does not exist', async () => {
    env.matchingEnabled = false;
    app = createApp();
    const recruiter = await createRecruiter();
    const job = await createJob(recruiter);
    const id = new Types.ObjectId().toString();
    const routes: [string, string, unknown?][] = [
      ['PUT', `/opportunities/jobs/${job._id}/decision`, { decision: 'interested' }],
      ['DELETE', `/opportunities/jobs/${job._id}/decision`],
      ['PUT', `/recruiter/jobs/${job._id}/candidates/decision`, { token: 'x', decision: 'interested' }],
      ['DELETE', `/recruiter/jobs/${job._id}/candidates/decision`, { token: 'x' }],
      ['GET', '/matches?side=candidate'],
      ['GET', `/matches/${id}`],
      ['PUT', `/matches/${id}/seen`],
      ['POST', `/matches/${id}/end`],
      ['GET', '/me/notifications']
    ];
    expect(app.routes.some((route) => route.path.startsWith('/matches') || route.path.endsWith('/decision'))).toBe(false);
    expect(app.routes.some((route) => route.path === '/me/notifications')).toBe(false);
    for (const [method, path, body] of routes) {
      const unknown = await call(method, `${path.split('?')[0]}-that-does-not-exist`, { cookie: recruiter.cookie });
      const answer = await call(method, path, { body, cookie: recruiter.cookie });
      expect(answer.status).toBe(404);
      expect(answer.text).toBe(unknown.text);
    }
    expect(await RateLimitCounter.exists({ _id: new RegExp(`^${matchingDecisionsKey(recruiter.id)}:`) })).toBeNull();
  });

  it('leaves what a mutual interest stored in a journey holding nothing, and says nothing of it', async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate();
    const jobId = await liveJob(recruiter);
    await bothInterested(recruiter, candidate, jobId);
    expect(await statuses(candidate, recruiter)).toMatchObject({ job: 'succeeded', 'job-match': 'succeeded' });

    env.matchingEnabled = false;
    app = createApp();

    const journey = await journeyOf(candidate, recruiter);
    expect(journey).not.toHaveProperty('match');
    expect(journey.steps.find((step: { id: string }) => step.id === 'job')).toEqual({ id: 'job', type: 'job', status: 'pending' });
    expect(await statuses(candidate, recruiter)).toMatchObject({ job: 'pending', 'job-match': 'pending' });
    // The recruiter shares a job as anyone does, and the job page is not the mutual interest's
    expect((await call('GET', `/opportunities/jobs/${jobId}`, { cookie: candidate.cookie })).status).toBe(404);
    expect((await submitStep(candidate, recruiter, 'job', { jobId })).status).toBe(403);
  });
});

describe('PUT /opportunities/jobs/:id/decision (the candidate)', () => {
  it('records an interest or a pass on a job proposed to them, again, and its undo', async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate();
    const jobId = await liveJob(recruiter);

    const interested = await candidateDecides(candidate, jobId, 'interested');
    expect(interested.status).toBe(200);
    expect(interested.json()).toEqual({ decision: 'interested', match: null });
    let match = await Match.findOne({ job: jobId, candidate: candidate.id }).lean();
    expect(match).toMatchObject({ candidateDecision: { value: 'interested' }, recruiter: new Types.ObjectId(recruiter.id) });
    expect(match!.recruiterDecision).toBeUndefined();
    expect(match!.expiresAt!.getTime()).toBe(matchDecisionExpiry(match!.candidateDecision!.at).getTime());
    // On its private page: proposed to them, with what they said of it
    expect((await call('GET', `/opportunities/jobs/${jobId}`, { cookie: candidate.cookie })).json()).toMatchObject({
      access: 'feed',
      decision: 'interested'
    });

    // Again: the latest counts, kept as long as the first decision says
    expect((await candidateDecides(candidate, jobId, 'pass')).json()).toEqual({ decision: 'pass', match: null });
    const passed = await Match.findOne({ job: jobId, candidate: candidate.id }).lean();
    expect(passed!.candidateDecision!.value).toBe('pass');
    expect(passed!.expiresAt!.getTime()).toBe(match!.expiresAt!.getTime());

    expect((await candidateUndoes(candidate, jobId)).json()).toEqual({ decision: null, match: null });
    expect(await Match.exists({ job: jobId, candidate: candidate.id })).toBeNull();
    const again = await candidateUndoes(candidate, jobId);
    expect(again.status).toBe(404);
    expect(again.text).toBe(DECISION_NOT_FOUND);
    match = await Match.findOne({ job: jobId, candidate: candidate.id }).lean();
    expect(match).toBeNull();
  });

  it('refuses a candidate not proposed to recruiters (403), and a job not proposed to them like one that does not exist (404)', async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate();
    const jobId = await liveJob(recruiter);
    const pending = (await jobInMatching(recruiter, sampleJob({ title: `Pending ${t.suffix}` })))._id;
    const otherTitle = await liveJob(recruiter, { title: 'Not what they ask for' });
    const someone = await createUser('someone');

    const notProposed = await candidateDecides(someone, jobId, 'interested');
    expect(notProposed.status).toBe(403);
    expect(notProposed.text).toBe(NOT_PROPOSED_TO_RECRUITERS);
    for (const id of [pending, otherTitle, UNKNOWN_ID]) {
      const answer = await candidateDecides(candidate, id, 'interested');
      expect(answer.status).toBe(404);
      expect(answer.text).toBe(JOB_NOT_FOUND);
    }
    // Its recruiter passed them: no longer proposed to them either
    expect((await recruiterDecides(recruiter, jobId, candidate, 'pass')).status).toBe(200);
    expect((await candidateDecides(candidate, jobId, 'interested')).status).toBe(404);
    // Withdrawn from discovery: proposed to nobody
    expect((await recruiterUndoes(recruiter, jobId, candidate)).status).toBe(200);
    expect((await call('DELETE', '/discovery/consent', { cookie: candidate.cookie })).status).toBe(200);
    expect((await candidateDecides(candidate, jobId, 'interested')).status).toBe(403);
    expect(await Match.countDocuments({ candidate: candidate.id })).toBe(0);
  });

  it(`answers 429 over ${MATCHING_LIMITS.decisionsPerDay} decisions a day, in the visitor language`, async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate();
    const jobId = await liveJob(recruiter);
    await Promise.all(
      Array.from({ length: MATCHING_DECISIONS.limit }, () => takeRateLimit(matchingDecisionsKey(candidate.id), MATCHING_DECISIONS))
    );

    const answer = await candidateDecides(candidate, jobId, 'interested', 'fr');

    expect(answer.status).toBe(429);
    expect(answer.text).toBe(
      `Vous pouvez répondre à ce qui vous est proposé ${MATCHING_DECISIONS.limit} fois par jour. Réessayez demain.`
    );
    expect(await Match.exists({ job: jobId, candidate: candidate.id })).toBeNull();
    // The undo counts too
    expect((await candidateUndoes(candidate, jobId)).status).toBe(429);
  });
});

describe('PUT /recruiter/jobs/:id/candidates/decision (the recruiter)', () => {
  it("records an interest or a pass on the candidate a card's token stands for, again, and its undo", async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate();
    const jobId = await liveJob(recruiter);
    // The token the feed gives them (tests/matchFeeds.test.ts covers the feed)
    const feed = await call('GET', `/recruiter/jobs/${jobId}/candidates`, { cookie: recruiter.cookie });
    const [card] = feed.json().cards;

    const interested = await recruiterDecides(recruiter, jobId, candidate, 'interested', card.token);
    expect(interested.json()).toEqual({ decision: 'interested', match: null });
    expect(await Match.findOne({ job: jobId, candidate: candidate.id }).lean()).toMatchObject({
      recruiterDecision: { value: 'interested' }
    });
    // Answered: no longer in their feed
    expect((await call('GET', `/recruiter/jobs/${jobId}/candidates`, { cookie: recruiter.cookie })).json().cards).toEqual([]);

    expect((await recruiterDecides(recruiter, jobId, candidate, 'pass')).json()).toEqual({ decision: 'pass', match: null });
    expect((await recruiterUndoes(recruiter, jobId, candidate)).json()).toEqual({ decision: null, match: null });
    expect(await Match.exists({ job: jobId, candidate: candidate.id })).toBeNull();
    expect((await recruiterUndoes(recruiter, jobId, candidate)).text).toBe(DECISION_NOT_FOUND);
  });

  it('refuses a token made for another recruiter or job, or not one, and a candidate not proposed for the job (409)', async () => {
    const recruiter = await createRecruiter();
    const rival = await createRecruiter('rival');
    const candidate = await proposedCandidate();
    const jobId = await liveJob(recruiter);
    const otherJob = await liveJob(recruiter, { title: `Other ${t.suffix}` });
    const rivalJob = await liveJob(rival);

    for (const token of [
      cardToken(rival, jobId, candidate),
      cardToken(recruiter, otherJob, candidate),
      sealMatchToken(candidate.id, { recruiterId: recruiter.id, jobId }, new Date(Date.now() - 8 * DAY)),
      'not-a-token'
    ]) {
      const answer = await recruiterDecides(recruiter, jobId, candidate, 'interested', token);
      expect(answer.status).toBe(409);
      expect(answer.text).toBe(CANDIDATE_UNAVAILABLE);
    }
    // Another recruiter's job: 404, like one that does not exist
    expect((await recruiterDecides(recruiter, rivalJob, candidate, 'interested')).status).toBe(404);
    // A job not proposed to candidates: 409, whatever the token
    const pending = (await jobInMatching(recruiter, sampleJob({ title: `Pending ${t.suffix}` })))._id;
    const notLive = await recruiterDecides(recruiter, pending, candidate, 'interested');
    expect(notLive.status).toBe(409);
    expect(notLive.text).toBe(JOB_NOT_PROPOSED);
    // The candidate passed the job, or withdrew: not proposed for it
    expect((await candidateDecides(candidate, jobId, 'pass')).status).toBe(200);
    expect((await recruiterDecides(recruiter, jobId, candidate, 'interested')).text).toBe(CANDIDATE_UNAVAILABLE);
    expect((await candidateUndoes(candidate, jobId)).status).toBe(200);
    expect((await call('DELETE', '/discovery/consent', { cookie: candidate.cookie })).status).toBe(200);
    expect((await recruiterDecides(recruiter, jobId, candidate, 'interested')).text).toBe(CANDIDATE_UNAVAILABLE);
    expect(await Match.countDocuments({ candidate: candidate.id })).toBe(0);
  });

  it('needs a recruiter space and the terms in force, like every recruiter route', async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate();
    const jobId = await liveJob(recruiter);
    const notRecruiter = await createUser('not-recruiter');

    expect((await recruiterDecides(notRecruiter, jobId, candidate, 'interested')).status).toBe(403);
    await User.updateOne({ _id: recruiter.id }, { $set: { 'legalAcceptances.$[].version': '2025-01-01' } });
    const stale = await recruiterDecides(recruiter, jobId, candidate, 'interested');
    expect(stale.status).toBe(422);
    expect(stale.json()).toMatchObject({ property: 'consent' });
  });
});

// ── The mutual interest ─────────────────────────────────────

describe('a mutual interest', () => {
  for (const first of ['candidate', 'recruiter'] as const) {
    it(`is made when both are interested, the ${first} first, and keeps what the candidate said yes to`, async () => {
      const recruiter = await createRecruiter();
      const candidate = await proposedCandidate();
      const jobId = await liveJob(recruiter);
      const posted = await stored(jobId);

      const firstAnswer =
        first === 'candidate'
          ? await candidateDecides(candidate, jobId, 'interested')
          : await recruiterDecides(recruiter, jobId, candidate, 'interested');
      expect(firstAnswer.json().match).toBeNull();
      const second =
        first === 'candidate'
          ? await recruiterDecides(recruiter, jobId, candidate, 'interested')
          : await candidateDecides(candidate, jobId, 'interested');
      expect(second.status).toBe(200);

      const match = (await Match.findOne({ job: jobId, candidate: candidate.id }).lean())!;
      expect(match.matchedAt).toBeInstanceOf(Date);
      expect(match.revealedAt!.getTime()).toBe(match.matchedAt!.getTime());
      expect(match.expiresAt).toBeUndefined();
      expect(match.changedAt).toBeUndefined();
      // The side that answered last is told now; the other has it unseen
      const last = first === 'candidate' ? 'recruiter' : 'candidate';
      expect(match[`${last}SeenAt`]!.getTime()).toBe(match.matchedAt!.getTime());
      expect(match[`${first}SeenAt`]).toBeUndefined();
      expect(match.snapshot).toMatchObject({
        posting: { ...toJobSnapshot(posted), title: `Senior Backend Engineer ${t.suffix}` },
        version: posted.updatedAt,
        score: 100,
        minScore: 70
      });
      const byCriterion = (a: { criterion: string }, b: { criterion: string }) => a.criterion.localeCompare(b.criterion);
      expect([...(match.snapshot!.criteria as { criterion: string }[])].sort(byCriterion)).toEqual(
        ['contractTypes', 'pay', 'titles', 'workMode'].map((criterion) => ({ criterion, outcome: 'match' }))
      );

      // Each side is answered as it reads it
      const answer = second.json().match;
      if (last === 'recruiter') {
        expect(answer).toMatchObject({
          side: 'recruiter',
          job: { _id: jobId, title: `Senior Backend Engineer ${t.suffix}`, company: 'Acme', status: 'open' },
          candidate: { domain: candidate.domain, title: 'Quill candidate' },
          seen: true,
          endedAt: null
        });
      } else {
        expect(answer).toMatchObject({
          side: 'candidate',
          job: { _id: jobId, title: `Senior Backend Engineer ${t.suffix}`, company: 'Acme', status: 'open' },
          score: 100,
          minScore: 70,
          seen: true
        });
      }
      // No decision changes it now (either side ends it instead)
      for (const answerAgain of [
        await candidateDecides(candidate, jobId, 'pass'),
        await recruiterDecides(recruiter, jobId, candidate, 'pass'),
        await candidateUndoes(candidate, jobId),
        await recruiterUndoes(recruiter, jobId, candidate)
      ]) {
        expect(answerAgain.status).toBe(409);
        expect(answerAgain.text).toBe(MUTUAL_INTEREST_EXISTS);
      }
      expect(await Match.countDocuments({ job: jobId, candidate: candidate.id })).toBe(1);
      expect((await Match.findById(match._id).lean())!.candidateDecision!.value).toBe('interested');
    });
  }

  it('is made exactly once when both answer at the same moment, in either order', async () => {
    const recruiter = await createRecruiter();
    for (const [round, order] of (['candidate', 'recruiter', 'candidate', 'recruiter'] as const).entries()) {
      const candidate = await proposedCandidate(`candidate${round}`);
      const jobId = await liveJob(recruiter, { title: `Job ${round} ${t.suffix}` });
      const fromCandidate = () => candidateDecides(candidate, jobId, 'interested');
      const fromRecruiter = () => recruiterDecides(recruiter, jobId, candidate, 'interested');

      const answers = await Promise.all(order === 'candidate' ? [fromCandidate(), fromRecruiter()] : [fromRecruiter(), fromCandidate()]);

      expect(answers.map((answer) => answer.status)).toEqual([200, 200]);
      const matches = await Match.find({ job: jobId, candidate: candidate.id }).lean();
      expect(matches).toHaveLength(1);
      expect(matches[0].matchedAt).toBeInstanceOf(Date);
      // At least the request that made it says so, and both say the same one
      const made = answers.map((answer) => answer.json().match).filter(Boolean);
      expect(made.length).toBeGreaterThan(0);
      expect(new Set(made.map((match: { _id: string }) => match._id))).toEqual(new Set([String(matches[0]._id)]));
      // Led into the journey once
      expect((await progressOf(candidate, recruiter)).job?.data).toMatchObject({ job: jobId, match: String(matches[0]._id) });
      expect(await WorkflowInstance.countDocuments({ owner: candidate.id, visitor: recruiter.id })).toBe(1);
    }
  });

  it('is not made when a side passes or undoes theirs first', async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate();
    const jobId = await liveJob(recruiter);

    expect((await candidateDecides(candidate, jobId, 'interested')).status).toBe(200);
    expect((await candidateUndoes(candidate, jobId)).status).toBe(200);
    expect((await recruiterDecides(recruiter, jobId, candidate, 'interested')).json().match).toBeNull();
    expect((await recruiterUndoes(recruiter, jobId, candidate)).status).toBe(200);

    expect((await recruiterDecides(recruiter, jobId, candidate, 'interested')).status).toBe(200);
    expect((await candidateDecides(candidate, jobId, 'pass')).json().match).toBeNull();
    expect(await Match.exists({ job: jobId, matchedAt: { $exists: true } })).toBeNull();
    expect(await WorkflowInstance.exists({ owner: candidate.id, visitor: recruiter.id })).toBeNull();
  });

  it('is marked changed when the posting was edited since: each side keeps what the candidate said yes to', async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate();
    const jobId = await liveJob(recruiter);
    const matchId = await bothInterested(recruiter, candidate, jobId);

    const edited = await call('PUT', `/jobs/${jobId}`, {
      body: { ...sampleJob({ title: `Senior Backend Engineer ${t.suffix}` }), description: 'A new description.', updatedAt: (await stored(jobId)).updatedAt },
      cookie: recruiter.cookie
    });
    expect(edited.status).toBe(200);

    const page = (await call('GET', `/opportunities/jobs/${jobId}`, { cookie: candidate.cookie })).json();
    expect(page.access).toBe('match');
    expect(page.job.description).toBe('## The job\n\nBuild the billing platform.');
    expect(page.match).toMatchObject({ _id: matchId, changedAt: expect.any(String), endedAt: null });
    expect((await journeyOf(candidate, recruiter)).match).toMatchObject({ _id: matchId, changed: true });
    // Still the version they said yes to on the journey
    expect((await statuses(candidate, recruiter)).job).toBe('succeeded');
  });
});

// ── Where a mutual interest leads ───────────────────────────

describe("a mutual interest and the candidate's journey", () => {
  it('fills the job step, freezes the job match, keeps the note to confirm, then opens the meeting', async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate();
    const jobId = await liveJob(recruiter);
    const matchId = await bothInterested(recruiter, candidate, jobId);

    const journey = await journeyOf(candidate, recruiter);
    expect(journey.match).toEqual({
      _id: matchId,
      job: { _id: jobId, title: `Senior Backend Engineer ${t.suffix}`, company: 'Acme' },
      matchedAt: expect.any(String)
    });
    const [note, job, jobMatch, meeting] = journey.steps;
    expect(note.status).toBe('pending');
    expect(job).toMatchObject({
      status: 'succeeded',
      view: { job: { _id: jobId, title: `Senior Backend Engineer ${t.suffix}`, status: 'open', sharedAt: journey.match.matchedAt }, matched: true }
    });
    expect(job.view.job).not.toHaveProperty('outdated');
    expect(jobMatch).toMatchObject({
      status: 'succeeded',
      view: { score: 100, minScore: 70, matched: true, frozenAt: journey.match.matchedAt, job: { _id: jobId } }
    });
    expect(jobMatch.view.criteria.map((view: { criterion: string }) => view.criterion).sort()).toEqual(
      ['contractTypes', 'pay', 'titles', 'workMode']
    );
    expect(meeting.status).toBe('pending');
    // What the journey keeps of it: the version and the mutual interest, the freeze
    const progress = await progressOf(candidate, recruiter);
    expect(progress.job?.data).toMatchObject({ job: jobId, match: matchId, posting: { title: `Senior Backend Engineer ${t.suffix}` } });
    expect(progress['job-match']?.data).toMatchObject({ via: 'mutual_match', match: matchId, job: jobId });
    expect(progress.note).toBeUndefined();

    // The meeting opens once the note is confirmed, not before
    expect(await meetingOpen(candidate, recruiter)).toBe(false);
    expect((await submitStep(candidate, recruiter, 'note', { acknowledged: true })).status).toBe(200);
    expect(await meetingOpen(candidate, recruiter)).toBe(true);
    // Nobody else's journey moved: another visitor, the owner, someone signed out
    const someone = await createRecruiter('someone');
    expect((await journeyOf(candidate, someone)).match).toBeUndefined();
    expect((await journeyOf(candidate)).match).toBeUndefined();
    expect((await journeyOf(candidate, candidate)).match).toBeUndefined();
  });

  it('opens the meeting at once on a journey without a note', async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate('candidate', gate({ note: false }));
    const jobId = await liveJob(recruiter);
    await bothInterested(recruiter, candidate, jobId);

    expect(await statuses(candidate, recruiter)).toEqual({ job: 'succeeded', 'job-match': 'succeeded', meeting: 'pending' });
    expect(await meetingOpen(candidate, recruiter)).toBe(true);
  });

  it('keeps the score it had: what the candidate changes since does not change it', async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate('candidate', gate({ note: false }));
    const jobId = await liveJob(recruiter);
    await bothInterested(recruiter, candidate, jobId);

    // A pay the job now misses, a deal-breaker, and the highest minimum
    const raised = criteria({ pay: { importance: 5, dealBreaker: true, perYear: 90_000 } });
    expect((await call('PUT', '/perfect-job', { body: { criteria: raised }, cookie: candidate.cookie })).status).toBe(200);
    expect((await call('PUT', '/workflow', { body: { steps: gate({ note: false, minScore: 100, showDetails: false }) }, cookie: candidate.cookie })).status).toBe(200);

    const jobMatch = (await journeyOf(candidate, recruiter)).steps.find((step: { id: string }) => step.id === 'job-match');
    expect(jobMatch).toMatchObject({ status: 'succeeded', view: { score: 100, minScore: 70, matched: true } });
    // Details only while the owner shows them
    expect(jobMatch.view).not.toHaveProperty('criteria');
    expect(await meetingOpen(candidate, recruiter)).toBe(true);
  });

  it('still leads there once the candidate edits their journey: steps added again under other ids', async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate();
    const jobId = await liveJob(recruiter);
    await bothInterested(recruiter, candidate, jobId);
    const [note] = journeyTemplate('gate');

    const renamed = [
      { ...note, id: 'intro' },
      { id: 'offer', type: 'job', config: {} },
      { id: 'score', type: 'job-match', config: { minScore: 70, showDetails: true } },
      { id: 'call', type: 'meeting', config: {} }
    ];
    expect((await call('PUT', '/workflow', { body: { steps: renamed }, cookie: candidate.cookie })).status).toBe(200);

    // Nothing stored under the new ids: held from the mutual interest itself
    const progress = await progressOf(candidate, recruiter);
    expect(progress.offer).toBeUndefined();
    expect(progress.score).toBeUndefined();
    expect(await statuses(candidate, recruiter)).toEqual({ intro: 'pending', offer: 'succeeded', score: 'succeeded', call: 'pending' });
    expect((await submitStep(candidate, recruiter, 'intro', { acknowledged: true })).status).toBe(200);
    expect(await assertStepOpen(candidate.id, recruiter.id, 'call')).toBeUndefined();
  });

  it("refuses another job on the job step while it lasts (409); ended, it holds nothing and the recruiter shares one as anyone", async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate('candidate', gate({ note: false }));
    const jobId = await liveJob(recruiter);
    const another = (await createJob(recruiter, sampleJob({ title: `Another ${t.suffix}` })))._id;
    const matchId = await bothInterested(recruiter, candidate, jobId);

    const refused = await submitStep(candidate, recruiter, 'job', { jobId: another });
    expect(refused.status).toBe(409);
    expect(refused.text).toBe(JOB_OF_MUTUAL_INTEREST);

    expect((await call('POST', `/matches/${matchId}/end`, { cookie: candidate.cookie })).status).toBe(200);

    const journey = await journeyOf(candidate, recruiter);
    expect(journey.match).toBeUndefined();
    expect(journey.steps.map((step: { status: string }) => step.status)).toEqual(['pending', 'pending', 'pending']);
    expect(journey.steps[0]).not.toHaveProperty('view');
    // What it stored there is gone; the recruiter shares a job, scored as anyone's
    const progress = await progressOf(candidate, recruiter);
    expect(progress.job).toBeUndefined();
    expect(progress['job-match']).toBeUndefined();
    expect((await submitStep(candidate, recruiter, 'job', { jobId: another })).status).toBe(200);
    const scored = (await journeyOf(candidate, recruiter)).steps[1];
    expect(scored.view).not.toHaveProperty('matched');
  });
});

// ── Each side's mutual interests ────────────────────────────

describe('mutual interests, as each side reads them', () => {
  it('lists them to each side, the recruiter reading the portfolio revealed and never who the candidate is', async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate();
    const jobId = await liveJob(recruiter);
    const matchId = await bothInterested(recruiter, candidate, jobId);

    const asCandidate = await call('GET', '/matches?side=candidate', { cookie: candidate.cookie });
    expect(asCandidate.json().matches).toEqual([
      expect.objectContaining({ _id: matchId, side: 'candidate', score: 100, minScore: 70, seen: false, changedAt: null })
    ]);
    expect(asCandidate.json().matches[0].job).toMatchObject({ _id: jobId, company: 'Acme', status: 'open' });
    expect(asCandidate.json().matches[0].job).not.toHaveProperty('recruiter');
    expect(asCandidate.text).not.toContain(recruiter.email);
    expect(asCandidate.text).not.toContain(recruiter.id);

    const asRecruiter = await call('GET', '/matches?side=recruiter', { cookie: recruiter.cookie });
    expect(asRecruiter.json().matches).toEqual([
      expect.objectContaining({
        _id: matchId,
        side: 'recruiter',
        candidate: { domain: candidate.domain, title: 'Quill candidate' },
        seen: true
      })
    ]);
    for (const secret of [candidate.email, candidate.id, 'candidate-first', 'candidate-last']) {
      expect(asRecruiter.text).not.toContain(secret);
    }
    // One of them, to either side; nothing to anyone else
    expect((await call('GET', `/matches/${matchId}`, { cookie: candidate.cookie })).json().side).toBe('candidate');
    expect((await call('GET', `/matches/${matchId}`, { cookie: recruiter.cookie })).json().side).toBe('recruiter');
    const someone = await createRecruiter('someone');
    for (const path of [`/matches/${matchId}`, `/matches/${UNKNOWN_ID}`]) {
      const answer = await call('GET', path, { cookie: someone.cookie });
      expect(answer.status).toBe(404);
      expect(answer.text).toBe(MATCH_NOT_FOUND);
    }
    expect((await call('GET', '/matches?side=recruiter', { cookie: someone.cookie })).json().matches).toEqual([]);
    // As a recruiter: with a recruiter space and the terms in force
    expect((await call('GET', '/matches?side=recruiter', { cookie: candidate.cookie })).status).toBe(403);
    await User.updateOne({ _id: recruiter.id }, { $set: { 'legalAcceptances.$[].version': '2025-01-01' } });
    expect((await call('GET', '/matches?side=recruiter', { cookie: recruiter.cookie })).status).toBe(422);
    expect((await call('GET', `/matches/${matchId}`, { cookie: recruiter.cookie })).status).toBe(422);
    expect((await call('GET', '/matches?side=nobody', { cookie: recruiter.cookie })).status).toBe(422);
  });

  it('counts those not seen yet, side by side, until each is seen or ends', async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate();
    const first = await bothInterested(recruiter, candidate, await liveJob(recruiter));
    const second = await bothInterested(recruiter, candidate, await liveJob(recruiter, { title: `Second ${t.suffix}` }));
    const notifications = async (user: TestUser) =>
      (await call('GET', '/me/notifications', { cookie: user.cookie })).json().mutualInterests;

    // The recruiter answered last both times: told then
    expect(await notifications(candidate)).toEqual({ candidate: 2, recruiter: 0 });
    expect(await notifications(recruiter)).toEqual({ candidate: 0, recruiter: 0 });

    const seen = await call('PUT', `/matches/${first}/seen`, { cookie: candidate.cookie });
    expect(seen.json()).toMatchObject({ _id: first, seen: true });
    expect(await notifications(candidate)).toEqual({ candidate: 1, recruiter: 0 });
    expect((await call('POST', `/matches/${second}/end`, { cookie: recruiter.cookie })).status).toBe(200);
    expect(await notifications(candidate)).toEqual({ candidate: 0, recruiter: 0 });
    expect((await call('PUT', `/matches/${first}/seen`, { cookie: (await createUser('someone')).cookie })).status).toBe(404);
  });

  it('ends one by either side, kept a few months with what each side saw, and answers one ended as it is', async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate();
    const byCandidate = await bothInterested(recruiter, candidate, await liveJob(recruiter));
    const byRecruiter = await bothInterested(recruiter, candidate, await liveJob(recruiter, { title: `Second ${t.suffix}` }));

    const ended = await call('POST', `/matches/${byCandidate}/end`, { cookie: candidate.cookie });
    expect(ended.json()).toMatchObject({ _id: byCandidate, endReason: 'candidate', endedAt: expect.any(String) });
    const stored = (await Match.findById(byCandidate).lean())!;
    expect(stored.expiresAt!.getTime()).toBe(endedMatchExpiry(stored.endedAt!).getTime());
    expect(stored.snapshot).toBeDefined();
    // Again, by the other side: answered as it is
    const again = await call('POST', `/matches/${byCandidate}/end`, { cookie: recruiter.cookie });
    expect(again.json()).toMatchObject({ endReason: 'candidate', side: 'recruiter' });

    expect((await call('POST', `/matches/${byRecruiter}/end`, { cookie: recruiter.cookie })).json().endReason).toBe('recruiter');
    // Listed, ended, to both; leading nowhere
    const listed = (await call('GET', '/matches?side=candidate', { cookie: candidate.cookie })).json().matches;
    expect(listed.map((match: { endReason: string }) => match.endReason).sort()).toEqual(['candidate', 'recruiter']);
    expect((await journeyOf(candidate, recruiter)).match).toBeUndefined();
    // Its job's private page still reads the version they said yes to, until it expires
    expect((await call('GET', `/opportunities/jobs/${String(stored.job)}`, { cookie: candidate.cookie })).json()).toMatchObject({
      access: 'match',
      match: { _id: byCandidate, endReason: 'candidate' }
    });
  });

  it('ends with its job: closed, the mutual interest ends and the journey holds it no more', async () => {
    const recruiter = await createRecruiter();
    const candidate = await proposedCandidate('candidate', gate({ note: false }));
    const jobId = await liveJob(recruiter);
    const matchId = await bothInterested(recruiter, candidate, jobId);

    expect((await call('PUT', `/jobs/${jobId}/status`, { body: { status: 'closed' }, cookie: recruiter.cookie })).status).toBe(200);

    expect((await Match.findById(matchId).lean())).toMatchObject({ endReason: 'job_closed' });
    expect(await statuses(candidate, recruiter)).toEqual({ job: 'pending', 'job-match': 'pending', meeting: 'pending' });
    expect((await journeyOf(candidate, recruiter)).match).toBeUndefined();
  });
});
