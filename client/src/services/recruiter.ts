import {
	JOB_LIMITS,
	JOB_STATUSES,
	JOB_STATUS_LABELS,
	intlLocale,
	isValidDomainName,
	normalizeDomainName,
	type JobStatus
} from 'portfolio-common';
import type { portfolioApi } from '#services';
import { JOB_STATUS_DESCRIPTIONS } from './jobPosting';
import { m } from './recruiter.messages';

// Pure helpers of the recruiter's pages: the dashboard (/recruiter: the job descriptions, their
// status filters) and a job description's page (/recruiter/jobs/:id: status, applicants). The
// API calls stay in the pages; nothing here knows the UI.

// --- Shapes ----------------------------------------------------------------------------

type RecruiterApi = typeof portfolioApi.recruiter.jobs;

/** A posting of GET /recruiter/jobs (with its applicant count) */
export type RecruiterJob = NonNullable<
	Awaited<ReturnType<RecruiterApi['get']>>['data']
>['jobs'][number];

/** GET /recruiter/jobs/:id: a posting with its applicants */
export type RecruiterJobDetail = NonNullable<
	Awaited<ReturnType<ReturnType<RecruiterApi>['get']>>['data']
>;

/** A candidate on a posting's applicant list: their portfolio (and name, when they applied) */
export type Applicant = RecruiterJobDetail['applicants'][number];

/** The fields of an applicant the helpers read */
type ApplicantLike = {
	source: 'applied' | 'added_by_recruiter';
	candidate: { name?: string; surname?: string };
	domain: { name: string; headerTitle?: string };
};

// --- Dates -----------------------------------------------------------------------------

const LOCALE = 'en-GB';

const asDate = (value: Date | string | null | undefined): Date | undefined => {
	if (!value) return undefined;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date;
};

/**
 * '3 Nov 2026' (in the browser's time zone by default); '' when missing or invalid. Eden
 * Treaty turns the API's ISO strings into Dates: both are accepted.
 */
export const formatDay = (value: Date | string | null | undefined, timeZone?: string): string => {
	const date = asDate(value);
	if (!date) return '';
	return date.toLocaleDateString(intlLocale(LOCALE), {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		...(timeZone ? { timeZone } : {})
	});
};

/** The ISO string of a date, for <time datetime>; '' when missing or invalid */
export const isoDate = (value: Date | string | null | undefined): string =>
	asDate(value)?.toISOString() ?? '';

// --- The list ---------------------------------------------------------------------------

/** 'All', or one status: the dashboard's filters */
export type StatusFilter = 'all' | JobStatus;

/** Postings per status */
export const countByStatus = (
	jobs: readonly { status: JobStatus }[]
): Record<JobStatus, number> => {
	const counts = Object.fromEntries(JOB_STATUSES.map((status) => [status, 0])) as Record<
		JobStatus,
		number
	>;
	for (const job of jobs) counts[job.status] += 1;
	return counts;
};

/**
 * The filters worth showing: 'All' and every status at least one posting has, with their counts.
 * Empty when the postings all share one status (filtering would change nothing).
 */
export const statusFilters = (
	jobs: readonly { status: JobStatus }[]
): { value: StatusFilter; label: string; count: number }[] => {
	const counts = countByStatus(jobs);
	const used = JOB_STATUSES.filter((status) => counts[status] > 0);
	if (used.length < 2) return [];
	return [
		{ value: 'all', label: m.statusFilter.all, count: jobs.length },
		...used.map((status) => ({
			value: status,
			label: m.statusFilter[status],
			count: counts[status]
		}))
	];
};

export const filterJobs = <T extends { status: JobStatus }>(
	jobs: readonly T[],
	filter: StatusFilter
): T[] => (filter === 'all' ? [...jobs] : jobs.filter((job) => job.status === filter));

/**
 * What a filter shows, for screen readers: '6 job descriptions', 'Open: 2 of 6 job descriptions'
 */
export const shownJobsText = (shown: number, total: number, filter: StatusFilter): string =>
	filter === 'all'
		? m.jobDescriptions(total)
		: m.shownJobs(JOB_STATUS_LABELS[filter], shown, total);

/** 'No applicants yet', '1 applicant', '12 applicants' */
export const applicantCountText = (count: number): string =>
	count === 0 ? m.noApplicants : m.applicantCount(count);

// --- Status -----------------------------------------------------------------------------

/** 'Status changed to Open' and what it means for the posting (the toast) */
export const statusChangedText = (status: JobStatus): { title: string; description: string } => ({
	title: m.statusChanged(JOB_STATUS_LABELS[status]),
	description: JOB_STATUS_DESCRIPTIONS[status]
});

/** Whether the posting has a public page (GET /jobs/:id answers for every status but draft) */
export const hasPublicPage = (status: JobStatus): boolean => status !== 'draft';

// --- Applicants -------------------------------------------------------------------------

const words = (value: string | undefined) => (value ?? '').trim().split(/\s+/).filter(Boolean);

/**
 * How an applicant is named: "Name Surname" when they applied themselves (the API only gives
 * names then), else the portfolio's title, else its name
 */
