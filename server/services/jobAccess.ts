import { Types } from 'mongoose';
import { JobPosting, WorkflowInstance } from '../models/database';
import type { JobPosting as StoredJobPosting } from '../models/database/jobPosting';
import { ResourceNotFoundError } from '../errors';
import { JOB_NOT_FOUND, toJobPostingDto } from './jobPostings';
import type { JobPostingDto } from './jobPostings';
import { journeySteps } from './workflows';
import { jobStep, pickedJobId, storedShare } from './workflowSteps/job';

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
//   kept shows the posting as it is now.
// Anyone else, like an unknown id, gets the 404 of a posting that does not exist, never a 403:
// an id says nothing about the postings behind it. What is returned never names the recruiter.

/** Why the caller may read the posting */
export type JobAccess = 'recruiter' | 'journey';

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
 * What the recruiter stored on a job step of `ownerId`'s journey that picks the posting `jobId`
 * (the stored posting's own id, as the job step stores it: lower case, whatever the URL had): the
 * job steps of the journey the owner has now, and what they stored for that recruiter (their
 * progress is kept under each step's id, services/workflows.ts); undefined when none picks it
 */
async function pickOnJourney(
  ownerId: string,
  recruiterId: Types.ObjectId,
  jobId: string
): Promise<{ data: unknown } | undefined> {
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
  return picks.find(({ data }) => storedShare(data)) ?? picks[0];
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
  if (!pick) throw notFound();
  const posting = toJobPostingDto(job);
  const share = storedShare(pick.data);
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
