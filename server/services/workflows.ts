import { Types } from 'mongoose';
import {
  APPLICABLE_JOB_STATUS,
  DEFAULT_WORKFLOW_STEPS,
  isWorkflowStepType,
  normalizeDomainName,
  workflowStepsProblem
} from 'portfolio-common';
import type { JobStatus, WorkflowStepType } from 'portfolio-common';
import { Domain, JobPosting, Workflow, WorkflowInstance } from '../models/database';
import {
  ConflictError,
  DomainDoesNotExistError,
  FieldValidationError,
  ForbiddenError,
  JourneyStepLockedError,
  MissingAuthCookieError,
  ResourceNotFoundError
} from '../errors';
import { JOB_NOT_FOUND } from './jobPostings';
import { requireRecruiterSpace } from './recruiters';

// The hiring journey of a portfolio (plugins/workflows.ts): the steps its
// owner chose (Workflow), and where each visitor stands (WorkflowInstance).
// A step opens once every step before it is done; the routes behind a step
// (the job pick, the booking routes of plugins/appointments.ts) check it with
// assertStepOpen. The owner is never stopped by their own journey.

type Id = Types.ObjectId | string;

// ── DTOs ────────────────────────────────────────────────────

/** The job posting a visitor picked, as their journey shows it to them */
export interface JourneyJobDto {
  _id: string;
  title: string;
  /** The hiring company, when the posting names it */
  company?: string;
  status: JobStatus;
}

export interface JourneyStepDto {
  type: WorkflowStepType;
  /** The visitor completed it (always false for an anonymous visitor or the owner) */
  done: boolean;
}

/** GET /workflow/domains/:domainName: a portfolio's journey, as the caller stands in it */
export interface JourneyDto {
  /** The steps, in order */
  steps: JourneyStepDto[];
  /** The job posting the visitor picked (job step), while it is still theirs */
  job?: JourneyJobDto;
  /** The caller owns the portfolio: they preview their journey, which never stops them */
  own?: true;
}

// ── The owner's journey ─────────────────────────────────────

/** The owner's steps, in order; DEFAULT_WORKFLOW_STEPS until they choose */
export async function journeySteps(ownerId: Id): Promise<WorkflowStepType[]> {
  const workflow = await Workflow.findOne({ user: ownerId }, { steps: 1 }).lean();
  if (!workflow) return [...DEFAULT_WORKFLOW_STEPS];
  // A type this version does not know (written by a newer one) is left out
  return workflow.steps.map((step) => step.type).filter(isWorkflowStepType);
}

/**
 * Replaces the owner's steps (422 naming `steps` when workflowStepsProblem
 * refuses them). An upsert on the unique `user`: MongoDB retries it itself
 * when two first saves race, so the account keeps one journey
 */
export async function saveJourneySteps(ownerId: string, steps: WorkflowStepType[]): Promise<WorkflowStepType[]> {
  const problem = workflowStepsProblem(steps);
  if (problem) throw new FieldValidationError('steps', problem);
  await Workflow.updateOne(
    { user: ownerId },
    { $set: { steps: steps.map((type) => ({ type })) } },
    { upsert: true, runValidators: true }
  );
  return steps;
}

/** The owner of the portfolio `domainName`; 404 when there is none */
export async function portfolioOwner(domainName: string): Promise<string> {
  const domain = await Domain.findOne({ name: normalizeDomainName(domainName) }, { admin: 1 }).lean();
  if (!domain) throw new DomainDoesNotExistError('Domain not found');
  return String(domain.admin);
}

// ── A visitor's progress ────────────────────────────────────

interface Progress {
  done: Set<WorkflowStepType>;
  job?: JourneyJobDto;
}

const NO_PROGRESS: Progress = { done: new Set() };

/**
 * Where `visitorId` stands in the owner's journey. The job step is done
 * while the posting they picked is still theirs and open (closed or deleted
 * since: they pick another one)
 */
async function visitorProgress(ownerId: Id, visitorId: string): Promise<Progress> {
  const instance = await WorkflowInstance.findOne({ owner: ownerId, visitor: visitorId }).lean();
  if (!instance) return NO_PROGRESS;
  const job = instance.job
    ? await JobPosting.findOne({ _id: instance.job, recruiter: visitorId }, { title: 1, company: 1, status: 1 }).lean()
    : null;
  const done = new Set<WorkflowStepType>();
  if (job?.status === APPLICABLE_JOB_STATUS) done.add('job');
  if (instance.meetingBookedAt) done.add('meeting');
  return {
    done,
    ...(job
      ? {
          job: {
            _id: job._id.toString(),
            title: job.title,
            ...(job.company ? { company: job.company } : {}),
            status: job.status as JobStatus
          }
        }
      : {})
  };
}

