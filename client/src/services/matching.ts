import {
	CARD_WITHHELD_CRITERIA,
	DISCOVERY_REQUIREMENTS,
	DISCOVERY_STATES,
	JOB_FIELD_PATHS,
	JOB_STATUS_LABELS,
	MATCH_DECISIONS,
	MATCH_END_REASONS,
	MATCHING_LIMITS,
	PERFECT_JOB_CRITERIA,
	intlLocale,
	isValidDomainName,
	type DiscoveryRequirement,
	type DiscoveryState,
	type JobStatus,
	type MatchDecision,
	type MatchEndReason,
	type MatchSide,
	type PerfectJobCriterion
} from 'portfolio-common';
import {
	CANDIDATE_UNAVAILABLE,
	DECISION_FINAL,
	DECISION_NOT_FOUND,
	JOB_NOT_FOUND,
	JOB_NOT_PROPOSED,
	MUTUAL_INTEREST_EXISTS,
	NOT_PROPOSED_TO_RECRUITERS,
	RECRUITER_REQUIRED
} from './apiBodies';
import { isConsentProblem } from './apiErrors';
import type { JobPostingLike } from './jobPosting';
import { formatDay, isNetworkFailure, keptTogether, networkError } from './recruiter';
import {
	isScore,
	jobMatchCriteria,
	transitProvider,
	type JobMatchCriterion,
	type TransitProvider
} from './workflow';
import { m } from './matching.messages';

// Pure helpers of the screens of matching (Path 2, CLAUDE.md "Matching"): a candidate answers the
// open jobs proposed to them, a recruiter the anonymous cards proposed for their job, each in a
// deck (MatchDeck.svelte), and both read their mutual interests. Here: readers of every answer of
// the matching routes, which keep only what the screens may show and leave out what is not what
// the API promises (fail closed), the deck's state and its rules (one answer at a time, undo of
// the latest first answer only, within MATCHING_LIMITS.undoMinutes), the keys and the drag that
// answer, and why an answer failed. The API calls stay in the pages; nothing here knows the UI.
// While MATCHING is off the routes answer a 404 of a route that does not exist: the screens show
// nothing of matching (`matchingOff`).

// --- Small readers ---------------------------------------------------------------------------

/** A moment as the screens say it: '28 Nov 2026, 14:05' (in the browser's time zone) */
export const formatMoment = (date: Date): string =>
	keptTogether(
		date.toLocaleString(intlLocale('en-GB'), {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		})
	);

type Fields = Record<string, unknown>;

const fields = (value: unknown): Fields =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as Fields) : {};

const text = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim() ? value.trim() : undefined;

const OBJECT_ID = /^[0-9a-f]{24}$/i;

const objectId = (value: unknown): string | undefined =>
	typeof value === 'string' && OBJECT_ID.test(value) ? value : undefined;

/** A whole number of months (or of anything counted), 0 or more */
const count = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;

