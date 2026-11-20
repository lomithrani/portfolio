import { Types } from 'mongoose';
import { MATCHING_LIMITS, endedMatchExpiry, jobSnapshotsDiffer, matchDecisionExpiry } from 'portfolio-common';
import type { JobSnapshot, JobStatus, MatchDecision, MatchEndReason, MatchSide } from 'portfolio-common';
import { Domain, JobPosting, Match } from '../models/database';
import type { JobPosting as StoredJobPosting } from '../models/database/jobPosting';
import { ConflictError, ForbiddenError, ResourceNotFoundError, TooManyRequestsError } from '../errors';
import {
  CANDIDATE_UNAVAILABLE,
  DECISION_NOT_FOUND,
  JOB_NOT_PROPOSED,
  MATCH_NOT_FOUND,
  MUTUAL_INTEREST_EXISTS,
  NOT_PROPOSED_TO_RECRUITERS
} from '../protocol';
import { commuteAvailability } from './commute';
import { isProposed, touchDiscovery } from './discovery';
import { isLiveInMatching } from './jobMatching';
import { JOB_NOT_FOUND, storedJobSnapshot } from './jobPostings';
import { versionNow } from './jobVersion';
import { logger } from './logger';
import { isDuplicateKeyError } from './mongoErrors';
import { candidateProposedFor, jobProposedTo } from './matchFeeds';
import type { ProposedPair } from './matchFeeds';
import { openMatchToken } from './matchTokens';
import { readMutualInterest } from './mutualInterests';
import type { MutualInterest, StoredMutualInterest } from './mutualInterests';
import { rateLimitKey, takeRateLimit } from './rateLimit';
import type { RateLimit } from './rateLimit';
import { requireRecruiterSpace } from './recruiters';
import type { TransitProvider } from './transit';
import { dropVisitorProgress, ownerJourney, seedVisitorProgress } from './workflows';
import { mutualInterestShare } from './workflowSteps/job';
import { freezeJobMatch, jobMatchCriteria } from './workflowSteps/jobMatch';
import type { JobMatchCriterionView } from './workflowSteps/jobMatch';
import { m } from './matches.messages';

// The decisions of matching (Path 2, behind MATCHING), the mutual interest
// they make, and where it leads: a candidate says whether a job proposed to
// them interests them (PUT /opportunities/jobs/:id/decision), a recruiter
// whether a candidate's anonymous card does, for their job (PUT
// /recruiter/jobs/:id/candidates/decision, the card's token standing for the
// candidate); either can undo theirs (DELETE) until both are interested.
//
// A decision is taken on a pair proposed now, by the one rule the feeds
// follow (services/matchFeeds.ts: the job live in matching, the candidate
// proposed to recruiters, the job meeting their bar, neither side having
// passed the other), the reader's own earlier answer aside; it is recorded
// with one atomic upsert on the Match (unique per job and candidate), then a
// mutual interest is made by one write conditioned on both interests and on
// none made yet (`matchedAt`), so two interests at once make exactly one, in
// either order, and a pass or an undo landing between them makes none.
//
// A mutual interest keeps what the candidate said yes to (`snapshot`: the
// version of the posting, their score of it, their minimum, each criterion's
// outcome, as the feeds read them: travel times from the cache only), reveals
// the candidate's portfolio to the recruiter (`revealedAt`: revealAllowed, the
// one hook should terms of introduction ever come first), and leads into the
// candidate's own hiring journey: its job step holds the job, its job match is
// frozen at that score, its notes are still the recruiter's to confirm, and
// the meeting opens after them (handOffToJourney; the steps read the mutual
// interest itself, services/mutualInterests.ts, so a journey edited since
// keeps it). Either side ends it (POST /matches/:id/end); its job leaving
// matching for good ends it too (services/jobMatching.ts).
//
// Deterministic: no model is asked anything. Private: a match is returned to
// its two sides only, each reading what is theirs (never the candidate's name
// or the recruiter's identity; the recruiter reads the candidate's portfolio
// address once revealed), and never logged.

// ── Decisions ───────────────────────────────────────────────

/** Decisions an account takes or undoes per UTC day, as a candidate and as a recruiter together */
export const MATCHING_DECISIONS: RateLimit = { limit: MATCHING_LIMITS.decisionsPerDay, windowMs: 24 * 60 * 60_000 };

