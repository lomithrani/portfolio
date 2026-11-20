import { Types } from 'mongoose';
import {
  DISCOVERY_INACTIVITY_DAYS,
  JOB_MATCH_STEP_LIMITS,
  MATCHING_LIMITS,
  discoveryConsentCutoff,
  scorePerfectJob
} from 'portfolio-common';
import type { JobSnapshot, PerfectJob as PerfectJobCriteria, PerfectJobScore } from 'portfolio-common';
import { DiscoveryProfile, JobPosting, Match, WorkflowInstance } from '../models/database';
import type { JobPosting as StoredJobPosting } from '../models/database/jobPosting';
import { FEED_CURSOR_PATTERN } from '../models/elysia/matchRequest.models';
import { ConflictError, ForbiddenError, ResourceNotFoundError, TooManyRequestsError } from '../errors';
import { JOB_NOT_PROPOSED, NOT_PROPOSED_TO_RECRUITERS } from '../protocol';
import { anonymousCard, cardOutcomes } from './candidateCard';
import type { CandidateCard, CardOutcome } from './candidateCard';
import { cachedCommuteContext, commuteAvailability, commuteWarmUpPossible, warmCommute } from './commute';
import type { CommutePair, CommuteReading } from './commute';
import { isProposed, touchDiscovery } from './discovery';
import { isLiveInMatching, liveJobsQuery } from './jobMatching';
import { JOB_NOT_FOUND, toJobSnapshot } from './jobPostings';
import type { JobPostingDto } from './jobPostings';
import { sealMatchToken } from './matchTokens';
import { perfectJobOf } from './perfectJobs';
import { hashValue, rateLimitKey, takeRateLimit } from './rateLimit';
import type { RateLimit } from './rateLimit';
import type { TransitProvider } from './transit';
import { ownerJourney } from './workflows';
import { jobMatchCriteria, jobMatchMinScore } from './workflowSteps/jobMatch';
import type { JobMatchCriterionView } from './workflowSteps/jobMatch';
import { pickedJobId } from './workflowSteps/job';
import { m } from './matchFeeds.messages';

// The feeds of matching (Path 2, behind MATCHING): the open jobs proposed to a
// candidate (GET /opportunities), and the anonymous cards of the candidates
// proposed for a recruiter's job (GET /recruiter/jobs/:id/candidates). Both are
// computed when they are read, from what is stored: nothing is written to
// show them (but the candidate's activity, once a day), and nothing is asked
// of an outside service while they are read.
//
// Who is proposed to whom is one rule, on both sides: a job proposed to
// candidates now (open, in matching and approved by a reviewer, of a
// recruiter who accepted the terms in force: jobMatching.ts's
// isLiveInMatching), a candidate proposed to recruiters now (their consent in
// force and nothing missing: discovery.ts's isProposed), the job scored
// against the candidate's own criteria (portfolio-common's scorePerfectJob,
// the score the "Get the job scored" step of their journey gives) at least
// their journey's minimum, no deal-breaker missed; never the candidate's own
// job, never what the reader answered already (interested or pass), nor what
// the other side passed (a candidate who passed the job, a recruiter who passed
// the candidate for it), nor a job its recruiter already shared on the
// candidate's page for recruiters (they are in touch through it). An interest
// of the other side's leaves a pair proposed: a recruiter reads the candidates
// interested in their job first.
//
// Deterministic only: no model, no learning, no ranking by score. A
// candidate's jobs come the most recently published first, with that date; a
// recruiter's cards come those interested in the job first, then in an order
// drawn from a keyed hash of the job and the candidate (hashValue): the same
// at every read, different for every job, and saying nothing of the score, of
// when anyone signed up, or of anything else about them. A recruiter reads
// MATCHING_LIMITS.recruiterCardsPerRead cards at a time and whether there are
// more, never how many: counts compared across jobs that differ by their pay
// (their terms are locked, a duplicate is another job) would tell candidates'
// floors. Each card stands for its candidate by a token bound to the recruiter
// and the job (matchTokens.ts), never an id.
//
// Travel times are read from the cache only (cachedCommuteContext): a feed is
// a GET, which Bun cuts after 30 s without data, and many pairs at once. What
// is not kept yet is asked in the background (warmCommute), within the
// reader's daily allowance and matching's share of the site's day: meanwhile a
// candidate reads that job's commute as unknown, and a recruiter's feed holds
// the candidate back (`pending`: read again in a moment), unless the job cannot
// meet them even with the commute matching (nothing is asked). When the travel time
// cannot be found today, or ever for matching (public transport from
// Transitous, which matching never asks), a commute that is a deal-breaker
// keeps the candidate out of recruiters' feeds; another is left out of the
// score, as the job match step leaves out a travel time it does not have.

