import {
	JOB_STATUSES,
	MATCHING_LIMITS,
	MATCHING_REVIEW_STATUSES,
	intlLocale,
	parseReviewReason,
	type JobFieldPath,
	type JobStatus,
	type MatchingReviewDecision,
	type MatchingReviewStatus
} from 'portfolio-common';
import { portfolioTextApi } from '#services';
import { JOB_CHANGED, JOB_NOT_FOUND } from './apiBodies';
import { bodyProperty, errorStatus } from './apiErrors';
import { JOB_FIELD_LABELS, jobFormFieldOf, type JobPostingLike } from './jobPosting';
import { readJobVersion, type JobVersion } from './matching';
import { isNetworkFailure, networkError } from './recruiter';
import { m } from './matchingReviews.messages';

// The reviewers' screen of matching (Path 2, CLAUDE.md "Matching", "Review"): the jobs recruiters
// put into matching wait for a reviewer, one of the operator's MATCHING_REVIEWERS, who reads each
// before it reaches any candidate, and approves it or says why not (GET /matching/reviews, PUT
// /matching/reviews/:id, decided on the version read). Here: readers of those answers, which keep
// what the screen shows and leave out what is not what the API promises, the calls, and why a
// read or a decision failed. Anyone else, and everyone while MATCHING is off, gets a 403 or a 404:
// the page then says only that it is not available, never what it is. The API calls go through
// portfolioTextApi: a title or a description that looks like a date stays text.

const withCredentials = { fetch: { credentials: 'include' } } as const;

/**
 * Mirrors of server/services/matchingReviews.ts (matchingReviews.test.ts reads it to keep them the
 * same): the days of a recruiter's past jobs in matching a reviewer reads beside each job, and the
 * most of them
 */
export const REVIEW_HISTORY_DAYS = 90;
export const REVIEW_HISTORY_JOBS = 20;

type Fields = Record<string, unknown>;

const fields = (value: unknown): Fields =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as Fields) : {};

const text = (value: unknown): string | null =>
	typeof value === 'string' && value.trim() ? value.trim() : null;

const OBJECT_ID = /^[0-9a-f]{24}$/i;

const objectId = (value: unknown): string | undefined =>
	typeof value === 'string' && OBJECT_ID.test(value) ? value : undefined;