/** An instant the API gave (an ISO text: the matching routes go through portfolioTextApi), as ISO */
const instant = (value: unknown): string | undefined => {
	if (!(typeof value === 'string' || value instanceof Date)) return undefined;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const isJobStatus = (value: unknown): value is JobStatus =>
	typeof value === 'string' && Object.hasOwn(JOB_STATUS_LABELS, value);

const oneOf = <T extends string>(list: readonly T[], value: unknown): T | undefined =>
	list.find((entry) => entry === value);

/** A feed's cursor (`next`), as the API makes them: a time and an id */
const FEED_CURSOR = /^[0-9a-z]{1,11}\.[0-9a-f]{24}$/;

const cursor = (value: unknown): string | null =>
	typeof value === 'string' && FEED_CURSOR.test(value) ? value : null;

// --- The anonymous card ----------------------------------------------------------------------

/** A role on an anonymous card: its title, the months in it (null: no dates), held now */
export interface CardRole {
	title: string;
	months: number | null;
	current: boolean;
}

/** A skill on an anonymous card: its name, the months it was used (null: no project placed) */
export interface CardSkill {
	name: string;
	months: number | null;
}

/** What a recruiter reads of a candidate before both are interested (GET /discovery/card, the feed) */
export interface AnonymousCard {
	headline: string | null;
	/** Months of professional experience in all */
	experienceMonths: number;
	roles: CardRole[];
	skills: CardSkill[];
}

/**
 * An anonymous card, from the API: its four fields only (CANDIDATE_CARD_FIELDS of the API), the
 * roles and skills that are not ones left out, at most as many as the API lists
 * (MATCHING_LIMITS.roles, .skills); undefined for anything that is not a card. Nothing else is
 * kept, whatever the answer holds
 */
export const readAnonymousCard = (value: unknown): AnonymousCard | undefined => {
	const card = fields(value);
	const experienceMonths = count(card.experienceMonths);
	if (experienceMonths === undefined || !Array.isArray(card.roles) || !Array.isArray(card.skills)) {
		return undefined;
	}
	const roles = card.roles.flatMap((entry): CardRole[] => {
		const role = fields(entry);
		const title = text(role.title);
		if (!title) return [];
		return [{ title, months: count(role.months) ?? null, current: role.current === true }];
	});
	const skills = card.skills.flatMap((entry): CardSkill[] => {
		const skill = fields(entry);
		const name = text(skill.name);
		return name ? [{ name, months: count(skill.months) ?? null }] : [];
	});
	return {
		headline: text(card.headline) ?? null,
		experienceMonths,
		roles: roles.slice(0, MATCHING_LIMITS.roles),
		skills: skills.slice(0, MATCHING_LIMITS.skills)
	};
};

/**
 * The outcomes a recruiter reads beside a card: never the commute or the places
 * (CARD_WITHHELD_CRITERIA, which the API never sends: left out here too), never a deal-breaker
 */
export const readCardOutcomes = (value: unknown): JobMatchCriterion[] =>
	jobMatchCriteria(value)
		.filter(
			(entry) =>
				!(CARD_WITHHELD_CRITERIA as readonly PerfectJobCriterion[]).includes(entry.criterion)
		)
		.map((entry) => ({ ...entry, dealBreaker: false }));

// --- The recruiter's feed --------------------------------------------------------------------

/** A card of a recruiter's feed: the token that stands for the candidate (for this recruiter and job) */
export interface RecruiterCard {
	/** What a decision on the card sends back (in a body); kept in memory, never stored */
	token: string;
	card: AnonymousCard;
	outcomes: JobMatchCriterion[];
	/** The candidate said they are interested in this job */
	interested: boolean;
}

/** GET /recruiter/jobs/:id/candidates: one card at a time, and whether there are more */
export interface RecruiterFeed {
	cards: RecruiterCard[];
	more: boolean;
}

/** A card's token, as the API makes them (base64url, about 66 characters) */
const TOKEN = /^[A-Za-z0-9_-]{16,512}$/;

export const readRecruiterCard = (value: unknown): RecruiterCard | undefined => {
	const entry = fields(value);
	const card = readAnonymousCard(entry.card);
	if (!card || typeof entry.token !== 'string' || !TOKEN.test(entry.token)) return undefined;
	return {
		token: entry.token,
		card,
		outcomes: readCardOutcomes(entry.outcomes),
		interested: entry.interested === true
	};
};

/**
 * GET /recruiter/jobs/:id/candidates, read: at most MATCHING_LIMITS.recruiterCardsPerRead cards
 * (one: never a page that would count the job's candidates); undefined for an answer that is not
 * one, and for one that listed cards of which none reads (a web build and an API that disagree:
 * the page says the read failed, to try again, rather than read the same card again and again,
 * each read counted against the hour's reads). No card read, no more: the API says `more` only
 * once it gave a card, and the next card is read once the one held is answered
 */
export const readRecruiterFeed = (value: unknown): RecruiterFeed | undefined => {
	const feed = fields(value);
	if (!Array.isArray(feed.cards)) return undefined;
	const cards = feed.cards.flatMap((entry) => readRecruiterCard(entry) ?? []);
	if (feed.cards.length > 0 && cards.length === 0) return undefined;
	return {
		cards: cards.slice(0, MATCHING_LIMITS.recruiterCardsPerRead),
		more: cards.length > 0 && feed.more === true
	};
};

// --- Job descriptions ------------------------------------------------------------------------

/** A version of a posting (a JobSnapshot), as the screens show it: never its status or recruiter */
export type JobVersion = JobPostingLike & { title: string; description: string };

const isLeaf = (value: unknown): boolean =>
	typeof value === 'string' ||
	(typeof value === 'number' && Number.isFinite(value)) ||
	(Array.isArray(value) && value.every((item) => typeof item === 'string'));

/**
 * A version of a posting, from the API: the fields of a job posting only (JOB_FIELD_PATHS, its
 * status aside), each a text, a number or a list of texts; undefined without a title. Nothing
 * else is kept (who posted it is never read)
 */
export const readJobVersion = (value: unknown): JobVersion | undefined => {
	const source = fields(value);
	const version: Fields = {};
	for (const path of JOB_FIELD_PATHS) {
		if (path === 'status') continue;
		const parts = path.split('.');
		let read: unknown = source;
		for (const part of parts) read = fields(read)[part];
		if (read === undefined || !isLeaf(read)) continue;
		let target = version;
		for (const part of parts.slice(0, -1)) {
			target[part] = fields(target[part]);
			target = target[part] as Fields;
		}
		target[parts.at(-1)!] = read;
	}
	const title = text(version.title);
	if (!title) return undefined;
	return {
		...(version as JobPostingLike),
		title,
		description: typeof version.description === 'string' ? version.description : ''
	};
};

// --- The candidate's feed --------------------------------------------------------------------

/** A job proposed to the candidate: the version scored, with its id and the day it was opened */
export type OpportunityJob = JobVersion & { _id: string; publishedAt: string };

/** How a job does against the candidate's own criteria: theirs to read */
export interface OpportunityScore {
	score: number;
	minScore: number;
	criteria: JobMatchCriterion[];
	transit?: TransitProvider;
}

/** A job of the candidate's feed */
export interface Opportunity extends OpportunityScore {
	job: OpportunityJob;
	/** Its recruiter said they are interested in the candidate */
	interested: boolean;
}

/** GET /opportunities: a page of jobs, the most recently opened first */
export interface CandidateFeed {
	jobs: Opportunity[];
	more: boolean;
	/** The cursor of the next page (`after`); null without more */
	next: string | null;
	/** Travel times are being computed: read again in a moment */
	pending: boolean;
}

/**
 * A score against the candidate's criteria (a feed's job, a mutual interest's score then, the
 * private page's `jobMatch`); undefined for anything that is not one
 */
export const readOpportunityScore = (value: unknown): OpportunityScore | undefined => {
	const source = fields(value);
	if (!isScore(source.score) || !isScore(source.minScore)) return undefined;
	const transit = transitProvider(source.transit);
	return {
		score: source.score,
		minScore: source.minScore,
		criteria: jobMatchCriteria(source.criteria),
		...(transit ? { transit } : {})
	};
};

export const readOpportunity = (value: unknown): Opportunity | undefined => {
	const entry = fields(value);
	const raw = fields(entry.job);
	const version = readJobVersion(raw);
	const _id = objectId(raw._id);
	const publishedAt = instant(raw.publishedAt);
	const score = readOpportunityScore(entry);
	if (!version || !_id || !publishedAt || !score) return undefined;
	return { job: { ...version, _id, publishedAt }, ...score, interested: entry.interested === true };
};

/** GET /opportunities, read; undefined for an answer that is not one */
export const readCandidateFeed = (value: unknown): CandidateFeed | undefined => {
	const feed = fields(value);
	if (!Array.isArray(feed.jobs)) return undefined;
	const more = feed.more === true;
	const next = more ? cursor(feed.next) : null;
	return {
		jobs: feed.jobs
			.flatMap((entry) => readOpportunity(entry) ?? [])
			.slice(0, MATCHING_LIMITS.candidateFeedPage),
		// Without a cursor to read them, there are none to read
		more: more && next !== null,
		next,
		pending: feed.pending === true
	};
};

// --- Mutual interests ------------------------------------------------------------------------

interface MutualInterestBase {
	_id: string;
	matchedAt: string;
	/** The posting was edited since (each side keeps the version matched) */
	changedAt: string | null;
	endedAt: string | null;
	endReason: MatchEndReason | null;
	seen: boolean;
}

/** A mutual interest as its candidate reads it: the version they said yes to, and their score then */
export interface CandidateMutualInterest extends MutualInterestBase, OpportunityScore {
	side: 'candidate';
	/** Null for a version that no longer reads back (a rule made tighter since) */
	job: (JobVersion & { _id: string; status: JobStatus }) | null;
}

/** A mutual interest as its recruiter reads it: their job, and the portfolio once revealed */
export interface RecruiterMutualInterest extends MutualInterestBase {
	side: 'recruiter';
	job: { _id: string; title: string; company?: string; status: JobStatus };
	/** Where their page for recruiters is (`/<domain>/hire`); null while not revealed */
	candidate: { domain: string; title: string | null } | null;
}

export type MutualInterest = CandidateMutualInterest | RecruiterMutualInterest;

/**
 * A mutual interest, from the API (GET /matches, GET /matches/:id, a decision that made one);
 * undefined for anything that is not one, or that is not of the side `side` when it is given
 */
export const readMutualInterest = (
	value: unknown,
	side?: MatchSide
): MutualInterest | undefined => {
	const entry = fields(value);
	const _id = objectId(entry._id);
	const matchedAt = instant(entry.matchedAt);
	if (!_id || !matchedAt || (side && entry.side !== side)) return undefined;
	const endedAt = instant(entry.endedAt) ?? null;
	const base: MutualInterestBase = {
		_id,
		matchedAt,
		changedAt: instant(entry.changedAt) ?? null,
		endedAt,
		endReason: endedAt ? (oneOf(MATCH_END_REASONS, entry.endReason) ?? null) : null,
		seen: entry.seen === true
	};
	if (entry.side === 'candidate') {
		const score = readOpportunityScore(entry);
		if (!score) return undefined;
		const raw = fields(entry.job);
		const version = readJobVersion(raw);
		const jobId = objectId(raw._id);
		const job =
			version && jobId && isJobStatus(raw.status)
				? { ...version, _id: jobId, status: raw.status }
				: null;
		return { ...base, ...score, side: 'candidate', job };
	}
	if (entry.side === 'recruiter') {
		const raw = fields(entry.job);
		const jobId = objectId(raw._id);
		const title = text(raw.title);
		if (!jobId || !title || !isJobStatus(raw.status)) return undefined;
		const company = text(raw.company);
		const revealed = fields(entry.candidate);
		const domain = typeof revealed.domain === 'string' ? revealed.domain : '';
		return {
			...base,
			side: 'recruiter',
			job: { _id: jobId, title, ...(company ? { company } : {}), status: raw.status },
			candidate: isValidDomainName(domain)
				? { domain: domain.toLowerCase(), title: text(revealed.title) ?? null }
				: null
		};
	}
	return undefined;
};

/** GET /matches?side=: a page of mutual interests, the latest first */
export interface MutualInterestList {
	matches: MutualInterest[];
	next: string | null;
}

export const readMutualInterestList = (
	value: unknown,
	side: MatchSide
): MutualInterestList | undefined => {
	const list = fields(value);
	if (!Array.isArray(list.matches)) return undefined;
	return {
		matches: list.matches.flatMap((entry) => readMutualInterest(entry, side) ?? []),
		next: cursor(list.next)
	};
};

/** What a decision (or its undo) left: the side's answer now, and the mutual interest it made */
export interface DecisionResult {
	decision: MatchDecision | null;
	match: MutualInterest | null;
}

/**
 * The answer of PUT or DELETE of a decision of `side`; undefined for one that is not what the API
 * promises (the answer was saved all the same: the screen reads it again rather than guess), a
 * mutual interest that does not read included: never taken for a plain answer, which Undo would
 * offer to take back
 */
export const readDecisionResult = (value: unknown, side: MatchSide): DecisionResult | undefined => {
	const answer = fields(value);
	if (!('decision' in answer) || !('match' in answer)) return undefined;
	const decision = answer.decision === null ? null : oneOf(MATCH_DECISIONS, answer.decision);
	if (decision === undefined) return undefined;
	if (answer.match === null) return { decision, match: null };
	const match = readMutualInterest(answer.match, side);
	return match ? { decision, match } : undefined;
};

// --- Discovery -------------------------------------------------------------------------------

/** GET /discovery: whether the candidate is proposed to recruiters, and what they still miss */
export interface DiscoveryStatus {
	state: DiscoveryState;
	enabledAt: string | null;
	consentExpiresAt: string | null;
	missing: DiscoveryRequirement[];
	/** Their journey's job match minimum, the one bar a job is held to; null without one */
	minScore: number | null;
	card: { headline: string | null; hiddenExperiences: string[] };
}

/** GET /discovery, read; undefined for an answer that is not one (the screen shows nothing of it) */
export const readDiscovery = (value: unknown): DiscoveryStatus | undefined => {
	const status = fields(value);
	const state = oneOf(DISCOVERY_STATES, status.state);
	if (!state || !Array.isArray(status.missing)) return undefined;
	const card = fields(status.card);
	return {
		state,
		enabledAt: instant(status.enabledAt) ?? null,
		consentExpiresAt: instant(status.consentExpiresAt) ?? null,
		// In the order the API lists them, each once
		missing: DISCOVERY_REQUIREMENTS.filter((requirement) =>
			(status.missing as unknown[]).includes(requirement)
		),
		minScore: isScore(status.minScore) ? status.minScore : null,
		card: {
			headline: text(card.headline) ?? null,
			hiddenExperiences: Array.isArray(card.hiddenExperiences)
				? card.hiddenExperiences.flatMap((id) => objectId(id) ?? [])
				: []
		}
	};
};

/** Why a professional experience of the candidate is not a role of their card */
export const CARD_ROLE_WITHHELD = ['hidden', 'title', 'upcoming', 'limit'] as const;
export type CardRoleWithheld = (typeof CARD_ROLE_WITHHELD)[number];

/** GET /discovery/card: the card as recruiters read it, and what it leaves out, for the candidate */
export interface CardPreview {
	card: AnonymousCard;
	/** The criteria whose outcome a recruiter reads beside the card */
	outcomes: PerfectJobCriterion[];
	withheld: {
		headline: boolean;
		roles: { experience: string; reason: CardRoleWithheld }[];
		skills: string[];
	};
}

export const readCardPreview = (value: unknown): CardPreview | undefined => {
	const preview = fields(value);
	const card = readAnonymousCard(preview.card);
	if (!card) return undefined;
	const withheld = fields(preview.withheld);
	const outcomes = Array.isArray(preview.outcomes) ? preview.outcomes : [];
	return {
		card,
		outcomes: PERFECT_JOB_CRITERIA.filter(
			(criterion) =>
				outcomes.includes(criterion) &&
				!(CARD_WITHHELD_CRITERIA as readonly PerfectJobCriterion[]).includes(criterion)
		),
		withheld: {
			headline: withheld.headline === true,
			roles: (Array.isArray(withheld.roles) ? withheld.roles : []).flatMap((entry) => {
				const role = fields(entry);
				const experience = objectId(role.experience);
				const reason = oneOf(CARD_ROLE_WITHHELD, role.reason);
				return experience && reason ? [{ experience, reason }] : [];
			}),
			skills: (Array.isArray(withheld.skills) ? withheld.skills : []).flatMap(
				(name) => text(name) ?? []
			)
		}
	};
};

// --- Notifications ---------------------------------------------------------------------------

/** GET /me/notifications: the mutual interests going on not seen yet, per side (a badge) */
export interface MatchNotifications {
	candidate: number;
	recruiter: number;
}

/** GET /me/notifications, read: a count that is not one is none */
export const readNotifications = (value: unknown): MatchNotifications => {
	const unseen = fields(fields(value).mutualInterests);
	return { candidate: count(unseen.candidate) ?? 0, recruiter: count(unseen.recruiter) ?? 0 };
};

// --- Matching off ----------------------------------------------------------------------------

/**
 * GET /discovery or GET /me/notifications answered that matching is off: while MATCHING is off
 * the API does not register its routes, which answer the 404 of a route that does not exist. The
 * screens then show nothing of matching, and say nothing of it
 */
export const matchingOff = (status: number | undefined): boolean => status === 404;

// --- The deck --------------------------------------------------------------------------------

/** What a read of a feed gives the deck: its cards, and whether there are more to read */
export interface DeckPage<T> {
	cards: readonly T[];
	more: boolean;
	/** The candidate's cursor of the next page; none for a recruiter (the next card is read once one is answered) */
	next?: string | null;
	/** Travel times are being computed (the candidate's feed) */
	pending?: boolean;
}

/** The latest answer given from the deck, while it may be undone */
export interface DeckAnswer<T> {
	card: T;
	decision: MatchDecision;
	/** When it was sent (milliseconds): the undo window counts from it */
	at: number;
	/** The deck's first answer on this card (an answer given again after an undo cannot be undone) */
	first: boolean;
}

/** A request of the deck on its way: one at a time */
export type DeckSending<T> =
	| { kind: 'decision'; card: T; decision: MatchDecision; at: number; first: boolean }
	| { kind: 'undo'; card: T };

/**
 * A deck: the cards to answer, the top one first, whether the feed has more, and what was answered
 * from it. Immutable: every change makes a new one
 */
export interface Deck<T> {
	cards: readonly T[];
	more: boolean;
	next: string | null;
	pending: boolean;
	/** A read of the feed is on its way */
	loading: boolean;
	/** The keys of the cards answered from this deck (an answer given again is no first answer) */
	answered: readonly string[];
	last: DeckAnswer<T> | null;
	sending: DeckSending<T> | null;
}

export type CardKey<T> = (card: T) => string;

/** The cards of `incoming` that are not among `held`, nor twice in it */
const fresh = <T>(held: readonly T[], incoming: readonly T[], key: CardKey<T>): T[] => {
	const seen = new Set(held.map(key));
	return incoming.filter((card) => {
		const id = key(card);
		if (seen.has(id)) return false;
		seen.add(id);
		return true;
	});
};

/** An empty deck, before its first read */
export const emptyDeck = <T>(): Deck<T> => ({
	cards: [],
	more: false,
	next: null,
	pending: false,
	loading: false,
	answered: [],
	last: null,
	sending: null
});

/** A read of the feed starts */
export const deckLoading = <T>(deck: Deck<T>): Deck<T> => ({ ...deck, loading: true });

/** A read failed: the deck is as it was (its cards stay) */
export const deckLoadFailed = <T>(deck: Deck<T>): Deck<T> => ({ ...deck, loading: false });

/**
 * A read of the feed arrived: its cards go under those held (each once: a card held, on its way or
 * answered already is not added again, as a read that left before an answer was saved may still
 * list it), with whether there are more after them. Travel times still being computed (`pending`)
 * stay said until a read from the start (`fromStart`) says otherwise: the jobs waiting for them may
 * be behind a cursor read since, which says nothing of them
 */
export const appendPage = <T>(
	deck: Deck<T>,
	page: DeckPage<T>,
	key: CardKey<T>,
	fromStart = false
): Deck<T> => {
	const held = [
		...deck.cards,
		...(deck.sending ? [deck.sending.card] : []),
		...(deck.last ? [deck.last.card] : [])
	];
	const answered = new Set(deck.answered);
	return {
		...deck,
		cards: [
			...deck.cards,
			...fresh(held, page.cards, key).filter((card) => !answered.has(key(card)))
		],
		more: page.more,
		next: page.more ? (page.next ?? null) : null,
		pending: page.pending === true || (!fromStart && deck.pending),
		loading: false
	};
};

/** The card on top: the one the buttons and keys answer */
export const topCard = <T>(deck: Deck<T>): T | undefined => deck.cards[0];

/**
 * Whether another card comes after the one on top: one held under it (a card undone comes back
 * over the next one already read), or more to read. Never how many
 */
export const moreAfterTop = <T>(deck: Deck<T>): boolean => deck.cards.length > 1 || deck.more;

/** Whether the deck takes an answer now: a card on top, nothing on its way */
export const canDecide = <T>(deck: Deck<T>): boolean => !deck.sending && deck.cards.length > 0;

/**
 * The top card is answered with `decision` at `at`: it leaves the deck at once (the next shows)
 * while the answer is on its way. Undo is for the latest answer attempted only: the one before goes
 * (should this one fail, Undo never takes back an earlier card than the one just acted on).
 * Unchanged when the deck takes no answer now
 */
export const startDecision = <T>(
	deck: Deck<T>,
	decision: MatchDecision,
	key: CardKey<T>,
	at: number
): Deck<T> => {
	const card = topCard(deck);
	if (!card || deck.sending) return deck;
	return {
		...deck,
		cards: deck.cards.slice(1),
		last: null,
		sending: { kind: 'decision', card, decision, at, first: !deck.answered.includes(key(card)) }
	};
};

/**
 * How long a card shown takes no answer (milliseconds): the second click of a double click, a
 * second tap or a key pressed twice would otherwise answer the next card, which the person never
 * saw (and could make a mutual interest, which reveals a portfolio). Counted from the moment the
 * card on top changed, for whatever reason (an answer, its failure, an undo, the moment both are
 * interested closed, the next card read)
 */
export const ANSWER_SETTLE_MS = 500;

/** Whether a card shown on top since `shownAt` takes an answer at `now` */
export const answerSettled = (shownAt: number, now: number): boolean =>
	now - shownAt >= ANSWER_SETTLE_MS;

/**
 * The answer on its way was saved. It can be undone unless it made a mutual interest (`mutual`:
 * a mutual interest is never undone by a decision)
 */
export const decisionSaved = <T>(deck: Deck<T>, key: CardKey<T>, mutual: boolean): Deck<T> => {
	const sending = deck.sending;
	if (sending?.kind !== 'decision') return deck;
	const id = key(sending.card);
	return {
		...deck,
		sending: null,
		answered: deck.answered.includes(id) ? deck.answered : [...deck.answered, id],
		last: mutual
			? null
			: { card: sending.card, decision: sending.decision, at: sending.at, first: sending.first }
	};
};

/**
 * The answer on its way failed: its card comes back on top (`restore`: to try again), or leaves
 * for good (`drop`: no longer proposed, or both interested already)
 */
export const decisionFailed = <T>(deck: Deck<T>, outcome: 'restore' | 'drop'): Deck<T> => {
	const sending = deck.sending;
	if (sending?.kind !== 'decision') return deck;
	return {
		...deck,
		sending: null,
		cards: outcome === 'restore' ? [sending.card, ...deck.cards] : deck.cards
	};
};

/** How long an answer can be undone, in milliseconds (MATCHING_LIMITS.undoMinutes) */
export const UNDO_WINDOW_MS = MATCHING_LIMITS.undoMinutes * 60_000;

/**
 * Whether the latest answer can be undone at `now`: the API's rules (within
 * MATCHING_LIMITS.undoMinutes, the latest answer, and the first on that card: an answer given
 * again after an undo is changed by answering again), nothing on its way, no read on its way
 * (its card could come back twice)
 */
export const canUndo = <T>(deck: Deck<T>, now: number): boolean =>
	!!deck.last &&
	deck.last.first &&
	!deck.sending &&
	!deck.loading &&
	now - deck.last.at <= UNDO_WINDOW_MS;

/** The undo of the latest answer starts; unchanged when it cannot be undone at `now` */
export const startUndo = <T>(deck: Deck<T>, now: number): Deck<T> =>
	canUndo(deck, now) && deck.last
		? { ...deck, sending: { kind: 'undo', card: deck.last.card } }
		: deck;

/** The undo went through: the card is back on top, to answer again (that answer is final) */
export const undoSaved = <T>(deck: Deck<T>, key: CardKey<T>): Deck<T> => {
	const sending = deck.sending;
	if (sending?.kind !== 'undo') return deck;
	const id = key(sending.card);
	return {
		...deck,
		sending: null,
		last: null,
		cards: [sending.card, ...deck.cards.filter((card) => key(card) !== id)]
	};
};

/**
 * The undo failed: the answer stays, and can be undone again (`keep`: a failure to try again) or
 * not anymore (`final`: past its window, another answer since, or gone)
 */
export const undoFailed = <T>(deck: Deck<T>, outcome: 'keep' | 'final'): Deck<T> => {
	if (deck.sending?.kind !== 'undo') return deck;
	return { ...deck, sending: null, last: outcome === 'final' ? null : deck.last };
};

/**
 * Whether the deck reads its feed again now. A recruiter reads the next card once the one held is
 * answered (the API proposes it once the answer is saved); a candidate reads the next page while
 * a few cards are left (MATCHING_LIMITS.candidateFeedPage a page)
 */
export const shouldLoadMore = <T>(deck: Deck<T>, side: MatchSide): boolean => {
	if (deck.loading || !deck.more) return false;
	if (side === 'recruiter') return deck.cards.length === 0 && !deck.sending;
	return deck.next !== null && deck.cards.length <= 3;
};

/**
 * What the deck shows: the moment both are interested (until the person goes on), nothing once it
 * stopped (the page says why: `onStop`), a placeholder before its first read, the card on top, a
 * placeholder while the next one is coming (a read, or an answer on its way with no card left), a
 * failed read to try again, or that there is nothing to answer. Never the empty state while it
 * stopped, nor while a card may still come
 */
export type DeckView =
	'moment' | 'stopped' | 'placeholder' | 'card' | 'waiting' | 'error' | 'empty';

export const deckView = <T>({
	deck,
	side,
	started,
	stopped,
	moment,
	readError
}: {
	deck: Deck<T>;
	side: MatchSide;
	/** Its first read came back */
	started: boolean;
	stopped: boolean;
	/** A mutual interest is shown */
	moment: boolean;
	/** The latest read failed, to try again */
	readError: boolean;
}): DeckView => {
	if (moment) return 'moment';
	if (stopped) return 'stopped';
	if (!started) return 'placeholder';
	if (deck.cards.length > 0) return 'card';
	if (deck.sending || deck.loading) return 'waiting';
	if (readError) return 'error';
	return shouldLoadMore(deck, side) ? 'waiting' : 'empty';
};

// --- Keys and drag ---------------------------------------------------------------------------

export type DeckAction = MatchDecision | 'undo';

/** What a key pressed inside the deck needs to say */
export interface DeckKey {
	key: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	altKey?: boolean;
	isComposing?: boolean;
	repeat?: boolean;
	defaultPrevented?: boolean;
	target?: unknown;
}

/** An element that takes text: the keys are its own */
const isEditable = (target: unknown): boolean => {
	const element = fields(target);
	const tag = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
	return (
		tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable === true
	);
};

/**
 * The deck's shortcut of a key pressed while the focus is inside it (WCAG 2.1.4: they work there
 * only): ← passes, → says Interested, Z undoes. None with a modifier (the browser's and the
 * screen reader's own), while a text is being composed, for a key held down (one answer per
 * press), or in a field that takes text
 */
export const deckKeyAction = (event: DeckKey): DeckAction | null => {
	if (event.ctrlKey || event.metaKey || event.altKey) return null;
	if (event.isComposing || event.repeat || event.defaultPrevented) return null;
	if (isEditable(event.target)) return null;
	switch (event.key) {
		case 'ArrowLeft':
			return 'pass';
		case 'ArrowRight':
			return 'interested';
		case 'z':
		case 'Z':
			return 'undo';
		default:
			return null;
	}
};

/** How far a pointer moves before the drag knows its direction, in pixels */
export const DRAG_LOCK_PX = 10;
/** The share of the card's width a card dragged sideways must travel to answer */
export const DRAG_DISTANCE = 0.3;
/** Or the speed of a flick, in pixels per millisecond */
export const DRAG_SPEED = 0.5;
/** The share of the card's width a flick travels at least (a quick scroll is no answer) */
export const DRAG_FLICK_DISTANCE = 0.15;

/**
 * What a drag never starts on: the card's controls, and its description (folded or read: text to
 * select, never a gesture that answers)
 */
export const NOT_DRAGGED =
	'a, button, input, select, textarea, summary, details, label, .prose, [contenteditable="true"]';

/**
 * Whether a pointer pressed on `target` starts the optional drag: a finger or a pen only (with a
 * mouse, the buttons and the keys answer, and a drag would fight text selection), never on what
 * NOT_DRAGGED names. An answer the other side already gave makes a mutual interest at once, which
 * nothing takes back: an answer is never given by accident
 */
export const dragStarts = (
	pointerType: string,
	target: { closest?: (selector: string) => unknown } | null | undefined
): boolean =>
	(pointerType === 'touch' || pointerType === 'pen') &&
	typeof target?.closest === 'function' &&
	!target.closest(NOT_DRAGGED);

/**
 * The direction a drag is locked to once it moved DRAG_LOCK_PX: `x` drags the card, `y` gives the
 * gesture back to the page's scroll; null before
 */
export const dragAxis = ({ dx, dy }: { dx: number; dy: number }): 'x' | 'y' | null => {
	if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_LOCK_PX) return null;
	return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
};

