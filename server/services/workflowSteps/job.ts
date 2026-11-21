import { Types } from 'mongoose';
import { JOB_STEP_LIMITS, OPEN_JOB_STATUS, jobSnapshotsDiffer, opportunityPath } from 'portfolio-common';
import type { JobSnapshot, JobStatus } from 'portfolio-common';
import { JobPosting } from '../../models/database';
import type { JobPosting as StoredJobPosting } from '../../models/database/jobPosting';
import { ConflictError, FieldValidationError, ResourceNotFoundError, TooManyRequestsError } from '../../errors';
import { JOB_OF_MUTUAL_INTEREST } from '../../protocol';
import { JOB_NOT_FOUND, storedJobSnapshot, toJobSnapshot } from '../jobPostings';
import { versionNow } from '../jobVersion';
import { userAcceptedCurrentTerms } from '../legal';
import type { MutualInterest } from '../mutualInterests';
import { rateLimitKey, takeRateLimit } from '../rateLimit';
import type { RateLimit } from '../rateLimit';
import { requireRecruiterSpace } from '../recruiters';
import type { ServerStep, StepContext } from './types';
import { inputFields, storedDate } from './types';
import { m } from './steps.messages';

// Job step: the visitor (a recruiter) shares one of their own open job
// postings, again if they wish (the latest share counts). The step keeps the
// version shared (a JobSnapshot): what the owner reads on the job's private
// page (services/jobAccess.ts), what the job match after it scores and what
// the meeting invitation names. Editing the posting changes none of them
// until the recruiter shares it again; the step tells them when it changed
// since (anything the owner reads of it: its terms are locked once the posting
// is opened, so in practice its description or a field no criterion reads).
// Sharing it again unchanged is nothing new: not counted, the version kept as
// it is. The step holds while that posting is theirs and open, and while they
// have accepted the terms in force: closed or deleted since, they pick another
// one (a posting deleted takes its versions with it: plugins/jobs.ts); after a
// change of the terms, they accept them again (the step's list asks for them,
// like every recruiter route) before the journey goes on. A pick stored before
// versions were kept (no `posting`), or one this version would not save, holds
// nothing: the recruiter shares the job again.
//
// A job can also come from matching (Path 2): when the owner and the recruiter
// are both interested in one of the recruiter's jobs, the step holds that job,
// the version the owner said yes to (services/matches.ts stores it here, with
// the mutual interest's id, `match`), and the recruiter cannot share another
// while the mutual interest lasts (409). It holds from the mutual interest
// itself (ctx.mutualInterest), whatever is stored, so a journey edited since
// (its job step removed and added again: a new id, nothing stored) still
// holds it; once the mutual interest ends, or while MATCHING is off, what it
// stored holds nothing and the recruiter shares a job as anyone does.

export interface JobStepData {
  /** The id of the posting shared */
  job: string;
  /** When it was shared */
  selectedAt: Date;
  /** The posting's `updatedAt` when it was shared: the version's date */
  version: Date;
  /** The version shared */
  posting: JobSnapshot;
  /**
   * The mutual interest of matching that filled the step (its id): the job the owner and the
   * recruiter are both interested in. Unset for a job the recruiter shared
   */
  match?: string;
}

/** The job posting a visitor shared, as their journey shows it to them */
export interface JourneyJobDto {
  _id: string;
  /** The version shared's (the posting's own when no version is kept) */
  title: string;
  /** The hiring company, when the version shared names it */
  company?: string;
  /** The posting's, now */
  status: JobStatus;
  /** When the version the step keeps was shared; unset when it keeps none (to share again) */
  sharedAt?: Date;
  /**
   * The posting differs from the version shared, in anything the owner reads of it (its status
   * aside): the owner still reads, and the job match still scores, the version shared, until the
   * recruiter shares the new one
   */
  outdated?: true;
}

export interface JobStepView {
  job: JourneyJobDto;
  /**
   * The job is the one the owner and the recruiter are both interested in (matching): the step
   * holds it while the mutual interest lasts, and the recruiter cannot share another
   */
  matched?: true;
}

