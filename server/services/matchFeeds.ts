import { Types } from 'mongoose';
import {
  DISCOVERY_INACTIVITY_DAYS,
  JOB_MATCH_STEP_LIMITS,
  MATCHING_LIMITS,
  discoveryConsentCutoff,
  scorePerfectJob,
  storedPerfectJob
} from 'portfolio-common';
import type { JobSnapshot, PerfectJob as PerfectJobCriteria, PerfectJobScore, WorkflowStep } from 'portfolio-common';
import { DiscoveryProfile, JobPosting, Match, PerfectJob, Workflow, WorkflowInstance } from '../models/database';
import type { JobPosting as StoredJobPosting } from '../models/database/jobPosting';
import { FEED_CURSOR_PATTERN } from '../models/elysia/matchRequest.models';
import { ConflictError, ForbiddenError, ResourceNotFoundError, TooManyRequestsError } from '../errors';
import { JOB_NOT_PROPOSED, NOT_PROPOSED_TO_RECRUITERS } from '../protocol';
import { anonymousCard, cardOutcomes } from './candidateCard';
import type { CandidateCard, CardOutcome } from './candidateCard';
import { cachedCommuteContext, commuteAvailability, commuteWarmUpPossible, warmCommute } from './commute';
import type { CommutePair, CommuteReading } from './commute';
import { isProposed, touchDiscovery } from './discovery';
import { isLiveInMatching, liveJobsQuery, versionReadsBack } from './jobMatching';
import { reviewedVersion } from './jobVersion';
import { JOB_NOT_FOUND, toJobSnapshot } from './jobPostings';
import type { JobPostingDto } from './jobPostings';
import { logger } from './logger';
import { sealMatchToken } from './matchTokens';
import { perfectJobOf } from './perfectJobs';
import { hashValue, rateLimitKey, takeRateLimit } from './rateLimit';
import type { RateLimit } from './rateLimit';
import type { TransitProvider } from './transit';
import { ownerJourney, storedJourney } from './workflows';
import { jobMatchCriteria, jobMatchMinScore } from './workflowSteps/jobMatch';
import type { JobMatchCriterionView } from './workflowSteps/jobMatch';
import { matchOfShare, pickedJobId } from './workflowSteps/job';
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
// the other side passed before the reader first answered (a candidate who
// passed the job, a recruiter who passed the candidate for it: once the reader
// answered, the other side's pass changes nothing they read, which would tell
// them of it, not even once they undo their answer or the job is put into
// matching again: when each side first answered is kept, hiddenFrom). The
// candidate is not proposed a job its recruiter already shared on their page
// for recruiters (they are in touch through it); the recruiter is proposed
// that candidate all the same, so that their own pick never tells them which
// card is the portfolio they visited. An interest of the other side's leaves a
// pair proposed, and each feed says so (`interested`): a recruiter reads the
// candidates interested in their job first.
//
// Deterministic only: no model, no learning, no ranking by score. A
// candidate's jobs come the most recently published first, with that date; a
// recruiter's cards come those interested in the job first, then in an order
// drawn from a keyed hash of the job and the candidate (hashValue): the same
// at every read, different for every job, and saying nothing of the score, of
// when anyone signed up, or of anything else about them. A recruiter reads one
// card at a time (MATCHING_LIMITS.recruiterCardsPerRead), the next once it is
// answered, and whether there are more, never how many: a page that is not
// full would be a count, and counts compared across jobs that differ by their
// pay (their terms are locked, a duplicate is another job) would tell
// candidates' floors. Each card stands for its candidate by a token bound to
// the recruiter and the job (matchTokens.ts), never an id.
//
// Travel times are read from the cache only (cachedCommuteContext): a feed is
// a GET, which Bun cuts after 30 s without data, and many pairs at once. A
// pair whose travel time the read cannot tell stands by one rule on both sides
// (standing): unless the job cannot meet the candidate even with the commute
// matching (nothing is asked then), what a warm-up can find is asked in the
// background (warmCommute), within the reader's daily allowance and matching's
// share of the site's day (the candidate's feed says `pending`: read again in a
// moment; a recruiter's says nothing of it, which would tell of a candidate
// never shown); meanwhile the candidate reads that job's commute as unknown
// (and a job that meets their bar only once it is known waits for it), and a
// recruiter's feed holds the candidate back. When the travel time cannot be found today, or ever for
// matching (public transport from Transitous, which matching never asks), a
// commute that is a deal-breaker keeps the pair apart on both sides; another is
// left out of the score, as the job match step leaves out a travel time it does
// not have.