/** The counter of `userId`'s decisions (keyed by a hash of it: rateLimitKey) */
export const matchingDecisionsKey = (userId: string) => rateLimitKey('matching-decision', userId);

/** Counts one decision (or undo) of `userId`; 429 over MATCHING_DECISIONS. Never given back */
const countDecision = async (userId: string) => {
  const { retryAfterSeconds } = await takeRateLimit(matchingDecisionsKey(userId), MATCHING_DECISIONS);
  if (retryAfterSeconds !== null) {
    throw new TooManyRequestsError(() => m.tooManyDecisions(MATCHING_DECISIONS.limit), retryAfterSeconds);
  }
};

/**
 * Whether a mutual interest may reveal the candidate's portfolio to the recruiter now. Always
 * today: the one place where terms of introduction (a fee the recruiter agrees to, say) would
 * come first, should they ever exist. A mutual interest not revealed leads nowhere yet (no
 * portfolio, no journey)
 */
export const revealAllowed = (_match: { job: Types.ObjectId; recruiter: Types.ObjectId; candidate: Types.ObjectId }): boolean =>
  true;

const DECISION_FIELD = { candidate: 'candidateDecision', recruiter: 'recruiterDecision' } as const satisfies Record<MatchSide, string>;
const SEEN_FIELD = { candidate: 'candidateSeenAt', recruiter: 'recruiterSeenAt' } as const satisfies Record<MatchSide, string>;

interface StoredMatch extends StoredMutualInterest {
  candidateDecision?: { value?: string | null; at?: Date | null } | null;
  recruiterDecision?: { value?: string | null; at?: Date | null } | null;
  revealedAt?: Date | null;
  candidateSeenAt?: Date | null;
  recruiterSeenAt?: Date | null;
}

const MATCHED = { matchedAt: { $exists: true } } as const;

/** 409 when the job `jobId` and the candidate `candidateId` are both interested already, or were */
const requireNoMutualInterest = async (jobId: Types.ObjectId, candidateId: string) => {
  if (await Match.exists({ job: jobId, candidate: candidateId, ...MATCHED })) throw new ConflictError(MUTUAL_INTEREST_EXISTS);
};

/**
 * Records the decision `value` of `side` on the job `job` and the candidate `candidateId`: one
 * upsert on their Match (none yet: created), never on a mutual interest (its filter leaves one out,
 * and the unique index refuses a second Match: 409). Kept MATCH_RETENTION.decisionMonths after the
 * earliest decision at most. A Match inserted by the other side at the same moment is retried once
 */
const recordDecision = async (
  side: MatchSide,
  job: StoredJobPosting,
  candidateId: string,
  value: MatchDecision,
  now: Date
): Promise<StoredMatch> => {
  const filter = { job: job._id, candidate: candidateId, matchedAt: { $exists: false } };
  const update = {
    $set: { [DECISION_FIELD[side]]: { value, at: now }, recruiter: job.recruiter },
    $min: { expiresAt: matchDecisionExpiry(now) }
  };
  for (let attempt = 0; ; attempt++) {
    try {
      const match = await Match.findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after' }).lean<StoredMatch>();
      if (match) return match;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      // A mutual interest (which the filter leaves out), or the other side's first decision
      // inserted at the same moment: read again
      await requireNoMutualInterest(job._id, candidateId);
      if (attempt > 0) throw error;
    }
  }
};

const bothInterested = (match: StoredMatch) =>
  match.candidateDecision?.value === 'interested' && match.recruiterDecision?.value === 'interested';

/**
 * What a mutual interest keeps of what the candidate said yes to: the version of the posting
 * (as a job step keeps a share), its date, their score of it, their minimum, and each criterion's
 * outcome, as the decision read them (travel times from the cache: a decision asks no outside
 * service), with the public transport service to credit when a travel time is among them
 */
const mutualInterestSnapshot = (job: StoredJobPosting, { bar, scored }: ProposedPair) => {
  const criteria = jobMatchCriteria(scored.score.criteria);
  const timed = criteria.some(({ criterion, outcome }) => criterion === 'commute' && outcome !== 'unknown');
  const transit = timed ? commuteAvailability('matching').transit : undefined;
  return {
    posting: versionNow(job),
    version: job.updatedAt,
    score: scored.score.score,
    minScore: bar.minScore,
    criteria,
    ...(transit ? { transit } : {})
  };
};