/**
 * What a card dragged sideways answers once let go: right says Interested, left passes, when it
 * travelled DRAG_DISTANCE of its width, or was flicked at DRAG_SPEED over DRAG_FLICK_DISTANCE of
 * it at least; `cancel` otherwise (it goes back), and for a drag that was not sideways
 */
export const dragDecision = ({
	dx,
	dy,
	width,
	ms
}: {
	dx: number;
	dy: number;
	width: number;
	ms: number;
}): MatchDecision | 'cancel' => {
	if (dragAxis({ dx, dy }) !== 'x') return 'cancel';
	if (!(width > 0)) return 'cancel';
	const far = Math.abs(dx) >= width * DRAG_DISTANCE;
	const flicked =
		ms > 0 && Math.abs(dx) / ms >= DRAG_SPEED && Math.abs(dx) >= width * DRAG_FLICK_DISTANCE;
	if (!far && !flicked) return 'cancel';
	return dx > 0 ? 'interested' : 'pass';
};

// --- Failures --------------------------------------------------------------------------------

/**
 * Why an answer, or its undo, did not go through, and what the deck does: `retry` and `limit`
 * bring the card back (said in an alert); `gone` and `mutual` drop it (no longer proposed, or both
 * interested already); `final` stops offering Undo; the others stop the deck, for the page to say
 * why (signed out, not proposed to recruiters, the job not proposed or gone, the terms to accept,
 * no recruiter space, matching off)
 */
