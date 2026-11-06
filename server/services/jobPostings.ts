import type { Types } from 'mongoose';
import { JOB_LIMITS, PUBLIC_JOB_STATUSES, normalizeJobPosting, validateJobPosting } from 'portfolio-common';
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
import { Domain, JobApplication, JobPosting, User } from '../models/database';
import type { JobApplicationSource } from '../models/database';
import type { JobPosting as StoredJobPosting } from '../models/database/jobPosting';
import type { JobApplication as StoredJobApplication } from '../models/database/jobApplication';
import { ConflictError, FieldValidationError, ResourceNotFoundError } from '../errors';
import { isDuplicateKeyError } from './mongoErrors';

// Job postings of the recruiter space (plugins/jobs.ts): what the API returns
// for a posting and its applicants (explicit mappings: no internal field, no
// candidate email or Google data ever goes out), and the rules shared by the
// routes (validation, ownership, publication, applicant list).

// ── DTOs ────────────────────────────────────────────────────

/**
 * A job posting as the API returns it: the fields that are set, its id and dates. Never who
 * posted it: a public posting must not lead to its recruiter's account (and portfolio)
 */
export interface JobPostingDto extends JobPostingInput {
  _id: string;
  createdAt: Date;
  /** Also the version an edit starts from (PUT /jobs/:id's `updatedAt`) */
  updatedAt: Date;
  /** First time the posting left the draft status */
  publishedAt?: Date;
}

/** A posting of the public list (GET /jobs): without its description, which the list never shows */
export type JobPostingSummaryDto = Omit<JobPostingDto, 'description'>;

/** A posting of GET /recruiter/jobs */
export interface RecruiterJobPostingDto extends JobPostingDto {
  applicantCount: number;
}

/** A candidate on a posting's applicant list: their portfolio, never their email */
export interface ApplicantDto {
  /** The application's id (DELETE /jobs/:id/applicants/:applicationId) */
  _id: string;
  appliedAt: Date;
  source: JobApplicationSource;
  /**
   * The account's name, only when the candidate applied themselves: any
   * recruiter space can add any portfolio, and an account name is not
   * public (empty for source 'added_by_recruiter')
   */
  candidate: { name?: string; surname?: string };
  domain: { name: string; headerTitle?: string };
}

/** GET /recruiter/jobs/:id: the posting and its applicants, oldest first */
export interface RecruiterJobPostingDetailDto extends JobPostingDto {
  applicants: ApplicantDto[];
}

/** Where the caller stands on a posting (GET, POST, DELETE /jobs/:id/application) */
export interface ApplicationStatusDto {
  applied: boolean;
  appliedAt?: Date;
  source?: JobApplicationSource;
  /** GET only: the caller is the posting's recruiter (who cannot apply to it) */
  own?: true;
}

export const JOB_NOT_FOUND = 'Job posting not found';

/** 409 of an edit that started from an older version of the posting */
export const JOB_CHANGED = 'This job posting was changed since you opened it';

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

/** A posting of the public list, read without its description */
export function toJobPostingSummaryDto(job: Omit<StoredJobPosting, 'description'>): JobPostingSummaryDto {
  const { description: _description, ...summary } = toJobPostingDto({ ...job, description: '' });
  return summary;
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

const TOO_MANY_JOBS = `You can keep at most ${JOB_LIMITS.jobsPerRecruiter} job postings: delete one to add another`;

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
    throw new ConflictError(TOO_MANY_JOBS);
  }
  const job = await JobPosting.create({
    ...jobPostingFields(fields),
    recruiter: recruiterId,
    publishedAt: publishedAtFor(fields.status, undefined)
  });
  if ((await JobPosting.countDocuments({ recruiter: recruiterId })) > JOB_LIMITS.jobsPerRecruiter) {
    await JobPosting.deleteOne({ _id: job._id });
    throw new ConflictError(TOO_MANY_JOBS);
  }
  return job.toObject<StoredJobPosting>();
}

/** The recruiter's posting (a document, to change it); 404 when it is not theirs, never 403 */
export async function findOwnJobPosting(recruiterId: string, id: string) {
  const job = await JobPosting.findOne({ _id: id, recruiter: recruiterId });
  if (!job) throw new ResourceNotFoundError(JOB_NOT_FOUND);
  return job;
}

