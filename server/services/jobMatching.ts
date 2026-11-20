import type { Types } from 'mongoose';
import {
  MATCHING_JOB_STATUSES,
  MATCHING_LIMITS,
  OPEN_JOB_STATUS,
  endedMatchExpiry,
  jobSnapshotsDiffer,
  keepsMatching,
  matchingJobProblem,
  matchingMessages
} from 'portfolio-common';
import type { JobPostingInput, JobSnapshot, JobStatus, MatchingReviewStatus } from 'portfolio-common';
import { env } from '../env';
import { JobPosting, Match } from '../models/database';
import type { JobPosting as StoredJobPosting } from '../models/database/jobPosting';
import { ConflictError, FieldValidationError, ResourceNotFoundError } from '../errors';
import { MATCHING_NEEDS_OPEN_JOB } from '../protocol';
import { warmOffice } from './commute';
import { JOB_NOT_FOUND, storedJobSnapshot, toJobPostingDto, toJobSnapshot } from './jobPostings';
import { reviewedVersion, versionNow } from './jobVersion';
import type { JobPostingDto } from './jobPostings';

// The job side of matching (Path 2, behind MATCHING): a recruiter's switch,
// which proposes an open job to the candidates whose criteria it meets once a
// reviewer approved it (PUT /jobs/:id/matching, or `matching` on POST /jobs;
// the review: services/matchingReviews.ts), and what happens to the job's
// matches (models/database/match.ts) and its review when the job changes:
// filled, closed or back to draft, deleted, taken out of matching, edited
// (plugins/jobs.ts calls these whatever the flag: they only end, drop or
// delete, or send a review back, so a job closed while matching is off never
// comes back into it).
//
// What a job must have to enter matching is portfolio-common's
// (matchingJobProblem: its company, a description); its terms are locked once
// it is opened (LOCKED_JOB_FIELDS), and only an open job enters matching, so
// what a candidate's criteria read never changes under a job in matching.
// Deterministic: no model is asked anything, here or in what decides who is
// proposed to whom.

/** A job's review as its recruiter reads it (no reviewer is named) */
export interface MatchingReviewDto {
  status: MatchingReviewStatus;
  /** When it was last sent for review */
  requestedAt: Date;
  /** When a reviewer last decided; null while it never was */
  reviewedAt: Date | null;
  /** Why it was not accepted, as the reviewer wrote it; null unless rejected */
  reason: string | null;
}

/** A posting as the recruiter's routes answer it: with whether it is in matching, and its review */
export interface RecruiterJobPostingDto extends JobPostingDto {
  /**
   * Whether its recruiter proposes it to candidates (matching), since when (null: off for this
   * job), and where it stands with the reviewers (null: never put into matching). Only while
   * MATCHING is on: absent, matching is not offered. Proposed to candidates only while it is open,
   * on and approved (portfolio-common's jobLiveInMatching)
   */
  matching?: { enabledAt: Date | null; review: MatchingReviewDto | null };
}

type StoredReview = NonNullable<NonNullable<StoredJobPosting['matching']>['review']>;

const toReviewDto = (review: StoredReview | null | undefined): MatchingReviewDto | null =>
  review
    ? {
        status: review.status as MatchingReviewStatus,
        requestedAt: review.requestedAt,
        reviewedAt: review.reviewedAt ?? null,
        reason: review.status === 'rejected' ? (review.reason ?? null) : null
      }
    : null;

/** A stored posting as the recruiter's routes answer it (toJobPostingDto, and its matching) */
export const toRecruiterJobDto = (job: StoredJobPosting): RecruiterJobPostingDto => {
  const dto = toJobPostingDto(job);
  if (!env.matchingEnabled) return dto;
  return {
    ...dto,
    matching: { enabledAt: job.matching?.enabledAt ?? null, review: toReviewDto(job.matching?.review) }
  };
};

/**
 * What matching asks in the background when a job enters it: its office looked up, once, so that
 * each candidate's travel time then needs only the way (services/commute.ts). Tests replace it
 */
export const jobMatchingWarmUp = {
  office: (location: JobPostingInput['location'], accountId: string): Promise<void> => warmOffice(location, accountId)
};

/**
 * The jobs proposed to candidates now, as a MongoDB filter: open, in matching and approved by a
 * reviewer (portfolio-common's jobLiveInMatching). On hold, pending or rejected: nobody
 */
export const LIVE_IN_MATCHING = {
  status: OPEN_JOB_STATUS,
  'matching.enabledAt': { $exists: true },
  'matching.review.status': 'approved'
} as const;

// ── The version a review is of ──────────────────────────────

export { reviewedVersion } from './jobVersion';