export type DecisionFailureKind =
	| 'retry'
	| 'limit'
	| 'gone'
	| 'mutual'
	| 'final'
	| 'signed-out'
	| 'not-proposed'
	| 'job-not-proposed'
	| 'job-gone'
	| 'terms'
	| 'no-space'
	| 'off';

export interface DecisionFailure {
	kind: DecisionFailureKind;
	message: string;
	/**
	 * A 429's Retry-After, in seconds, when it gave one: the message says from when, and the deck
	 * takes no answer (or no read, for a read's limit) until then
	 */
	retryAfter?: number;
}

/** A 429's failure: from when it can be tried again (`retryAfter` seconds after `now`), when known */
const limitFailure = (
	retryAfter: number | undefined,
	now: number,
	until: (moment: string) => string,
	later: string
): DecisionFailure =>
	retryAfter
		? { kind: 'limit', message: until(formatMoment(new Date(now + retryAfter * 1000))), retryAfter }
		: { kind: 'limit', message: later };

/** The failures after which the deck takes no answer: the page says why */
const STOPPING: readonly DecisionFailureKind[] = [
	'signed-out',
	'not-proposed',
	'job-not-proposed',
	'job-gone',
	'terms',
	'no-space',
	'off'
];

export const stopsDeck = (failure: DecisionFailure): boolean => STOPPING.includes(failure.kind);

