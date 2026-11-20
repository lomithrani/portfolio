import type { Types } from 'mongoose';
import { MATCHING_LIMITS, changedLockedFields, emailDomainOf, parseReviewReason } from 'portfolio-common';
import type { JobFieldPath, JobSnapshot, JobStatus, MatchingReviewDecision, MatchingReviewStatus } from 'portfolio-common';
import { env } from '../env';
import { JobPosting, User } from '../models/database';
import type { JobPosting as StoredJobPosting } from '../models/database/jobPosting';
import { ConflictError, FieldValidationError, ForbiddenError, ResourceNotFoundError } from '../errors';
import { JOB_CHANGED, NOT_A_MATCHING_REVIEWER } from '../protocol';
import { reviewedVersion } from './jobMatching';
import type { MatchingReviewDto } from './jobMatching';
import { JOB_NOT_FOUND, toJobPostingDto, toJobSnapshot } from './jobPostings';
import type { JobPostingDto } from './jobPostings';
import { logger } from './logger';
import { hashValue } from './rateLimit';

// The review of the jobs put into matching (Path 2, behind MATCHING): a
// reviewer, one of the operator's MATCHING_REVIEWERS, reads each job by hand
// before it reaches any candidate, and approves it or says why not. Only an
// approved job is proposed (portfolio-common's jobLiveInMatching); a review
// holds for the version of the posting it was of (reviewedVersion: changed
// since, the job is pending again, services/jobMatching.ts).
//
// A reviewer reads what judging a posting needs: the posting, the email
// domain of its recruiter (who is behind it), a key that tells the jobs of one
// recruiter apart from another's, and that recruiter's other jobs in matching,
// now or lately, with those that are near-duplicates of it and the terms they
// differ in: a recruiter who puts copies of a job that differ in one term into
// matching (the pay, the office) to learn candidates' floors or areas from
// the cards each copy gets is told apart from one who posts several jobs.
// Only the jobs still stored, of that account: a copy deleted before the next
// is put into matching, or posted from another account, is not shown (nothing
// of a deleted job is kept for this; each copy is reviewed all the same, and
// reads one card at a time). Never a candidate's data, and never the
// recruiter's name or address. No
// reviewer is named to anyone, nor stored: the decision keeps when it was
// taken and on which version.

/** The days of a recruiter's past jobs in matching a reviewer reads beside each job (see recruitersJobs) */
export const REVIEW_HISTORY_DAYS = 90;
/** The most of a recruiter's other jobs a reviewer reads beside each job, the latest created first */
export const REVIEW_HISTORY_JOBS = 20;

/** Another job of the same recruiter, as a reviewer compares it with the job under review */
export interface RecruiterOtherJobDto {
  _id: string;
  title: string;
  company: string | null;
  status: JobStatus;
  location: JobPostingDto['location'];
  pay: JobPostingDto['pay'];
  contract: JobPostingDto['contract'];
  createdAt: Date;
  /** In matching now */
  inMatching: boolean;
  /** Where its review stands (null: never reviewed) */
  review: MatchingReviewStatus | null;
  /**
   * The same company and title as the job under review, or the same description: a copy of it,
   * as a probe of candidates would be (one term changed)
   */
  nearDuplicate: boolean;
  /** For a near-duplicate, the terms it differs in (LOCKED_JOB_FIELDS: what the criteria read) */
  differsIn: JobFieldPath[];
}

/** A job pending review, as a reviewer reads it (GET /matching/reviews) */
export interface ReviewedJobDto {
  job: JobPostingDto;
  /**
   * Who is behind it: the domain of the recruiter's email address (null when it has none), and a
   * key standing for the recruiter (the same for all their jobs, never their id), so that the jobs
   * of one account at a common domain are told apart from those of others
   */
  recruiter: { emailDomain: string | null; key: string };
  /**
   * The recruiter's other jobs in matching now, or put into matching and created or sent for review
   * in the last REVIEW_HISTORY_DAYS days, REVIEW_HISTORY_JOBS at most, the latest created first
   */
  otherJobs: RecruiterOtherJobDto[];
  /** Since when it is in matching */
  matchingSince: Date;
  review: MatchingReviewDto;
  /**
   * The version read (reviewedVersion): what PUT /matching/reviews/:id decides on, refused (409)
   * once the posting changed since
   */
  version: string;
}