/**
 * Where a mutual interest leads: the candidate's own hiring journey, for its recruiter. Its job
 * step holds the job they are both interested in, and its job match is frozen at the score then
 * (the record of it: the steps read the mutual interest itself, services/mutualInterests.ts); the
 * other steps keep what the recruiter did there, and the notes are still theirs to confirm before
 * the meeting opens. Nothing for a journey without a job step (the candidate changed it since
 * they were proposed), nor a mutual interest not revealed
 */
export async function handOffToJourney(interest: MutualInterest): Promise<void> {
  const share = mutualInterestShare(interest);
  if (!share) return;
  const { steps } = await ownerJourney(interest.candidate);
  const jobIndex = steps.findIndex((step) => step.type === 'job');
  if (jobIndex === -1) return;
  const jobMatch = steps.slice(jobIndex + 1).find((step) => step.type === 'job-match');
  await seedVisitorProgress(interest.candidate, interest.recruiter, [
    { stepId: steps[jobIndex].id, data: share },
    ...(jobMatch ? [{ stepId: jobMatch.id, data: freezeJobMatch(interest) }] : [])
  ]);
}

/**
 * Drops what a mutual interest stored in its candidate's journey (handOffToJourney), once it ended:
 * the recruiter's job step is to do again, as anyone's (what it stored would hold nothing anyway)
 */
const dropHandOff = (matchId: string, recruiterId: string) =>
  dropVisitorProgress(recruiterId, (data) => (data as { match?: unknown } | null | undefined)?.match === matchId);

/** Runs `step` and logs that it failed, never failing its caller: the mutual interest is made, or ended */
const bestEffort = async (what: string, step: () => Promise<void>) => {
  try {
    await step();
  } catch (error) {
    // Never who, nor which match: a match is private
    logger.error(`Mutual interest: ${what} failed`, { errorName: error instanceof Error ? error.name : typeof error });
  }
};

/**
 * After a decision that left both sides interested in `match`: the mutual interest, made by one
 * write conditioned on both interests and on none made yet, so that two decisions at once make
 * one, and a pass or an undo landing between them makes none. `side` decided last: they are told
 * now, the other side's is unseen (GET /me/notifications). Revealed (revealAllowed), it leads into
 * the candidate's journey (handOffToJourney). The match as it is after: a mutual interest, or the
 * decisions alone when another request made it or a decision changed meanwhile
 */
const makeMutualInterest = async (
  match: StoredMatch,
  job: StoredJobPosting,
  pair: ProposedPair,
  side: MatchSide,
  now: Date
): Promise<StoredMatch | null> => {
  const revealed = revealAllowed(match);
  const made = await Match.findOneAndUpdate(
    {
      _id: match._id,
      matchedAt: { $exists: false },
      'candidateDecision.value': 'interested',
      'recruiterDecision.value': 'interested'
    },
    {
      $set: {
        matchedAt: now,
        snapshot: mutualInterestSnapshot(job, pair),
        [SEEN_FIELD[side]]: now,
        ...(revealed ? { revealedAt: now } : {})
      },
      $unset: { expiresAt: 1 }
    },
    { returnDocument: 'after' }
  ).lean<StoredMatch>();
  if (!made) return Match.findById(match._id).lean<StoredMatch>();
  // An edit of the posting saved since this decision read it (afterJobEdited ran before the mutual
  // interest existed): marked changed, as that edit would have marked it
  const current = await JobPosting.findById(job._id).lean<StoredJobPosting>();
  const kept = storedJobSnapshot(made.snapshot?.posting);
  if (current && (!kept || jobSnapshotsDiffer(kept, versionNow(current)))) {
    await Match.updateOne({ _id: made._id, changedAt: { $exists: false } }, { $set: { changedAt: now } });
  }
  const interest = readMutualInterest(made);
  if (made.revealedAt && interest) await bestEffort('hand-off into the journey', () => handOffToJourney(interest));
  return Match.findById(made._id).lean<StoredMatch>();
};

/**
 * Removes the decision of `side` on the job `jobId` and the candidate `candidateId` (an undo),
 * never once they are both interested (409); 404 when that side has none. The Match goes once no
 * decision is left
 */