/** A session's user id the queries can use; anything else is an anonymous visitor */
const knownVisitor = (visitorId: string | undefined) =>
  visitorId && Types.ObjectId.isValid(visitorId) ? visitorId : undefined;

/** The owner's journey as `visitorId` (undefined: not signed in) stands in it */
export async function journeyFor(ownerId: string, visitorId: string | undefined): Promise<JourneyDto> {
  const steps = await journeySteps(ownerId);
  const visitor = knownVisitor(visitorId);
  const own = visitor === ownerId;
  const progress = visitor && !own ? await visitorProgress(ownerId, visitor) : NO_PROGRESS;
  return {
    steps: steps.map((type) => ({ type, done: progress.done.has(type) })),
    ...(progress.job ? { job: progress.job } : {}),
    ...(own ? { own: true as const } : {})
  };
}

export const SIGN_IN_TO_CONTINUE = 'Sign in to continue the hiring journey';
export const EARLIER_STEPS_FIRST = 'Complete the earlier steps of the hiring journey first';

/**
 * Lets `visitorId` (undefined: not signed in) use `step` of the owner's
 * journey, or throws: `missing()` when the journey has no such step, 401
 * when steps come before it and nobody is signed in, 403 when one of them is
 * not done. The owner always passes. Returns the visitor's progress (with the
 * job they picked), empty when nothing had to be checked
 */
export async function assertStepOpen(
  ownerId: Id,
  visitorId: string | undefined,
  step: WorkflowStepType,
  missing: () => Error
): Promise<Pick<Progress, 'job'>> {
  const steps = await journeySteps(ownerId);
  const index = steps.indexOf(step);
  if (index === -1) throw missing();
  const visitor = knownVisitor(visitorId);
  if (visitor === String(ownerId) || index === 0) return {};
  if (!visitor) throw new MissingAuthCookieError(SIGN_IN_TO_CONTINUE);
  const progress = await visitorProgress(ownerId, visitor);
  if (!steps.slice(0, index).every((earlier) => progress.done.has(earlier))) {
    throw new JourneyStepLockedError(EARLIER_STEPS_FIRST);
  }
  return { job: progress.job };
}

// ── The steps ───────────────────────────────────────────────

export const NO_JOB_STEP = 'This hiring journey does not ask for a job';
export const JOB_NOT_OPEN = 'Only an open job description can be picked';

/**
 * Job step: the visitor picks one of their own open job postings for the
 * portfolio `domainName` (again: the latest pick counts). Needs a recruiter
 * space (403), a posting of theirs (404 otherwise, like any unknown id) that
 * is open (409), and a journey with a job step (409) whose earlier steps
 * they completed. Not on one's own portfolio (403)
 */
export async function pickJourneyJob(domainName: string, visitorId: string, jobId: string): Promise<JourneyDto> {
  const ownerId = await portfolioOwner(domainName);
  if (ownerId === visitorId) throw new ForbiddenError('You cannot pick a job for your own portfolio');
  await assertStepOpen(ownerId, visitorId, 'job', () => new ConflictError(NO_JOB_STEP));
  await requireRecruiterSpace(visitorId);
  const job = await JobPosting.findOne({ _id: jobId, recruiter: visitorId }, { status: 1 }).lean();
  if (!job) throw new ResourceNotFoundError(JOB_NOT_FOUND);
  if (job.status !== APPLICABLE_JOB_STATUS) throw new ConflictError(JOB_NOT_OPEN);
  // Unique (owner, visitor): MongoDB retries the upsert itself when two first picks race
  await WorkflowInstance.updateOne(
    { owner: ownerId, visitor: visitorId },
    { $set: { job: job._id, jobSelectedAt: new Date() } },
    { upsert: true }
  );
  return journeyFor(ownerId, visitorId);
}

/**
 * Meeting step: records a booking of a signed-in visitor who is going
 * through the owner's journey (who completed a step before it). Nothing
 * for anyone else: an open booking page keeps no trace of its visitors
 */
export async function recordMeetingBooked(ownerId: Id, visitorId: string | undefined): Promise<void> {
  const visitor = knownVisitor(visitorId);
  if (!visitor || visitor === String(ownerId)) return;
  await WorkflowInstance.updateOne({ owner: ownerId, visitor }, { $set: { meetingBookedAt: new Date() } });
}
