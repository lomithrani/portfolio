import Elysia, { t } from 'elysia';
import mongoose from 'mongoose';
import { APPLICABLE_JOB_STATUS, normalizeDomainName } from 'portfolio-common';
import { Domain, JobApplication, JobPosting } from '../models/database';
import type { JobPosting as StoredJobPosting } from '../models/database/jobPosting';
import { userLogged } from './userLogged';
import {
  ConflictError,
  DomainDoesNotExistError,
  ForbiddenError,
  ResourceNotFoundError,
  UnsupportedMediaTypeError
} from '../errors';
import {
  jobApplicantParams,
  jobApplicantRequest,
  jobPostingRequest,
  jobStatusRequest,
  objectIdParams
} from '../models/elysia';
import { requireRecruiterSpace } from '../services/recruiters';
import {
  JOB_NOT_FOUND,
  addApplication,
  applicantCounts,
  createJobPosting,
  findOwnJobPosting,
  findPublicJobPosting,
  jobPostingFields,
  listApplicants,
  publishedAtFor,
  toApplicantDtos,
  toJobPostingDto,
  validJobPosting
} from '../services/jobPostings';
import type {
  ApplicantDto,
  ApplicationStatusDto,
  JobPostingDto,
  RecruiterJobPostingDetailDto,
  RecruiterJobPostingDto
} from '../services/jobPostings';
import { logger } from '../services/logger';

// Job postings of the recruiter space, their applicants and the public job
// pages. Recruiter routes need a recruiter space (403 without one) and only
// ever find the caller's own postings: another recruiter's answers 404, like
// an unknown id, so ids leak nothing. Candidate routes need a session only;
// applying also needs a portfolio (a domain).

/** Most recent open postings of the public list */
const PUBLIC_JOBS_LIMIT = 100;

// POST /jobs/:id/application carries no data, but needs a JSON body all
// the same ({}): a POST without a body has no Content-Type, so it is a CORS
// simple request that another site can send with the session cookie and no
// preflight (app.ts refuses the other non-JSON bodies), which would apply on
// the candidate's behalf. A JSON body needs a preflight, which only the
// allowed origins pass. Checked on the header: Elysia turns a missing body
// into {} before validating it
const requireJsonBody = ({ request }: { request: Request }) => {
  if (!request.headers.get('content-type')) throw new UnsupportedMediaTypeError('Unsupported Media Type');
};

/** save() of a posting deleted meanwhile (e.g. in another tab): 404, like an unknown id */
const saveJobPosting = async (job: Awaited<ReturnType<typeof findOwnJobPosting>>) => {
  try {
    return await job.save();
  } catch (error) {
    if (error instanceof mongoose.Error.DocumentNotFoundError) {
      throw new ResourceNotFoundError(JOB_NOT_FOUND);
    }
    throw error;
  }
};

const jobsPublic = new Elysia()
  .get('/jobs', async (): Promise<{ jobs: JobPostingDto[] }> => {
    // Exactly the { status, updatedAt } index: no in-memory sort of every open posting
    const jobs = await JobPosting.find({ status: APPLICABLE_JOB_STATUS })
      .sort({ updatedAt: -1 })
      .limit(PUBLIC_JOBS_LIMIT)
      .lean<StoredJobPosting[]>();
    return { jobs: jobs.map(toJobPostingDto) };
  }, {
    detail: { summary: 'Open job postings, most recently updated first' }
  })
  .get('/jobs/:id', async ({ params: { id } }): Promise<JobPostingDto> =>
    toJobPostingDto(await findPublicJobPosting(id)), {
    params: objectIdParams,
    detail: { summary: 'A job posting (not a draft)' }
  });

