import {
	LOCALES,
	MATCHING_LIMITS,
	MATCHING_REVIEW_STATUSES,
	OPEN_JOB_STATUS,
	keepsMatching,
	matchingJobProblem,
	matchingMessages,
	withLocale,
	type JobStatus,
	type MatchDecision,
	type MatchingReviewStatus
} from 'portfolio-common';
import { portfolioApi, portfolioTextApi } from '#services';
import { bodyProperty, errorStatus, isConsentProblem } from './apiErrors';
import type { JobForm, JobFormField } from './jobPosting';
import {
	decisionFailure,
	feedFailure,
	matchingOff,
	readDecisionResult,
	readMutualInterest,
	readMutualInterestList,
	readRecruiterFeed,
	retryAfterSeconds,
	type DeckPage,
	type DecisionFailure,
	type MutualInterest,
	type RecruiterCard,
	type RecruiterMutualInterest
} from './matching';
import { isNetworkFailure, type RecruiterJobDetail } from './recruiter';
import { m } from './recruiterMatching.messages';

// The recruiter's side of matching (Path 2, CLAUDE.md "Matching"): a job description they propose
// to the candidates whose criteria it meets (PUT /jobs/:id/matching, read by a reviewer before any
// candidate sees it), the anonymous cards proposed for it, answered one at a time in a deck (GET
// /recruiter/jobs/:id/candidates, PUT and DELETE /recruiter/jobs/:id/candidates/decision, the card's
// token in the body, kept in memory only), and their mutual interests (GET /matches?side=recruiter,
// one job's with `job=`, POST /matches/:id/end). The API calls are here, with what each answer
// means; the texts are the pages'. While MATCHING is off the postings carry no `matching` and the
// routes answer a 404: nothing of matching shows. Nothing counts candidates: whether there are
// more, never how many.

const withCredentials = { fetch: { credentials: 'include' } } as const;

type Fields = Record<string, unknown>;

const fields = (value: unknown): Fields =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as Fields) : {};