// ── Reads ───────────────────────────────────────────────────

/** Reads of the feeds per account per hour, both together: what a person reads, not a script */
export const MATCHING_FEED_READS: RateLimit = { limit: 120, windowMs: 60 * 60_000 };

/** The counter of `userId`'s feed reads (keyed by a hash of it: rateLimitKey) */
export const matchingFeedKey = (userId: string) => rateLimitKey('matching-feed', userId);

/**
 * Counts one read of a feed by `userId`, or of the private page of a job that may be proposed to
 * them (services/jobAccess.ts, which does a feed's work for one job); 429 over MATCHING_FEED_READS.
 * Never given back
 */
export const countFeedRead = async (userId: string) => {
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
export interface CandidateBar {
  perfectJob: PerfectJobCriteria;
  /** The minimum of their journey's job match (the highest without one: fails closed) */
  minScore: number;
  /** Their journey's job match shows details: a recruiter reads the outcomes (cardOutcomes) */
  showDetails: boolean;
  /** The ids of their journey's job steps, where a recruiter's pick is kept (their own feed reads them) */
  jobSteps: string[];
}

/** The bar of a candidate whose criteria are `perfectJob` and whose journey has `steps` */
const barOf = (perfectJob: PerfectJobCriteria, steps: readonly WorkflowStep[]): CandidateBar => {
  const jobMatch = steps.find((step) => step.type === 'job-match');
  return {
    perfectJob,
    minScore: jobMatch ? jobMatchMinScore(jobMatch.config) : JOB_MATCH_STEP_LIMITS.minScore.max,
    showDetails: (jobMatch?.config as { showDetails?: unknown } | undefined)?.showDetails === true,
    jobSteps: steps.filter((step) => step.type === 'job').map((step) => step.id)
  };
};

const candidateBar = async (candidateId: string): Promise<CandidateBar> => {
  const [perfectJob, journey] = await Promise.all([perfectJobOf(candidateId), ownerJourney(candidateId)]);
  return barOf(perfectJob, journey.steps);
};

/**
 * The bars of the candidates `ids`, read at once (two queries, whatever their number), as
 * candidateBar reads one: what the recruiter's feed holds every candidate to, in memory, before it
 * reads anything more of the few the job can meet
 */
const candidateBars = async (ids: readonly Types.ObjectId[]): Promise<Map<string, CandidateBar>> => {
  const [perfectJobs, journeys] = await Promise.all([
    PerfectJob.find({ user: { $in: ids } }, { user: 1, criteria: 1 }).lean<{ user: Types.ObjectId; criteria?: unknown }[]>(),
    Workflow.find({ user: { $in: ids } }, { user: 1, steps: 1 }).lean<{ user: Types.ObjectId; steps?: unknown }[]>()
  ]);
  const criteriaOf = new Map(perfectJobs.map((stored) => [String(stored.user), stored.criteria]));
  const journeyOf = new Map(journeys.map((stored) => [String(stored.user), stored]));
  return new Map(
    ids.map((id) => {
      const key = String(id);
      return [key, barOf(storedPerfectJob(criteriaOf.get(key)), storedJourney(journeyOf.get(key)).steps)];
    })
  );
};

/** A job scored against a candidate's bar, with what the read knew of the commute */
export interface ScoredPair {
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
 * The job scored as if its commute matched: the most it can score whatever its travel time (a
 * criterion matched adds to the score at least as much as one left out, and misses no
 * deal-breaker). A job that does not meet the candidate's bar even then never will: computed in
 * memory, before anything is read of the pair
 */
const atBest = (bar: CandidateBar, snapshot: JobSnapshot): Pick<ScoredPair, 'score'> => ({
  score: scorePerfectJob(bar.perfectJob, snapshot, { commute: { minutes: 0 } })
});

/** The job cannot meet the candidate's bar, whatever its travel time */
const beyondReach = (bar: CandidateBar, snapshot: JobSnapshot) => !passes(atBest(bar, snapshot), bar);

/**
 * How a job and a candidate stand, by the one rule of both feeds (and of the decisions on them),
 * once read: `in`, the job meets the candidate's bar; `out`, it does not; `warming`, the read could
 * not tell the commute, a warm-up can find it today (`canWarm`: the reader's allowances), and the
 * job may meet the bar once it is known (the caller asks it). When the commute cannot be told today,
 * or ever for matching, a commute that is a deal-breaker keeps the pair apart (it may be missed),
 * another is left out of the score (as the job match step leaves out a travel time it does not have)
 */
const standing = async (
  bar: CandidateBar,
  snapshot: JobSnapshot,
  scored: ScoredPair,
  canWarm: () => Promise<boolean>
): Promise<'in' | 'out' | 'warming'> => {
  if (commuteUnknown(scored)) {
    if (beyondReach(bar, snapshot)) return 'out';
    if (findable(scored.reading) && (await canWarm())) return 'warming';
    if (bar.perfectJob.commute?.dealBreaker === true) return 'out';
  }
  return passes(scored, bar) ? 'in' : 'out';
};

/** What each side decided of a job and a candidate (their Match), when either did, and when each first answered */
interface PairDecisions {
  candidateDecision?: { value?: string | null; at?: Date | null } | null;
  recruiterDecision?: { value?: string | null; at?: Date | null } | null;
  candidateFirstAt?: Date | null;
  recruiterFirstAt?: Date | null;
}

/** What the feeds read of a Match */
const DECISIONS = { candidateDecision: 1, recruiterDecision: 1, candidateFirstAt: 1, recruiterFirstAt: 1 } as const;

const decisionsOn = (jobId: Types.ObjectId, candidateId: string) =>
  Match.findOne({ job: jobId, candidate: candidateId }, DECISIONS).lean<PairDecisions>();

/**
 * Whether the pair is kept from `reader` because the other side passed it before `reader` first
 * answered it (or `reader` never did), while `reader` has no answer now: the one place the other
 * side's pass shows. A pass made after the reader first answered changes nothing they read, their
 * answer undone or dropped since included (when each side first answered is kept: an undo, or the
 * job put into matching again, never shows it). A match recorded before first answers were kept
 * counts the reader's current answer as their first
 */
const hiddenFrom = (decisions: PairDecisions | null | undefined, reader: 'candidate' | 'recruiter'): boolean => {
  if (!decisions) return false;
  const own = reader === 'candidate' ? decisions.candidateDecision : decisions.recruiterDecision;
  const other = reader === 'candidate' ? decisions.recruiterDecision : decisions.candidateDecision;
  if (own || other?.value !== 'pass') return false;
  const first = reader === 'candidate' ? decisions.candidateFirstAt : decisions.recruiterFirstAt;
  return !first || !other.at || other.at.getTime() < first.getTime();
};

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
      const data = byStep.get(stepId)?.data;
      // What a mutual interest stored there is not a pick (it goes once the mutual interest ends)
      const jobId = matchOfShare(data) ? undefined : pickedJobId(data);
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

/** How a job does against a candidate's own criteria, as they read it (their feed, the job's private page) */
export interface OpportunityScore {
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

/** The job scored against the candidate's bar, as they read it */
const opportunityScore = (scored: ScoredPair, bar: CandidateBar): OpportunityScore => {
  const criteria = jobMatchCriteria(scored.score.criteria);
  const timed = criteria.some(({ criterion, outcome }) => criterion === 'commute' && outcome !== 'unknown');
  const transit = timed ? commuteAvailability('matching').transit : undefined;
  return { score: scored.score.score, minScore: bar.minScore, criteria, ...(transit ? { transit } : {}) };
};

/** A job of a candidate's feed */
export interface OpportunityCard extends OpportunityScore {
  job: OpportunityJobDto;
  /**
   * The job's recruiter said they are interested in the candidate (each feed's `interested` is the
   * other side's): the candidate's interest makes a mutual interest
   */
  interested: boolean;
}

/** GET /opportunities */
export interface CandidateFeedDto {
  /** The most recently published first, MATCHING_LIMITS.candidateFeedPage at most */
  jobs: OpportunityCard[];
  /** More jobs after these: read them with `next` */
  more: boolean;
  /** What to send as `after` for the next page; null without more */
  next: string | null;
  /**
   * Travel times are being computed: read again in a moment, for the commute of jobs shown, or for
   * jobs that meet the candidate's bar only once it is known
   */
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
 * interest or a pass), the jobs whose recruiter passed them before they first answered (hiddenFrom),
 * their own jobs, and the jobs a
 * recruiter shared on their page for recruiters. Each job comes with its score, the minimum, how
 * it does on each of their criteria, and whether its recruiter is interested in them; a travel
 * time not kept yet is asked in the background (`pending`), for a job shown and for one that meets
 * their bar only once it is known (standing). Reading it is activity (touchDiscovery)
 */
export async function candidateFeed(userId: string, after?: string, now = new Date()): Promise<CandidateFeedDto> {
  await countFeedRead(userId);
  if (!(await isProposed(userId, now))) throw new ForbiddenError(NOT_PROPOSED_TO_RECRUITERS);
  await touchDiscovery(userId, now);

  const [bar, decisions, visits] = await Promise.all([
    candidateBar(userId),
    // Jobs they answered, or whose recruiter answered them: nothing to propose again once they or
    // its recruiter passed, a recruiter's interest to say
    Match.find(
      { candidate: userId, $or: [{ candidateDecision: { $exists: true } }, { recruiterDecision: { $exists: true } }] },
      { job: 1, ...DECISIONS }
    ).lean<(PairDecisions & { job: Types.ObjectId })[]>(),
    WorkflowInstance.find({ owner: userId }, { steps: 1 }).lean<{ steps?: unknown }[]>()
  ]);
  const left = new Set<string>();
  const wanted = new Set<string>();
  for (const decision of decisions) {
    const jobId = String(decision.job);
    if (decision.candidateDecision || hiddenFrom(decision, 'candidate')) left.add(jobId);
    else if (decision.recruiterDecision?.value === 'interested') wanted.add(jobId);
  }
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

  const canWarm = warmUpsFor(userId);
  const page = MATCHING_LIMITS.candidateFeedPage;
  const shown: { job: StoredJobPosting; card: OpportunityCard }[] = [];
  /** The offices whose travel time a warm-up can find: of jobs shown, and of jobs waiting for it */
  const toWarm: JobSnapshot['location'][] = [];
  let more = false;
  try {
    for await (const job of jobs) {
      const jobId = String(job._id);
      if (left.has(jobId)) continue;
      const snapshot = toJobSnapshot(job);
      // A version that no longer reads back is proposed to nobody (isLiveInMatching)
      if (!versionReadsBack(job)) continue;
      // Not met even with the commute matching: nothing to read of the pair, nothing to ask
      if (beyondReach(bar, snapshot)) continue;
      const scored = await scorePair(bar, snapshot);
      const stands = await standing(bar, snapshot, scored, canWarm);
      if (stands === 'out') continue;
      const shows = passes(scored, bar);
      if (shows && shown.length === page) {
        more = true;
        break;
      }
      // Its travel time asked in the background: a job that meets the bar only once it is known
      // waits for it, unseen
      if (stands === 'warming') toWarm.push(snapshot.location);
      if (!shows) continue;
      shown.push({
        job,
        card: { job: opportunityJob(job, snapshot), ...opportunityScore(scored, bar), interested: wanted.has(jobId) }
      });
    }
  } finally {
    await jobs.close();
  }

  for (const location of toWarm) void matchFeedWarmUps.commute({ candidateId: userId, location }, userId);

  const last = shown.at(-1)?.job;
  return {
    jobs: shown.map(({ card }) => card),
    more,
    next: more && last ? cursorOf(last) : null,
    pending: toWarm.length > 0
  };
}

/**
 * A job and a candidate proposed to each other now, with what it took to tell: the candidate's
 * bar, the job scored against it (its travel time from the cache), and the version scored. What a
 * decision of either side records, and a mutual interest keeps (services/matches.ts)
 */
export interface ProposedPair {
  bar: CandidateBar;
  scored: ScoredPair;
  /** The version scored (toJobSnapshot of the posting read) */
  snapshot: JobSnapshot;
}

/**
 * The job `job`, live in matching, and the candidate `candidateId` as the candidate's feed sees
 * them, their own answer aside: never their own job, nor one whose recruiter passed them before
 * they first answered it (after, the recruiter's pass changes nothing they read, their answer
 * undone since included: it would tell them of it, hiddenFrom), and it meets their bar (standing: the commute left out of the score while not known, a
 * deal-breaker one that cannot be told today keeping them apart). Null otherwise, with what each
 * side decided of it. Whether the candidate is proposed to recruiters is the caller's
 * (isProposed); `exceptPicked` also leaves out a job its recruiter shared on the candidate's page
 * for recruiters, as their feed does
 */
const candidatePair = async (
  candidateId: string,
  job: StoredJobPosting,
  { exceptPicked }: { exceptPicked: boolean }
): Promise<{ pair: ProposedPair; decisions: PairDecisions | null } | null> => {
  if (String(job.recruiter) === candidateId) return null;
  if (!(await isLiveInMatching(job))) return null;
  const [decisions, bar, visit] = await Promise.all([
    decisionsOn(job._id, candidateId),
    candidateBar(candidateId),
    exceptPicked
      ? WorkflowInstance.findOne({ owner: candidateId, visitor: job.recruiter }, { steps: 1 }).lean<{ steps?: unknown }>()
      : null
  ]);
  if (hiddenFrom(decisions, 'candidate')) return null;
  if (visit && pickedOn(bar.jobSteps, [visit.steps]).has(String(job._id))) return null;
  const snapshot = toJobSnapshot(job);
  if (beyondReach(bar, snapshot)) return null;
  const scored = await scorePair(bar, snapshot);
  const stands = await standing(bar, snapshot, scored, warmUpsFor(candidateId));
  if (stands === 'out' || !passes(scored, bar)) return null;
  return { pair: { bar, scored, snapshot }, decisions };
};

/**
 * Whether the job `job` is proposed to the candidate `candidateId` now, for a decision of theirs
 * on it (services/matches.ts), whatever they answered of it already: live in matching, not theirs,
 * its recruiter not having passed them before they answered, not shared on their page for
 * recruiters (they are in touch through it), and meeting their bar. Whether they are proposed to
 * recruiters is the caller's
 */
export const jobProposedTo = async (candidateId: string, job: StoredJobPosting): Promise<ProposedPair | null> =>
  (await candidatePair(candidateId, job, { exceptPicked: true }))?.pair ?? null;

/** A job proposed to a candidate, as its private page shows it to them (services/jobAccess.ts) */
export interface ProposedJobPosting {
  /** The version their feed scores, with the posting's id, status and dates */
  job: JobPostingDto;
  /** How it does against their criteria, as their feed says it */
  jobMatch: OpportunityScore;
  /** Its recruiter said they are interested in them */
  interested: boolean;
}

/**
 * The posting `job` as a candidate reads it when it is proposed to them now (the private page,
 * services/jobAccess.ts: `access: 'feed'`), whatever they answered of it: the version their feed
 * scores, with its score and whether its recruiter is interested in them; null when it is not
 * proposed to them (not live in matching, theirs, they are not proposed to recruiters, its
 * recruiter passed them before they answered, or it does not meet their bar)
 */
export async function proposedJobPosting(
  candidateId: string,
  job: StoredJobPosting,
  now = new Date()
): Promise<ProposedJobPosting | null> {
  if (!(await isProposed(candidateId, now))) return null;
  const proposed = await candidatePair(candidateId, job, { exceptPicked: false });
  if (!proposed) return null;
  const { pair, decisions } = proposed;
  return {
    job: {
      ...pair.snapshot,
      _id: String(job._id),
      status: job.status as JobPostingDto['status'],
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      ...(job.publishedAt ? { publishedAt: job.publishedAt } : {})
    },
    jobMatch: opportunityScore(pair.scored, pair.bar),
    interested: decisions?.recruiterDecision?.value === 'interested'
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

/**
 * GET /recruiter/jobs/:id/candidates. Never whether candidates are held back for a travel time
 * being computed: that would tell of candidates never shown (one who meets the job on everything
 * but the way to its office); the screen reads the feed again once the card shown is answered, or
 * a while later
 */
export interface RecruiterFeedDto {
  /** MATCHING_LIMITS.recruiterCardsPerRead at most (one), in the feed's order */
  cards: RecruiterCandidateCard[];
  /** More candidates after these, once these are answered: never how many */
  more: boolean;
}

/** How the recruiter's feed reads its candidates: how many it evaluates at once, in its order. Tests change it */
export const recruiterFeedTuning = { evaluatedAtOnce: 8 };

/** A candidate evaluated for a job: proposed for it, held back for a travel time, or not proposed */
type Evaluated = { kind: 'out' } | { kind: 'held' } | { kind: 'in'; bar: CandidateBar; scored: ScoredPair };

/** A recruiter's job, as its candidates are evaluated for it */
interface JobUnderEvaluation {
  recruiterId: string;
  /** The version candidates are scored against */
  snapshot: JobSnapshot;
  /** Whether the recruiter's warm-ups can still ask anything today (warmUpsFor) */
  canWarm: () => Promise<boolean>;
}

/**
 * Whether the candidate `candidate`, whose bar is `bar`, is proposed for `job` now (the decisions
 * of either side on the pair aside, which the caller reads): within reach of their bar (in memory:
 * most candidates of a job end there, before anything is read of them), proposed to recruiters
 * (isProposed, with their `profile` when read already), and meeting their bar (standing). One whose
 * travel time a warm-up can find is held back (it is asked in the background, on the recruiter's
 * allowance); not findable today, a deal-breaker commute keeps them out, another is left out of the
 * score. Whether the recruiter shared the job on their page for recruiters does not matter here: it
 * would tell the recruiter which card is the portfolio they visited
 */
const evaluateCandidate = async (
  { recruiterId, snapshot, canWarm }: JobUnderEvaluation,
  candidate: string,
  { now, bar, profile }: { now: Date; bar: CandidateBar; profile?: Parameters<typeof isProposed>[2] }
): Promise<Evaluated> => {
  if (beyondReach(bar, snapshot)) return { kind: 'out' };
  if (!(await isProposed(candidate, now, profile))) return { kind: 'out' };
  const scored = await scorePair(bar, snapshot);
  const stands = await standing(bar, snapshot, scored, canWarm);
  if (stands === 'warming') {
    // Held back until its travel time is known: the score would not be the one it gets
    void matchFeedWarmUps.commute({ candidateId: candidate, location: snapshot.location }, recruiterId);
    return { kind: 'held' };
  }
  return stands === 'in' ? { kind: 'in', bar, scored } : { kind: 'out' };
};

/**
 * Whether the candidate `candidateId` is proposed for the job `job` of `recruiterId` now, for a
 * decision of the recruiter's on them (services/matches.ts), whatever the recruiter answered
 * already: as the recruiter's feed proposes them (evaluateCandidate), and not having passed the job
 * before the recruiter first answered them (after, the candidate's pass changes nothing the
 * recruiter reads, their answer undone since included: it would tell them of it, hiddenFrom). Held
 * back for a travel time, they are not proposed yet. Whether the job is live is the caller's
 */
export async function candidateProposedFor(
  recruiterId: string,
  job: StoredJobPosting,
  candidateId: string,
  now = new Date()
): Promise<ProposedPair | null> {
  if (candidateId === recruiterId || !Types.ObjectId.isValid(candidateId)) return null;
  const [decisions, bar] = await Promise.all([decisionsOn(job._id, candidateId), candidateBar(candidateId)]);
  if (hiddenFrom(decisions, 'recruiter')) return null;
  const snapshot = toJobSnapshot(job);
  const evaluation = { recruiterId, snapshot, canWarm: warmUpsFor(recruiterId) };
  const result = await evaluateCandidate(evaluation, candidateId, { now, bar });
  return result.kind === 'in' ? { bar: result.bar, scored: result.scored, snapshot } : null;
}

/**
 * GET /recruiter/jobs/:id/candidates: the candidates proposed for the job `jobId` of `recruiterId`
 * now, as anonymous cards, MATCHING_LIMITS.recruiterCardsPerRead at most: those interested in the
 * job first, then in the order of a keyed hash of the job and the candidate, never by score.
 * 429 over MATCHING_FEED_READS; 404 for a job that is not theirs; 409 JOB_NOT_PROPOSED for one not
 * proposed to candidates now (not open, out of matching, or not approved). The recruiter space
 * and the terms in force are the route's (requireRecruiterSpace).
 *
 * Leaves out the recruiter's own account, the candidates they answered for this job, and those who
 * passed it before the recruiter first answered them (hiddenFrom). Every candidate's bar is read at
 * once and held against the job in memory first; only those within its reach are read further
 * (isProposed, the travel time kept), `recruiterFeedTuning.evaluatedAtOnce` at a time, until the
 * cards are found. A candidate whose travel time is not kept yet is held back while a warm-up can
 * find it (asked in the background, never said); one whose commute is a deal-breaker that cannot be
 * told today is left out
 */
export async function recruiterFeed(recruiterId: string, jobId: string, now = new Date()): Promise<RecruiterFeedDto> {
  await countFeedRead(recruiterId);
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
  const decisions = await Match.find({ job: job._id, candidate: { $in: ids } }, { candidate: 1, ...DECISIONS }).lean<
    (PairDecisions & { candidate: Types.ObjectId; candidateDecision?: { value?: string; at?: Date; version?: string } | null })[]
  >();
  const answered = new Set<string>();
  const interested = new Set<string>();
  // An interest holds for the version of the job it was given on: given on another (the job edited
  // since), the recruiter's interest asks the candidate again (services/matches.ts)
  const version = reviewedVersion(job);
  for (const decision of decisions) {
    const candidate = String(decision.candidate);
    if (decision.recruiterDecision || hiddenFrom(decision, 'recruiter')) answered.add(candidate);
    else if (decision.candidateDecision?.value === 'interested' && decision.candidateDecision.version === version) {
      interested.add(candidate);
    }
  }
  // Those interested first, then a keyed hash of the job and the candidate: never the score
  const ordered = profiles
    .filter((profile) => !answered.has(String(profile.user)))
    .map((profile) => {
      const candidate = String(profile.user);
      return { profile, candidate, first: interested.has(candidate), rank: hashValue(`${jobKey}:${candidate}`) };
    })
    .sort((a, b) => Number(b.first) - Number(a.first) || (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));

  // Every candidate's bar at once: most are out of the job's reach, which tells in memory
  const bars = await candidateBars(ordered.map(({ profile }) => profile.user));
  const evaluation: JobUnderEvaluation = { recruiterId, snapshot, canWarm: warmUpsFor(recruiterId) };
  const evaluate = async ({ profile, candidate }: (typeof ordered)[number]): Promise<Evaluated> => {
    const bar = bars.get(candidate);
    if (!bar) return { kind: 'out' };
    try {
      return await evaluateCandidate(evaluation, candidate, { now, bar, profile });
    } catch (error) {
      // What one candidate's stored data breaks never fails the feed: that candidate is out (fails
      // closed), and nothing of them is logged
      logger.error('Matching: a candidate could not be evaluated for a feed', {
        reason: error instanceof Error ? error.name : 'unknown'
      });
      return { kind: 'out' };
    }
  };

  const shown: { candidate: string; bar: CandidateBar; scored: ScoredPair }[] = [];
  const limit = MATCHING_LIMITS.recruiterCardsPerRead;
  const atOnce = Math.max(1, recruiterFeedTuning.evaluatedAtOnce);
  let more = false;
  for (let start = 0; start < ordered.length && !more; start += atOnce) {
    const batch = ordered.slice(start, start + atOnce);
    const results = await Promise.all(batch.map(evaluate));
    for (const [index, result] of results.entries()) {
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
  return { cards, more };
}
