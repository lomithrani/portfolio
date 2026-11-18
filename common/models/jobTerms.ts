// The terms of a job posting: the fields a candidate's perfect job scores (perfectJob.ts's
// JOB_FIELD_CRITERIA), which are locked once the posting is opened, so that the match a candidate
// saw stays the match of the job they read. Shared by the API (PUT /jobs/:id answers 409 when an
// opened posting's terms change) and the job editor (their inputs are read-only once opened, and
// opening a posting is confirmed first).
import { highestPayMax } from './jobPosting';
import { JOB_FIELD_CRITERIA, JOB_FIELD_PATHS } from './perfectJob';
import type { JobFieldPath, JobPostingInput, JobStatus } from './jobPosting';

/**
 * The fields of a posting locked once it is opened: every field a criterion of the perfect job
 * reads (a non-empty list in JOB_FIELD_CRITERIA), so the list follows the criteria. The
 * description, the company, the benefits and the other fields no criterion reads stay editable,
 * and so does the status.
 */
export const LOCKED_JOB_FIELDS: readonly JobFieldPath[] = JOB_FIELD_PATHS.filter(
	(path) => JOB_FIELD_CRITERIA[path].length > 0
);

/** A posting's dates, as the API returns them or the client holds them */
type Published = { publishedAt?: Date | string | null };

/**
 * Whether a posting's terms are locked: it was opened (`publishedAt`, set the first time it left
 * the draft status). It stays locked whatever its status afterwards, back to draft included.
 */
export const jobTermsLocked = (job: Published | null | undefined): boolean => !!job?.publishedAt;

/**
 * Whether saving a posting with this status locks its terms now: one never opened (or a new one)
 * leaving the draft status. What the editor and the status control confirm first.
 */
export const locksJobTerms = (status: JobStatus, job?: Published | null): boolean =>
	status !== 'draft' && !jobTermsLocked(job);

/** The value of a field (its dotted path) in a posting; undefined when it is not set */
const fieldValue = (job: JobPostingInput, path: JobFieldPath): unknown =>
	path
		.split('.')
		.reduce<unknown>(
			(value, key) =>
				value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined,
			job
		);

/**
 * A locked field's value as its terms are compared: as it is stored, except the top of the pay
 * range, compared as it is scored (at most JOB_LIMITS.pay.maxRangeRatio times the bottom). A range
 * saved wider than that can then be brought down to the top it was scored with, the one change
 * its terms take (validateJobPosting refuses anything wider): nothing a candidate's match reads
 * changes.
 */
const lockedValue = (job: JobPostingInput, path: JobFieldPath): unknown => {
	if (path === 'pay.max') {
		const { min, max } = job.pay;
		return Number.isFinite(min) && Number.isFinite(max) ? Math.min(max, highestPayMax(min)) : max;
	}
	return fieldValue(job, path);
};

/**
 * The locked fields whose value differs from `stored` in `next`, both normalised
 * (normalizeJobPosting), in the order of the posting: what an edit of an opened posting may not
 * change. An edit sends the whole posting: locked fields it leaves as they are pass.
 */
export const changedLockedFields = (
	stored: JobPostingInput,
	next: JobPostingInput
): JobFieldPath[] =>
	LOCKED_JOB_FIELDS.filter(
		(path) =>
			JSON.stringify(lockedValue(stored, path)) !== JSON.stringify(lockedValue(next, path))
	);