// ── Reads ───────────────────────────────────────────────────

/** Reads of the feeds per account per hour, both together: what a person reads, not a script */
export const MATCHING_FEED_READS: RateLimit = { limit: 120, windowMs: 60 * 60_000 };

/** The counter of `userId`'s feed reads (keyed by a hash of it: rateLimitKey) */
export const matchingFeedKey = (userId: string) => rateLimitKey('matching-feed', userId);

/** Counts one read of a feed by `userId`; 429 over MATCHING_FEED_READS. Never given back */
const countRead = async (userId: string) => {
  const { retryAfterSeconds } = await takeRateLimit(matchingFeedKey(userId), MATCHING_FEED_READS);
  if (retryAfterSeconds !== null) {
    throw new TooManyRequestsError(() => m.tooManyReads(MATCHING_FEED_READS.limit), retryAfterSeconds);
  }
};

/**
 * What a read asks in the background: the travel time of a pair not kept yet, and whether the
 * reader's allowances leave room for it today. Tests replace them
 */
export const matchFeedWarmUps = {
  commute: (pair: CommutePair, accountId: string): Promise<void> => warmCommute(pair, accountId),
  possible: (accountId: string): Promise<boolean> => commuteWarmUpPossible(accountId)
};

/** Whether a warm-up could find what `reading` lacks: something not kept yet, or a service that failed a while ago */
const findable = (reading: CommuteReading) => reading.state === 'missing' || reading.state === 'failed';

/** What the reader's warm-ups can do today, asked once per read and only when a pair needs it */
const warmUpsFor = (accountId: string) => {
  let possible: Promise<boolean> | undefined;
  return () => (possible ??= matchFeedWarmUps.possible(accountId).catch(() => false));
};

// ── What a candidate asks of a job ──────────────────────────

/** A candidate's bar, which every job is held to: their criteria, and their journey's minimum */
interface CandidateBar {
  perfectJob: PerfectJobCriteria;
  /** The minimum of their journey's job match (the highest without one: fails closed) */
  minScore: number;
  /** Their journey's job match shows details: a recruiter reads the outcomes (cardOutcomes) */
  showDetails: boolean;
  /** The ids of their journey's job steps, where a recruiter's pick is kept */
  jobSteps: string[];
}

const candidateBar = async (candidateId: string): Promise<CandidateBar> => {
  const [perfectJob, journey] = await Promise.all([perfectJobOf(candidateId), ownerJourney(candidateId)]);
  const jobMatch = journey.steps.find((step) => step.type === 'job-match');
  return {
    perfectJob,
    minScore: jobMatch ? jobMatchMinScore(jobMatch.config) : JOB_MATCH_STEP_LIMITS.minScore.max,
    showDetails: (jobMatch?.config as { showDetails?: unknown } | undefined)?.showDetails === true,
    jobSteps: journey.steps.filter((step) => step.type === 'job').map((step) => step.id)
  };
};

/** A job scored against a candidate's bar, with what the read knew of the commute */
interface ScoredPair {
  score: PerfectJobScore;
  reading: CommuteReading;
}

/** The job `snapshot` scored against `bar`, its travel time from the cache only */
const scorePair = async (bar: CandidateBar, snapshot: JobSnapshot): Promise<ScoredPair> => {
  const reading = await cachedCommuteContext(bar.perfectJob.commute, snapshot.location, 'matching');
  return { reading, score: scorePerfectJob(bar.perfectJob, snapshot, reading.context) };
};