/**
 * The review of a job entering matching now: the decision it had while the posting is still the
 * version decided on (turned off then on again, nothing changed), a request still pending as it
 * was; else a new request, pending (when a reviewer last decided kept)
 */
const reviewOnEntry = (job: StoredJobPosting, now: Date) => {
  const review = job.matching?.review;
  if (review?.status === 'pending') return review;
  if (review && review.version === reviewedVersion(job)) return review;
  // When a reviewer last decided stays known; the reason was of that version
  return { status: 'pending', requestedAt: now, ...(review?.reviewedAt ? { reviewedAt: review.reviewedAt } : {}) };
};

// ── Entering matching ───────────────────────────────────────

/** How many jobs `recruiterId` has in matching (open or on hold: no other status keeps it) */
const jobsInMatching = (recruiterId: string) =>
  JobPosting.countDocuments({ recruiter: recruiterId, 'matching.enabledAt': { $exists: true } });

const tooManyJobsInMatching = () =>
  new ConflictError(() => matchingMessages.job.tooMany(MATCHING_LIMITS.matchingJobsPerRecruiter));

/** 422 on `company` or `description` for a posting matching cannot propose (matchingJobProblem) */
const requireMatchingFields = (job: { company?: string | null; description?: string | null }) => {
  const problem = matchingJobProblem(job);
  if (problem) throw new FieldValidationError(problem.field, () => matchingJobProblem(job)?.message ?? '');
};

/** 409 when `recruiterId` has MATCHING_LIMITS.matchingJobsPerRecruiter jobs in matching already */
const requireRoomInMatching = async (recruiterId: string) => {
  if ((await jobsInMatching(recruiterId)) >= MATCHING_LIMITS.matchingJobsPerRecruiter) throw tooManyJobsInMatching();
};

/**
 * Over the limit once written (jobs entering matching at once, and together over it): what
 * `takeBack` undoes, then 409. Counted after the write, as createJobPosting counts the postings, so
 * the limit holds whatever the number of parallel requests (at the boundary they may all be
 * refused; a retry then gets the place)
 */
const holdLimit = async (recruiterId: string, takeBack: () => Promise<unknown>) => {
  if ((await jobsInMatching(recruiterId)) > MATCHING_LIMITS.matchingJobsPerRecruiter) {
    await takeBack();
    throw tooManyJobsInMatching();
  }
};

/** The posting `jobId` of `recruiterId` as it is stored now; 404 when it is not theirs, or gone */
const reloadOwn = async (recruiterId: string, jobId: Types.ObjectId | string) => {
  const job = await JobPosting.findOne({ _id: jobId, recruiter: recruiterId }).lean<StoredJobPosting>();
  if (!job) throw new ResourceNotFoundError(JOB_NOT_FOUND);
  return job;
};

/**
 * Turns matching on or off for the posting `jobId` of `recruiterId` (PUT /jobs/:id/matching), and
 * answers the posting as it is then. 404 for a posting that is not theirs.
 *
 * On: only for an open posting (409 MATCHING_NEEDS_OPEN_JOB), that names its company and has a
 * description (422 on `company` or `description`), within MATCHING_LIMITS.matchingJobsPerRecruiter
 * jobs in matching (409); already on, nothing is written. It is then sent for review (pending:
 * proposed to nobody until a reviewer approves it), unless it was approved or rejected before and
 * has not changed since (reviewOnEntry), and its office is looked up in the background
 * (jobMatchingWarmUp). The terms in force are the recruiter routes' (requireRecruiterSpace).
 *
 * Off: in any status, whatever was set; the job leaves every feed at once, and the interests no
 * other side answered go (afterMatchingOff). Its review stays, for when it is turned on again.
 *
 * Neither changes the posting's `updatedAt`: matching is not part of the posting, and an edit
 * started before (PUT /jobs/:id's `updatedAt`) is not refused for it
 */
