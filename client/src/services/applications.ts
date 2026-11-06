import { APPLICABLE_JOB_STATUS, type JobStatus } from 'portfolio-common';
import { jobSummaryParts, statusLabel, type JobPostingLike } from './jobPosting';
import type { AuthUser } from './stores';

// Pure helpers of the public job pages (/jobs, /jobs/[id]) and of applying with a portfolio
// (ApplyPanel): which panel a viewer gets, the messages of the application routes, dates and the
// plain-text descriptions of a posting. Nothing here calls the API or knows the UI.

const LOCALE = 'en-GB';

// --- Public pages -----------------------------------------------------------------------------

/** The API's 404 body for a draft or unknown posting (GET /jobs/:id) */
export const JOB_NOT_FOUND_MESSAGE = 'Job posting not found';

export const JOBS_UNAVAILABLE_MESSAGE =
	'The job board is temporarily unavailable. Please retry shortly.';

/** GET /jobs returns at most this many postings, most recently updated first */
export const PUBLIC_JOBS_LIMIT = 100;

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** Whether `id` can be a posting id at all (the API answers 422 for anything else) */
export const isJobPostingId = (id: string | undefined | null): id is string =>
	typeof id === 'string' && OBJECT_ID.test(id);

/**
 * Whether the API answered that the posting does not exist or is a draft. Any other 404 (a route
 * miss, a wrong API URL, the hosting edge) means the API could not be asked: not a missing posting.
 */
export const isJobNotFound = (
	error: { status: unknown; value?: unknown } | null | undefined
): boolean => {
	if (error?.status === 422) return true;
	return (
		error?.status === 404 &&
		typeof error.value === 'string' &&
		error.value.trim() === JOB_NOT_FOUND_MESSAGE
	);
};

/** 'No open positions', '1 open position', '12 open positions' */
export const openPositionsText = (count: number): string => {
	if (count <= 0) return 'No open positions';
	return `${count} open ${count === 1 ? 'position' : 'positions'}`;
};

const toDate = (value: Date | string | null | undefined): Date | undefined => {
	if (!value) return undefined;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date;
};

/**
 * '6 Nov 2026'; '' for a missing or invalid date. Pages rendered on the server pass 'UTC' (the
 * server's and the browser's time zones may differ: the hydrated text must not change).
 */
export const formatDay = (value: Date | string | null | undefined, timeZone?: string): string => {
	const date = toDate(value);
	if (!date) return '';
	return date.toLocaleDateString(LOCALE, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		...(timeZone ? { timeZone } : {})
	});
};

/** 'Published 3 Nov 2026' (first published, else created), '' without a date */
export const publishedText = (
	job: { publishedAt?: Date | string | null; createdAt?: Date | string | null },
	timeZone = 'UTC'
): string => {
	const day = formatDay(job.publishedAt ?? job.createdAt, timeZone);
	return day ? `Published ${day}` : '';
};

/** The page title of a posting: 'Backend engineer at Acme', 'Backend engineer' */
export const jobPageTitle = (job: Pick<JobPostingLike, 'title' | 'company'>): string => {
	const title = job.title?.trim() || 'Job posting';
	const company = job.company?.trim();
	return company ? `${title} at ${company}` : title;
};

const DESCRIPTION_MAX_LENGTH = 200;