const undoDecision = async (side: MatchSide, jobId: Types.ObjectId | string, candidateId: string) => {
  const field = DECISION_FIELD[side];
  const undone = await Match.findOneAndUpdate(
    { job: jobId, candidate: candidateId, matchedAt: { $exists: false }, [field]: { $exists: true } },
    { $unset: { [field]: 1 } },
    { returnDocument: 'after' }
  ).lean<StoredMatch>();
  if (!undone) {
    if (await Match.exists({ job: jobId, candidate: candidateId, ...MATCHED })) throw new ConflictError(MUTUAL_INTEREST_EXISTS);
    throw new ResourceNotFoundError(DECISION_NOT_FOUND);
  }
  // Nothing left of it (the other side may have decided meanwhile: then it stays)
  await Match.deleteOne({
    _id: undone._id,
    matchedAt: { $exists: false },
    candidateDecision: { $exists: false },
    recruiterDecision: { $exists: false }
  });
};

/** PUT and DELETE /opportunities/jobs/:id/decision */
export interface CandidateDecisionDto {
  /** The candidate's decision on the job now (null: undone) */
  decision: MatchDecision | null;
  /** The mutual interest the job and the candidate have, when this decision made one */
  match: CandidateMatchDto | null;
}

/** PUT and DELETE /recruiter/jobs/:id/candidates/decision */
export interface RecruiterDecisionDto {
  /** The recruiter's decision on the candidate for the job now (null: undone) */
  decision: MatchDecision | null;
  /** The mutual interest the job and the candidate have, when this decision made one */
  match: RecruiterMatchDto | null;
}

/**
 * The candidate `userId` says whether the job `jobId`, proposed to them, interests them (PUT
 * /opportunities/jobs/:id/decision), again if they wish (the latest counts) until they are both
 * interested. 429 over MATCHING_DECISIONS; 403 NOT_PROPOSED_TO_RECRUITERS unless they are proposed
 * to recruiters now; 409 MUTUAL_INTEREST_EXISTS once they and the recruiter are both interested;
 * 404 for a job not proposed to them now (jobProposedTo: like an unknown id). Their interest in a
 * job whose recruiter is interested in them makes a mutual interest. It is activity
 */
export async function decideAsCandidate(
  userId: string,
  jobId: string,
  value: MatchDecision,
  now = new Date()
): Promise<CandidateDecisionDto> {
  await countDecision(userId);
  if (!(await isProposed(userId, now))) throw new ForbiddenError(NOT_PROPOSED_TO_RECRUITERS);
  const job = await JobPosting.findById(jobId).lean<StoredJobPosting>();
  if (!job) throw new ResourceNotFoundError(JOB_NOT_FOUND);
  await requireNoMutualInterest(job._id, userId);
  const pair = await jobProposedTo(userId, job);
  if (!pair) throw new ResourceNotFoundError(JOB_NOT_FOUND);
  let match: StoredMatch | null = await recordDecision('candidate', job, userId, value, now);
  if (bothInterested(match)) match = await makeMutualInterest(match, job, pair, 'candidate', now);
  await touchDiscovery(userId, now);
  return { decision: value, match: match?.matchedAt ? (await candidateMatchDtos([match]))[0] ?? null : null };
}

/**
 * The candidate `userId` undoes their decision on the job `jobId` (DELETE
 * /opportunities/jobs/:id/decision): 429 over MATCHING_DECISIONS; 404 DECISION_NOT_FOUND without
 * one; 409 MUTUAL_INTEREST_EXISTS once they are both interested (either side ends a mutual
 * interest instead). Whether the job is still proposed to them does not matter
 */
export async function undoAsCandidate(userId: string, jobId: string): Promise<CandidateDecisionDto> {
  await countDecision(userId);
  await undoDecision('candidate', jobId, userId);
  return { decision: null, match: null };
}

/** The job `jobId` of `recruiterId`, live in matching: 404 when it is not theirs, 409 JOB_NOT_PROPOSED when not live */
const ownLiveJob = async (recruiterId: string, jobId: string) => {
  const job = await JobPosting.findOne({ _id: jobId, recruiter: recruiterId }).lean<StoredJobPosting>();
  if (!job) throw new ResourceNotFoundError(JOB_NOT_FOUND);
  if (!(await isLiveInMatching(job))) throw new ConflictError(JOB_NOT_PROPOSED);
  return job;
};

/** The candidate a card's token stands for, for this recruiter and job; 409 CANDIDATE_UNAVAILABLE otherwise */
const candidateOfToken = (token: string, recruiterId: string, job: StoredJobPosting, now: Date) => {
  const candidateId = openMatchToken(token, { recruiterId, jobId: String(job._id) }, now);
  if (!candidateId) throw new ConflictError(CANDIDATE_UNAVAILABLE);
  return candidateId;
};