export async function setJobMatching(
  recruiterId: string,
  jobId: string,
  enabled: boolean,
  now = new Date()
): Promise<StoredJobPosting> {
  const job = await reloadOwn(recruiterId, jobId);
  if (!enabled) {
    await JobPosting.updateOne(
      { _id: job._id, recruiter: recruiterId },
      { $unset: { 'matching.enabledAt': 1 } },
      { timestamps: false }
    );
    // Even when it was off: a turn-off stopped midway is finished
    await afterMatchingOff(job._id);
    return reloadOwn(recruiterId, job._id);
  }

  if (job.status !== OPEN_JOB_STATUS) throw new ConflictError(MATCHING_NEEDS_OPEN_JOB);
  requireMatchingFields(job);
  if (job.matching?.enabledAt) return job;
  await requireRoomInMatching(recruiterId);
  const { modifiedCount } = await JobPosting.updateOne(
    { _id: job._id, recruiter: recruiterId, status: OPEN_JOB_STATUS, 'matching.enabledAt': { $exists: false } },
    { $set: { 'matching.enabledAt': now, 'matching.review': reviewOnEntry(job, now) } },
    { timestamps: false }
  );
  if (modifiedCount === 0) {
    // Changed meanwhile: put in matching by another request (nothing to do), or no longer open
    const current = await reloadOwn(recruiterId, job._id);
    if (current.status !== OPEN_JOB_STATUS) throw new ConflictError(MATCHING_NEEDS_OPEN_JOB);
    return current;
  }
  await holdLimit(recruiterId, () =>
    JobPosting.updateOne(
      { _id: job._id, 'matching.enabledAt': now },
      { $unset: { 'matching.enabledAt': 1 } },
      { timestamps: false }
    )
  );
  void jobMatchingWarmUp.office(toJobPostingDto(job).location, recruiterId);
  return reloadOwn(recruiterId, job._id);
}

/**
 * Whether a posting created with `asked` (POST /jobs's `matching`) enters matching, checked before
 * anything is written: never while MATCHING is off (the flag is ignored, as if not sent); else 422
 * on `matching` for a posting not created open, on `company` or `description` for one matching
 * cannot propose (matchingJobProblem), and 409 for a recruiter with
 * MATCHING_LIMITS.matchingJobsPerRecruiter jobs in matching already
 */
export async function entersMatchingAtCreation(
  recruiterId: string,
  fields: JobPostingInput,
  asked: boolean | undefined
): Promise<boolean> {
  if (!env.matchingEnabled || asked !== true) return false;
  if (fields.status !== OPEN_JOB_STATUS) {
    throw new FieldValidationError('matching', () => matchingMessages.job.openOnly);
  }
  requireMatchingFields(fields);
  await requireRoomInMatching(recruiterId);
  return true;
}

/** What a posting created in matching at `now` holds of it: on, and sent for review */
export const newJobMatching = (now = new Date()) => ({
  enabledAt: now,
  review: { status: 'pending' as const, requestedAt: now }
});

/**
 * After a posting was created in matching (entersMatchingAtCreation): over the limit (creations at
 * once), the posting is deleted again and 409, as if never created; else its office is looked up
 * in the background
 */
export async function settleCreatedInMatching(recruiterId: string, job: StoredJobPosting): Promise<void> {
  await holdLimit(recruiterId, () => JobPosting.deleteOne({ _id: job._id }));
  void jobMatchingWarmUp.office(toJobPostingDto(job).location, recruiterId);
}

// ── What a job's changes do to its matches ──────────────────

/**
 * After matching was turned off for the job `jobId`: the interests no other side answered go (a
 * candidate's in the job, a recruiter's in a candidate for it), since nobody is proposed it to
 * answer them; the passes stay until they expire (MATCH_RETENTION), so turning matching off then on
 * again proposes the job to no candidate who passed it, nor a card its recruiter passed; the mutual
 * interests go on
 */
export async function afterMatchingOff(jobId: Types.ObjectId | string): Promise<void> {
  const pending = { job: jobId, matchedAt: { $exists: false } };
  await Match.updateMany({ ...pending, 'candidateDecision.value': 'interested' }, { $unset: { candidateDecision: 1 } });
  await Match.updateMany({ ...pending, 'recruiterDecision.value': 'interested' }, { $unset: { recruiterDecision: 1 } });
  await Match.deleteMany({ ...pending, candidateDecision: { $exists: false }, recruiterDecision: { $exists: false } });
}

/**
 * After the job `jobId` was given the status `status` (PUT /jobs/:id/status, or an edit through
 * PUT /jobs/:id). Open or on hold: nothing (on hold, the feeds propose it to nobody until it is
 * open again). Filled, closed or back to draft, it leaves matching for good: out of it (its
 * recruiter turns it on again once it is open; its review stays), every decision no mutual
 * interest came of gone, and every mutual interest ended (`job_closed`, kept
 * MATCH_RETENTION.endedMatchMonths more, with what each side saw). Idempotent: a change stopped
 * midway is finished by the next. Whether it took the job out of matching (its posting changed)
 */
export async function afterJobStatusChange(jobId: Types.ObjectId | string, status: JobStatus, now = new Date()): Promise<boolean> {
  if (keepsMatching(status)) return false;
  // Conditioned on the status stored: a job opened again (and put in matching) meanwhile keeps it
  const { modifiedCount } = await JobPosting.updateOne(
    { _id: jobId, status: { $nin: MATCHING_JOB_STATUSES }, 'matching.enabledAt': { $exists: true } },
    { $unset: { 'matching.enabledAt': 1 } },
    { timestamps: false }
  );
  await Match.deleteMany({ job: jobId, matchedAt: { $exists: false } });
  await Match.updateMany(
    { job: jobId, matchedAt: { $exists: true }, endedAt: { $exists: false } },
    { $set: { endedAt: now, endReason: 'job_closed', expiresAt: endedMatchExpiry(now) } }
  );
  return modifiedCount > 0;
}