/** A 429's Retry-After (seconds, from the answer's headers); undefined without a usable one */
export const retryAfterSeconds = (headers: unknown): number | undefined => {
	const value =
		headers instanceof Headers
			? headers.get('retry-after')
			: (fields(headers)['retry-after'] ?? fields(headers)['Retry-After']);
	const seconds = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : NaN;
	return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
};

/**
 * Why an answer of `side` (`action`: a decision, or its undo) failed, from the API's status and
 * body: the bodies of server/protocol.ts are matched, never shown; a request that got no answer
 * is tried again
 */
export const decisionFailure = (
	status: number | undefined,
	value: unknown,
	side: MatchSide,
	action: 'decide' | 'undo',
	retryAfter?: number,
	now = Date.now()
): DecisionFailure => {
	const retry: DecisionFailure = {
		kind: 'retry',
		message: action === 'undo' ? m.failure.undo : m.failure.retry
	};
	if (isNetworkFailure(value)) return { ...retry, message: networkError() };
	const body = typeof value === 'string' ? value.trim() : '';
	const gone = side === 'candidate' ? m.candidate.gone : m.recruiter.gone;
	switch (status) {
		case 401:
			return { kind: 'signed-out', message: m.failure.signedOut };
		case 403:
			if (body === NOT_PROPOSED_TO_RECRUITERS) {
				return { kind: 'not-proposed', message: m.failure.notProposed };
			}
			return body === RECRUITER_REQUIRED ? { kind: 'no-space', message: m.failure.noSpace } : retry;
		case 404:
			if (body === DECISION_NOT_FOUND) return { kind: 'final', message: m.failure.nothingToUndo };
			if (body === JOB_NOT_FOUND) {
				// A candidate's job no longer proposed to them; a recruiter's job deleted
				return side === 'candidate'
					? { kind: 'gone', message: gone }
					: { kind: 'job-gone', message: m.failure.jobGone };
			}
			// The 404 of a route that does not exist: matching was turned off
			return { kind: 'off', message: m.failure.off };
		case 409:
			if (body === DECISION_FINAL) return { kind: 'final', message: m.failure.final };
			if (body === MUTUAL_INTEREST_EXISTS) return { kind: 'mutual', message: m.failure.mutual };
			if (body === CANDIDATE_UNAVAILABLE) return { kind: 'gone', message: gone };
			if (body === JOB_NOT_PROPOSED) {
				return { kind: 'job-not-proposed', message: m.failure.jobNotProposed };
			}
			return retry;
		case 422:
			return isConsentProblem(status, value) ? { kind: 'terms', message: m.failure.terms } : retry;
		case 429:
			return limitFailure(retryAfter, now, m.failure.limitUntil, m.failure.limit);
		default:
			return retry;
	}
};

