import { MATCHING_LIMITS, emailDomainOf, parseReviewReason } from 'portfolio-common';
import type { MatchingReviewDecision } from 'portfolio-common';
import { env } from '../env';
import { JobPosting, User } from '../models/database';
import type { JobPosting as StoredJobPosting } from '../models/database/jobPosting';
import { ConflictError, FieldValidationError, ForbiddenError, ResourceNotFoundError } from '../errors';
import { JOB_CHANGED, NOT_A_MATCHING_REVIEWER } from '../protocol';
import { reviewedVersion } from './jobMatching';
import type { MatchingReviewDto } from './jobMatching';
import { JOB_NOT_FOUND, toJobPostingDto } from './jobPostings';
import type { JobPostingDto } from './jobPostings';
import { logger } from './logger';

// The review of the jobs put into matching (Path 2, behind MATCHING): a
// reviewer, one of the operator's MATCHING_REVIEWERS, reads each job by hand
// before it reaches any candidate, and approves it or says why not. Only an
// approved job is proposed (portfolio-common's jobLiveInMatching); a review
// holds for the version of the posting it was of (reviewedVersion: changed
// since, the job is pending again, services/jobMatching.ts).
//
// A reviewer reads what judging a posting needs: the posting, and the email
// domain of its recruiter (who is behind it); never a candidate's data, and
// never the recruiter's name or address. No reviewer is named to anyone, nor
// stored: the decision keeps when it was taken and on which version.

/** A job pending review, as a reviewer reads it (GET /matching/reviews) */
export interface ReviewedJobDto {
  job: JobPostingDto;
  /** The domain of the recruiter's email address (who is behind the job); null when it has none */
  recruiter: { emailDomain: string | null };
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

/** A job in matching as a reviewer reads it, its recruiter's email being `recruiterEmail` */
const toReviewedJob = (job: StoredJobPosting, recruiterEmail: string | null | undefined): ReviewedJobDto => {
  const review = job.matching?.review;
  return {
    job: toJobPostingDto(job),
    recruiter: { emailDomain: emailDomainOf(recruiterEmail) },
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
 * MATCHING_LIMITS.reviewsPerRead at most (the next ones once those are decided)
 */
export async function pendingReviews(): Promise<{ jobs: ReviewedJobDto[] }> {
  const jobs = await JobPosting.find({
    'matching.enabledAt': { $exists: true },
    'matching.review.status': 'pending'
  })
    .sort({ 'matching.review.requestedAt': 1, _id: 1 })
    .limit(MATCHING_LIMITS.reviewsPerRead)
    .lean<StoredJobPosting[]>();
  const recruiters = await User.find({ _id: { $in: jobs.map((job) => job.recruiter) } }, { email: 1 }).lean<
    { _id: unknown; email?: string | null }[]
  >();
  const emails = new Map(recruiters.map((user) => [String(user._id), user.email]));
  return { jobs: jobs.map((job) => toReviewedJob(job, emails.get(String(job.recruiter)))) };
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
  const [reviewed, recruiter] = await Promise.all([
    JobPosting.findById(jobId).lean<StoredJobPosting>(),
    User.findById(job.recruiter, { email: 1 }).lean<{ email?: string | null }>()
  ]);
  return toReviewedJob(reviewed ?? job, recruiter?.email);
}