const jobsRecruiter = new Elysia()
  .use(userLogged)
  // After the session and request checks: what needs a recruiter space
  .onBeforeHandle(async ({ userId }) => {
    await requireRecruiterSpace(userId);
  })
  .get('/recruiter/jobs', async ({ userId }): Promise<{ jobs: RecruiterJobPostingDto[] }> => {
    const jobs = await JobPosting.find({ recruiter: userId })
      .sort({ updatedAt: -1, _id: -1 })
      .lean<StoredJobPosting[]>();
    const counts = await applicantCounts(jobs.map((job) => job._id));
    return {
      jobs: jobs.map((job) => ({ ...toJobPostingDto(job), applicantCount: counts.get(job._id.toString()) ?? 0 }))
    };
  }, {
    detail: { summary: "The recruiter's job postings, most recently updated first" }
  })
  .get('/recruiter/jobs/:id', async ({ userId, params: { id } }): Promise<RecruiterJobPostingDetailDto> => {
    const job = await findOwnJobPosting(userId, id);
    return { ...toJobPostingDto(job.toObject<StoredJobPosting>()), applicants: await listApplicants(job._id) };
  }, {
    params: objectIdParams,
    detail: { summary: 'One of the recruiter\'s job postings, with its applicants (oldest first)' }
  })
  .post('/jobs', async ({ userId, body }): Promise<JobPostingDto> => {
    return toJobPostingDto(await createJobPosting(userId, validJobPosting(body)));
  }, {
    body: jobPostingRequest,
    detail: { summary: 'Add a job posting' }
  })
  .put('/jobs/:id', async ({ userId, params: { id }, body }): Promise<JobPostingDto> => {
    const fields = validJobPosting(body);
    const job = await findOwnJobPosting(userId, id);
    // Every field replaced: the optional ones left out are unset
    job.set(jobPostingFields(fields));
    job.publishedAt = publishedAtFor(fields.status, job.publishedAt);
    const saved = await saveJobPosting(job);
    return toJobPostingDto(saved.toObject<StoredJobPosting>());
  }, {
    params: objectIdParams,
    body: jobPostingRequest,
    detail: { summary: 'Edit a job posting' }
  })
  .put('/jobs/:id/status', async ({ userId, params: { id }, body: { status } }): Promise<JobPostingDto> => {
    const job = await findOwnJobPosting(userId, id);
    job.status = status;
    job.publishedAt = publishedAtFor(status, job.publishedAt);
    const saved = await saveJobPosting(job);
    return toJobPostingDto(saved.toObject<StoredJobPosting>());
  }, {
    params: objectIdParams,
    body: jobStatusRequest,
    detail: { summary: 'Change the status of a job posting' }
  })
  .delete('/jobs/:id', async ({ userId, params: { id } }) => {
    const job = await JobPosting.findOneAndDelete({ _id: id, recruiter: userId });
    if (!job) throw new ResourceNotFoundError(JOB_NOT_FOUND);
    // After the posting: a failure here leaves applications no route reaches,
    // never a posting without its applicants
    await JobApplication.deleteMany({ job: job._id }).catch((error: unknown) => {
      logger.error('Could not remove the applications of a deleted job posting', {
        errorName: error instanceof Error ? error.name : typeof error
      });
    });
    return { id };
  }, {
    params: objectIdParams,
    detail: { summary: 'Delete a job posting and its applicant list' }
  })
  .post('/jobs/:id/applicants', async ({ userId, params: { id }, body }): Promise<ApplicantDto> => {
    const job = await findOwnJobPosting(userId, id);
    const domain = await Domain.findOne({ name: normalizeDomainName(body.domain) }, { admin: 1 }).lean();
    if (!domain) throw new DomainDoesNotExistError('Domain not found');
    if (String(domain.admin) === userId) throw new ForbiddenError('You cannot add your own portfolio');
    const application = await addApplication(
      { job: job._id, candidate: String(domain.admin), domain: domain._id, source: 'added_by_recruiter' },
      'Already an applicant'
    );
    const [applicant] = await toApplicantDtos([application]);
    // The portfolio was just found: only a deletion meanwhile could get here
    if (!applicant) throw new DomainDoesNotExistError('Domain not found');
    return applicant;
  }, {
    params: objectIdParams,
    body: jobApplicantRequest,
    detail: { summary: 'Add a portfolio (by domain name) to the applicants of a job posting' }
  })
  .delete('/jobs/:id/applicants/:applicationId', async ({ userId, params: { id, applicationId } }) => {
    const job = await findOwnJobPosting(userId, id);
    const application = await JobApplication.findOneAndDelete({ _id: applicationId, job: job._id });
    if (!application) throw new ResourceNotFoundError('Applicant not found');
    return { id: applicationId };
  }, {
    params: jobApplicantParams,
    detail: { summary: 'Remove an applicant from a job posting' }
  });

const jobsCandidate = new Elysia()
  .use(userLogged)
  .get('/jobs/:id/application', async ({ userId, params: { id } }): Promise<ApplicationStatusDto> => {
    const job = await findPublicJobPosting(id);
    const application = await JobApplication.findOne({ job: job._id, candidate: userId }, { createdAt: 1, source: 1 }).lean();
    if (!application) return { applied: false };
    return { applied: true, appliedAt: application.createdAt, source: application.source };
  }, {
    params: objectIdParams,
    detail: { summary: 'Whether the caller is an applicant of a job posting' }
  })
  .post('/jobs/:id/application', async ({ userId, params: { id } }): Promise<ApplicationStatusDto> => {
    const job = await findPublicJobPosting(id);
    if (job.status !== APPLICABLE_JOB_STATUS) {
      throw new ConflictError('This job posting is not taking applications');
    }
    if (job.recruiter.toString() === userId) {
      throw new ForbiddenError('You cannot apply to your own job posting');
    }
    const domain = await Domain.findOne({ admin: userId }, { _id: 1 }).lean();
    if (!domain) throw new ForbiddenError('Claim a portfolio before applying');
    const application = await addApplication(
      { job: job._id, candidate: userId, domain: domain._id, source: 'applied' },
      'You already applied'
    );
    return { applied: true, appliedAt: application.createdAt, source: 'applied' };
  }, {
    params: objectIdParams,
    body: t.Object({}),
    beforeHandle: requireJsonBody,
    detail: { summary: 'Apply to an open job posting with your portfolio' }
  })
  .delete('/jobs/:id/application', async ({ userId, params: { id } }): Promise<ApplicationStatusDto> => {
    // Whatever the posting's status now, and whoever listed the caller
    const application = await JobApplication.findOneAndDelete({ job: id, candidate: userId });
    if (!application) throw new ResourceNotFoundError('You have not applied to this job posting');
    return { applied: false };
  }, {
    params: objectIdParams,
    detail: { summary: 'Withdraw your application to a job posting' }
  });

export const jobs = new Elysia()
  .use(jobsPublic)
  .use(jobsRecruiter)
  .use(jobsCandidate);