// Not a message: the client tells this 409 from its text (/open job/ in pickJobFailure of
// client/src/services/workflow.ts) and says it in its own words: it stays in English (protocol.ts)
export const JOB_NOT_OPEN = 'Only an open job description can be picked';

/**
 * Shares one recruiter can make on one owner's job step per UTC day while a job match scores them
 * (portfolio-common's JOB_STEP_LIMITS): each one is a score, and trying many versions of a job
 * would tell the recruiter more of the owner's criteria than a score is meant to
 */
export const JOB_SHARES_PER_DAY: RateLimit = {
  limit: JOB_STEP_LIMITS.scoredSharesPerDay,
  windowMs: 24 * 60 * 60_000
};

/** The counter of `visitorId`'s shares on `ownerId`'s journey (keyed by a hash: rateLimitKey) */
export const jobSharesKey = (ownerId: string, visitorId: string) => rateLimitKey('job-share', `${ownerId}:${visitorId}`);

// The step type that scores the job shared here (server/services/workflowSteps/jobMatch.ts, which
// imports this file: named, not imported)
const SCORING_STEP = 'job-match';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const jobId = (value: unknown) => (typeof value === 'string' && OBJECT_ID.test(value) ? value : undefined);

/**
 * The id of the posting a job step's stored `data` picked, when it holds one: for what reads a
 * visitor's pick outside the journey (services/jobAccess.ts: the owner reads the job picked on
 * their journey)
 */
export const pickedJobId = (data: unknown): string | undefined =>
  jobId((data as Partial<JobStepData> | null | undefined)?.job);

/** A share as a job step stored it, when it is a whole one (this version's: a valid version kept) */
export interface StoredShare {
  job: string;
  sharedAt: Date;
  version: Date;
  posting: JobSnapshot;
}

/**
 * The share a job step's stored `data` holds: the posting's id, when it was shared and the version
 * shared, checked again (storedJobSnapshot); undefined for a pick stored before versions were
 * kept (legacyPick), or anything this version would not have stored
 */
export const storedShare = (data: unknown): StoredShare | undefined => {
  const job = pickedJobId(data);
  const { selectedAt, version, posting } = (data ?? {}) as Partial<Record<keyof JobStepData, unknown>>;
  const sharedAt = storedDate(selectedAt);
  const versionDate = storedDate(version);
  const snapshot = storedJobSnapshot(posting);
  return job && sharedAt && versionDate && snapshot ? { job, sharedAt, version: versionDate, posting: snapshot } : undefined;
};

/** The mutual interest a job step's stored `data` was filled by (its id), when it was one */
export const matchOfShare = (data: unknown): string | undefined => {
  const match = (data as Partial<JobStepData> | null | undefined)?.match;
  return typeof match === 'string' && OBJECT_ID.test(match) ? match : undefined;
};

/**
 * What the job step stores for the recruiter of a mutual interest in the owner's journey
 * (services/matches.ts): the version the owner said yes to, shared when they both became
 * interested, with the mutual interest's id. Undefined for a version that no longer checks out
 */
export const mutualInterestShare = (interest: MutualInterest): JobStepData | undefined =>
  interest.posting
    ? {
        job: interest.job,
        selectedAt: interest.matchedAt,
        version: interest.version,
        posting: interest.posting,
        match: interest._id
      }
    : undefined;

/**
 * A pick stored before the step kept the version shared: the posting's id and when, without a
 * `version` or a `posting`. Only the job's private page reads it (services/jobAccess.ts: the
 * posting as it is now, which invitations sent before link); the step holds nothing with it.
 * Anything else without a valid version is not one: it fails closed everywhere
 */
export const legacyPick = (data: unknown): boolean => {
  if (!pickedJobId(data)) return false;
  const fields = data as Record<string, unknown>;
  return !Object.hasOwn(fields, 'version') && !Object.hasOwn(fields, 'posting');
};

type JobContext = StepContext<Record<string, never>, JobStepData>;