/**
 * The recruiter `recruiterId` says whether the candidate whose card `token` stands for interests
 * them for their job `jobId` (PUT /recruiter/jobs/:id/candidates/decision), again if they wish
 * until they are both interested. 429 over MATCHING_DECISIONS; 404 for a job that is not theirs;
 * 409 JOB_NOT_PROPOSED unless it is proposed to candidates now; 409 CANDIDATE_UNAVAILABLE for a
 * token that does not stand for a candidate for this recruiter and job (made for another, or too
 * old), or a candidate not proposed for the job now (candidateProposedFor); 409
 * MUTUAL_INTEREST_EXISTS once they are both interested. The recruiter space and the terms in force
 * are the route's (requireRecruiterSpace). Their interest in a candidate interested in the job
 * makes a mutual interest, which reveals the candidate's portfolio to them
 */
export async function decideAsRecruiter(
  recruiterId: string,
  jobId: string,
  token: string,
  value: MatchDecision,
  now = new Date()
): Promise<RecruiterDecisionDto> {
  await countDecision(recruiterId);
  const job = await ownLiveJob(recruiterId, jobId);
  const candidateId = candidateOfToken(token, recruiterId, job, now);
  await requireNoMutualInterest(job._id, candidateId);
  const pair = await candidateProposedFor(recruiterId, job, candidateId, now);
  if (!pair) throw new ConflictError(CANDIDATE_UNAVAILABLE);
  let match: StoredMatch | null = await recordDecision('recruiter', job, candidateId, value, now);
  if (bothInterested(match)) match = await makeMutualInterest(match, job, pair, 'recruiter', now);
  return { decision: value, match: match?.matchedAt ? (await recruiterMatchDtos([match]))[0] ?? null : null };
}

/**
 * The recruiter `recruiterId` undoes their decision on the candidate whose card `token` stands for,
 * for their job `jobId` (DELETE /recruiter/jobs/:id/candidates/decision): 429 over
 * MATCHING_DECISIONS; 404 for a job that is not theirs; 409 CANDIDATE_UNAVAILABLE for a token that
 * is not one for it; 404 DECISION_NOT_FOUND without a decision; 409 MUTUAL_INTEREST_EXISTS once
 * they are both interested. Whether the job is still live does not matter
 */
export async function undoAsRecruiter(
  recruiterId: string,
  jobId: string,
  token: string,
  now = new Date()
): Promise<RecruiterDecisionDto> {
  await countDecision(recruiterId);
  const job = await JobPosting.findOne({ _id: jobId, recruiter: recruiterId }).lean<StoredJobPosting>();
  if (!job) throw new ResourceNotFoundError(JOB_NOT_FOUND);
  await undoDecision('recruiter', job._id, candidateOfToken(token, recruiterId, job, now));
  return { decision: null, match: null };
}

// ── Mutual interests, as each side reads them ───────────────

interface MatchBaseDto {
  _id: string;
  /** When both became interested */
  matchedAt: Date;
  /**
   * The latest edit of the posting that made it differ from the version matched (its terms are
   * locked: its description, or a field no criterion reads); null while it does not. Each side keeps
   * the version matched
   */
  changedAt: Date | null;
  /** When it ended, and who or what ended it; null while it lasts */
  endedAt: Date | null;
  endReason: MatchEndReason | null;
  /** The caller saw it (PUT /matches/:id/seen; the decision that made it counts) */
  seen: boolean;
}

/** A mutual interest as its candidate reads it: the job they said yes to, as they read it then */
export interface CandidateMatchDto extends MatchBaseDto {
  side: 'candidate';
  /**
   * The version they said yes to (a JobSnapshot: never who posted it), with the posting's id and
   * status now; null for a version that no longer checks out
   */
  job: (JobSnapshot & { _id: string; status: JobStatus }) | null;
  /** Their score of it then, against their own criteria, and their minimum then */
  score: number;
  minScore: number;
  /** How it did on each of their criteria then, the commute included */
  criteria: JobMatchCriterionView[];
  /** With a travel time among `criteria`: the public transport service asked, to credit it */
  transit?: TransitProvider;
}