/**
 * After the job `jobId` was deleted: every match of it goes, its decisions and its mutual
 * interests with what each side saw (as the versions of it shared on journeys go)
 */
export async function afterJobDeleted(jobId: Types.ObjectId | string): Promise<void> {
  await Match.deleteMany({ job: jobId });
}

/**
 * An edit of a job in matching that stays in it (PUT /jobs/:id, open or on hold) keeps what
 * matching asks of it: while MATCHING is on, 422 on `company` for an edit that takes its company
 * out (its recruiter turns matching off first), on `description` for one without a description.
 * While MATCHING is off nothing is refused: such an edit takes the job out of matching instead
 * (leavesMatchingOnEdit), the switch not being offered
 */
export function requireMatchingKept(stored: StoredJobPosting, fields: JobPostingInput): void {
  if (!env.matchingEnabled || !stored.matching?.enabledAt || !keepsMatching(fields.status)) return;
  const problem = matchingJobProblem(fields);
  if (problem?.field === 'company') {
    throw new FieldValidationError('company', () => matchingMessages.job.companyKept);
  }
  requireMatchingFields(fields);
}

/**
 * Whether an edit of a job in matching that stays in it takes it out of matching: one matching
 * cannot propose any more (matchingJobProblem), while MATCHING is off (on, requireMatchingKept
 * refused it). The route then turns matching off for it (afterMatchingOff)
 */
export const leavesMatchingOnEdit = (stored: StoredJobPosting, fields: JobPostingInput): boolean =>
  !!stored.matching?.enabledAt && keepsMatching(fields.status) && matchingJobProblem(fields) !== null;

/**
 * After an edit of the job (PUT /jobs/:id: `before` and `after` it). Its terms are locked once it
 * is opened: what changes is what no criterion reads (its description...).
 * - Its review holds for the version decided on: a job in matching approved or rejected that is no
 *   longer that version is sent for review again (pending: out of the feeds until a reviewer
 *   approves it); its decisions and mutual interests stay.
 * - A snapshot never changes (each side keeps what it saw): a mutual interest whose snapshot is no
 *   longer the posting is marked changed (`changedAt`: the latest edit that changed the posting, or
 *   this one when none was marked yet); one the edit brings back to its snapshot is not any more. A
 *   snapshot that cannot be read counts as changed
 * Whether it sent the job back for review (its posting changed)
 */
export async function afterJobEdited(before: StoredJobPosting, after: StoredJobPosting, now = new Date()): Promise<boolean> {
  const review = after.matching?.review;
  let sentBack = false;
  if (after.matching?.enabledAt && review && review.status !== 'pending' && review.version !== reviewedVersion(after)) {
    // Conditioned on the decision read: one taken meanwhile on this version is not undone
    const { modifiedCount } = await JobPosting.updateOne(
      {
        _id: after._id,
        'matching.enabledAt': { $exists: true },
        'matching.review.status': review.status,
        'matching.review.version': review.version ?? null
      },
      {
        $set: { 'matching.review.status': 'pending', 'matching.review.requestedAt': now },
        $unset: { 'matching.review.reason': 1 }
      },
      { timestamps: false }
    );
    sentBack = modifiedCount > 0;
  }

  const active = await Match.find(
    { job: after._id, matchedAt: { $exists: true }, endedAt: { $exists: false } },
    { 'snapshot.posting': 1 }
  ).lean<{ _id: Types.ObjectId; snapshot?: { posting?: unknown } | null }[]>();
  if (active.length === 0) return sentBack;
  const current = versionNow(after);
  const edited = jobSnapshotsDiffer(versionNow(before), current);
  const differ: Types.ObjectId[] = [];
  const same: Types.ObjectId[] = [];
  for (const match of active) {
    const kept = storedJobSnapshot(match.snapshot?.posting);
    (kept && !jobSnapshotsDiffer(kept, current) ? same : differ).push(match._id);
  }
  await Promise.all([
    differ.length > 0 &&
      Match.updateMany(
        { _id: { $in: differ }, ...(edited ? {} : { changedAt: { $exists: false } }) },
        { $set: { changedAt: now } }
      ),
    same.length > 0 && Match.updateMany({ _id: { $in: same }, changedAt: { $exists: true } }, { $unset: { changedAt: 1 } })
  ]);
  return sentBack;
}
