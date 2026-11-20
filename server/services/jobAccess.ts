import { Types } from 'mongoose';
import { env } from '../env';
import { JobPosting, WorkflowInstance } from '../models/database';
import type { JobPosting as StoredJobPosting } from '../models/database/jobPosting';
import { ResourceNotFoundError } from '../errors';
import { JOB_NOT_FOUND, toJobPostingDto } from './jobPostings';
import type { JobPostingDto } from './jobPostings';
import { proposedJobPosting } from './matchFeeds';
import { journeySteps } from './workflows';
import { jobStep, legacyPick, pickedJobId, storedShare } from './workflowSteps/job';
import type { StoredShare } from './workflowSteps/job';

// Who may read a job posting outside the recruiter space: the page the meeting invitation of a
// hiring journey links (the web client's /opportunities/:id, plugins/opportunities.ts). One rule,
// here, for every way a posting reaches a candidate. Today:
// - 'recruiter': the posting's own recruiter, whatever its status (draft included): the client
//   sends them on to their page of it in the recruiter space;
// - 'journey': a portfolio owner on whose journey the recruiter picked it, as the current pick of
//   a job step of the journey they have now (a later pick, a step removed or a posting deleted
//   ends it), whatever its status but draft (a draft is its recruiter's alone). They read the
//   version the recruiter shared there (the job step keeps it: an edit of the posting reaches them
//   once shared again), with the posting's status and dates; a pick stored before versions were
//   kept (legacyPick: the job's id and when, nothing else) shows the posting as it is now, which
//   invitations sent before link, and a version that no longer checks out shows nothing (the
//   404 below), as the job step holds nothing with it;
// - 'feed' (matching, Path 2, while MATCHING is on): a candidate to whom the job is proposed now,
//   as their feed shows it (services/matchFeeds.ts: live in matching, meeting their criteria and
//   their minimum, its recruiter not having passed them), whatever they answered of it. They
//   read the posting as it is now, as their feed scores it.
// Anyone else, like an unknown id, gets the 404 of a posting that does not exist, never a 403:
// an id says nothing about the postings behind it. What is returned never names the recruiter.

/** Why the caller may read the posting */
export type JobAccess = 'recruiter' | 'journey' | 'feed';

/** GET /opportunities/jobs/:id: the posting and why the caller reads it */
export interface SharedJobPostingDto {
  /**
   * For `access: 'journey'`, the version the recruiter shared (its `updatedAt`: the version's
   * date), with the posting's id, status and other dates
   */
  job: JobPostingDto;
  access: JobAccess;
  /** `access: 'journey'`: when the recruiter shared the version `job` is (unset: the posting now) */
  sharedAt?: Date;
}

const isObjectId = (value: string) => Types.ObjectId.isValid(value) && /^[0-9a-fA-F]{24}$/.test(value);

/**
 * The pick of the posting `jobId` (the stored posting's own id, as the job step stores it: lower
 * case, whatever the URL had) by its recruiter on a job step of `ownerId`'s journey: the job steps
 * of the journey the owner has now, and what they stored for that recruiter (their progress is
 * kept under each step's id, services/workflows.ts). With the version shared (`share`), or without
 * one for a pick stored before versions were kept; undefined when none picks it, or none of its
 * picks is either
 */
async function pickOnJourney(
  ownerId: string,
  recruiterId: Types.ObjectId,
  jobId: string
): Promise<{ share?: StoredShare } | undefined> {
  const instance = await WorkflowInstance.findOne({ owner: ownerId, visitor: recruiterId }, { steps: 1 }).lean();
  if (!instance?.steps) return undefined;
  // A Map in the schema, a plain object once read with lean(): looked up as a Map, so a step id is
  // never read off an object's prototype
  const progress = new Map(Object.entries(instance.steps));
  const steps = await journeySteps(ownerId);
  const picks = steps.flatMap((step) => {
    const data: unknown = step.type === jobStep.type ? progress.get(step.id)?.data : undefined;
    return pickedJobId(data) === jobId ? [{ data }] : [];
  });
  // The pick that keeps a version, when one does
  const share = picks.map(({ data }) => storedShare(data)).find((kept) => kept !== undefined);
  if (share) return { share };
  return picks.some(({ data }) => legacyPick(data)) ? {} : undefined;
}

/**
 * The posting `jobId` as `userId` may read it, and why (JobAccess); 404 (JOB_NOT_FOUND) to anyone
 * else, like an id no posting has
 */
export async function readableJobPosting(userId: string, jobId: string): Promise<SharedJobPostingDto> {
  const notFound = () => new ResourceNotFoundError(JOB_NOT_FOUND);
  if (!isObjectId(userId) || !isObjectId(jobId)) throw notFound();
  const job = await JobPosting.findById(jobId).lean<StoredJobPosting>();
  if (!job) throw notFound();
  if (String(job.recruiter) === userId) return { job: toJobPostingDto(job), access: 'recruiter' };
  if (job.status === 'draft') throw notFound();
  const pick = await pickOnJourney(userId, job.recruiter, String(job._id));
  if (!pick) {
    const proposed = env.matchingEnabled ? await proposedJobPosting(userId, job) : null;
    if (proposed) return { job: proposed, access: 'feed' };
    throw notFound();
  }
  const posting = toJobPostingDto(job);
  const { share } = pick;
  if (!share) return { job: posting, access: 'journey' };
  const { _id, status, createdAt, publishedAt } = posting;
  return {
    job: {
      ...share.posting,
      _id,
      status,
      createdAt,
      updatedAt: share.version,
      ...(publishedAt ? { publishedAt } : {})
    },
    access: 'journey',
    sharedAt: share.sharedAt
  };
}
