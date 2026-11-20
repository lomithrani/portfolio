import Elysia from 'elysia';
import mongoose from 'mongoose';
import { JobPosting } from '../models/database';
import type { JobPosting as StoredJobPosting } from '../models/database/jobPosting';
import { userLogged } from './userLogged';
import { ConflictError, ResourceNotFoundError } from '../errors';
import { jobPostingEditRequest, jobPostingRequest, jobStatusRequest, objectIdParams } from '../models/elysia';
import { requireRecruiterSpace } from '../services/recruiters';
import {
  JOB_NOT_FOUND,
  createJobPosting,
  findOwnJobPosting,
  jobPostingFields,
  publishedAtFor,
  requireOpenablePay,
  requireUnchangedTerms,
  toJobPostingDto,
  validJobPosting
} from '../services/jobPostings';
import type { JobPostingDto } from '../services/jobPostings';
import { dropVisitorProgress } from '../services/workflows';
import { pickedJobId } from '../services/workflowSteps/job';
import { JOB_CHANGED } from '../protocol';

// Job postings of the recruiter space. Every route needs a recruiter space
// (403 without one) with the terms in force (422 on `consent`:
// services/recruiters.ts) and only ever finds the caller's own postings:
// another recruiter's answers 404, like an unknown id, so ids leak nothing.
// There is no public job page or list: a recruiter shows a job description
// by picking it on a candidate's Hire page (the job step). Once opened, a
// posting's terms (what the perfect job scores) are locked: an edit that
// changes them answers 409 (services/jobPostings.ts, requireUnchangedTerms).
// Deleting a posting deletes the versions of it shared on journeys too.

/**
 * save() of a posting that matched nothing: deleted meanwhile (e.g. in another tab), a 404 like
 * an unknown id; else changed meanwhile, a 409. save() filters on the version it loaded when an
 * edit replaces a list (Mongoose's VersionError) and on `$where` (PUT /jobs/:id's `updatedAt`,
 * and a posting never opened still being so)
 */
const saveJobPosting = async (job: Awaited<ReturnType<typeof findOwnJobPosting>>) => {
  try {
    return await job.save();
  } catch (error) {
    if (error instanceof mongoose.Error.DocumentNotFoundError || error instanceof mongoose.Error.VersionError) {
      if (!(await JobPosting.exists({ _id: job._id }))) throw new ResourceNotFoundError(JOB_NOT_FOUND);
      throw new ConflictError(JOB_CHANGED);
    }
    throw error;
  }
};

export const jobs = new Elysia()
  .use(userLogged)
  // After the session and request checks: what needs a recruiter space (and the terms in force)
  .onBeforeHandle(async ({ userId }) => {
    await requireRecruiterSpace(userId);
  })
  .get('/recruiter/jobs', async ({ userId }): Promise<{ jobs: JobPostingDto[] }> => {
    const jobs = await JobPosting.find({ recruiter: userId })
      .sort({ updatedAt: -1, _id: -1 })
      .lean<StoredJobPosting[]>();
    return { jobs: jobs.map(toJobPostingDto) };
  }, {
    detail: { summary: "The recruiter's job postings, most recently updated first" }
  })
  .get('/recruiter/jobs/:id', async ({ userId, params: { id } }): Promise<JobPostingDto> => {
    const job = await findOwnJobPosting(userId, id);
    return toJobPostingDto(job.toObject<StoredJobPosting>());
  }, {
    params: objectIdParams,
    detail: { summary: 'One of the recruiter\'s job postings' }
  })
  .post('/jobs', async ({ userId, body }): Promise<JobPostingDto> => {
    return toJobPostingDto(await createJobPosting(userId, validJobPosting(body)));
  }, {
    body: jobPostingRequest,
    detail: { summary: 'Add a job posting' }
  })
  .put('/jobs/:id', async ({ userId, params: { id }, body }): Promise<JobPostingDto> => {
    const { updatedAt, ...posting } = body;
    const fields = validJobPosting(posting);
    const job = await findOwnJobPosting(userId, id);
    // An edit of the version it started from only: saved over a posting changed since (status
    // set in another tab...), it would undo that change. Refused before anything else (the
    // posting may have been opened since: the editor reloads it), then save() matches nothing
    // should it change meanwhile: 409 either way
    if (updatedAt !== undefined) {
      const version = new Date(updatedAt);
      if (job.updatedAt?.getTime() !== version.getTime()) throw new ConflictError(JOB_CHANGED);
      job.$where = { updatedAt: version };
    }
    // Opened before: its terms stay as they are (409). Never opened: saved only while it still
    // is not (null also matches a missing field), so an edit without `updatedAt` cannot change
    // the terms of a posting opened meanwhile (PUT /jobs/:id/status): save() matches nothing, 409
    requireUnchangedTerms(job.toObject<StoredJobPosting>(), fields);
    if (!job.publishedAt) job.$where = { ...job.$where, publishedAt: null };
    // Every field replaced: the optional ones left out are unset
    job.set(jobPostingFields(fields));
    job.publishedAt = publishedAtFor(fields.status, job.publishedAt);
    const saved = await saveJobPosting(job);
    return toJobPostingDto(saved.toObject<StoredJobPosting>());
  }, {
    params: objectIdParams,
    body: jobPostingEditRequest,
    detail: {
      summary: 'Edit a job posting (409 when it changed since `updatedAt`, or when it changes the terms of a posting opened before)'
    }
  })
  .put('/jobs/:id/status', async ({ userId, params: { id }, body: { status } }): Promise<JobPostingDto> => {
    const job = await findOwnJobPosting(userId, id);
    // Opened for the first time: a range saved wider than the cap is narrowed first (422)
    requireOpenablePay(job, status);
    job.status = status;
    job.publishedAt = publishedAtFor(status, job.publishedAt);
    const saved = await saveJobPosting(job);
    return toJobPostingDto(saved.toObject<StoredJobPosting>());
  }, {
    params: objectIdParams,
    body: jobStatusRequest,
    detail: {
      summary: 'Change the status of a job posting (422 on `pay.max` when it opens one whose pay range is wider than the cap)'
    }
  })
  .delete('/jobs/:id', async ({ userId, params: { id } }) => {
    const job = await JobPosting.findOneAndDelete({ _id: id, recruiter: userId });
    if (!job) throw new ResourceNotFoundError(JOB_NOT_FOUND);
    // The versions of it the recruiter shared on hiring journeys go with it (the job step keeps
    // one, which nothing reads once the posting is gone): the step is to do again, as it was
    const jobId = job._id.toString();
    await dropVisitorProgress(userId, (data) => pickedJobId(data) === jobId);
    return { id };
  }, {
    params: objectIdParams,
    detail: { summary: 'Delete a job posting' }
  });