/** The job meets the candidate's bar: no deal-breaker missed, at least their minimum */
const passes = ({ score }: Pick<ScoredPair, 'score'>, bar: CandidateBar) => !score.broken && score.score >= bar.minScore;

/** The read could not tell the commute: not kept yet, a service that failed, or never for matching */
const commuteUnknown = ({ reading }: ScoredPair) => findable(reading) || reading.state === 'unknowable';

/**
 * The job scored as if its commute matched: the most it can score once its travel time is known.
 * A job that does not meet the candidate's bar even then never will
 */
const atBest = (bar: CandidateBar, snapshot: JobSnapshot): Pick<ScoredPair, 'score'> => ({
  score: scorePerfectJob(bar.perfectJob, snapshot, { commute: { minutes: 0 } })
});

/**
 * The jobs a recruiter picked on the job steps of a candidate's journey, from what their visits
 * stored (`progress`: each WorkflowInstance's steps): picked there, they are in touch through it
 */
const pickedOn = (jobSteps: readonly string[], progress: readonly unknown[]): Set<string> => {
  const picked = new Set<string>();
  for (const steps of progress) {
    // A Map in the schema, a plain object once read with lean(): looked up as a Map, so a step id
    // is never read off an object's prototype
    const byStep = new Map(Object.entries((steps ?? {}) as Record<string, { data?: unknown } | undefined>));
    for (const stepId of jobSteps) {
      const jobId = pickedJobId(byStep.get(stepId)?.data);
      if (jobId) picked.add(jobId);
    }
  }
  return picked;
};

// ── The candidate's feed ────────────────────────────────────

/**
 * A job proposed to a candidate as they read it: the version scored (its JobSnapshot, normalised,
 * its pay range brought down to the top it is scored with), its id and when it was published.
 * Never who posted it
 */
export interface OpportunityJobDto extends JobSnapshot {
  _id: string;
  /** When it was opened: the date the feed shows, and orders by */
  publishedAt: Date;
}

/** A job of a candidate's feed */
export interface OpportunityCard {
  job: OpportunityJobDto;
  /** Out of 100, against the candidate's own criteria: theirs to read */
  score: number;
  /** Their journey's minimum, which the score meets */
  minScore: number;
  /**
   * How the job does on each of their criteria (the job match step's views), the commute
   * included: `unknown` while its travel time is not known
   */
  criteria: JobMatchCriterionView[];
  /** With a travel time among `criteria`: the public transport service this site asks, to credit it */
  transit?: TransitProvider;
}

/** GET /opportunities */
export interface CandidateFeedDto {
  /** The most recently published first, MATCHING_LIMITS.candidateFeedPage at most */
  jobs: OpportunityCard[];
  /** More jobs after these: read them with `next` */
  more: boolean;
  /** What to send as `after` for the next page; null without more */
  next: string | null;
  /** Travel times of jobs shown are being computed: read again in a moment for their commute */
  pending: boolean;
}

/** Where a page of a candidate's feed starts: after the job published at `at` with the id `id` */
interface FeedCursor {
  at: Date;
  id: Types.ObjectId;
}

const cursorOf = (job: { _id: Types.ObjectId; publishedAt?: Date | null }): string =>
  `${(job.publishedAt?.getTime() ?? 0).toString(36)}.${String(job._id)}`;

const readCursor = (after: string | undefined): FeedCursor | undefined => {
  if (!after || !new RegExp(FEED_CURSOR_PATTERN).test(after)) return undefined;
  const [time, id] = after.split('.');
  return { at: new Date(Number.parseInt(time, 36)), id: new Types.ObjectId(id) };
};

/** The posting as a candidate's feed shows it: the version scored, its id and its publication */
const opportunityJob = (job: StoredJobPosting, snapshot: JobSnapshot): OpportunityJobDto => ({
  ...snapshot,
  _id: String(job._id),
  publishedAt: job.publishedAt ?? job.createdAt
});

