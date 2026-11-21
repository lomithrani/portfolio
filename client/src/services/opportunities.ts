import { discoveryConsentRenewable, type MatchDecision } from 'portfolio-common';
import { portfolioTextApi } from '#services';
import { errorStatus } from './apiErrors';
import {
	decisionFailure,
	feedFailure,
	matchingOff,
	readCandidateFeed,
	readDecisionResult,
	readMutualInterest,
	readMutualInterestList,
	retryAfterSeconds,
	UNDO_WINDOW_MS,
	type CandidateMutualInterest,
	type DeckPage,
	type DecisionFailure,
	type DiscoveryStatus,
	type MutualInterest,
	type Opportunity
} from './matching';
import { isNetworkFailure } from './recruiter';

// The candidate's side of matching (Path 2, CLAUDE.md "Matching"), outside the admin page: their
// inbox (/opportunities: the open jobs proposed to them, answered in a deck, and their mutual
// interests) and the answers of a job's private page (/opportunities/:id, for a job proposed to
// them or one they and its recruiter are both interested in). The API calls are here, with what
// each answer means (the readers and the failures of matching.ts); the texts are the pages'.

const withCredentials = { fetch: { credentials: 'include' } } as const;

// --- The views of the inbox ------------------------------------------------------------------

/** The inbox's views: the jobs to answer (the default), and the mutual interests */
export const OPPORTUNITIES_VIEWS = ['review', 'interests'] as const;
export type OpportunitiesView = (typeof OPPORTUNITIES_VIEWS)[number];

/** The view a link asks for (`?view=`): the jobs to answer unless it names another */
export const opportunitiesView = (value: string | null | undefined): OpportunitiesView =>
	value === 'interests' ? 'interests' : 'review';

/**
 * The address's search once `view` is shown (the default leaves no parameter, the others kept),
 * or null when it does not change: the address follows the view shown (replaceState), so a reload
 * or a link opens on it
 */
export const opportunitiesViewSearch = (search: string, view: OpportunitiesView): string | null => {
	const params = new URLSearchParams(search);
	if (
		opportunitiesView(params.get('view')) === view &&
		(view !== 'review' || !params.has('view'))
	) {
		return null;
	}
	if (view === 'review') params.delete('view');
	else params.set('view', view);
	return params.toString();
};

// --- Where the candidate stands --------------------------------------------------------------

/**
 * What the view of jobs to answer shows, from GET /discovery: the deck (`on`: proposed to
 * recruiters now), or why there is none: no portfolio (discovery needs one), discovery off,
 * paused (something it needs went missing since) or its consent ended
 */
export type ReviewState = 'no-portfolio' | 'off' | 'paused' | 'lapsed' | 'on';

export const reviewState = (status: DiscoveryStatus, hasPortfolio: boolean): ReviewState => {
	if (!hasPortfolio || status.missing.includes('portfolio')) return 'no-portfolio';
	if (status.state === 'on' && status.missing.length > 0) return 'paused';
	return status.state;
};

/**
 * When the consent of a candidate proposed now ends, in its last DISCOVERY_CONSENT_RENEWAL_DAYS
 * days (when it can be confirmed again: discoveryConsentRenewable, as discovery's settings offer
 * it); null otherwise. No email says it (decision 10): the inbox does, above the deck
 */
export const consentEndsSoon = (status: DiscoveryStatus, now = new Date()): string | null =>
	reviewState(status, true) === 'on' &&
	status.consentExpiresAt &&
	discoveryConsentRenewable(status.enabledAt, now)
		? status.consentExpiresAt
		: null;

// --- The deck: reading what is proposed, answering it ----------------------------------------

/** A read of the jobs proposed to the candidate, as the deck takes it */
export type OpportunitiesRead =
	{ ok: true; page: DeckPage<Opportunity> } | { ok: false; failure: DecisionFailure };

/** An answer (or its undo), as the deck and the private page take it */
export type OpportunityAnswer =
	| { ok: true; decision: MatchDecision | null; match: MutualInterest | null }
	| { ok: false; failure: DecisionFailure };

/** Eden's answer's Retry-After (a 429's), when the API gave one */
const retryAfterOf = (result: { response?: Response; headers?: unknown }): number | undefined =>
	retryAfterSeconds(result.response?.headers ?? result.headers);

/**
 * GET /opportunities: the open jobs proposed to the candidate, from the start (`next` null) or
 * from the page `next` names. An answer the reader refuses is a read to try again
 */
export const readOpportunities = async (next: string | null): Promise<OpportunitiesRead> => {
	try {
		const result = await portfolioTextApi.opportunities.get({
			query: next ? { after: next } : {},
			...withCredentials
		});
		if (result.error) {
			return {
				ok: false,
				failure: feedFailure(
					errorStatus(result.error),
					result.error.value,
					'candidate',
					retryAfterOf(result)
				)
			};
		}
		const feed = readCandidateFeed(result.data);
		if (!feed) return { ok: false, failure: feedFailure(500, '', 'candidate') };
		return {
			ok: true,
			page: { cards: feed.jobs, more: feed.more, next: feed.next, pending: feed.pending }
		};
	} catch (error) {
		return { ok: false, failure: feedFailure(undefined, error, 'candidate') };
	}
};

/** What an answer, or its undo, gave: the decision now and the mutual interest it made */
const answerResult = (
	result: {
		data: unknown;
		error: { status: unknown; value?: unknown } | null;
		response?: Response;
		headers?: unknown;
	},
	action: 'decide' | 'undo'
): OpportunityAnswer => {
	if (result.error) {
		return {
			ok: false,
			failure: decisionFailure(
				errorStatus(result.error),
				result.error.value,
				'candidate',
				action,
				retryAfterOf(result)
			)
		};
	}
	const read = readDecisionResult(result.data, 'candidate');
	// Saved all the same: the page reads again rather than guess what was saved
	if (!read) return { ok: false, failure: decisionFailure(500, '', 'candidate', action) };
	return { ok: true, decision: read.decision, match: read.match };
};