/** An instant the API gave (an ISO text), as ISO; null otherwise */
const instant = (value: unknown): string | null => {
	if (!(typeof value === 'string' || value instanceof Date)) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const oneOf = <T extends string>(list: readonly T[], value: unknown): T | undefined =>
	list.find((entry) => entry === value);

/** The fields of a posting a field path names, of those the editor has an input for */
const isFieldPath = (value: unknown): value is JobFieldPath =>
	typeof value === 'string' && jobFormFieldOf(value) !== undefined;

// --- The list -------------------------------------------------------------------------------

/** Another job of the same recruiter, as a reviewer compares it with the job under review */
export interface ReviewOtherJob {
	_id: string;
	title: string;
	company: string | null;
	status: JobStatus;
	/** What its one-line summary reads: its place, contract and pay */
	summary: JobPostingLike;
	createdAt: string | null;
	/** In matching now */
	inMatching: boolean;
	/** Where its review stands (null: never reviewed) */
	review: MatchingReviewStatus | null;
	/** A copy of the job under review: the same company and title, or the same description */
	nearDuplicate: boolean;
	/** For a copy, the terms it differs in (what candidates' criteria read) */
	differsIn: JobFieldPath[];
}

/** A job waiting for a review, as the reviewer reads it */
export interface ReviewedJob {
	/** The posting as candidates would read it, with its id and status */
	job: JobVersion & { _id: string; status: JobStatus };
	/**
	 * Who is behind it: the domain of the recruiter's email address (null: none), and a key that
	 * stands for the recruiter, the same on all their jobs (never their id, name or address)
	 */
	recruiter: { emailDomain: string | null; key: string };
	otherJobs: ReviewOtherJob[];
	/** Since when it is in matching */
	matchingSince: string | null;
	/** When it was last sent for review: what it waits since */
	requestedAt: string | null;
	/** When a reviewer decided on an earlier version of it (edited since); null when none did */
	reviewedBefore: string | null;
	/** The version read: what a decision is taken on */
	version: string;
}

/** GET /matching/reviews: the jobs waiting, the oldest request first */
export interface ReviewList {
	jobs: ReviewedJob[];
	/** As many as one read lists: more may wait, listed once these are decided */
	full: boolean;
}

const readOtherJob = (value: unknown): ReviewOtherJob | undefined => {
	const entry = fields(value);
	const _id = objectId(entry._id);
	const title = text(entry.title);
	const status = oneOf(JOB_STATUSES, entry.status);
	if (!_id || !title || !status) return undefined;
	const nearDuplicate = entry.nearDuplicate === true;
	return {
		_id,
		title,
		company: text(entry.company),
		status,
		// Its fields as a posting's, nothing else: a text, a number or a list of texts each
		summary: readJobVersion({
			title,
			location: entry.location,
			contract: entry.contract,
			pay: entry.pay
		}) ?? { title },
		createdAt: instant(entry.createdAt),
		inMatching: entry.inMatching === true,
		review: oneOf(MATCHING_REVIEW_STATUSES, entry.review) ?? null,
		nearDuplicate,
		differsIn:
			nearDuplicate && Array.isArray(entry.differsIn) ? entry.differsIn.filter(isFieldPath) : []
	};
};

/** A job of GET /matching/reviews (or PUT's answer); undefined when not what the API promises */
export const readReviewedJob = (value: unknown): ReviewedJob | undefined => {
	const entry = fields(value);
	const posting = fields(entry.job);
	const _id = objectId(posting._id);
	const status = oneOf(JOB_STATUSES, posting.status);
	const version = readJobVersion(posting);
	const recruiter = fields(entry.recruiter);
	const key = text(recruiter.key);
	const versionRead = text(entry.version);
	if (!_id || !status || !version || !key || !versionRead) return undefined;
	const review = fields(entry.review);
	return {
		job: { ...version, _id, status },
		recruiter: { emailDomain: text(recruiter.emailDomain), key },
		otherJobs: (Array.isArray(entry.otherJobs) ? entry.otherJobs : [])
			.map(readOtherJob)
			.filter((job): job is ReviewOtherJob => !!job)
			.slice(0, REVIEW_HISTORY_JOBS),
		matchingSince: instant(entry.matchingSince),
		requestedAt: instant(review.requestedAt),
		reviewedBefore: instant(review.reviewedAt),
		version: versionRead
	};
};

/** A decision saved on the reviewers' page: the version decided on and the review it gave */
export interface SavedDecision {
	version: string;
	status: Exclude<MatchingReviewStatus, 'pending'>;
	/** When it was saved, on the page's own clock (a counter it also stamps each read with) */
	at: number;
}

/**
 * `list` as the page shows it once the decisions saved on it (`decided`, by job id) are counted: a
 * job decided on as the version decided leaves it (a read the API answered before the decision
 * was written would bring it back as waiting), and the other jobs of each entry read the review
 * that the decisions saved after the read started (`startedAt`, on the same clock) gave them (a
 * read answered before them says the review before). A job edited since its decision (another
 * version) stays: it waits again
 */
export const reconcileReviews = (
	list: ReviewList,
	decided: ReadonlyMap<string, SavedDecision>,
	startedAt: number
): ReviewList => ({
	...list,
	jobs: list.jobs
		.filter((entry) => decided.get(entry.job._id)?.version !== entry.version)
		.map((entry) => ({
			...entry,
			otherJobs: entry.otherJobs.map((other) => {
				const saved = decided.get(other._id);
				return saved && saved.at > startedAt ? { ...other, review: saved.status } : other;
			})
		}))
});

/** GET /matching/reviews's answer; undefined when it is not what the API promises */
export const readReviewList = (value: unknown): ReviewList | undefined => {
	const raw = fields(value).jobs;
	if (!Array.isArray(raw)) return undefined;
	const jobs = raw.map(readReviewedJob).filter((job): job is ReviewedJob => !!job);
	return { jobs, full: raw.length >= MATCHING_LIMITS.reviewsPerRead };
};

// --- Failures -------------------------------------------------------------------------------

const bodyText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** The validation message of a 422's body, as the API wrote it (in the visitor's language) */
const bodyMessage = (value: unknown): string =>
	value && typeof value === 'object' && 'message' in value && typeof value.message === 'string'
		? value.message
		: '';

/**
 * Why the list could not be read: signed out, not available (a 403: not a reviewer; a 404: the
 * route does not exist, matching is off; one page for both, which says nothing of what it is), or
 * to try again
 */
export type ReviewsReadFailure = 'signed-out' | 'unavailable' | 'retry';

export const reviewsReadFailure = (
	status: number | undefined,
	value: unknown
): ReviewsReadFailure => {
	if (isNetworkFailure(value)) return 'retry';
	if (status === 401) return 'signed-out';
	if (status === 403 || status === 404) return 'unavailable';
	return 'retry';
};

export type ReviewsRead =
	{ ok: true; list: ReviewList } | { ok: false; failure: ReviewsReadFailure };