/**
 * Why a read of a feed of `side` failed (GET /opportunities, GET /recruiter/jobs/:id/candidates),
 * as the deck says it: the same kinds as an answer's (`retry` and `limit` keep the deck, which
 * offers to read again; the others stop it, for the page to say why)
 */
export const feedFailure = (
	status: number | undefined,
	value: unknown,
	side: MatchSide,
	retryAfter?: number,
	now = Date.now()
): DecisionFailure => {
	const retry: DecisionFailure = {
		kind: 'retry',
		message: side === 'candidate' ? m.candidate.loadFailed : m.recruiter.loadFailed
	};
	if (isNetworkFailure(value)) return retry;
	const body = typeof value === 'string' ? value.trim() : '';
	switch (status) {
		case 401:
			return { kind: 'signed-out', message: m.failure.signedOut };
		case 403:
			if (body === NOT_PROPOSED_TO_RECRUITERS) {
				return { kind: 'not-proposed', message: m.failure.notProposed };
			}
			return body === RECRUITER_REQUIRED ? { kind: 'no-space', message: m.failure.noSpace } : retry;
		case 404:
			return body === JOB_NOT_FOUND
				? { kind: 'job-gone', message: m.failure.jobGone }
				: { kind: 'off', message: m.failure.off };
		case 409:
			return body === JOB_NOT_PROPOSED
				? { kind: 'job-not-proposed', message: m.failure.jobNotProposed }
				: retry;
		case 422:
			return isConsentProblem(status, value) ? { kind: 'terms', message: m.failure.terms } : retry;
		case 429:
			return limitFailure(retryAfter, now, m.failure.readLimitUntil, m.failure.readLimit);
		default:
			return retry;
	}
};

