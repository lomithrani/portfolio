import { Types } from 'mongoose';
import { APPLICABLE_JOB_STATUS } from 'portfolio-common';
import type { JobStatus } from 'portfolio-common';
import { JobPosting } from '../../models/database';
import { ConflictError, FieldValidationError, ResourceNotFoundError } from '../../errors';
import { JOB_NOT_FOUND } from '../jobPostings';
import { requireRecruiterSpace } from '../recruiters';
import type { ServerStep, StepContext } from './types';
import { inputFields } from './types';

// Job step: the visitor (a recruiter) picks one of their own open job
// postings, again if they wish (the latest pick counts). The step holds
// while that posting is theirs and open: closed or deleted since, they pick
// another one.

export interface JobStepData {
  /** The id of the posting picked */
  job: string;
  selectedAt: Date;
}

/** The job posting a visitor picked, as their journey shows it to them */
export interface JourneyJobDto {
  _id: string;
  title: string;
  /** The hiring company, when the posting names it */
  company?: string;
  status: JobStatus;
}

export interface JobStepView {
  job: JourneyJobDto;
}

export const JOB_NOT_OPEN = 'Only an open job description can be picked';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const jobId = (value: unknown) => (typeof value === 'string' && OBJECT_ID.test(value) ? value : undefined);

type JobContext = StepContext<Record<string, never>, JobStepData>;

/** The posting the visitor picked, while it is still theirs */
const pickedJob = async ({ visitorId, data }: JobContext): Promise<JourneyJobDto | undefined> => {
  const id = jobId(data?.job);
  if (!id || !Types.ObjectId.isValid(visitorId)) return undefined;
  const job = await JobPosting.findOne({ _id: id, recruiter: visitorId }, { title: 1, company: 1, status: 1 }).lean();
  if (!job) return undefined;
  return {
    _id: job._id.toString(),
    title: job.title,
    ...(job.company ? { company: job.company } : {}),
    status: job.status as JobStatus
  };
};

export const jobStep: ServerStep<Record<string, never>, JobStepData, JobStepView> = {
  type: 'job',
  evaluate: async (ctx) => {
    const job = await pickedJob(ctx);
    return {
      status: job?.status === APPLICABLE_JOB_STATUS ? 'succeeded' : 'pending',
      ...(job ? { view: { job } } : {})
    };
  },
  /**
   * Needs a recruiter space (403) and a posting of theirs (404 otherwise,
   * like any unknown id) that is open (409)
   */
  submit: async ({ visitorId, input }) => {
    const id = jobId(inputFields(input)?.jobId);
    if (!id) throw new FieldValidationError('input.jobId', 'Pick one of your job descriptions');
    await requireRecruiterSpace(visitorId);
    const job = await JobPosting.findOne({ _id: id, recruiter: visitorId }, { status: 1 }).lean();
    if (!job) throw new ResourceNotFoundError(JOB_NOT_FOUND);
    if (job.status !== APPLICABLE_JOB_STATUS) throw new ConflictError(JOB_NOT_OPEN);
    return { job: job._id.toString(), selectedAt: new Date() };
  },
  // What the meeting is about
  describe: async ({ webOrigin, ...ctx }) => {
    const job = await pickedJob(ctx);
    if (!job) return [];
    return [
      `Job: ${job.company ? `${job.title} — ${job.company}` : job.title}`,
      ...(webOrigin ? [`${webOrigin}/jobs/${job._id}`] : [])
    ];
  }
};
