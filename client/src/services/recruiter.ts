import { JOB_STATUSES, JOB_STATUS_LABELS, intlLocale, type JobStatus } from 'portfolio-common';
import type { portfolioApi } from '#services';
import { JOB_STATUS_DESCRIPTIONS } from './jobPosting';
import { m } from './recruiter.messages';

// Pure helpers of the recruiter's pages: the dashboard (/recruiter: the job descriptions, their
// status filters) and a job description's page (/recruiter/jobs/:id: its status). The API calls
// stay in the pages; nothing here knows the UI.

// --- Shapes ----------------------------------------------------------------------------

type RecruiterApi = typeof portfolioApi.recruiter.jobs;

/** A posting of GET /recruiter/jobs */
export type RecruiterJob = NonNullable<
	Awaited<ReturnType<RecruiterApi['get']>>['data']
>['jobs'][number];

/** GET /recruiter/jobs/:id: one posting */
export type RecruiterJobDetail = NonNullable<
	Awaited<ReturnType<ReturnType<RecruiterApi>['get']>>['data']
>;

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

// --- Status -----------------------------------------------------------------------------

/** 'Status changed to Open' and what it means for the posting (the toast) */
export const statusChangedText = (status: JobStatus): { title: string; description: string } => ({
	title: m.statusChanged(JOB_STATUS_LABELS[status]),
	description: JOB_STATUS_DESCRIPTIONS[status]
});

// --- Failures ---------------------------------------------------------------------------

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