/** `text` cut at a word boundary, with an ellipsis, when longer than `max` characters */
export const truncateText = (text: string, max: number): string => {
	if (text.length <= max) return text;
	const cut = text.slice(0, max - 1);
	const lastSpace = cut.lastIndexOf(' ');
	return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s·,:;-]+$/, '')}…`;
};

/**
 * The plain-text description of a posting for search results and link previews (meta
 * description, Open Graph): its status when it is not open, company, city, work mode, contract
 * and pay. Never the Markdown description.
 */
export const jobShareDescription = (job: JobPostingLike): string => {
	const parts = [
		job.status && job.status !== APPLICABLE_JOB_STATUS ? statusLabel(job.status) : '',
		job.company?.trim() ?? '',
		...jobSummaryParts(job)
	].filter(Boolean);
	if (parts.length === 0) return 'A job description: apply with your portfolio.';
	return truncateText(parts.join(' · '), DESCRIPTION_MAX_LENGTH);
};

// --- Applying ----------------------------------------------------------------------------------

/**
 * What the apply panel shows:
 * - 'not-open': the posting takes no applications (on hold, filled, closed), known without the
 *   session (rendered on the server too);
 * - 'checking': the session is being checked with the API (no flash of signed-out UI);
 * - 'own-posting': the viewer is the posting's recruiter;
 * - 'signed-out': sign in to apply;
 * - 'no-portfolio': signed in without a portfolio, claim one first;
 * - 'can-apply': signed in with a portfolio (whether they applied comes from the API).
 */
export type ApplyView =
	'not-open' | 'checking' | 'own-posting' | 'signed-out' | 'no-portfolio' | 'can-apply';

type ApplyViewer = Pick<AuthUser, '_id' | 'domain'> | null | undefined;

/** Whether the signed-in viewer is the recruiter of the posting */
export const isOwnPosting = (job: { recruiter?: unknown }, user: ApplyViewer): boolean =>
	!!user?._id && job.recruiter != null && String(job.recruiter) === String(user._id);

export const applyView = ({
	job,
	user,
	sessionChecked
}: {
	job: { status?: JobStatus; recruiter?: unknown };
	/** The signed-in account, once the session is valid (undefined when signed out) */
	user: ApplyViewer;
	sessionChecked: boolean;
}): ApplyView => {
	if (job.status !== APPLICABLE_JOB_STATUS) return 'not-open';
	if (!sessionChecked) return 'checking';
	if (isOwnPosting(job, user)) return 'own-posting';
	if (!user?._id) return 'signed-out';
	if (!user.domain) return 'no-portfolio';
	return 'can-apply';
};

/**
 * Whether the panel asks the API if the viewer applied: always when they can apply, and on a
 * posting that is not open for a candidate with a portfolio (who can still withdraw).
 */
export const needsApplicationStatus = (
	view: ApplyView,
	job: { recruiter?: unknown },
	user: ApplyViewer,
	sessionChecked: boolean
): boolean => {
	if (view === 'can-apply') return true;
	return (
		view === 'not-open' &&
		sessionChecked &&
		!!user?._id &&
		!!user.domain &&
		!isOwnPosting(job, user)
	);
};

/** Why a posting takes no applications, by status */
export const closedNotice = (status: JobStatus | undefined): { title: string; text: string } => {
	switch (status) {
		case 'on_hold':
			return {
				title: 'On hold',
				text: 'This position is not taking applications for now. Check back later.'
			};
		case 'filled':
			return {
				title: 'Position filled',
				text: 'This position has been filled: it is not taking applications any more.'
			};
		case 'closed':
			return {
				title: 'Position closed',
				text: 'This position is closed: it is not taking applications any more.'
			};
		default:
			return { title: 'Not open', text: 'This position is not taking applications.' };
	}
};

export type ApplicationSource = 'applied' | 'added_by_recruiter';

/** Where the viewer stands on a posting (GET, POST, DELETE /jobs/:id/application) */
export type ApplicationStatus = {
	applied: boolean;
	appliedAt?: Date;
	source?: ApplicationSource;
};

/**
 * An ApplicationStatusDto as it arrives (appliedAt as a Date through Eden, or an ISO string);
 * undefined when it is not one.
 */
export const readApplicationStatus = (data: unknown): ApplicationStatus | undefined => {
	if (!data || typeof data !== 'object' || !('applied' in data)) return undefined;
	const value = data as { applied?: unknown; appliedAt?: unknown; source?: unknown };
	if (typeof value.applied !== 'boolean') return undefined;
	if (!value.applied) return { applied: false };
	const appliedAt =
		value.appliedAt instanceof Date || typeof value.appliedAt === 'string'
			? toDate(value.appliedAt)
			: undefined;
	const source =
		value.source === 'applied' || value.source === 'added_by_recruiter' ? value.source : undefined;
	return {
		applied: true,
		...(appliedAt ? { appliedAt } : {}),
		...(source ? { source } : {})
	};
};

/**
 * 'You applied on 6 Nov 2026', 'The recruiter added your portfolio on 6 Nov 2026' (in the
 * browser's time zone: the panel is rendered in the browser only); '' when not applied.
 */
export const applicationSummary = (status: ApplicationStatus, timeZone?: string): string => {
	if (!status.applied) return '';
	const day = formatDay(status.appliedAt, timeZone);
	if (status.source === 'added_by_recruiter') {
		return day
			? `The recruiter added your portfolio on ${day}`
			: 'The recruiter added your portfolio';
	}
	return day ? `You applied on ${day}` : 'You applied';
};

/**
 * 'withdraw': the viewer's own application; 'remove': leaving an applicant list the recruiter put
 * the viewer's portfolio on (source 'added_by_recruiter'). Both are DELETE /jobs/:id/application.
 */
export type ApplicationAction = 'apply' | 'withdraw' | 'remove' | 'status';

/** The action that takes the viewer off a posting's applicant list, by how they got on it */
export const leaveAction = (source: ApplicationSource | undefined): 'withdraw' | 'remove' =>
	source === 'added_by_recruiter' ? 'remove' : 'withdraw';

/** What the panel says about leaving an applicant list, by how the viewer got on it */
export type LeaveCopy = {
	/** The button that asks first */
	button: string;
	/** The confirmation's question */
	question: string;
	/** The confirming button, and while its request runs */
	confirm: string;
	busy: string;
	/** Once done: the toast's title (announced too) and description */
	done: string;
	doneDescription: string;
};

export const leaveCopy = (source: ApplicationSource | undefined): LeaveCopy =>
	leaveAction(source) === 'remove'
		? {
				button: 'Remove me from the list',
				question:
					'Remove your portfolio from this applicant list? The recruiter will no longer see it there.',
				confirm: 'Remove me',
				busy: 'Removing…',
				done: 'Removed from the applicant list',
				doneDescription: 'The recruiter no longer sees your portfolio on this list.'
			}
		: {
				button: 'Withdraw my application',
				question:
					'Withdraw your application? The recruiter will no longer see you as an applicant.',
				confirm: 'Withdraw',
				busy: 'Withdrawing…',
				done: 'Application withdrawn',
				doneDescription: 'The recruiter no longer sees you as an applicant.'
			};

/**
 * What a failed application request means for the panel:
 * - 'session-expired' (401): the session is cleared, sign in again;
 * - 'already-applied' (409): reload the status, nothing went wrong;
 * - 'not-applied' (404 on withdraw or remove): the application is gone already;
 * - 'not-open' (409): the posting stopped taking applications: reload it;
 * - 'no-portfolio' (403): the account has no portfolio (any more): reload the account;
 * - 'own-posting' (403), 'full' (409), 'not-found' (404), 'network', 'error': a message only.
 */
export type ApplicationFailureKind =
	| 'session-expired'
	| 'already-applied'
	| 'not-applied'
	| 'not-open'
	| 'no-portfolio'
	| 'own-posting'
	| 'full'
	| 'not-found'
	| 'network'
	| 'error';

export type ApplicationFailure = { kind: ApplicationFailureKind; message: string };

const bodyText = (value: unknown): string => {
	if (typeof value === 'string') return value;
	if (value && typeof value === 'object' && 'message' in value) {
		return typeof value.message === 'string' ? value.message : '';
	}
	return '';
};

const FALLBACK_MESSAGES: Record<ApplicationAction, string> = {
	apply: 'Could not send your application. Try again.',
	withdraw: 'Could not withdraw your application. Try again.',
	remove: 'Could not remove you from the list. Try again.',
	status: 'Could not check whether you applied. Try again.'
};

const SESSION_EXPIRED_MESSAGES: Record<ApplicationAction, string> = {
	apply: 'Your session expired. Sign in again to apply.',
	withdraw: 'Your session expired. Sign in again to withdraw your application.',
	remove: 'Your session expired. Sign in again to remove yourself from the list.',
	status: 'Your session expired. Sign in again to apply.'
};

export const APPLICATION_NETWORK_MESSAGE =
	'Could not reach the server. Check your connection and try again.';

/**
 * The failure of an application request (GET, POST or DELETE /jobs/:id/application) from its
 * HTTP status and body; `status` undefined: the request did not get an answer (network).
 */
export const applicationFailure = (
	action: ApplicationAction,
	status: number | undefined,
	body?: unknown
): ApplicationFailure => {
	const text = bodyText(body);
	const fallback: ApplicationFailure = { kind: 'error', message: FALLBACK_MESSAGES[action] };
	if (status === undefined) return { kind: 'network', message: APPLICATION_NETWORK_MESSAGE };
	if (status === 401) {
		return { kind: 'session-expired', message: SESSION_EXPIRED_MESSAGES[action] };
	}
	if (status === 403) {
		if (/own job posting/i.test(text)) {
			return { kind: 'own-posting', message: 'You cannot apply to your own job description.' };
		}
		if (/claim a portfolio/i.test(text)) {
			return { kind: 'no-portfolio', message: 'Claim a portfolio before applying.' };
		}
		return fallback;
	}
	if (status === 409) {
		if (/already applied/i.test(text)) {
			return { kind: 'already-applied', message: 'You had already applied to this job.' };
		}
		if (/not taking applications/i.test(text)) {
			return { kind: 'not-open', message: 'This position is no longer taking applications.' };
		}
		if (/limit/i.test(text)) {
			return {
				kind: 'full',
				message: 'This job description has reached its limit of applicants.'
			};
		}
		return fallback;
	}
	if (status === 404) {
		if (action === 'withdraw' && /not applied/i.test(text)) {
			return { kind: 'not-applied', message: 'Your application had already been withdrawn.' };
		}
		if (action === 'remove' && /not applied/i.test(text)) {
			return { kind: 'not-applied', message: 'You were no longer on the applicant list.' };
		}
		return { kind: 'not-found', message: 'This job description is no longer published.' };
	}
	return fallback;
};