/** GET /matching/reviews */
export const loadReviews = async (): Promise<ReviewsRead> => {
	try {
		const { data, error } = await portfolioTextApi.matching.reviews.get(withCredentials);
		if (error || !data) {
			return { ok: false, failure: reviewsReadFailure(errorStatus(error), error?.value) };
		}
		const list = readReviewList(data);
		return list ? { ok: true, list } : { ok: false, failure: 'retry' };
	} catch (error) {
		return { ok: false, failure: reviewsReadFailure(undefined, error) };
	}
};

/**
 * Why a decision did not go through: the job changed since it was read (`changed`: the page reads
 * it again), it is no longer in matching (`gone`: taken out, or deleted), the reason refused
 * (`reason`, on its field), signed out, not available (no longer a reviewer, matching turned off),
 * or to try again
 */
export type ReviewFailureKind =
	'changed' | 'gone' | 'reason' | 'signed-out' | 'unavailable' | 'retry';

export interface ReviewFailure {
	kind: ReviewFailureKind;
	message: string;
}

/** The message of each failure but the reason's (the API's own words, on its field) */
const FAILURE_MESSAGES = {
	changed: 'changed',
	gone: 'gone',
	'signed-out': 'signedOut',
	unavailable: 'unavailable',
	retry: 'retry'
} as const satisfies Record<Exclude<ReviewFailureKind, 'reason'>, string>;

export const reviewFailure = (status: number | undefined, value: unknown): ReviewFailure => {
	const failure = (kind: Exclude<ReviewFailureKind, 'reason'>): ReviewFailure => ({
		kind,
		message:
			kind === 'retry' && isNetworkFailure(value)
				? networkError()
				: m.failure[FAILURE_MESSAGES[kind]]
	});
	if (isNetworkFailure(value)) return failure('retry');
	const body = bodyText(value);
	switch (status) {
		case 401:
			return failure('signed-out');
		case 403:
			return failure('unavailable');
		case 404:
			// The 404 of a route that does not exist: matching was turned off
			return failure(body === JOB_NOT_FOUND ? 'gone' : 'unavailable');
		case 409:
			return failure(body === JOB_CHANGED ? 'changed' : 'retry');
		case 422:
			return bodyProperty(value) === 'reason'
				? { kind: 'reason', message: bodyMessage(value) || m.failure.retry }
				: failure('retry');
		default:
			return failure('retry');
	}
};

export type ReviewResult =
	{ ok: true; job: ReviewedJob | null } | { ok: false; failure: ReviewFailure };

/**
 * PUT /matching/reviews/:id: `decision` on the job `jobId` as the version `version` read, with the
 * reason its recruiter reads (to reject). The reason is checked first, as the API checks it
 * (portfolio-common's parseReviewReason): a reason refused sends nothing
 */
export const decideReview = async (
	jobId: string,
	decision: MatchingReviewDecision,
	reason: string,
	version: string
): Promise<ReviewResult> => {
	const parsed = parseReviewReason(decision, reason);
	if (!parsed.ok) return { ok: false, failure: { kind: 'reason', message: parsed.message } };
	try {
		const { data, error } = await portfolioTextApi.matching
			.reviews({ id: jobId })
			.put(
				{ decision, version, ...(parsed.reason ? { reason: parsed.reason } : {}) },
				withCredentials
			);
		if (error || !data) {
			return { ok: false, failure: reviewFailure(errorStatus(error), error?.value) };
		}
		return { ok: true, job: readReviewedJob(data) ?? null };
	} catch (error) {
		return { ok: false, failure: reviewFailure(undefined, error) };
	}
};

// --- Texts ----------------------------------------------------------------------------------

/**
 * How the page scrolls a job into view in main#page (whose own scroll is smooth): at once under
 * "reduce motion"
 */
export const scrollBehavior = (): ScrollBehavior =>
	typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
		? 'instant'
		: 'smooth';

/** Where another job's review stands, in words */
export const reviewStatusText = (review: MatchingReviewStatus | null): string =>
	review ? m.review[review] : m.review.never;

/**
 * The terms a copy differs in, as one list in the page's language ('Minimum pay and City'); each
 * named once, as the editor labels it
 */
export const differsInText = (paths: readonly JobFieldPath[]): string => {
	const labels = [
		...new Set(
			paths.flatMap((path) => {
				const field = jobFormFieldOf(path);
				return field ? [JOB_FIELD_LABELS[field]] : [];
			})
		)
	];
	return new Intl.ListFormat(intlLocale(), { type: 'conjunction' }).format(labels);
};

/** How many of a job's other jobs (`ReviewedJob.otherJobs`) are copies of it */
export const nearDuplicateCount = (
	jobs: readonly Pick<ReviewOtherJob, 'nearDuplicate'>[]
): number => jobs.filter((other) => other.nearDuplicate).length;