/** The posting the visitor picked, while it is still theirs, with the share the step keeps of it */
const pickedJob = async ({ visitorId, data }: JobContext) => {
  const id = pickedJobId(data);
  if (!id || !Types.ObjectId.isValid(visitorId)) return undefined;
  const posting = await JobPosting.findOne({ _id: id, recruiter: visitorId }).lean<StoredJobPosting>();
  if (!posting) return undefined;
  const share = storedShare(data);
  // What the owner reads: the version shared, else the posting as it is
  const { title, company } = share?.posting ?? posting;
  const job: JourneyJobDto = {
    _id: posting._id.toString(),
    title,
    ...(company ? { company } : {}),
    status: posting.status as JobStatus,
    ...(share ? { sharedAt: share.sharedAt } : {}),
    ...(share && jobSnapshotsDiffer(share.posting, versionNow(posting)) ? { outdated: true as const } : {})
  };
  return { job, share };
};

/** The version a visitor shared on a job step, for a later step that works on it */
export interface SharedJob {
  /** The posting's id */
  _id: string;
  sharedAt: Date;
  posting: JobSnapshot;
}

/**
 * The version a visitor shared on a job step, from what that step stored (`data`), while the
 * posting is still theirs and they have accepted the terms in force (as the job step holds a
 * share): for a later step that works on it (the job match, which scores nothing for a recruiter
 * who has not accepted them again). Undefined without a valid version kept: the step is to do again
 */
export const pickedSnapshot = async (visitorId: string, data: unknown): Promise<SharedJob | undefined> => {
  const share = storedShare(data);
  // What a mutual interest stored holds only while it leads here, and is then read from it
  if (!share || matchOfShare(data) || !Types.ObjectId.isValid(visitorId)) return undefined;
  if (!(await userAcceptedCurrentTerms(visitorId))) return undefined;
  if (!(await JobPosting.exists({ _id: share.job, recruiter: visitorId }))) return undefined;
  return { _id: share.job, sharedAt: share.sharedAt, posting: share.posting };
};

/**
 * The job of the mutual interest `interest` as the step shows it, and whether it holds: the version
 * the owner said yes to (read back), the posting still the recruiter's and open, and the recruiter
 * having accepted the terms in force, as for a job shared
 */
const matchedJob = async (interest: MutualInterest, visitorId: string) => {
  const posting = await JobPosting.findOne({ _id: interest.job, recruiter: visitorId }, { status: 1 }).lean<
    Pick<StoredJobPosting, '_id' | 'status'>
  >();
  if (!posting || !interest.posting) return undefined;
  const { title, company } = interest.posting;
  const job: JourneyJobDto = {
    _id: interest.job,
    title,
    ...(company ? { company } : {}),
    status: posting.status as JobStatus,
    sharedAt: interest.matchedAt
  };
  return { job, holds: job.status === OPEN_JOB_STATUS && (await userAcceptedCurrentTerms(visitorId)) };
};

/** The link of a job's private page on the web app `webOrigin` (none without one) */
const jobLink = (id: string, webOrigin: string | undefined) => (webOrigin ? [`${webOrigin}${opportunityPath(id)}`] : []);

/**
 * What the meeting invitation says of a mutual interest of matching: its job (the version the owner
 * said yes to), that they are both interested in it, and its private page. The job step's lines;
 * the engine's too when the journey has no job step before the meeting (services/workflows.ts: the
 * owner removed it since), so the invitation always names the job they met over
 */
export const mutualInterestLines = (interest: MutualInterest, webOrigin?: string): string[] => {
  if (!interest.posting) return [];
  const { title, company } = interest.posting;
  return [m.job.invitation(title, company), m.job.mutualInterest, ...jobLink(interest.job, webOrigin)];
};