/** A mutual interest as its recruiter reads it: their job, and the candidate's portfolio once revealed */
export interface RecruiterMatchDto extends MatchBaseDto {
  side: 'recruiter';
  /** Their job, as the candidate said yes to it (its title and company), with its status now */
  job: { _id: string; title: string; company?: string; status: JobStatus };
  /**
   * The candidate's portfolio, revealed by the mutual interest: its address name (their page for
   * recruiters is `/<domain>/hire`, where the meeting is booked) and its title; null while not
   * revealed, or once they have no portfolio. Never their name or email address
   */
  candidate: { domain: string; title: string | null } | null;
}

export type MatchDto = CandidateMatchDto | RecruiterMatchDto;

const baseDto = (stored: StoredMatch, interest: MutualInterest, side: MatchSide): MatchBaseDto => ({
  _id: interest._id,
  matchedAt: interest.matchedAt,
  changedAt: interest.changedAt ?? null,
  endedAt: interest.endedAt ?? null,
  endReason: interest.endReason ?? null,
  seen: !!stored[SEEN_FIELD[side]]
});

type JobFacts = Pick<StoredJobPosting, '_id' | 'status' | 'title' | 'company'>;

/** The jobs of `matches`, by id: their status now (and title and company, for a version that no longer checks out) */
const jobsOf = async (matches: readonly StoredMatch[]) => {
  const jobs = await JobPosting.find(
    { _id: { $in: matches.map((match) => match.job) } },
    { status: 1, title: 1, company: 1 }
  ).lean<JobFacts[]>();
  return new Map(jobs.map((job) => [String(job._id), job]));
};

/** Mutual interests as their candidate reads them (a match that is not one is left out) */
async function candidateMatchDtos(matches: readonly StoredMatch[]): Promise<CandidateMatchDto[]> {
  const jobs = await jobsOf(matches);
  return matches.flatMap((stored): CandidateMatchDto[] => {
    const interest = readMutualInterest(stored);
    const job = interest && jobs.get(interest.job);
    if (!interest || !job) return [];
    return [
      {
        ...baseDto(stored, interest, 'candidate'),
        side: 'candidate',
        job: interest.posting ? { ...interest.posting, _id: interest.job, status: job.status as JobStatus } : null,
        score: interest.score,
        minScore: interest.minScore,
        criteria: interest.criteria,
        ...(interest.transit ? { transit: interest.transit } : {})
      }
    ];
  });
}

/** Mutual interests as their recruiter reads them (a match that is not one is left out) */
async function recruiterMatchDtos(matches: readonly StoredMatch[]): Promise<RecruiterMatchDto[]> {
  const revealed = matches.filter((match) => match.revealedAt).map((match) => match.candidate);
  const [jobs, domains] = await Promise.all([
    jobsOf(matches),
    Domain.find({ admin: { $in: revealed } }, { name: 1, headerTitle: 1, admin: 1 }).lean<
      { name: string; headerTitle?: string | null; admin: Types.ObjectId }[]
    >()
  ]);
  const domainOf = new Map(domains.map((domain) => [String(domain.admin), domain]));
  return matches.flatMap((stored): RecruiterMatchDto[] => {
    const interest = readMutualInterest(stored);
    const job = interest && jobs.get(interest.job);
    if (!interest || !job) return [];
    const { title, company } = interest.posting ?? job;
    const domain = stored.revealedAt ? domainOf.get(interest.candidate) : undefined;
    return [
      {
        ...baseDto(stored, interest, 'recruiter'),
        side: 'recruiter',
        job: { _id: interest.job, title, ...(company ? { company } : {}), status: job.status as JobStatus },
        candidate: domain ? { domain: domain.name, title: domain.headerTitle || null } : null
      }
    ];
  });
}

/** The side `userId` is of `match` */
const sideOf = (match: StoredMatch, userId: string): MatchSide | undefined =>
  String(match.candidate) === userId ? 'candidate' : String(match.recruiter) === userId ? 'recruiter' : undefined;

/** `match` as its side `side` reads it (a recruiter's space and terms checked by the caller) */
const asSideReads = async (match: StoredMatch, side: MatchSide): Promise<MatchDto> => {
  const [dto] = side === 'candidate' ? await candidateMatchDtos([match]) : await recruiterMatchDtos([match]);
  if (!dto) throw new ResourceNotFoundError(MATCH_NOT_FOUND);
  return dto;
};

