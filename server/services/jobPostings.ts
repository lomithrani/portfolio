import { JOB_LIMITS, normalizeJobPosting, validateJobPosting } from 'portfolio-common';
import type {
  ContractType,
  EducationLevel,
  JobCountry,
  JobPostingInput,
  JobStatus,
  PayCurrency,
  PayPeriod,
  SeniorityLevel,
  TravelFrequency,
  WorkMode,
  WorkingTimeArrangement
} from 'portfolio-common';
import { JobPosting } from '../models/database';
import type { JobPosting as StoredJobPosting } from '../models/database/jobPosting';
import { ConflictError, FieldValidationError, ResourceNotFoundError } from '../errors';
import { m } from './jobPostings.messages';

// Job postings of the recruiter space (plugins/jobs.ts): what the API returns
// for a posting (an explicit mapping: no internal field, never its recruiter),
// and the rules shared by the routes (validation, ownership, publication).

// ── DTOs ────────────────────────────────────────────────────

/**
 * A job posting as the API returns it: the fields that are set, its id and dates. Never who
 * posted it: a posting shown to a candidate (the job step of their hiring journey) must not lead
 * to its recruiter's account
 */
export interface JobPostingDto extends JobPostingInput {
  _id: string;
  createdAt: Date;
  /** Also the version an edit starts from (PUT /jobs/:id's `updatedAt`) */
  updatedAt: Date;
  /** First time the posting left the draft status */
  publishedAt?: Date;
}

/**
 * 404 for a posting that does not exist or is not the caller's. Not a message: the client matches
 * it (isJobPostingGone of recruiter.ts, pickJobFailure of workflow.ts), so it stays in English
 * (see protocol.ts)
 */
export const JOB_NOT_FOUND = 'Job posting not found';

/** `value` without its unset keys (null or undefined, as MongoDB and Mongoose leave them) */
const withoutUnset = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined)) as {
    [K in keyof T]: Exclude<T[K], null>;
  };

/** A copy of a stored list (Mongoose arrays stay inside); undefined when unset */
const listOf = (items: readonly string[] | null | undefined) => (items ? [...items] : undefined);

/** The nested object, unless none of its fields is set */
const unlessEmpty = <T extends object>(value: T) => (Object.keys(value).length ? value : undefined);

/** A stored job posting (lean, or a document's toObject()) as the API returns it */
export function toJobPostingDto(job: StoredJobPosting): JobPostingDto {
  const { location, contract, workingTime, pay, organization, requirements } = job;
  return withoutUnset({
    _id: job._id.toString(),
    title: job.title,
    description: job.description,
    company: job.company,
    status: job.status as JobStatus,
    openings: job.openings,
    location: withoutUnset({
      country: location.country as JobCountry,
      city: location.city,
      address: location.address,
      postalCode: location.postalCode,
      workMode: location.workMode as WorkMode,
      remoteDaysPerWeek: location.remoteDaysPerWeek
    }),
    contract: withoutUnset({
      type: contract.type as ContractType,
      durationMonths: contract.durationMonths,
      startDate: contract.startDate,
      trialPeriodMonths: contract.trialPeriodMonths,
      collectiveAgreement: contract.collectiveAgreement
    }),
    workingTime: withoutUnset({
      arrangement: workingTime.arrangement as WorkingTimeArrangement,
      hoursPerWeek: workingTime.hoursPerWeek,
      daysPerYear: workingTime.daysPerYear,
      rttDaysPerYear: workingTime.rttDaysPerYear
    }),
    pay: withoutUnset({
      min: pay.min,
      max: pay.max,
      currency: pay.currency as PayCurrency,
      period: pay.period as PayPeriod,
      variable: pay.variable
    }),
    organization: organization
      ? unlessEmpty(
          withoutUnset({
            directReports: organization.directReports,
            peers: organization.peers,
            levelsToCeo: organization.levelsToCeo
          })
        )
      : undefined,
    requirements: requirements
      ? unlessEmpty(
          withoutUnset({
            seniority: requirements.seniority as SeniorityLevel | null | undefined,
            education: requirements.education as EducationLevel | null | undefined,
            skills: listOf(requirements.skills),
            languages: listOf(requirements.languages)
          })
        )
      : undefined,
    benefits: listOf(job.benefits),
    travel: job.travel as TravelFrequency | null | undefined,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    publishedAt: job.publishedAt
  });
}

// ── Postings ────────────────────────────────────────────────

/**
 * The posting as it is stored (portfolio-common's normalisation), or the
 * first rule it breaks as a 422 naming the field (FieldValidationError)
 */
export function validJobPosting(body: JobPostingInput): JobPostingInput {
  const job = normalizeJobPosting(body);
  const [problem] = validateJobPosting(job);
  if (problem) throw new FieldValidationError(problem.field, problem.message);
  return job;
}

/**
 * Every field of a posting, the optional ones left out set to undefined:
 * set() on a stored posting then unsets them (PUT replaces the whole posting)
 */
export const jobPostingFields = (job: JobPostingInput) => ({
  title: job.title,
  description: job.description,
  company: job.company,
  status: job.status,
  openings: job.openings,
  location: job.location,
  contract: job.contract,
  workingTime: job.workingTime,
  pay: job.pay,
  organization: job.organization,
  requirements: job.requirements,
  benefits: job.benefits,
  travel: job.travel
});

/** When a posting with this status was first published: now, the first time it leaves draft */
export const publishedAtFor = (status: JobStatus, publishedAt: Date | null | undefined) =>
  publishedAt ?? (status === 'draft' ? undefined : new Date());

const tooManyJobs = () => m.tooManyJobs(JOB_LIMITS.jobsPerRecruiter);

/**
 * Stores a new posting of the recruiter, who keeps at most
 * JOB_LIMITS.jobsPerRecruiter (409 beyond). Counted before (the usual
 * refusal, nothing written) and again after the insert: creations that
 * arrive at once and together go over the limit take theirs back, so it
 * holds whatever the number of parallel requests (at the boundary they may
 * all be refused; a retry then gets the place)
 */
export async function createJobPosting(recruiterId: string, fields: JobPostingInput) {
  if ((await JobPosting.countDocuments({ recruiter: recruiterId })) >= JOB_LIMITS.jobsPerRecruiter) {
    throw new ConflictError(tooManyJobs);
  }
  const job = await JobPosting.create({
    ...jobPostingFields(fields),
    recruiter: recruiterId,
    publishedAt: publishedAtFor(fields.status, undefined)
  });
  if ((await JobPosting.countDocuments({ recruiter: recruiterId })) > JOB_LIMITS.jobsPerRecruiter) {
    await JobPosting.deleteOne({ _id: job._id });
    throw new ConflictError(tooManyJobs);
  }
  return job.toObject<StoredJobPosting>();
}

/** The recruiter's posting (a document, to change it); 404 when it is not theirs, never 403 */
export async function findOwnJobPosting(recruiterId: string, id: string) {
  const job = await JobPosting.findOne({ _id: id, recruiter: recruiterId });
  if (!job) throw new ResourceNotFoundError(JOB_NOT_FOUND);
  return job;
}
