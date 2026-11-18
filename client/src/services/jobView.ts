import type { portfolioTextApi } from '#services';
import { isNetworkFailure } from './recruiter';
import { m } from './jobView.messages';

// Pure helpers of the private page of a job description (/opportunities/:id, the page the meeting
// invitation of a hiring journey links): GET /opportunities/jobs/:id answers its recruiter
// (`access: 'recruiter'`, sent on to their page of it in the recruiter space) and the portfolio
// owner on whose journey they picked it (`access: 'journey'`); anyone else gets the 404 of an
// unknown id. The API call stays in the page; nothing here knows the UI.

/** GET /opportunities/jobs/:id: the posting, and why the caller reads it */
export type SharedJob = NonNullable<
	Awaited<ReturnType<ReturnType<typeof portfolioTextApi.opportunities.jobs>['get']>>['data']
>;

/** What the page shows when the API did not give the posting */
export type JobViewFailure = 'signed-out' | 'not-shared' | 'error';

/**
 * Whether `id` can name a job posting (a MongoDB ObjectId): anything else is shared with nobody,
 * the page says so without asking the API (which would answer 422)
 */
export const isJobPostingId = (id: string | null | undefined): id is string =>
	!!id && /^[0-9a-f]{24}$/i.test(id);

/**
 * Why GET /opportunities/jobs/:id gave no posting: the session ended (401: sign in again), the
 * posting is not shared with the caller (the API's 404 of a job posting it does not show, or 422
 * for an id that is not one), or the API could not answer (any other status, a 404 that is not
 * the API's: a route it does not have, a proxy, or no answer at all: retry)
 */
export const jobViewFailure = (status: number | undefined, value: unknown): JobViewFailure => {
	if (isNetworkFailure(value)) return 'error';
	if (status === 401) return 'signed-out';
	if (status === 422) return 'not-shared';
	if (status === 404) {
		const text = typeof value === 'string' ? value : '';
		return /job posting/i.test(text) ? 'not-shared' : 'error';
	}
	return 'error';
};

/** The browser tab's title: the posting's title once loaded */
export const jobViewTitle = (title?: string | null): string =>
	m.pageTitle(title?.trim() || m.jobDescription);
