import {
	MATCH_DECISIONS,
	MATCH_END_REASONS,
	type MatchDecision,
	type MatchEndReason
} from 'portfolio-common';
import type { portfolioTextApi } from '#services';
import {
	formatMoment,
	readOpportunityScore,
	retryAfterSeconds,
	type OpportunityScore
} from './matching';
import { isNetworkFailure } from './recruiter';
import { m } from './jobView.messages';

// Pure helpers of the private page of a job description (/opportunities/:id, the page the meeting
// invitation of a hiring journey links): GET /opportunities/jobs/:id answers its recruiter
// (`access: 'recruiter'`, sent on to their page of it in the recruiter space), each portfolio
// owner on whose journey they picked it (`access: 'journey'`), and with matching (Path 2) the
// candidate of a mutual interest on it (`access: 'match'`) and a candidate it is proposed to
// (`access: 'feed'`); anyone else gets the 404 of an unknown id. The API call stays in the page;
// nothing here knows the UI.

/** GET /opportunities/jobs/:id: the posting, and why the caller reads it */
export type SharedJob = NonNullable<
	Awaited<ReturnType<ReturnType<typeof portfolioTextApi.opportunities.jobs>['get']>>['data']
>;

/**
 * What the page shows when the API did not give the posting: sign in again, not shared with the
 * caller, a read refused for now (`limited`: matching's reads of an hour, 429), or an error to retry
 */
export type JobViewFailure = 'signed-out' | 'not-shared' | 'limited' | 'error';

/**
 * Whether `id` can name a job posting (a MongoDB ObjectId): anything else is shared with nobody,
 * the page says so without asking the API (which would answer 422)
 */
export const isJobPostingId = (id: string | null | undefined): id is string =>
	!!id && /^[0-9a-f]{24}$/i.test(id);

/**
 * Why GET /opportunities/jobs/:id gave no posting: the session ended (401: sign in again), the
 * posting is not shared with the caller (the API's 404 of a job posting it does not show, or 422
 * for an id that is not one), too many reads (429: while matching is on, every read that is not
 * the recruiter's, a journey's pick or a mutual interest counts against the feeds' reads of an
 * hour, MATCHING_FEED_READS), or the API could not answer (any other status, a 404 that is not
 * the API's: a route it does not have, a proxy, or no answer at all: retry)
 */
export const jobViewFailure = (status: number | undefined, value: unknown): JobViewFailure => {
	if (isNetworkFailure(value)) return 'error';
	if (status === 401) return 'signed-out';
	if (status === 422) return 'not-shared';
	if (status === 429) return 'limited';
	if (status === 404) {
		const text = typeof value === 'string' ? value : '';
		return /job posting/i.test(text) ? 'not-shared' : 'error';
	}
	return 'error';
};

/**
 * When a read refused for now can go again (milliseconds), from the 429's Retry-After; null when
 * it gave none
 */
export const jobViewRetryAt = (headers: unknown, now = Date.now()): number | null => {
	const seconds = retryAfterSeconds(headers);
	return seconds ? now + seconds * 1000 : null;
};

/** What the page says of a read refused for now: from when it can read again, when known */
export const jobViewLimitText = (until: number | null): string =>
	until ? m.limitedUntil(formatMoment(new Date(until))) : m.limited;

/** The browser tab's title: the posting's title once loaded */
export const jobViewTitle = (title?: string | null): string =>
	m.pageTitle(title?.trim() || m.jobDescription);

// --- Why the caller reads it -----------------------------------------------------------------

/** A mutual interest on the job, as its candidate reads it on the private page */
export interface SharedMutualInterest {
	side: 'candidate';
	_id: string;
	matchedAt: string;
	/** The posting was edited since (the page shows the version they said yes to) */
	changedAt: string | null;
	endedAt: string | null;
	endReason: MatchEndReason | null;
}

/**
 * What the page shows beside the job, by why the caller reads it: the version shared on their
 * journey (`journey`, when it was shared: unset for the posting as it is now), a job proposed to
 * them (`feed`: their score of it, null when it does not read, whether its recruiter is interested
 * in them, what they answered), or their mutual interest on it (`match`)
 */
export type JobViewAccess =
	| { kind: 'journey'; sharedAt?: string }
	| {
			kind: 'feed';
			score: OpportunityScore | null;
			interested: boolean;
			decision: MatchDecision | null;
	  }
	| { kind: 'match'; interest: SharedMutualInterest };

const instant = (value: unknown): string | null => {
	if (!(typeof value === 'string' || value instanceof Date)) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/**
 * Why the caller reads the job (GET /opportunities/jobs/:id's `access` and what goes with it),
 * read defensively; undefined for a mutual interest that does not read (the page says it could
 * not load the job rather than show it without what it holds). `recruiter` is the page's own
 * (sent on), never shown here
 */
export const readJobViewAccess = (shared: {
	access: string;
	sharedAt?: unknown;
	jobMatch?: unknown;
	interested?: unknown;
	decision?: unknown;
	match?: unknown;
}): JobViewAccess | undefined => {
	switch (shared.access) {
		case 'feed': {
			const decision = MATCH_DECISIONS.find((entry) => entry === shared.decision) ?? null;
			return {
				kind: 'feed',
				score: readOpportunityScore(shared.jobMatch) ?? null,
				interested: shared.interested === true,
				decision
			};
		}
		case 'match': {
			const match =
				shared.match && typeof shared.match === 'object'
					? (shared.match as Record<string, unknown>)
					: {};
			const matchedAt = instant(match.matchedAt);
			if (typeof match._id !== 'string' || !OBJECT_ID.test(match._id) || !matchedAt) {
				return undefined;
			}
			const endedAt = instant(match.endedAt);
			return {
				kind: 'match',
				interest: {
					side: 'candidate',
					_id: match._id,
					matchedAt,
					changedAt: instant(match.changedAt),
					endedAt,
					endReason: endedAt
						? (MATCH_END_REASONS.find((reason) => reason === match.endReason) ?? null)
						: null
				}
			};
		}
		default: {
			const sharedAt = instant(shared.sharedAt);
			return { kind: 'journey', ...(sharedAt ? { sharedAt } : {}) };
		}
	}
};
