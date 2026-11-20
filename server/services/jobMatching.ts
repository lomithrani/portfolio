import type { Types } from 'mongoose';
import {
  LEGAL_VERSION,
  MATCHING_JOB_STATUSES,
  MATCHING_LIMITS,
  OPEN_JOB_STATUS,
  endedMatchExpiry,
  jobLiveInMatching,
  jobSnapshotsDiffer,
  keepsMatching,
  matchingJobProblem,
  matchingMessages,
  normalizeJobPosting,
  validateJobPosting
} from 'portfolio-common';
import type { JobPostingInput, JobStatus, MatchingReviewStatus } from 'portfolio-common';
import { env } from '../env';
import { JobPosting, Match, User } from '../models/database';
import type { JobPosting as StoredJobPosting } from '../models/database/jobPosting';
import { ConflictError, FieldValidationError, ResourceNotFoundError } from '../errors';
import { JOB_CHANGED, MATCHING_NEEDS_OPEN_JOB } from '../protocol';
import { warmOffice } from './commute';
import { JOB_NOT_FOUND, storedJobSnapshot, toJobPostingDto, toJobSnapshot } from './jobPostings';
import { reviewedVersion, versionNow } from './jobVersion';
import { userAcceptedCurrentTerms } from './legal';
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
 * What a job itself holds of being proposed to candidates now, as a MongoDB filter: open, in
 * matching and approved by a reviewer (portfolio-common's jobLiveInMatching). On hold, pending or
 * rejected: nobody. What reads the jobs proposed adds its recruiter's terms: liveJobsQuery
 */
export const LIVE_IN_MATCHING = {
  status: OPEN_JOB_STATUS,
  'matching.enabledAt': { $exists: true },
  'matching.review.status': 'approved'
} as const;

/**
 * Whether the stored job is proposed to candidates now: open, in matching, approved
 * (jobLiveInMatching), and its recruiter accepted the terms in force. After a LEGAL_VERSION bump a
 * recruiter's jobs are proposed to nobody, and decided on by nobody, until they accept the new
 * terms (as a job picked on a job step holds only while its recruiter has): a mutual interest never
 * reveals a portfolio to a recruiter who did not agree to what the terms ask of them then
 */
export async function isLiveInMatching(job: StoredJobPosting): Promise<boolean> {
  return jobLiveInMatching(job) && (await userAcceptedCurrentTerms(job.recruiter));
}

/**
 * The jobs proposed to candidates now (isLiveInMatching), as a MongoDB filter: LIVE_IN_MATCHING,
 * of the recruiters who accepted the terms in force, read once (the recruiters of the jobs live
 * now), never `except` (a candidate's own jobs, when they are a recruiter too)
 */
export async function liveJobsQuery(except?: string) {
  const recruiters = await JobPosting.distinct('recruiter', LIVE_IN_MATCHING);
  const accepted = await User.find(
    { _id: { $in: recruiters }, 'legalAcceptances.version': LEGAL_VERSION },
    { _id: 1 }
  ).lean<{ _id: Types.ObjectId }[]>();
  const ids = accepted.map((user) => user._id).filter((id) => String(id) !== except);
  return { ...LIVE_IN_MATCHING, recruiter: { $in: ids } };
}

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
 * 422 for a posting whose stored version breaks a rule a posting is saved under today (saved before
 * that rule was made tighter: a pay range wider than JOB_LIMITS.pay.maxRangeRatio times its bottom,
 * which a posting opened before that cap keeps): the first rule it breaks, as validateJobPosting
 * names it (`pay.max`...), or on `matching` when only the request schema refuses it (its version
 * would not read back: storedJobSnapshot). Matching proposes what a recruiter could save today, and
 * a mutual interest leads into the candidate's journey with its snapshot, read back with those
 * rules. Its recruiter saves it again in the editor (which shows an opened posting's range brought
 * down to the top it is scored with). POST /jobs's posting passed them already (validJobPosting)
 */
const requireCurrentRules = (job: StoredJobPosting) => {
  const { _id, createdAt, updatedAt, publishedAt, ...fields } = toJobPostingDto(job);
  const firstProblem = () => validateJobPosting(normalizeJobPosting(fields))[0];
  const problem = firstProblem();
  if (problem) throw new FieldValidationError(problem.field, () => firstProblem()?.message ?? '');
  if (!storedJobSnapshot(toJobSnapshot(job))) {
    throw new FieldValidationError('matching', () => matchingMessages.job.saveAgain);
  }
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
 * Puts the posting `job` (as read) into matching at `now`, with the review it enters with
 * (reviewOnEntry): what is checked first, then one write conditioned on the version read (its
 * `updatedAt`, which an edit changes and matching's own writes do not), so a review kept for that
 * version is never set on a posting edited meanwhile. Whether it was written (false: changed
 * meanwhile), or the stored posting when it was in matching already
 */
const enterMatching = async (recruiterId: string, job: StoredJobPosting, now: Date) => {
  if (job.status !== OPEN_JOB_STATUS) throw new ConflictError(MATCHING_NEEDS_OPEN_JOB);
  requireMatchingFields(job);
  requireCurrentRules(job);
  if (job.matching?.enabledAt) return job;
  await requireRoomInMatching(recruiterId);
  const { modifiedCount } = await JobPosting.updateOne(
    {
      _id: job._id,
      recruiter: recruiterId,
      status: OPEN_JOB_STATUS,
      updatedAt: job.updatedAt ?? null,
      'matching.enabledAt': { $exists: false }
    },
    { $set: { 'matching.enabledAt': now, 'matching.review': reviewOnEntry(job, now) } },
    { timestamps: false }
  );
  return modifiedCount > 0;
};

/**
 * Turns matching on or off for the posting `jobId` of `recruiterId` (PUT /jobs/:id/matching), and
 * answers the posting as it is then. 404 for a posting that is not theirs.
 *
 * On: only for an open posting (409 MATCHING_NEEDS_OPEN_JOB), that names its company and has a
 * description (422 on `company` or `description`), whose stored version passes the rules a posting
 * is saved under today (422: requireCurrentRules), within MATCHING_LIMITS.matchingJobsPerRecruiter
 * jobs in matching (409); already on, nothing is written. It is then sent for review (pending:
 * proposed to nobody until a reviewer approves it), unless it was approved or rejected before and
 * has not changed since (reviewOnEntry), and its office is looked up in the background
 * (jobMatchingWarmUp). Edited between the read and the write, it is read and checked again, once
 * (then 409 JOB_CHANGED). The terms in force are the recruiter routes' (requireRecruiterSpace).
 *
 * Off: in any status, whatever was set; the job leaves every feed at once, and the interests no
 * mutual interest came of go (afterMatchingOff). Its review stays, for when it is turned on again.
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
  let job = await reloadOwn(recruiterId, jobId);
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

  let entered = await enterMatching(recruiterId, job, now);
  if (entered === false) {
    // Changed meanwhile (edited, its status changed, or put in matching by another request): read
    // and checked again, once
    job = await reloadOwn(recruiterId, job._id);
    entered = await enterMatching(recruiterId, job, now);
    if (entered === false) throw new ConflictError(JOB_CHANGED);
  }
  if (entered !== true) return entered;
  const before = job.matching;
  await holdLimit(recruiterId, () =>
    // As it was before this request: off, with the review it had (or no matching at all)
    JobPosting.updateOne(
      { _id: job._id, 'matching.enabledAt': now },
      before?.review
        ? { $unset: { 'matching.enabledAt': 1 }, $set: { 'matching.review': before.review } }
        : { $unset: { matching: 1 } },
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
 * After matching was turned off for the job `jobId`: every interest no mutual interest came of goes
 * (a candidate's in the job, a recruiter's in a candidate for it), whether the other side answered
 * it with a pass or not answered it at all, since nothing is left for it to lead to; the passes stay
 * until they expire (MATCH_RETENTION), so turning matching off then on again proposes the job to no
 * candidate who passed it, nor a card its recruiter passed (an interest answered with a pass is not
 * proposed again either: the pass is kept); the mutual interests go on
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

/** The review a job in matching that `edited` is now holds no more: decided on another version */
const decidedOnAnotherVersion = (edited: StoredJobPosting) => {
  const review = edited.matching?.review;
  return (
    !!edited.matching?.enabledAt &&
    keepsMatching(edited.status) &&
    !!review &&
    review.status !== 'pending' &&
    review.version !== reviewedVersion(edited)
  );
};

/**
 * What an edit of a job in matching saves of its review with the posting (PUT /jobs/:id: `edited`,
 * the posting about to be saved), as paths of the stored document and their values: approved or
 * rejected on a version the posting no longer is, it is pending again in the same write, so its new
 * text is never proposed unreviewed, not even between the save and afterJobEdited (which sends it
 * back again from what is stored, for a decision taken while the edit ran). Nothing otherwise
 */
export const reviewSavedWithEdit = (edited: StoredJobPosting, now = new Date()): [string, unknown][] =>
  decidedOnAnotherVersion(edited)
    ? [
        ['matching.review.status', 'pending'],
        ['matching.review.requestedAt', now],
        ['matching.review.reason', undefined]
      ]
    : [];

/**
 * After an edit of the job (PUT /jobs/:id: `before` and `after` it, `after` as saved). Its terms
 * are locked once it is opened: what changes is what no criterion reads (its description...).
 * Decided from what is stored, not from the copy the edit loaded, which a request that ran
 * meanwhile (a reviewer's decision, matching turned on) may have made stale:
 * - Its review holds for the version decided on: a job in matching approved or rejected on another
 *   version than the one saved is sent for review again (pending: out of the feeds until a reviewer
 *   approves it); its decisions and mutual interests stay. A decision taken meanwhile on the
 *   version saved is not undone.
 * - A job in matching that matching cannot propose any more (its company taken out by an edit that
 *   started before it was put into matching) is taken out of it (afterMatchingOff).
 * - A snapshot never changes (each side keeps what it saw): a mutual interest whose snapshot is no
 *   longer the posting is marked changed (`changedAt`: the latest edit that changed the posting, or
 *   this one when none was marked yet); one the edit brings back to its snapshot is not any more. A
 *   snapshot that cannot be read counts as changed
 * Whether it changed the job (sent back for review, or out of matching): its posting is read again
 */
export async function afterJobEdited(before: StoredJobPosting, after: StoredJobPosting, now = new Date()): Promise<boolean> {
  let changed = false;
  if (keepsMatching(after.status) && matchingJobProblem(after)) {
    const { modifiedCount } = await JobPosting.updateOne(
      { _id: after._id, 'matching.enabledAt': { $exists: true } },
      { $unset: { 'matching.enabledAt': 1 } },
      { timestamps: false }
    );
    if (modifiedCount > 0) {
      await afterMatchingOff(after._id);
      changed = true;
    }
  }
  const { modifiedCount: sentBack } = await JobPosting.updateOne(
    {
      _id: after._id,
      status: { $in: MATCHING_JOB_STATUSES },
      'matching.enabledAt': { $exists: true },
      'matching.review.status': { $in: ['approved', 'rejected'] },
      'matching.review.version': { $ne: reviewedVersion(after) }
    },
    {
      $set: { 'matching.review.status': 'pending', 'matching.review.requestedAt': now },
      $unset: { 'matching.review.reason': 1 }
    },
    { timestamps: false }
  );
  changed ||= sentBack > 0;

  const active = await Match.find(
    { job: after._id, matchedAt: { $exists: true }, endedAt: { $exists: false } },
    { 'snapshot.posting': 1 }
  ).lean<{ _id: Types.ObjectId; snapshot?: { posting?: unknown } | null }[]>();
  if (active.length === 0) return changed;
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
  return changed;
}