/** An instant the API gave (an ISO text, or a Date once Eden parsed it), as ISO; null otherwise */
const instant = (value: unknown): string | null => {
	if (!(typeof value === 'string' || value instanceof Date)) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

// --- A job in matching ----------------------------------------------------------------------

/** Where a job stands with the reviewers, as its recruiter reads it (no reviewer is named) */
export interface JobMatchingReview {
	status: MatchingReviewStatus;
	/** When a reviewer last decided; null while none did */
	reviewedAt: string | null;
	/** Why it was not accepted, in the reviewer's own words; null unless rejected */
	reason: string | null;
}

/** A posting's `matching`: whether its recruiter proposes it to candidates, and its review */
export interface JobMatching {
	/** Since when it is proposed (null: off) */
	enabledAt: string | null;
	/** Null: never put into matching */
	review: JobMatchingReview | null;
}

/**
 * A posting's `matching`, as the recruiter routes answer it while MATCHING is on; null when the
 * posting has none (matching off: nothing of it shows) or it is not what the API promises
 */
export const readJobMatching = (value: unknown): JobMatching | null => {
	if (!value || typeof value !== 'object') return null;
	const matching = fields(value);
	const raw = matching.review;
	let review: JobMatchingReview | null = null;
	if (raw) {
		const entry = fields(raw);
		const status = MATCHING_REVIEW_STATUSES.find((known) => known === entry.status);
		if (!status) return null;
		const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
		review = {
			status,
			reviewedAt: instant(entry.reviewedAt),
			reason: status === 'rejected' && reason ? reason : null
		};
	}
	return { enabledAt: instant(matching.enabledAt), review };
};

/**
 * Where a job stands in matching: `off` (not proposed), `pending` (sent for review: proposed to
 * nobody yet), `rejected` (not accepted, with the reviewer's reason), `paused` (accepted, but on
 * hold: proposed to nobody until it is open again), `live` (open, on and accepted: proposed to the
 * candidates whose criteria it meets, portfolio-common's jobLiveInMatching)
 */
export type JobMatchingState = 'off' | 'pending' | 'rejected' | 'paused' | 'live';

export const jobMatchingState = (status: JobStatus, matching: JobMatching): JobMatchingState => {
	if (!matching.enabledAt) return 'off';
	if (matching.review?.status === 'rejected') return 'rejected';
	if (matching.review?.status !== 'approved') return 'pending';
	return status === OPEN_JOB_STATUS ? 'live' : 'paused';
};

/** Whether matching can be turned on for a job now: only an open one */
export const canProposeJob = (status: JobStatus): boolean => status === OPEN_JOB_STATUS;

/**
 * Whether a job was ever put into matching (the switch on now, or a review kept from before): its
 * mutual interests, if any, go on whatever the switch says, and end once it is filled, closed or
 * back to draft (server/services/jobMatching.ts afterJobStatusChange)
 */
export const everInMatching = (matching: JobMatching | null): boolean =>
	!!matching && (!!matching.enabledAt || !!matching.review);

/**
 * What changing a job's status from `from` to `to` takes from matching, as its page asks first and
 * its editor says: null when nothing (matching off, never put into matching, or a status it keeps:
 * open or on hold, or one it had left already); else what it loses, said in words (still proposed:
 * the answers and its mutual interests; put into matching before: its mutual interests, if any)
 */
export const leavingMatchingText = (
	matching: JobMatching | null,
	from: JobStatus,
	to: JobStatus
): string | null => {
	if (!matching || !everInMatching(matching) || !keepsMatching(from) || keepsMatching(to)) {
		return null;
	}
	return `${matching.enabledAt ? m.leaving.proposed : m.leaving.before} ${m.leaving.final}`;
};

/** What the dialog that deletes a job adds for a job put into matching (its matches go too) */
export const deleteMatchingDetails = (matching: unknown): string =>
	everInMatching(readJobMatching(matching)) ? m.deleteDetails : '';

/**
 * The line of a job of the dashboard: where it stands in matching, or null (matching off, or the
 * job not proposed). Never a count
 */
export const jobMatchingLabel = (job: { status: JobStatus; matching?: unknown }): string | null => {
	const matching = readJobMatching(job.matching);
	if (!matching) return null;
	const state = jobMatchingState(job.status, matching);
	return state === 'off' ? null : m.label[state];
};

// --- Turning it on or off -----------------------------------------------------------------

/**
 * Why PUT /jobs/:id/matching failed: the job is not open, it lacks its company or its description,
 * it was saved under rules made tighter since, the recruiter proposes as many jobs as allowed
 * already, it changed meanwhile; the session, the recruiter space or the terms; the job gone,
 * matching off, or to try again
 */
export type SwitchFailureKind =
	| 'not-open'
	| 'company'
	| 'description'
	| 'save-again'
	| 'limit'
	| 'changed'
	| 'signed-out'
	| 'no-space'
	| 'terms'
	| 'gone'
	| 'off'
	| 'retry';

export interface SwitchFailure {
	kind: SwitchFailureKind;
	message: string;
}

// Bodies of the API matched (server/protocol.ts, services/jobPostings.ts, services/recruiters.ts):
// English constants whatever the visitor's language
const MATCHING_NEEDS_OPEN_JOB = 'Only an open job description can be proposed to candidates';
const JOB_CHANGED = 'This job posting was changed since you opened it';
const JOB_NOT_FOUND = 'Job posting not found';
const RECRUITER_REQUIRED = 'Create your recruiter space first';
const MATCH_NOT_FOUND = 'Match not found';

const bodyText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** The message of each failure (the limit's names how many jobs) */
const SWITCH_MESSAGES = {
	'not-open': 'notOpen',
	company: 'company',
	description: 'description',
	'save-again': 'saveAgain',
	changed: 'changed',
	'signed-out': 'signedOut',
	'no-space': 'noSpace',
	terms: 'terms',
	gone: 'gone',
	off: 'off',
	retry: 'retry'
} as const satisfies Record<Exclude<SwitchFailureKind, 'limit'>, string>;

export const switchFailure = (status: number | undefined, value: unknown): SwitchFailure => {
	const failure = (kind: SwitchFailureKind): SwitchFailure => ({
		kind,
		message:
			kind === 'limit'
				? m.switchFailure.limit(MATCHING_LIMITS.matchingJobsPerRecruiter)
				: m.switchFailure[SWITCH_MESSAGES[kind]]
	});
	if (isNetworkFailure(value)) return failure('retry');
	const body = bodyText(value);
	switch (status) {
		case 401:
			return failure('signed-out');
		case 403:
			return failure(body === RECRUITER_REQUIRED ? 'no-space' : 'retry');
		case 404:
			// The 404 of a route that does not exist: matching was turned off
			return failure(body === JOB_NOT_FOUND ? 'gone' : 'off');
		case 409:
			if (body === MATCHING_NEEDS_OPEN_JOB) return failure('not-open');
			if (body === JOB_CHANGED) return failure('changed');
			// The route's other 409: as many jobs in matching as a recruiter may have
			return failure('limit');
		case 422: {
			if (isConsentProblem(status, value)) return failure('terms');
			const property = bodyProperty(value);
			if (property === 'company') return failure('company');
			if (property === 'description') return failure('description');
			return failure('save-again');
		}
		default:
			return failure('retry');
	}
};

/** PUT /jobs/:id/matching: the posting as it is then, or why it failed */
export type SwitchResult =
	{ ok: true; job: RecruiterJobDetail } | { ok: false; failure: SwitchFailure };

export const setJobMatching = async (jobId: string, enabled: boolean): Promise<SwitchResult> => {
	try {
		const { data, error } = await portfolioApi
			.jobs({ id: jobId })
			.matching.put({ enabled }, withCredentials);
		if (error || !data) {
			return { ok: false, failure: switchFailure(errorStatus(error), error?.value) };
		}
		return { ok: true, job: data };
	} catch (error) {
		return { ok: false, failure: switchFailure(undefined, error) };
	}
};

// --- The job editor's choice ----------------------------------------------------------------

/**
 * What the job editor asks of a job created open and proposed to candidates (POST /jobs's
 * `matching`): its company and a description (portfolio-common's matchingJobProblem, the API's
 * rule), each on its field; nothing when it is not proposed or not created open (the choice is
 * not sent then)
 */
export const matchingFormErrors = (
	form: Pick<JobForm, 'status' | 'company' | 'description'>,
	proposed: boolean
): Partial<Record<JobFormField, string>> => {
	if (!proposed || form.status !== OPEN_JOB_STATUS) return {};
	const problem = matchingJobProblem(form);
	// The editor's words: the API's rule, and the other way out (unticking the choice)
	return problem ? { [problem.field]: m.formErrors[problem.field] } : {};
};

/**
 * Whether a 409 of POST /jobs is the limit of jobs proposed to candidates at once (the editor then
 * offers to create it without proposing it), not the limit of job descriptions a recruiter keeps
 * (which a creation without matching meets too). The API says it in the visitor's language, the
 * one this page sends: compared in each
 */
export const isMatchingLimitBody = (value: unknown): boolean => {
	const body = bodyText(value);
	return (
		!!body &&
		LOCALES.some(
			(locale) =>
				withLocale(locale, () =>
					matchingMessages.job.tooMany(MATCHING_LIMITS.matchingJobsPerRecruiter)
				) === body
		)
	);
};

/** Whether the editor sends `matching: true` with a new posting: offered, ticked, created open */
export const sendsMatching = (
	form: Pick<JobForm, 'status'>,
	{ offered, proposed }: { offered: boolean; proposed: boolean }
): boolean => offered && proposed && form.status === OPEN_JOB_STATUS;

// --- The deck: the candidates proposed for a job --------------------------------------------

/** A read of the cards proposed for a job, as the deck takes it */
export type CandidatesRead =
	{ ok: true; page: DeckPage<RecruiterCard> } | { ok: false; failure: DecisionFailure };

/** An answer (or its undo), as the deck takes it */
export type CandidateAnswer =
	{ ok: true; match: MutualInterest | null } | { ok: false; failure: DecisionFailure };

/** Eden's answer's Retry-After (a 429's), when the API gave one */
const retryAfterOf = (result: { response?: Response; headers?: unknown }): number | undefined =>
	retryAfterSeconds(result.response?.headers ?? result.headers);

/**
 * GET /recruiter/jobs/:id/candidates: the next card proposed for the job (one at a time) and
 * whether more come. An answer the reader refuses is a read to try again
 */
export const readCandidates = async (jobId: string): Promise<CandidatesRead> => {
	try {
		const result = await portfolioTextApi.recruiter
			.jobs({ id: jobId })
			.candidates.get(withCredentials);
		if (result.error) {
			return {
				ok: false,
				failure: feedFailure(
					errorStatus(result.error),
					result.error.value,
					'recruiter',
					retryAfterOf(result)
				)
			};
		}
		const feed = readRecruiterFeed(result.data);
		if (!feed) return { ok: false, failure: feedFailure(500, '', 'recruiter') };
		return { ok: true, page: { cards: feed.cards, more: feed.more } };
	} catch (error) {
		return { ok: false, failure: feedFailure(undefined, error, 'recruiter') };
	}
};

/**
 * Whether a candidate waits for the recruiter's answer on the job: `some`, `none`, `not-proposed`
 * (409 JOB_NOT_PROPOSED: the API proposes it to nobody although its posting reads as proposed, its
 * stored version saved under rules made tighter since), or `unknown` (the read failed, or is not
 * allowed now). A read of the feed (counted as one): what the card holds is not kept, and the deck
 * reads it again. Never how many
 */
export type CandidatesWaiting = 'some' | 'none' | 'not-proposed' | 'unknown';

export const candidatesWaiting = async (jobId: string): Promise<CandidatesWaiting> => {
	const read = await readCandidates(jobId);
	if (!read.ok) return read.failure.kind === 'job-not-proposed' ? 'not-proposed' : 'unknown';
	return read.page.cards.length > 0 ? 'some' : 'none';
};

const answerResult = (
	result: {
		data: unknown;
		error: { status: unknown; value?: unknown } | null;
		response?: Response;
		headers?: unknown;
	},
	action: 'decide' | 'undo'
): CandidateAnswer => {
	if (result.error) {
		return {
			ok: false,
			failure: decisionFailure(
				errorStatus(result.error),
				result.error.value,
				'recruiter',
				action,
				retryAfterOf(result)
			)
		};
	}
	const read = readDecisionResult(result.data, 'recruiter');
	// Saved all the same: the deck reads again rather than guess what was saved
	if (!read) return { ok: false, failure: decisionFailure(500, '', 'recruiter', action) };
	return { ok: true, match: read.match };
};

/**
 * PUT /recruiter/jobs/:id/candidates/decision: whether the candidate of the card (its `token`, in
 * the body: never in the address) interests the recruiter for the job
 */
export const answerCandidate = async (
	jobId: string,
	token: string,
	decision: MatchDecision
): Promise<CandidateAnswer> => {
	try {
		return answerResult(
			await portfolioTextApi.recruiter
				.jobs({ id: jobId })
				.candidates.decision.put({ token, decision }, withCredentials),
			'decide'
		);
	} catch (error) {
		return { ok: false, failure: decisionFailure(undefined, error, 'recruiter', 'decide') };
	}
};

/**
 * DELETE /recruiter/jobs/:id/candidates/decision: the recruiter's latest answer undone, with the
 * token of the card it was given on (kept in memory: the feed never shows that card again)
 */
export const undoCandidateAnswer = async (
	jobId: string,
	token: string
): Promise<CandidateAnswer> => {
	try {
		return answerResult(
			await portfolioTextApi.recruiter
				.jobs({ id: jobId })
				.candidates.decision.delete({ token }, withCredentials),
			'undo'
		);
	} catch (error) {
		return { ok: false, failure: decisionFailure(undefined, error, 'recruiter', 'undo') };
	}
};

// --- Mutual interests -----------------------------------------------------------------------

/**
 * Why the recruiter's mutual interests could not be read or changed: the session, the recruiter
 * space, the terms, the mutual interest (or its job) gone, matching off, no answer, or an error
 */
export type RecruiterInterestFailure =
	'signed-out' | 'no-space' | 'terms' | 'gone' | 'off' | 'network' | 'error';

export const recruiterInterestFailure = (error: {
	status: unknown;
	value?: unknown;
}): RecruiterInterestFailure => {
	if (isNetworkFailure(error.value)) return 'network';
	const status = errorStatus(error);
	const body = bodyText(error.value);
	if (status === 401) return 'signed-out';
	if (status === 403) return body === RECRUITER_REQUIRED ? 'no-space' : 'error';
	if (isConsentProblem(status, error.value)) return 'terms';
	if (status === 404 && (body === MATCH_NOT_FOUND || body === JOB_NOT_FOUND)) return 'gone';
	// The 404 of a route that does not exist: matching was turned off
	if (matchingOff(status)) return 'off';
	return 'error';
};

/** GET /matches?side=recruiter: a page of the recruiter's mutual interests, the latest first */
export type RecruiterInterestsLoad =
	| { ok: true; interests: RecruiterMutualInterest[]; next: string | null }
	| { ok: false; failure: RecruiterInterestFailure };

const asRecruiters = (list: readonly MutualInterest[]): RecruiterMutualInterest[] =>
	list.filter((interest): interest is RecruiterMutualInterest => interest.side === 'recruiter');

/** The recruiter's mutual interests (one job's with `jobId`), from the start or after `after` */
export const loadRecruiterInterests = async ({
	jobId,
	after
}: {
	jobId?: string;
	after?: string | null;
} = {}): Promise<RecruiterInterestsLoad> => {
	try {
		const { data, error } = await portfolioTextApi.matches.get({
			query: {
				side: 'recruiter',
				...(jobId ? { job: jobId } : {}),
				...(after ? { after } : {})
			},
			...withCredentials
		});
		if (error) return { ok: false, failure: recruiterInterestFailure(error) };
		const list = readMutualInterestList(data, 'recruiter');
		if (!list) return { ok: false, failure: 'error' };
		return { ok: true, interests: asRecruiters(list.matches), next: list.next };
	} catch {
		return { ok: false, failure: 'network' };
	}
};

/** POST /matches/:id/end: the recruiter ends the mutual interest `id` */
export type RecruiterInterestEnd =
	| { ok: true; interest: RecruiterMutualInterest }
	| { ok: false; failure: RecruiterInterestFailure };

export const endRecruiterInterest = async (id: string): Promise<RecruiterInterestEnd> => {
	try {
		const { data, error } = await portfolioTextApi
			.matches({ id })
			.end.post(undefined, withCredentials);
		if (error) return { ok: false, failure: recruiterInterestFailure(error) };
		const interest = readMutualInterest(data, 'recruiter');
		return interest?.side === 'recruiter'
			? { ok: true, interest }
			: { ok: false, failure: 'error' };
	} catch {
		return { ok: false, failure: 'network' };
	}
};