export const applicantName = (applicant: ApplicantLike): string => {
	const name = [...words(applicant.candidate.name), ...words(applicant.candidate.surname)].join(
		' '
	);
	return name || applicant.domain.headerTitle?.trim() || applicant.domain.name;
};

/** 'LG' for Louis Gentil; the first letters of the portfolio name otherwise ("louis.gentil" → "LG") */
export const applicantInitials = (applicant: ApplicantLike): string => {
	const name = applicantName(applicant);
	const parts = name === applicant.domain.name ? name.split(/[.-]+/) : words(name);
	return (
		parts
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => Array.from(part)[0]?.toLocaleUpperCase() ?? '')
			.join('') || '?'
	);
};

/** 'Applied 3 Nov 2026', 'Added 3 Nov 2026' */
export const applicantDateText = (
	applicant: Pick<ApplicantLike, 'source'> & { appliedAt: Date | string },
	timeZone?: string
): string => {
	const day = formatDay(applicant.appliedAt, timeZone);
	if (!day) return '';
	return applicant.source === 'applied' ? m.appliedOn(day) : m.addedOn(day);
};

/**
 * The portfolio name in what was typed in "Add a portfolio": a name ('louis.gentil'), or the
 * address of one of its pages pasted from the browser ('https://site/louis.gentil/experiences'),
 * normalised like the API does. '' when nothing was typed.
 */
export const domainFromInput = (raw: string): string => {
	let text = raw.trim();
	if (!text) return '';
	// An address: its first path segment is the portfolio (the site serves /<name>/...)
	const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? safeUrl(text) : undefined;
	if (url) text = url.pathname;
	text = text.replace(/^\/+/, '').split(/[/?#]/)[0] ?? '';
	try {
		text = decodeURIComponent(text);
	} catch {
		// Kept as typed: the name check below refuses it
	}
	return normalizeDomainName(text);
};

const safeUrl = (text: string): URL | undefined => {
	try {
		return new URL(text);
	} catch {
		return undefined;
	}
};

/** Why "Add a portfolio" cannot send what was typed (null when it can) */
export const applicantDomainProblem = (raw: string): string | null => {
	const name = domainFromInput(raw);
	if (!name) return m.domainProblem.empty;
	if (!isValidDomainName(name)) return m.domainProblem.invalid;
	return null;
};

/** What the pages say when the API could not be reached */
export const networkError = (): string => m.networkError;

/**
 * Whether a request got no answer at all: Eden Treaty turns a fetch that failed (offline, the
 * connection dropped) into a 503 error whose value is the fetch error, not the API's text
 */
export const isNetworkFailure = (value: unknown): boolean => value instanceof Error;

/** `fallback` (what failed), or the connection's problem when the request got no answer */
export const failureText = (value: unknown, fallback: string): string =>
	isNetworkFailure(value) ? networkError() : fallback;

const bodyText = (value: unknown): string =>
	typeof value === 'string'
		? value.trim()
		: value &&
			  typeof value === 'object' &&
			  typeof (value as { message?: unknown }).message === 'string'
			? (value as { message: string }).message.trim()
			: '';

/**
 * Why POST /jobs/:id/applicants failed. `field`: the problem is the name typed (shown under the
 * field); otherwise it is about the posting or the account (shown as an alert).
 */
export const addApplicantError = (
	status: number | undefined,
	value: unknown,
	domain: string
): { message: string; field: boolean } => {
	if (isNetworkFailure(value)) return { message: networkError(), field: false };
	const text = bodyText(value);
	switch (status) {
		case 401:
			return { message: m.addApplicant.sessionExpired, field: false };
		case 403:
			return /own portfolio/i.test(text)
				? { message: m.addApplicant.ownPortfolio, field: true }
				: { message: m.addApplicant.noRecruiterSpace, field: false };
		case 404:
			return /domain/i.test(text)
				? { message: m.addApplicant.unknownPortfolio(domain), field: true }
				: { message: m.addApplicant.jobGone, field: false };
		case 409:
			return /already/i.test(text)
				? { message: m.addApplicant.alreadyApplicant(domain), field: true }
				: { message: m.addApplicant.full(JOB_LIMITS.applicantsPerJob), field: false };
		case 400:
		case 422:
			return { message: m.domainProblem.invalid, field: true };
		default:
			return { message: m.addApplicant.failed, field: false };
	}
};

/**
 * Whether a 404 of a route of one posting (DELETE /jobs/:id/applicants/:applicationId...) says
 * the posting itself is gone (deleted in another tab), not the applicant
 */
export const isJobPostingGone = (status: number | undefined, value: unknown): boolean =>
	status === 404 && /job posting not found/i.test(bodyText(value));

/** What the confirmation says before an applicant is removed */
export const removeApplicantText = (applicant: ApplicantLike): string =>
	applicant.source === 'applied'
		? m.removeApplicant.applied(applicantName(applicant))
		: m.removeApplicant.added(applicantName(applicant));

/** What the confirmation says before a posting is deleted */
export const deleteJobText = (applicantCount: number): string =>
	applicantCount === 0 ? m.deleteJob.noApplicants : m.deleteJob.withApplicants(applicantCount);