/**
 * GET /opportunities: the open jobs proposed to the candidate `userId` now, the most recently
 * published first, MATCHING_LIMITS.candidateFeedPage at a time, from after `after` (a page's
 * `next`). 429 over MATCHING_FEED_READS; 403 NOT_PROPOSED_TO_RECRUITERS unless they are proposed
 * to recruiters now (discovery on, nothing missing). Leaves out what they answered already (an
 * interest or a pass), the jobs whose recruiter passed them, their own jobs, and the jobs a
 * recruiter shared on their page for recruiters. Each job comes with its score, the minimum, and
 * how it does on each of their criteria; a travel time not kept yet is asked in the background
 * (`pending`). Reading it is activity (touchDiscovery)
 */
export async function candidateFeed(userId: string, after?: string, now = new Date()): Promise<CandidateFeedDto> {
  await countRead(userId);
  if (!(await isProposed(userId, now))) throw new ForbiddenError(NOT_PROPOSED_TO_RECRUITERS);
  await touchDiscovery(userId, now);

  const [bar, answered, visits] = await Promise.all([
    candidateBar(userId),
    // Jobs they answered, or whose recruiter passed them: nothing to propose again
    Match.find(
      { candidate: userId, $or: [{ candidateDecision: { $exists: true } }, { 'recruiterDecision.value': 'pass' }] },
      { job: 1 }
    ).lean<{ job: Types.ObjectId }[]>(),
    WorkflowInstance.find({ owner: userId }, { steps: 1 }).lean<{ steps?: unknown }[]>()
  ]);
  const left = new Set(answered.map((match) => String(match.job)));
  for (const jobId of pickedOn(bar.jobSteps, visits.map((visit) => visit.steps))) left.add(jobId);

  const cursor = readCursor(after);
  // Live in matching, of a recruiter who accepted the terms in force, never their own
  const jobs = JobPosting.find({
    ...(await liveJobsQuery(userId)),
    ...(cursor
      ? { $or: [{ publishedAt: { $lt: cursor.at } }, { publishedAt: cursor.at, _id: { $lt: cursor.id } }] }
      : {})
  })
    .sort({ publishedAt: -1, _id: -1 })
    .lean<StoredJobPosting[]>()
    .cursor();

  const page = MATCHING_LIMITS.candidateFeedPage;
  const shown: { job: StoredJobPosting; card: OpportunityCard; scored: ScoredPair }[] = [];
  let more = false;
  try {
    for await (const job of jobs) {
      if (left.has(String(job._id))) continue;
      const snapshot = toJobSnapshot(job);
      const scored = await scorePair(bar, snapshot);
      if (!passes(scored, bar)) continue;
      if (shown.length === page) {
        more = true;
        break;
      }
      const criteria = jobMatchCriteria(scored.score.criteria);
      const timed = criteria.some(({ criterion, outcome }) => criterion === 'commute' && outcome !== 'unknown');
      const transit = timed ? commuteAvailability('matching').transit : undefined;
      shown.push({
        job,
        scored,
        card: {
          job: opportunityJob(job, snapshot),
          score: scored.score.score,
          minScore: bar.minScore,
          criteria,
          ...(transit ? { transit } : {})
        }
      });
    }
  } finally {
    await jobs.close();
  }

  // Travel times of the jobs shown that a warm-up can find: asked in the background
  const canWarm = warmUpsFor(userId);
  let pending = false;
  for (const { card, scored } of shown) {
    if (!findable(scored.reading) || !(await canWarm())) continue;
    pending = true;
    void matchFeedWarmUps.commute({ candidateId: userId, location: card.job.location }, userId);
  }

  const last = shown.at(-1)?.job;
  return {
    jobs: shown.map(({ card }) => card),
    more,
    next: more && last ? cursorOf(last) : null,
    pending
  };
}

/**
 * The posting `job` as a candidate reads it when it is proposed to them now (the private page,
 * services/jobAccess.ts: `access: 'feed'`), whatever they answered of it: the version their feed
 * scores; null when it is not proposed to them (not live in matching, theirs, they are not
 * proposed to recruiters, its recruiter passed them, or it does not meet their bar)
 */