/**
 * The mutual interests of `userId` as `side` (GET /matches?side=), active and ended (until they
 * expire), the latest first, MATCHING_LIMITS.matchesPerRead at most. As a recruiter: with a
 * recruiter space and the terms in force (403, 422 on `consent`), like every recruiter route
 */
export async function listMatches(userId: string, side: MatchSide): Promise<{ matches: MatchDto[] }> {
  if (side === 'recruiter') await requireRecruiterSpace(userId);
  const matches = await Match.find({ [side]: userId, ...MATCHED })
    .sort({ matchedAt: -1, _id: -1 })
    .limit(MATCHING_LIMITS.matchesPerRead)
    .lean<StoredMatch[]>();
  return { matches: side === 'candidate' ? await candidateMatchDtos(matches) : await recruiterMatchDtos(matches) };
}

/**
 * The mutual interest `matchId` of which `userId` is a side, and that side; 404 MATCH_NOT_FOUND
 * otherwise. As its recruiter: with a recruiter space and the terms in force (403, 422 on
 * `consent`), like every recruiter route
 */
const ownMatch = async (userId: string, matchId: string) => {
  const match = Types.ObjectId.isValid(userId)
    ? await Match.findOne({ _id: matchId, ...MATCHED, $or: [{ candidate: userId }, { recruiter: userId }] }).lean<StoredMatch>()
    : null;
  const side = match ? sideOf(match, userId) : undefined;
  if (!match || !side) throw new ResourceNotFoundError(MATCH_NOT_FOUND);
  if (side === 'recruiter') await requireRecruiterSpace(userId);
  return { match, side };
};

/** The mutual interest `matchId` as `userId`, one of its sides, reads it (GET /matches/:id); 404 otherwise */
export async function readMatch(userId: string, matchId: string): Promise<MatchDto> {
  const { match, side } = await ownMatch(userId, matchId);
  return asSideReads(match, side);
}

/**
 * `userId` saw the mutual interest `matchId` (PUT /matches/:id/seen): it no longer counts in their
 * notifications. 404 when they are not one of its sides
 */
export async function markMatchSeen(userId: string, matchId: string, now = new Date()): Promise<MatchDto> {
  const { match, side } = await ownMatch(userId, matchId);
  const seen = await Match.findOneAndUpdate(
    { _id: match._id },
    { $set: { [SEEN_FIELD[side]]: now } },
    { returnDocument: 'after' }
  ).lean<StoredMatch>();
  if (!seen) throw new ResourceNotFoundError(MATCH_NOT_FOUND);
  return asSideReads(seen, side);
}

/**
 * `userId` ends the mutual interest `matchId` (POST /matches/:id/end), as the side they are of: it
 * leads into the candidate's journey no more (what it stored there goes: the recruiter shares a job
 * as anyone does), and is kept MATCH_RETENTION.endedMatchMonths more, with what each side saw. One
 * already ended is answered as it is. 404 when they are not one of its sides
 */
export async function endMatch(userId: string, matchId: string, now = new Date()): Promise<MatchDto> {
  const { match, side } = await ownMatch(userId, matchId);
  const ended =
    (await Match.findOneAndUpdate(
      { _id: match._id, endedAt: { $exists: false } },
      { $set: { endedAt: now, endReason: side, expiresAt: endedMatchExpiry(now) } },
      { returnDocument: 'after' }
    ).lean<StoredMatch>()) ?? (await Match.findById(match._id).lean<StoredMatch>());
  if (!ended) throw new ResourceNotFoundError(MATCH_NOT_FOUND);
  await bestEffort('hand-off removal', () => dropHandOff(String(ended._id), String(ended.recruiter)));
  return asSideReads(ended, side);
}

/** GET /me/notifications */
export interface MatchNotificationsDto {
  /** The mutual interests going on that the account has not seen yet, as each side (a badge) */
  mutualInterests: Record<MatchSide, number>;
}

/** What `userId` has not seen yet of matching: their mutual interests going on, unseen, per side */
export async function matchNotifications(userId: string): Promise<MatchNotificationsDto> {
  const unseen = (side: MatchSide) =>
    Match.countDocuments({ [side]: userId, ...MATCHED, endedAt: { $exists: false }, [SEEN_FIELD[side]]: { $exists: false } });
  const [candidate, recruiter] = await Promise.all([unseen('candidate'), unseen('recruiter')]);
  return { mutualInterests: { candidate, recruiter } };
}
