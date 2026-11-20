// The job side of matching (Path 2, behind MATCHING): the recruiter's switch
// (PUT /jobs/:id/matching, POST /jobs's `matching`), the review of each job by
// the operator's reviewers (GET/PUT /matching/reviews), and what a job's
// changes do to its matches and its review (services/jobMatching.ts,
// services/matchingReviews.ts, plugins/jobs.ts), with the Match model
// (models/database/match.ts), against a real MongoDB (MONGO_URL, local or from
// TEST_MONGO_URL). Decisions and mutual interests have no route yet: the
// matches a test needs are stored directly. Each test creates its own
// accounts, postings and matches, named with a suffix unique to that test,
// and removes them after: tests pass in any order (--randomize). Nothing asks
// an outside service: the office lookup a job's entry starts is replaced.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import mongoose, { Types } from 'mongoose';
import {
  MATCHING_LIMITS,
  MATCH_RETENTION,
  endedMatchExpiry,
  jobLiveInMatching,
  matchDecisionExpiry
} from 'portfolio-common';
import { env } from '../env';
import { createApp } from '../app';
import { DiscoveryProfile, JobPosting, Match, User } from '../models/database';
import type { JobPosting as StoredJobPosting } from '../models/database/jobPosting';
import { JOB_CHANGED, MATCHING_NEEDS_OPEN_JOB, NOT_A_MATCHING_REVIEWER } from '../protocol';
import { deleteAccount } from '../services/accountDeletion';
import { jobMatchingWarmUp, reviewedVersion } from '../services/jobMatching';
import { toJobSnapshot } from '../services/jobPostings';
import { logger } from '../services/logger';
import { authCookie, openRecruiterSpace } from './helpers';
import { assertDisposableDatabase } from './testDatabase';

/** Names unique to one test: everything it creates carries its suffix */
const testNames = () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
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
const saved = { matching: env.matchingEnabled, reviewers: env.matchingReviewers };

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

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  await Promise.all([User.init(), JobPosting.init(), Match.init(), DiscoveryProfile.init()]);
});

afterAll(async () => {
  env.matchingEnabled = saved.matching;
  env.matchingReviewers = saved.reviewers;
  if (connected) await mongoose.disconnect();
});

beforeEach(() => {
  t = testNames();
  // Before the app is built: it registers the matching routes only while the flag is on
  env.matchingEnabled = true;
  env.matchingReviewers = new Set([t.email('reviewer')]);
  app = createApp();
  warmed = [];
  spyOn(jobMatchingWarmUp, 'office').mockImplementation(async (location, accountId) => {
    warmed.push({ location, accountId });
  });
});

afterEach(async () => {
  mock.restore();
  env.matchingEnabled = saved.matching;
  env.matchingReviewers = saved.reviewers;
  if (!connected) return;
  const users = (await User.find({ email: new RegExp(`-${t.suffix}@`) }, '_id').lean()).map((user) => user._id);
  const jobs = (await JobPosting.find({ recruiter: { $in: users } }, '_id').lean()).map((job) => job._id);
  await Match.deleteMany({ $or: [{ candidate: { $in: users } }, { recruiter: { $in: users } }, { job: { $in: jobs } }] });
  await JobPosting.deleteMany({ _id: { $in: jobs } });
  await DiscoveryProfile.deleteMany({ user: { $in: users } });
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
    const raced = await JobPosting.insertMany(
      Array.from({ length: max + 3 }, (_, index) => ({ ...sampleJob({ title: `Raced ${index}` }), recruiter: racer.id, publishedAt: new Date() }))
    );
    const answers = await Promise.all(raced.map((job) => setMatching(racer, job._id.toString(), true)));
    expect(answers.every((answer) => answer.status === 200 || answer.status === 409)).toBe(true);
    expect(await JobPosting.countDocuments({ recruiter: racer.id, 'matching.enabledAt': { $exists: true } })).toBeLessThanOrEqual(max);
  });

  it('turns matching off in any status: the interests nobody answered go, passes and mutual interests stay', async () => {
    const recruiter = await createRecruiter();
    const job = await jobInMatching(recruiter);
    const other = await jobInMatching(recruiter, sampleJob({ title: 'Other job' }));
    const candidates = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((name) => createUser(name)));
    const [a, b, c, d, e] = candidates as [TestUser, TestUser, TestUser, TestUser, TestUser];
    const candidateInterest = await storeMatch(job._id, recruiter, a, { candidate: 'interested' });
    const recruiterInterest = await storeMatch(job._id, recruiter, b, { recruiter: 'interested' });
    const candidatePass = await storeMatch(job._id, recruiter, c, { candidate: 'pass' });
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
    env.matchingEnabled = false;
    app = createApp();
    expect((await call('PUT', `/jobs/${offline.job._id}/status`, { body: { status: 'filled' }, cookie: recruiter.cookie })).status).toBe(200);
    expect((await stored(offline.job._id)).matching?.enabledAt).toBeUndefined();
    expect((await matchOf(offline.mutual))?.endReason).toBe('job_closed');
    expect(await matchOf(offline.pass)).toBeNull();
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
  it('lists the jobs waiting for a review to the reviewers alone (403 for anyone else)', async () => {
    const recruiter = await createRecruiter();
    const reviewer = await createUser('reviewer');
    const stranger = await createUser('stranger');
    const first = await jobInMatching(recruiter, sampleJob({ title: 'First' }));
    await Bun.sleep(5);
    const second = await jobInMatching(recruiter, sampleJob({ title: 'Second' }));
    const approved = await jobInMatching(recruiter, sampleJob({ title: 'Approved' }));
    await approve(approved._id);
    const off = await jobInMatching(recruiter, sampleJob({ title: 'Off' }));
    await setMatching(recruiter, off._id, false);

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
    expect(entry).toEqual({
      job: expect.objectContaining({ _id: first._id, title: 'First', company: 'Acme', description: first.description }),
      recruiter: { emailDomain: 'example.com' },
      matchingSince: first.matching.enabledAt,
      review: { status: 'pending', requestedAt: first.matching.enabledAt, reviewedAt: null, reason: null },
      version: reviewedVersion(await stored(first._id))
    });
    // Who is behind the job, by the domain of their address only
    for (const leak of [recruiter.id, recruiter.email, 'recruiter-first', 'recruiter-last']) {
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

// ── The model ───────────────────────────────────────────────

describe('the Match model', () => {
  it('holds one match per job and candidate', async () => {
    const recruiter = await createRecruiter();
    const job = await jobInMatching(recruiter);
    const candidate = await createUser('candidate');
    await storeMatch(job._id, recruiter, candidate, { candidate: 'pass' });

    const twice = storeMatch(job._id, recruiter, candidate, { recruiter: 'interested' });

    expect(twice).rejects.toMatchObject({ code: 11000 });
    await twice.catch(() => {});
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