export async function proposedJobPosting(
  candidateId: string,
  job: StoredJobPosting,
  now = new Date()
): Promise<JobPostingDto | null> {
  if (String(job.recruiter) === candidateId) return null;
  if (!(await isLiveInMatching(job))) return null;
  const [proposed, passed] = await Promise.all([
    isProposed(candidateId, now),
    Match.exists({ job: job._id, candidate: candidateId, 'recruiterDecision.value': 'pass' })
  ]);
  if (!proposed || passed) return null;
  const snapshot = toJobSnapshot(job);
  const bar = await candidateBar(candidateId);
  if (!passes(await scorePair(bar, snapshot), bar)) return null;
  return {
    ...snapshot,
    _id: String(job._id),
    status: job.status as JobPostingDto['status'],
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.publishedAt ? { publishedAt: job.publishedAt } : {})
  };
}

// ── The recruiter's feed ────────────────────────────────────

/** A candidate's anonymous card as a recruiter reads it for their job */
export interface RecruiterCandidateCard {
  /**
   * Stands for the candidate (matchTokens.ts): what a decision on the card sends back, bound to
   * this recruiter and this job, different at every read
   */
  token: string;
  card: CandidateCard;
  /**
   * How the job does on the candidate's criteria, as their journey's job match shows it
   * (showDetails), never the commute or the places, never a score or a deal-breaker (cardOutcomes)
   */
  outcomes: CardOutcome[];
  /** The candidate said they are interested in this job */
  interested: boolean;
}

/** GET /recruiter/jobs/:id/candidates */
export interface RecruiterFeedDto {
  /** MATCHING_LIMITS.recruiterCardsPerRead at most, in the feed's order */
  cards: RecruiterCandidateCard[];
  /** More candidates after these, once these are answered: never how many */
  more: boolean;
  /** Candidates are held back while their travel time is being computed: read again in a moment */
  pending: boolean;
}

/** Candidates evaluated at once, in the feed's order */
const EVALUATED_AT_ONCE = 8;

/** A candidate evaluated for a job: proposed for it, held back for a travel time, or not proposed */
type Evaluated = { kind: 'out' } | { kind: 'held' } | { kind: 'in'; bar: CandidateBar; scored: ScoredPair };

/**
 * GET /recruiter/jobs/:id/candidates: the candidates proposed for the job `jobId` of `recruiterId`
 * now, as anonymous cards, MATCHING_LIMITS.recruiterCardsPerRead at most: those interested in the
 * job first, then in the order of a keyed hash of the job and the candidate, never by score.
 * 429 over MATCHING_FEED_READS; 404 for a job that is not theirs; 409 JOB_NOT_PROPOSED for one not
 * proposed to candidates now (not open, out of matching, or not approved). The recruiter space
 * and the terms in force are the route's (requireRecruiterSpace).
 *
 * Leaves out the recruiter's own account, the candidates they answered for this job, those who
 * passed it, and those on whose page for recruiters they shared it. A candidate whose travel time
 * is not kept yet is held back while a warm-up can find it (`pending`); one whose commute is a
 * deal-breaker that cannot be told today is left out
 */