/** PUT /opportunities/jobs/:id/decision: whether the job `jobId` interests the candidate */
export const answerOpportunity = async (
	jobId: string,
	decision: MatchDecision
): Promise<OpportunityAnswer> => {
	try {
		return answerResult(
			await portfolioTextApi.opportunities
				.jobs({ id: jobId })
				.decision.put({ decision }, withCredentials),
			'decide'
		);
	} catch (error) {
		return { ok: false, failure: decisionFailure(undefined, error, 'candidate', 'decide') };
	}
};

/** DELETE /opportunities/jobs/:id/decision: the candidate's latest answer on `jobId` undone */
export const undoOpportunityAnswer = async (jobId: string): Promise<OpportunityAnswer> => {
	try {
		return answerResult(
			await portfolioTextApi.opportunities
				.jobs({ id: jobId })
				.decision.delete(undefined, withCredentials),
			'undo'
		);
	} catch (error) {
		return { ok: false, failure: decisionFailure(undefined, error, 'candidate', 'undo') };
	}
};

/**
 * Whether an answer given at `at` (milliseconds) on a page can still be undone at `now`: within
 * MATCHING_LIMITS.undoMinutes (the page offers Undo only for an answer `undoableHere` allows)
 */
export const undoOpen = (at: number | null, now: number): boolean =>
	at !== null && now - at <= UNDO_WINDOW_MS;

/**
 * Whether the answer a job's private page gives now is one it can offer to undo: the API undoes
 * only the candidate's first answer on the job (409 DECISION_FINAL otherwise, kept through an
 * undo), so only on a page that read no answer (`loaded` null) and gave none before
 * (`answeredHere`: an answer, or an undo, given there). What the page cannot know (an answer given
 * and undone in the deck before it read the job) is the API's to refuse, which the page says
 */
export const undoableHere = (loaded: MatchDecision | null, answeredHere: boolean): boolean =>
	loaded === null && !answeredHere;

// --- Mutual interests ------------------------------------------------------------------------

/**
 * Why the mutual interests could not be read or changed: the session ended (401), the mutual
 * interest is gone (the API's 404 MATCH_NOT_FOUND: not a side of it, or taken back), matching was
 * turned off (the 404 of a route that does not exist), no answer, or another failure
 */
export type MutualInterestFailure = 'signed-out' | 'off' | 'gone' | 'network' | 'error';

// The API's 404 of a mutual interest the caller is not a side of, or that was taken back
// (server/protocol.ts, which opportunities.test.ts reads to keep them the same): an English
// constant whatever the visitor's language
export const MATCH_NOT_FOUND = 'Match not found';

export const interestFailure = (error: {
	status: unknown;
	value?: unknown;
}): MutualInterestFailure => {
	if (isNetworkFailure(error.value)) return 'network';
	const status = errorStatus(error);
	if (status === 401) return 'signed-out';
	if (status === 404 && typeof error.value === 'string' && error.value.trim() === MATCH_NOT_FOUND) {
		return 'gone';
	}
	// The 404 of a route that does not exist: matching was turned off
	if (matchingOff(status)) return 'off';
	return 'error';
};

/** GET /matches?side=candidate: a page of the candidate's mutual interests, the latest first */
export type MutualInterestsLoad =
	| { ok: true; interests: CandidateMutualInterest[]; next: string | null }
	| { ok: false; failure: MutualInterestFailure };

export const loadMutualInterests = async (after: string | null): Promise<MutualInterestsLoad> => {
	try {
		const { data, error } = await portfolioTextApi.matches.get({
			query: { side: 'candidate', ...(after ? { after } : {}) },
			...withCredentials
		});
		if (error) return { ok: false, failure: interestFailure(error) };
		const list = readMutualInterestList(data, 'candidate');
		if (!list) return { ok: false, failure: 'error' };
		return {
			ok: true,
			interests: list.matches.filter(
				(interest): interest is CandidateMutualInterest => interest.side === 'candidate'
			),
			next: list.next
		};
	} catch {
		return { ok: false, failure: 'network' };
	}
};

/** POST /matches/:id/end: the candidate ends the mutual interest `id` */
export type MutualInterestEnd =
	{ ok: true; interest: CandidateMutualInterest } | { ok: false; failure: MutualInterestFailure };

export const endMutualInterest = async (id: string): Promise<MutualInterestEnd> => {
	try {
		const { data, error } = await portfolioTextApi
			.matches({ id })
			.end.post(undefined, withCredentials);
		if (error) return { ok: false, failure: interestFailure(error) };
		const interest = readMutualInterest(data, 'candidate');
		return interest?.side === 'candidate'
			? { ok: true, interest }
			: { ok: false, failure: 'error' };
	} catch {
		return { ok: false, failure: 'network' };
	}
};

/**
 * The mutual interests read so far with a page added (each once: a mutual interest made between
 * two reads moves the later pages, which may list one already shown)
 */
export const appendInterests = <T extends { _id: string }>(
	shown: readonly T[],
	page: readonly T[]
): T[] => {
	const ids = new Set(shown.map((interest) => interest._id));
	return [...shown, ...page.filter((interest) => !ids.has(interest._id))];
};

/** The mutual interests to mark seen as they are shown: going on, not seen yet */
export const unseenInterests = (interests: readonly MutualInterest[]): string[] =>
	interests.filter((interest) => !interest.seen && !interest.endedAt).map(({ _id }) => _id);