export const jobStep: ServerStep<Record<string, never>, JobStepData, JobStepView> = {
  type: 'job',
  evaluate: async (ctx) => {
    if (ctx.mutualInterest) {
      const matched = await matchedJob(ctx.mutualInterest, ctx.visitorId);
      if (!matched) return { status: 'pending' };
      return { status: matched.holds ? 'succeeded' : 'pending', view: { job: matched.job, matched: true } };
    }
    // Stored by a mutual interest that no longer leads here (ended, or MATCHING off): holds nothing
    if (matchOfShare(ctx.data)) return { status: 'pending' };
    const picked = await pickedJob(ctx);
    const holds =
      !!picked?.share && picked.job.status === OPEN_JOB_STATUS && (await userAcceptedCurrentTerms(ctx.visitorId));
    return {
      status: holds ? 'succeeded' : 'pending',
      ...(picked ? { view: { job: picked.job } } : {})
    };
  },
  /**
   * Needs a recruiter space (403) with the terms in force (422 on `consent`:
   * services/recruiters.ts), no mutual interest with the owner leading here
   * (409 JOB_OF_MUTUAL_INTEREST: its job holds the step while it lasts), and a
   * posting of theirs (404 otherwise, like any unknown id) that is open (409)
   * and passes today's rules (422 on
   * `input.jobId` for one saved under older ones). On a journey that scores it
   * (a job match after this step), at most JOB_SHARES_PER_DAY shares (429
   * beyond). Stores the version shared; the version kept, shared again
   * unchanged, is nothing new: kept as it is (its date too), not counted
   */
  submit: async ({ ownerId, visitorId, input, later, data, mutualInterest }) => {
    const id = jobId(inputFields(input)?.jobId);
    if (!id) throw new FieldValidationError('input.jobId', () => m.job.pickOne);
    await requireRecruiterSpace(visitorId);
    // The job they are both interested in holds the step while their mutual interest lasts
    if (mutualInterest) throw new ConflictError(JOB_OF_MUTUAL_INTEREST);
    const posting = await JobPosting.findOne({ _id: id, recruiter: visitorId }).lean<StoredJobPosting>();
    if (!posting) throw new ResourceNotFoundError(JOB_NOT_FOUND);
    if (posting.status !== OPEN_JOB_STATUS) throw new ConflictError(JOB_NOT_OPEN);
    // Read back as the step reads it (a posting saved under older rules may not pass them): a
    // version the step would not hold is refused now, rather than stored and never holding
    const snapshot = storedJobSnapshot(toJobSnapshot(posting));
    if (!snapshot) throw new FieldValidationError('input.jobId', () => m.job.cannotShare);
    // Picked again as it was shared (the step selects the job kept): nothing new to share or score.
    // Not what a mutual interest stored, which held nothing once it ended: shared now, it is new
    const kept = matchOfShare(data) ? undefined : storedShare(data);
    if (kept && kept.job === posting._id.toString() && !jobSnapshotsDiffer(kept.posting, snapshot)) {
      return { job: kept.job, selectedAt: kept.sharedAt, version: kept.version, posting: kept.posting };
    }
    if (later.some((step) => step.type === SCORING_STEP)) {
      const { retryAfterSeconds } = await takeRateLimit(jobSharesKey(ownerId, visitorId), JOB_SHARES_PER_DAY);
      if (retryAfterSeconds !== null) {
        throw new TooManyRequestsError(() => m.job.tooManyShares(JOB_SHARES_PER_DAY.limit), retryAfterSeconds);
      }
    }
    const selectedAt = new Date();
    // (A posting has its dates: written by hand without them, the share is dated instead)
    return { job: posting._id.toString(), selectedAt, version: storedDate(posting.updatedAt) ?? selectedAt, posting: snapshot };
  },
  // What the meeting is about (the version shared), and the job's private page (web client's
  // /opportunities/:id): the owner reads that version there signed in, its recruiter is sent on to
  // their own page of it; anyone else the invitation reaches reads that it is not shared with them
  // (services/jobAccess.ts)
  // A job of a mutual interest says so, between the two
  describe: async ({ webOrigin, ...ctx }) => {
    const { mutualInterest } = ctx;
    if (mutualInterest) return mutualInterestLines(mutualInterest, webOrigin);
    if (matchOfShare(ctx.data)) return [];
    const picked = await pickedJob(ctx);
    if (!picked?.share) return [];
    const { title, company } = picked.share.posting;
    return [m.job.invitation(title, company), ...jobLink(picked.job._id, webOrigin)];
  }
};