export async function recruiterFeed(recruiterId: string, jobId: string, now = new Date()): Promise<RecruiterFeedDto> {
  await countRead(recruiterId);
  const job = await JobPosting.findOne({ _id: jobId, recruiter: recruiterId }).lean<StoredJobPosting>();
  if (!job) throw new ResourceNotFoundError(JOB_NOT_FOUND);
  if (!(await isLiveInMatching(job))) throw new ConflictError(JOB_NOT_PROPOSED);
  const snapshot = toJobSnapshot(job);
  const jobKey = String(job._id);

  // Candidates whose consent is in force and who were active lately (the rest of what they must
  // have is checked one by one, by isProposed)
  const profiles = await DiscoveryProfile.find(
    {
      user: { $ne: recruiterId },
      enabledAt: { $gt: discoveryConsentCutoff(now) },
      $or: [
        { lastActiveAt: { $exists: false } },
        { lastActiveAt: { $gte: new Date(now.getTime() - DISCOVERY_INACTIVITY_DAYS * 24 * 60 * 60_000) } }
      ]
    },
    { user: 1, enabledAt: 1, lastActiveAt: 1 }
  ).lean<{ user: Types.ObjectId; enabledAt?: Date | null; lastActiveAt?: Date | null }[]>();
  const ids = profiles.map((profile) => profile.user);
  const [decisions, visits] = await Promise.all([
    Match.find(
      { job: job._id, candidate: { $in: ids } },
      { candidate: 1, candidateDecision: 1, recruiterDecision: 1 }
    ).lean<{ candidate: Types.ObjectId; candidateDecision?: { value?: string } | null; recruiterDecision?: unknown }[]>(),
    WorkflowInstance.find({ visitor: recruiterId, owner: { $in: ids } }, { owner: 1, steps: 1 }).lean<
      { owner: Types.ObjectId; steps?: unknown }[]
    >()
  ]);
  const answered = new Set<string>();
  const interested = new Set<string>();
  for (const decision of decisions) {
    const candidate = String(decision.candidate);
    if (decision.recruiterDecision || decision.candidateDecision?.value === 'pass') answered.add(candidate);
    else if (decision.candidateDecision?.value === 'interested') interested.add(candidate);
  }
  const visitOf = new Map(visits.map((visit) => [String(visit.owner), visit.steps]));

  // Those interested first, then a keyed hash of the job and the candidate: never the score
  const ordered = profiles
    .filter((profile) => !answered.has(String(profile.user)))
    .map((profile) => {
      const candidate = String(profile.user);
      return { profile, candidate, first: interested.has(candidate), rank: hashValue(`${jobKey}:${candidate}`) };
    })
    .sort((a, b) => Number(b.first) - Number(a.first) || (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));

  const canWarm = warmUpsFor(recruiterId);
  const evaluate = async ({ profile, candidate }: (typeof ordered)[number]): Promise<Evaluated> => {
    if (!(await isProposed(candidate, now, profile))) return { kind: 'out' };
    const bar = await candidateBar(candidate);
    if (pickedOn(bar.jobSteps, [visitOf.get(candidate)]).has(jobKey)) return { kind: 'out' };
    const scored = await scorePair(bar, snapshot);
    if (commuteUnknown(scored)) {
      // Not met even if the commute matches: nothing to wait for
      if (!passes(atBest(bar, snapshot), bar)) return { kind: 'out' };
      if (findable(scored.reading) && (await canWarm())) {
        // Held back until its travel time is known: the score would not be the one it gets
        void matchFeedWarmUps.commute({ candidateId: candidate, location: snapshot.location }, recruiterId);
        return { kind: 'held' };
      }
      // Not known today: a deal-breaker cannot be told, another is left out of the score
      if (bar.perfectJob.commute?.dealBreaker === true) return { kind: 'out' };
    }
    if (!passes(scored, bar)) return { kind: 'out' };
    return { kind: 'in', bar, scored };
  };

  const shown: { candidate: string; bar: CandidateBar; scored: ScoredPair }[] = [];
  const limit = MATCHING_LIMITS.recruiterCardsPerRead;
  let more = false;
  let pending = false;
  for (let start = 0; start < ordered.length && !more; start += EVALUATED_AT_ONCE) {
    const batch = ordered.slice(start, start + EVALUATED_AT_ONCE);
    const results = await Promise.all(batch.map(evaluate));
    for (const [index, result] of results.entries()) {
      if (result.kind === 'held') pending = true;
      if (result.kind !== 'in') continue;
      if (shown.length === limit) {
        more = true;
        break;
      }
      shown.push({ candidate: batch[index].candidate, bar: result.bar, scored: result.scored });
    }
  }

  const cards = await Promise.all(
    shown.map(
      async ({ candidate, bar, scored }): Promise<RecruiterCandidateCard> => ({
        token: sealMatchToken(candidate, { recruiterId, jobId: jobKey }, now),
        card: await anonymousCard(candidate, now),
        outcomes: cardOutcomes(jobMatchCriteria(scored.score.criteria), bar.showDetails),
        interested: interested.has(candidate)
      })
    )
  );
  return { cards, more, pending };
}
