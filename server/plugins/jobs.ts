import Elysia from 'elysia';
import mongoose from 'mongoose';
import { JobPosting } from '../models/database';
import type { JobPosting as StoredJobPosting } from '../models/database/jobPosting';
import { userLogged } from './userLogged';
import { ConflictError, ResourceNotFoundError } from '../errors';
import { jobPostingCreateRequest, jobPostingEditRequest, jobStatusRequest, objectIdParams } from '../models/elysia';
import { requireRecruiterSpace } from '../services/recruiters';
import {
  JOB_NOT_FOUND,
  createJobPosting,
  findOwnJobPosting,
  jobPostingFields,
  publishedAtFor,
  requireOpenablePay,
  requireUnchangedTerms,
  validJobPosting
} from '../services/jobPostings';
import {
  afterJobDeleted,
  afterJobEdited,
  afterJobStatusChange,
  afterMatchingOff,
  entersMatchingAtCreation,
  leavesMatchingOnEdit,
  newJobMatching,
  requireMatchingKept,
  settleCreatedInMatching,
  toRecruiterJobDto
} from '../services/jobMatching';
import type { RecruiterJobPostingDto } from '../services/jobMatching';
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
// Matching (Path 2): a posting can be created in it (POST /jobs's `matching`),
// and what a status change, an edit or a deletion does to its matches is
// services/jobMatching.ts's, whatever the MATCHING flag (the switch itself,
// PUT /jobs/:id/matching, is plugins/matches.ts's: 404 while it is off).

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

/** A saved posting as it is now, once what its change did to matching changed it (else as saved) */
const currentPosting = async (saved: StoredJobPosting, changed: boolean) =>
  (changed && (await JobPosting.findById(saved._id).lean<StoredJobPosting>())) || saved;

export const jobs = new Elysia()
  .use(userLogged)
  // After the session and request checks: what needs a recruiter space (and the terms in force)
  .onBeforeHandle(async ({ userId }) => {
    await requireRecruiterSpace(userId);
  })
  .get('/recruiter/jobs', async ({ userId }): Promise<{ jobs: RecruiterJobPostingDto[] }> => {
    const jobs = await JobPosting.find({ recruiter: userId })
      .sort({ updatedAt: -1, _id: -1 })
      .lean<StoredJobPosting[]>();
    return { jobs: jobs.map(toRecruiterJobDto) };
  }, {
    detail: { summary: "The recruiter's job postings, most recently updated first" }
  })
  .get('/recruiter/jobs/:id', async ({ userId, params: { id } }): Promise<RecruiterJobPostingDto> => {
    const job = await findOwnJobPosting(userId, id);
    return toRecruiterJobDto(job.toObject<StoredJobPosting>());
  }, {
    params: objectIdParams,
    detail: { summary: 'One of the recruiter\'s job postings' }
  })
  .post('/jobs', async ({ userId, body }): Promise<RecruiterJobPostingDto> => {
    const { matching, ...posting } = body;
    const fields = validJobPosting(posting);
    // Checked before anything is written: only an open posting that names its company, within the
    // jobs a recruiter can have in matching (ignored while MATCHING is off)
    const inMatching = await entersMatchingAtCreation(userId, fields, matching);
    const job = await createJobPosting(userId, fields, inMatching ? newJobMatching() : undefined);
    if (inMatching) await settleCreatedInMatching(userId, job);
    return toRecruiterJobDto(job);
  }, {
    body: jobPostingCreateRequest,
    detail: {
      summary: 'Add a job posting, proposed to candidates through matching when `matching` is true (an open posting that names its company)'
    }
  })
  .put('/jobs/:id', async ({ userId, params: { id }, body }): Promise<RecruiterJobPostingDto> => {
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
    const before = job.toObject<StoredJobPosting>();
    requireUnchangedTerms(before, fields);
    // In matching and staying in it: it keeps its company and its description (422)
    requireMatchingKept(before, fields);
    if (!job.publishedAt) job.$where = { ...job.$where, publishedAt: null };
    // Every field replaced: the optional ones left out are unset (matching is not one of them)
    job.set(jobPostingFields(fields));
    job.publishedAt = publishedAtFor(fields.status, job.publishedAt);
    // While MATCHING is off, an edit that leaves matching nothing to propose takes it out instead
    const leavesMatching = leavesMatchingOnEdit(before, fields);
    if (leavesMatching) job.set('matching.enabledAt', undefined);
    const saved = (await saveJobPosting(job)).toObject<StoredJobPosting>();
    if (leavesMatching) await afterMatchingOff(saved._id);
    const closed = await afterJobStatusChange(saved._id, fields.status);
    const sentBack = await afterJobEdited(before, saved);
    return toRecruiterJobDto(await currentPosting(saved, closed || sentBack));
  }, {
    params: objectIdParams,
    body: jobPostingEditRequest,
    detail: {
      summary: 'Edit a job posting (409 when it changed since `updatedAt`, or when it changes the terms of a posting opened before)'
    }
  })
  .put('/jobs/:id/status', async ({ userId, params: { id }, body: { status } }): Promise<RecruiterJobPostingDto> => {
    const job = await findOwnJobPosting(userId, id);
    // Opened for the first time: a range saved wider than the cap is narrowed first (422)
    requireOpenablePay(job, status);
    job.status = status;
    job.publishedAt = publishedAtFor(status, job.publishedAt);
    const saved = (await saveJobPosting(job)).toObject<StoredJobPosting>();
    // Filled, closed or back to draft: out of matching, its decisions dropped, its mutual interests ended
    return toRecruiterJobDto(await currentPosting(saved, await afterJobStatusChange(saved._id, status)));
  }, {
    params: objectIdParams,
    body: jobStatusRequest,
    detail: {
      summary: 'Change the status of a job posting (422 on `pay.max` when it opens one whose pay range is wider than the cap); filled, closed or back to draft, it leaves matching'
    }
  })
  .delete('/jobs/:id', async ({ userId, params: { id } }) => {
    const job = await JobPosting.findOneAndDelete({ _id: id, recruiter: userId });
    if (!job) throw new ResourceNotFoundError(JOB_NOT_FOUND);
    // The versions of it the recruiter shared on hiring journeys go with it (the job step keeps
    // one, which nothing reads once the posting is gone): the step is to do again, as it was
    const jobId = job._id.toString();
    await dropVisitorProgress(userId, (data) => pickedJobId(data) === jobId);
    // Its matches too: decisions, mutual interests and what each side saw
    await afterJobDeleted(job._id);
    return { id };
  }, {
    params: objectIdParams,
    detail: { summary: 'Delete a job posting' }
  });