/** What PUT /matching/reviews/:id takes */
export interface ReviewInput {
  decision: MatchingReviewDecision;
  reason?: string;
  version: string;
}

/**
 * 403 (NOT_A_MATCHING_REVIEWER) unless the account `userId` is a reviewer: its email is one of
 * MATCHING_REVIEWERS (none set: nobody is)
 */
export async function requireMatchingReviewer(userId: string): Promise<void> {
  if (env.matchingReviewers.size > 0) {
    const user = await User.findById(userId, { email: 1 }).lean<{ email?: string | null }>();
    const email = user?.email?.trim().toLowerCase();
    if (email && env.matchingReviewers.has(email)) return;
  }
  throw new ForbiddenError(NOT_A_MATCHING_REVIEWER);
}

/** The key standing for a recruiter in the reviewers' list: keyed (hashValue), never their id */
export const reviewerRecruiterKey = (recruiterId: Types.ObjectId | string) => hashValue(`review:${String(recruiterId)}`).slice(0, 12);

/** Text compared without case, accents or extra spaces */
const folded = (text: string | null | undefined) =>
  (text ?? '').normalize('NFKD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Whether two postings are copies of each other: the same company and title, or the same description */
const nearDuplicates = (a: JobSnapshot, b: JobSnapshot) =>
  (folded(a.company) !== '' && folded(a.company) === folded(b.company) && folded(a.title) === folded(b.title)) ||
  (folded(a.description) !== '' && folded(a.description) === folded(b.description));

/** `other`, a job of the same recruiter, as a reviewer compares it with `job` */
const toOtherJob = (job: StoredJobPosting, other: StoredJobPosting): RecruiterOtherJobDto => {
  const [mine, theirs] = [toJobSnapshot(job), toJobSnapshot(other)];
  const nearDuplicate = nearDuplicates(mine, theirs);
  return {
    _id: String(other._id),
    title: theirs.title,
    company: theirs.company ?? null,
    status: other.status as JobStatus,
    location: theirs.location,
    pay: theirs.pay,
    contract: theirs.contract,
    createdAt: other.createdAt,
    inMatching: !!other.matching?.enabledAt,
    review: (other.matching?.review?.status as MatchingReviewStatus | undefined) ?? null,
    nearDuplicate,
    differsIn: nearDuplicate ? changedLockedFields(mine, theirs) : []
  };
};

/**
 * The other jobs of the recruiters `recruiterIds` a reviewer reads beside theirs (one query): in
 * matching now, or put into matching (a review kept) and created or sent for review in the last
 * REVIEW_HISTORY_DAYS days, the latest created first, by recruiter
 */
const recruitersJobs = async (recruiterIds: readonly Types.ObjectId[], now: Date) => {
  const since = new Date(now.getTime() - REVIEW_HISTORY_DAYS * 24 * 60 * 60_000);
  const jobs = await JobPosting.find({
    recruiter: { $in: recruiterIds },
    'matching.review': { $exists: true },
    $or: [
      { 'matching.enabledAt': { $exists: true } },
      { createdAt: { $gte: since } },
      { 'matching.review.requestedAt': { $gte: since } }
    ]
  })
    .sort({ createdAt: -1, _id: -1 })
    .lean<StoredJobPosting[]>();
  const byRecruiter = new Map<string, StoredJobPosting[]>();
  for (const job of jobs) {
    const key = String(job.recruiter);
    byRecruiter.set(key, [...(byRecruiter.get(key) ?? []), job]);
  }
  return byRecruiter;
};

/** A job in matching as a reviewer reads it, its recruiter's email being `recruiterEmail`, beside their `others` */
const toReviewedJob = (
  job: StoredJobPosting,
  recruiterEmail: string | null | undefined,
  others: readonly StoredJobPosting[]
): ReviewedJobDto => {
  const review = job.matching?.review;
  return {
    job: toJobPostingDto(job),
    recruiter: { emailDomain: emailDomainOf(recruiterEmail), key: reviewerRecruiterKey(job.recruiter) },
    otherJobs: others
      .filter((other) => !other._id.equals(job._id))
      .slice(0, REVIEW_HISTORY_JOBS)
      .map((other) => toOtherJob(job, other)),
    matchingSince: job.matching!.enabledAt!,
    review: {
      status: (review?.status ?? 'pending') as MatchingReviewDto['status'],
      requestedAt: review?.requestedAt ?? job.matching!.enabledAt!,
      reviewedAt: review?.reviewedAt ?? null,
      reason: review?.status === 'rejected' ? (review.reason ?? null) : null
    },
    version: reviewedVersion(job)
  };
};

/**
 * The jobs in matching waiting for a review (GET /matching/reviews), the oldest request first,
 * MATCHING_LIMITS.reviewsPerRead at most (the next ones once those are decided), each beside its
 * recruiter's other jobs in matching (toReviewedJob)
 */
export async function pendingReviews(now = new Date()): Promise<{ jobs: ReviewedJobDto[] }> {
  const jobs = await JobPosting.find({
    'matching.enabledAt': { $exists: true },
    'matching.review.status': 'pending'
  })
    .sort({ 'matching.review.requestedAt': 1, _id: 1 })
    .limit(MATCHING_LIMITS.reviewsPerRead)
    .lean<StoredJobPosting[]>();
  const recruiterIds = jobs.map((job) => job.recruiter as Types.ObjectId);
  const [recruiters, others] = await Promise.all([
    User.find({ _id: { $in: recruiterIds } }, { email: 1 }).lean<{ _id: unknown; email?: string | null }[]>(),
    recruitersJobs(recruiterIds, now)
  ]);
  const emails = new Map(recruiters.map((user) => [String(user._id), user.email]));
  return {
    jobs: jobs.map((job) => toReviewedJob(job, emails.get(String(job.recruiter)), others.get(String(job.recruiter)) ?? []))
  };
}

/** The reason of a decision refused, read again in the language in use */
const reasonRefusal = (decision: MatchingReviewDecision, reason: unknown) => {
  const result = parseReviewReason(decision, reason);
  return result.ok ? '' : result.message;
};

/**
 * Decides on the job `jobId` in matching (PUT /matching/reviews/:id), as the version `version` a
 * reviewer read: approved (proposed to the candidates whose criteria it meets) or rejected with a
 * reason its recruiter reads. 422 on `reason` (required to reject, MATCHING_LIMITS.reviewReason
 * characters at most), 404 for a job that is not in matching (or not one), 409 JOB_CHANGED once the
 * posting is no longer the version read (it changed, or changes meanwhile). Any job in matching can
 * be decided on again, pending or not. Logs the job's id and the decision, nothing else
 */
export async function reviewJob(jobId: string, input: ReviewInput, now = new Date()): Promise<ReviewedJobDto> {
  const parsed = parseReviewReason(input.decision, input.reason);
  if (!parsed.ok) throw new FieldValidationError('reason', () => reasonRefusal(input.decision, input.reason));
  const inMatching = { _id: jobId, 'matching.enabledAt': { $exists: true } };
  const job = await JobPosting.findOne(inMatching).lean<StoredJobPosting>();
  if (!job) throw new ResourceNotFoundError(JOB_NOT_FOUND);
  if (reviewedVersion(job) !== input.version) throw new ConflictError(JOB_CHANGED);

  const status = input.decision === 'approve' ? 'approved' : 'rejected';
  // Conditioned on the version stored (an edit changes `updatedAt`, matching's own writes do not)
  const { modifiedCount } = await JobPosting.updateOne(
    { ...inMatching, updatedAt: job.updatedAt },
    {
      $set: {
        'matching.review': {
          status,
          requestedAt: job.matching?.review?.requestedAt ?? now,
          reviewedAt: now,
          version: input.version,
          ...(parsed.reason ? { reason: parsed.reason } : {})
        }
      }
    },
    { timestamps: false }
  );
  if (modifiedCount === 0) {
    if (!(await JobPosting.exists(inMatching))) throw new ResourceNotFoundError(JOB_NOT_FOUND);
    throw new ConflictError(JOB_CHANGED);
  }
  logger.info('Matching: job reviewed', { jobId, decision: input.decision });
  const [reviewed, recruiter, others] = await Promise.all([
    JobPosting.findById(jobId).lean<StoredJobPosting>(),
    User.findById(job.recruiter, { email: 1 }).lean<{ email?: string | null }>(),
    recruitersJobs([job.recruiter as Types.ObjectId], now)
  ]);
  return toReviewedJob(reviewed ?? job, recruiter?.email, others.get(String(job.recruiter)) ?? []);
}