/** A posting anyone can see (not a draft); 404 otherwise */
export async function findPublicJobPosting(id: string) {
  const job = await JobPosting.findOne({ _id: id, status: { $in: [...PUBLIC_JOB_STATUSES] } }).lean<StoredJobPosting>();
  if (!job) throw new ResourceNotFoundError(JOB_NOT_FOUND);
  return job;
}

/** Applicant counts of these postings, in one aggregation */
export async function applicantCounts(jobIds: Types.ObjectId[]) {
  if (!jobIds.length) return new Map<string, number>();
  const counts = await JobApplication.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { job: { $in: jobIds } } },
    { $group: { _id: '$job', count: { $sum: 1 } } }
  ]);
  return new Map(counts.map(({ _id, count }) => [_id.toString(), count]));
}

// ── Applicants ──────────────────────────────────────────────

/**
 * Applicant DTOs of these applications (two lookups for all of them). An
 * application whose portfolio no longer exists is left out: domains are
 * never deleted today, so it can only be a leftover. Account names are read
 * for the candidates who applied themselves only (see ApplicantDto)
 */
export async function toApplicantDtos(applications: StoredJobApplication[]): Promise<ApplicantDto[]> {
  if (!applications.length) return [];
  const applied = applications.filter((application) => application.source === 'applied');
  const [users, domains] = await Promise.all([
    applied.length
      ? User.find({ _id: { $in: applied.map((application) => application.candidate) } }, { name: 1, surname: 1 }).lean()
      : [],
    Domain.find({ _id: { $in: applications.map((application) => application.domain) } }, { name: 1, headerTitle: 1 }).lean()
  ]);
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  const domainsById = new Map(domains.map((domain) => [String(domain._id), domain]));
  return applications.flatMap((application): ApplicantDto[] => {
    const domain = domainsById.get(application.domain.toString());
    if (!domain) return [];
    const user = application.source === 'applied' ? usersById.get(application.candidate.toString()) : undefined;
    return [
      {
        _id: application._id.toString(),
        appliedAt: application.createdAt,
        source: application.source as JobApplicationSource,
        candidate: withoutUnset({ name: user?.name || undefined, surname: user?.surname || undefined }),
        domain: withoutUnset({ name: domain.name, headerTitle: domain.headerTitle || undefined })
      }
    ];
  });
}

/** A posting's applicants, oldest first (at most JOB_LIMITS.applicantsPerJob) */
export async function listApplicants(jobId: Types.ObjectId | string) {
  const applications = await JobApplication.find({ job: jobId })
    .sort({ createdAt: 1, _id: 1 })
    .limit(JOB_LIMITS.applicantsPerJob)
    .lean<StoredJobApplication[]>();
  return toApplicantDtos(applications);
}

export interface NewApplication {
  job: Types.ObjectId;
  candidate: Types.ObjectId | string;
  domain: Types.ObjectId;
  source: JobApplicationSource;
}

const FULL_JOB = `This job posting has reached its limit of ${JOB_LIMITS.applicantsPerJob} applicants`;

/**
 * Lists a candidate on a posting. `duplicate` is the 409's message when they
 * already are (checked first, then by the unique index: concurrent requests
 * list them once). Refuses a full list (409), counted before and again after
 * the insert, like the postings of createJobPosting: applications arriving
 * at once never go over the limit. Answers 404 when the posting was deleted
 * meanwhile: its applications are removed with it, so one created after that
 * removal is taken back
 */
export async function addApplication(application: NewApplication, duplicate: string) {
  if (await JobApplication.exists({ job: application.job, candidate: application.candidate })) {
    throw new ConflictError(duplicate);
  }
  if ((await JobApplication.countDocuments({ job: application.job })) >= JOB_LIMITS.applicantsPerJob) {
    throw new ConflictError(FULL_JOB);
  }
  let created;
  try {
    created = await JobApplication.create(application);
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new ConflictError(duplicate);
    throw error;
  }
  const [posting, count] = await Promise.all([
    JobPosting.exists({ _id: application.job }),
    JobApplication.countDocuments({ job: application.job })
  ]);
  if (!posting || count > JOB_LIMITS.applicantsPerJob) {
    await JobApplication.deleteOne({ _id: created._id });
    throw posting ? new ConflictError(FULL_JOB) : new ResourceNotFoundError(JOB_NOT_FOUND);
  }
  return created.toObject<StoredJobApplication>();
}