// --- Copy ------------------------------------------------------------------------------------

/** The buttons' labels */
export const decisionLabel = (action: DeckAction): string => m.decision[action];

/**
 * What the deck says once an answer (or its undo) went through. A recruiter's names nobody (the
 * card is anonymous) and counts nothing; a candidate's names the job (`title`)
 */
export const deckAnnouncement = (
	side: MatchSide,
	event: MatchDecision | 'undone',
	title = ''
): string => {
	const said = event === 'pass' ? 'passed' : event;
	if (side === 'recruiter') return m.recruiter[said];
	return m.candidate[said](title);
};

/**
 * Under a recruiter's card: whether other candidates come after it, never how many (counts across
 * jobs that differ by one term would tell candidates' floors)
 */
export const recruiterQueueText = (more: boolean): string =>
	more ? m.recruiter.more : m.recruiter.last;

/**
 * Where a mutual interest stands, as `interest.side` reads it: going on, or ended (by them, by the
 * other side, or because the job is no longer open). Never a bare "match" (decision 11)
 */
export const mutualInterestStateText = (
	interest: Pick<MutualInterestBase, 'endedAt' | 'endReason'> & { side: MatchSide }
): string => {
	if (!interest.endedAt) return m.mutualInterest.ongoing;
	switch (interest.endReason) {
		case null:
			return m.mutualInterest.ended;
		case 'job_closed':
			return m.mutualInterest.jobClosed;
		default:
			if (interest.endReason === interest.side) return m.mutualInterest.endedByYou;
			return interest.side === 'candidate'
				? m.mutualInterest.endedByRecruiter
				: m.mutualInterest.endedByCandidate;
	}
};

/** That the job description was edited since both were interested; null while it was not */
export const mutualInterestChangeText = (
	interest: Pick<MutualInterestBase, 'changedAt'> & { side: MatchSide }
): string | null => (interest.changedAt ? m.mutualInterest.changed[interest.side] : null);

/** The day both became interested: 'Both interested on 20 Nov 2026' */
export const matchedOnText = (matchedAt: string): string =>
	m.mutualInterest.matchedOn(formatDay(matchedAt));
