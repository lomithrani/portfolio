import { describe, expect, it } from 'vitest';
import {
	LOCALES,
	MATCHING_LIMITS,
	messageSource,
	withLocale,
	type MessageTree
} from 'portfolio-common';
import { networkError } from '../recruiter';
import {
	ANSWER_SETTLE_MS,
	UNDO_WINDOW_MS,
	answerSettled,
	appendPage,
	canDecide,
	canUndo,
	deckAnnouncement,
	deckKeyAction,
	deckLoadFailed,
	deckLoading,
	decisionFailed,
	decisionFailure,
	decisionLabel,
	decisionSaved,
	deckView,
	feedFailure,
	dragAxis,
	dragDecision,
	dragStarts,
	emptyDeck,
	formatMoment,
	matchedOnText,
	matchingOff,
	moreAfterTop,
	mutualInterestChangeText,
	mutualInterestStateText,
	readAnonymousCard,
	readCandidateFeed,
	readCardOutcomes,
	readCardPreview,
	readDecisionResult,
	readDiscovery,
	readJobVersion,
	readMutualInterest,
	readMutualInterestList,
	readNotifications,
	readOpportunity,
	readRecruiterFeed,
	recruiterQueueText,
	retryAfterSeconds,
	shouldLoadMore,
	startDecision,
	startUndo,
	stopsDeck,
	topCard,
	undoFailed,
	undoSaved,
	type Deck,
	type MutualInterest
} from '../matching';
import { m } from '../matching.messages';
import { m as cards } from '#components/matching/cards.messages.ts';
import { m as outcomes } from '#components/matching/CriterionOutcomes.messages.ts';

// The screens of matching (Path 2): what they keep of the API's answers, the deck's state and
// rules, the keys and the drag that answer, why an answer failed, and what a recruiter reads
// (never a count of candidates)

const JOB_ID = '65e2e0000000000000000101';
const MATCH_ID = '65e2e00000000000000000aa';

const CARD = {
	headline: 'Platform engineer, distributed systems',
	experienceMonths: 75,
	roles: [
		{ title: 'Staff engineer', months: 26, current: true },
		{ title: 'Backend engineer', months: 49, current: false }
	],
	skills: [
		{ name: 'Kafka', months: 40 },
		{ name: 'Go', months: null }
	]
};

const TOKEN = 'AQ' + 'x'.repeat(64);

const VERSION = {
	title: 'Staff Platform Engineer',
	description: 'Build the **platform**.',
	company: 'Acme',
	location: {
		country: 'FR',
		city: 'Lyon',
		postalCode: '69002',
		workMode: 'hybrid',
		remoteDaysPerWeek: 2
	},
	contract: { type: 'cdi' },
	workingTime: { arrangement: 'annual_days', daysPerYear: 218 },
	pay: { min: 6500000, max: 8000000, currency: 'EUR', period: 'year' },
	requirements: { seniority: 'senior', skills: ['Kafka', 'Go'] },
	benefits: ['Meal vouchers']
};

const OPPORTUNITY = {
	job: { ...VERSION, _id: JOB_ID, publishedAt: '2026-11-03T09:00:00.000Z' },
	score: 82,
	minScore: 60,
	criteria: [
		{ criterion: 'pay', outcome: 'match' },
		{ criterion: 'commute', outcome: 'unknown' }
	],
	interested: true
};

describe('the anonymous card', () => {
	it('keeps its four fields, and nothing else the answer holds', () => {
		expect(
			readAnonymousCard({
				...CARD,
				name: 'Jane Doe',
				domain: 'jane-doe',
				email: 'jane@example.com',
				roles: [{ ...CARD.roles[0], company: 'Globex' }, CARD.roles[1]]
			})
		).toEqual(CARD);
	});

	it('leaves out what is not a role or a skill, and reads no time as no time', () => {
		expect(
			readAnonymousCard({
				headline: '   ',
				experienceMonths: 0,
				roles: [
					{ title: '  Engineer  ', months: -3, current: 'yes' },
					{ title: '', months: 3 },
					null,
					'Engineer'
				],
				skills: [{ name: 'Rust', months: 2.5 }, { months: 3 }, 'Go']
			})
		).toEqual({
			headline: null,
			experienceMonths: 0,
			roles: [{ title: 'Engineer', months: null, current: false }],
			skills: [{ name: 'Rust', months: null }]
		});
	});

	it('lists no more roles and skills than the API does', () => {
		const card = readAnonymousCard({
			...CARD,
			roles: Array.from({ length: 20 }, (_, index) => ({ title: `Role ${index}`, months: 1 })),
			skills: Array.from({ length: 40 }, (_, index) => ({ name: `Skill ${index}`, months: 1 }))
		});
		expect(card?.roles).toHaveLength(MATCHING_LIMITS.roles);
		expect(card?.skills).toHaveLength(MATCHING_LIMITS.skills);
	});

	it('is no card when the answer is not one', () => {
		for (const junk of [
			undefined,
			null,
			'card',
			[],
			{},
			{ ...CARD, experienceMonths: -1 },
			{ ...CARD, experienceMonths: '75' },
			{ ...CARD, roles: undefined },
			{ ...CARD, skills: 'Kafka' }
		]) {
			expect(readAnonymousCard(junk)).toBeUndefined();
		}
	});

	it('shows a recruiter no commute, no place and no deal-breaker beside it', () => {
		expect(
			readCardOutcomes([
				{ criterion: 'pay', outcome: 'partial' },
				{ criterion: 'commute', outcome: 'match' },
				{ criterion: 'cities', outcome: 'miss' },
				{ criterion: 'contractTypes', outcome: 'miss', dealBreaker: true },
				{ criterion: 'seniority', outcome: 'miss', notStated: true },
				{ criterion: 'pay', outcome: 'match' },
				{ criterion: 'nope', outcome: 'match' }
			])
		).toEqual([
			{ criterion: 'pay', outcome: 'partial', notStated: false, dealBreaker: false },
			{ criterion: 'contractTypes', outcome: 'miss', notStated: false, dealBreaker: false },
			{ criterion: 'seniority', outcome: 'miss', notStated: true, dealBreaker: false }
		]);
		expect(readCardOutcomes('pay')).toEqual([]);
	});
});

describe("the recruiter's feed", () => {
	const entry = { token: TOKEN, card: CARD, outcomes: [], interested: true };

	it('keeps one card at a time, and whether there are more: never how many', () => {
		expect(readRecruiterFeed({ cards: [entry], more: true })).toEqual({
			cards: [{ token: TOKEN, card: CARD, outcomes: [], interested: true }],
			more: true
		});
		const feed = readRecruiterFeed({ cards: [entry, { ...entry, token: 'B' + TOKEN }], more: 1 });
		expect(feed?.cards).toHaveLength(MATCHING_LIMITS.recruiterCardsPerRead);
		expect(feed?.more).toBe(false);
	});

	it('leaves out a card without a token, or with one that is not a token', () => {
		for (const token of [undefined, '', 'short', 'not a token!'.repeat(4), 42]) {
			expect(
				readRecruiterFeed({ cards: [{ ...entry, token }, entry], more: false })?.cards
			).toEqual([{ token: TOKEN, card: CARD, outcomes: [], interested: true }]);
		}
		expect(readRecruiterFeed({ more: true })).toBeUndefined();
		expect(readRecruiterFeed(null)).toBeUndefined();
	});

	it('fails closed when it listed cards of which none reads, rather than read them again', () => {
		// A web build and an API that disagree: a read that failed, never "nothing, but more"
		// (the deck would read the same card again and again, each read counted)
		for (const card of [
			{ ...entry, token: 'x' },
			{ ...entry, card: {} }
		]) {
			expect(readRecruiterFeed({ cards: [card], more: true })).toBeUndefined();
		}
		// No card read, no more to read: the next card comes once one is answered
		expect(readRecruiterFeed({ cards: [], more: true })).toEqual({ cards: [], more: false });
	});
});

describe("the candidate's feed", () => {
	it('keeps the fields of a job posting only: never who posted it, nor its status', () => {
		expect(
			readJobVersion({
				...VERSION,
				status: 'open',
				recruiter: '65e2e0000000000000000001',
				recruiterEmail: 'hr@acme.example',
				location: { ...VERSION.location, latitude: 45.76 },
				pay: { ...VERSION.pay, min: Number.NaN }
			})
		).toEqual({
			...VERSION,
			pay: { max: 8000000, currency: 'EUR', period: 'year' }
		});
		expect(readJobVersion({ ...VERSION, description: undefined })?.description).toBe('');
		expect(readJobVersion({ ...VERSION, title: ' ' })).toBeUndefined();
		expect(readJobVersion({ ...VERSION, benefits: ['ok', 3] })?.benefits).toBeUndefined();
	});

	it('reads a job proposed to the candidate, dated and scored against their criteria', () => {
		expect(readOpportunity({ ...OPPORTUNITY, transit: 'here' })).toEqual({
			job: { ...VERSION, _id: JOB_ID, publishedAt: '2026-11-03T09:00:00.000Z' },
			score: 82,
			minScore: 60,
			criteria: [
				{ criterion: 'pay', outcome: 'match', notStated: false, dealBreaker: false },
				{ criterion: 'commute', outcome: 'unknown', notStated: false, dealBreaker: false }
			],
			transit: 'here',
			interested: true
		});
		for (const junk of [
			{ ...OPPORTUNITY, score: 101 },
			{ ...OPPORTUNITY, minScore: '60' },
			{ ...OPPORTUNITY, job: { ...OPPORTUNITY.job, _id: 'abc' } },
			{ ...OPPORTUNITY, job: { ...OPPORTUNITY.job, publishedAt: 'soon' } },
			{ ...OPPORTUNITY, job: { ...OPPORTUNITY.job, title: undefined } }
		]) {
			expect(readOpportunity(junk)).toBeUndefined();
		}
	});

	it('reads a page, its cursor only with more after it', () => {
		const next = 'mh3x1k2.' + JOB_ID;
		expect(
			readCandidateFeed({ jobs: [OPPORTUNITY, { job: {} }], more: true, next, pending: true })
		).toMatchObject({ jobs: [{ job: { _id: JOB_ID } }], more: true, next, pending: true });
		expect(readCandidateFeed({ jobs: [], more: false, next })).toEqual({
			jobs: [],
			more: false,
			next: null,
			pending: false
		});
		// More, but no cursor to read them with: none to read
		expect(readCandidateFeed({ jobs: [], more: true, next: '../admin' })).toMatchObject({
			more: false,
			next: null
		});
		expect(readCandidateFeed({ more: true })).toBeUndefined();
	});
});

describe('mutual interests', () => {
	const base = {
		_id: MATCH_ID,
		matchedAt: '2026-11-20T10:00:00.000Z',
		changedAt: null,
		endedAt: null,
		endReason: null,
		seen: false
	};
	const candidateSide = {
		...base,
		side: 'candidate',
		job: { ...VERSION, _id: JOB_ID, status: 'open' },
		score: 82,
		minScore: 60,
		criteria: [{ criterion: 'pay', outcome: 'match' }]
	};
	const recruiterSide = {
		...base,
		side: 'recruiter',
		job: { _id: JOB_ID, title: 'Staff Platform Engineer', company: 'Acme', status: 'open' },
		candidate: { domain: 'jane-doe', title: 'Jane Doe' }
	};

	it('reads the version the candidate said yes to, and their score then', () => {
		expect(readMutualInterest(candidateSide)).toEqual({
			...base,
			side: 'candidate',
			job: { ...VERSION, _id: JOB_ID, status: 'open' },
			score: 82,
			minScore: 60,
			criteria: [{ criterion: 'pay', outcome: 'match', notStated: false, dealBreaker: false }]
		});
		// A version that no longer reads back: the mutual interest stays, without its job
		expect(readMutualInterest({ ...candidateSide, job: null })).toMatchObject({ job: null });
		expect(readMutualInterest({ ...candidateSide, score: undefined })).toBeUndefined();
	});

	it("reads the recruiter's job, and the portfolio only once revealed", () => {
		expect(readMutualInterest(recruiterSide)).toEqual({
			...base,
			side: 'recruiter',
			job: { _id: JOB_ID, title: 'Staff Platform Engineer', company: 'Acme', status: 'open' },
			candidate: { domain: 'jane-doe', title: 'Jane Doe' }
		});
		expect(readMutualInterest({ ...recruiterSide, candidate: null })).toMatchObject({
			candidate: null
		});
		// Not an address name: no link to make of it
		expect(
			readMutualInterest({ ...recruiterSide, candidate: { domain: '../admin', title: 'x' } })
		).toMatchObject({ candidate: null });
		expect(
			readMutualInterest({ ...recruiterSide, candidate: { domain: 'jane-doe' } })
		).toMatchObject({ candidate: { domain: 'jane-doe', title: null } });
		expect(readMutualInterest({ ...recruiterSide, job: { _id: JOB_ID } })).toBeUndefined();
	});

	it('says why it ended only once it did', () => {
		expect(readMutualInterest({ ...recruiterSide, endReason: 'recruiter' })?.endReason).toBeNull();
		expect(
			readMutualInterest({
				...recruiterSide,
				endedAt: '2026-11-21T08:00:00.000Z',
				endReason: 'job_closed'
			})
		).toMatchObject({ endedAt: '2026-11-21T08:00:00.000Z', endReason: 'job_closed' });
	});

	it("reads one side's only, when asked for a side", () => {
		expect(readMutualInterest(recruiterSide, 'candidate')).toBeUndefined();
		expect(readMutualInterest({ ...recruiterSide, side: 'owner' })).toBeUndefined();
		expect(readMutualInterest({ ...recruiterSide, _id: 'x' })).toBeUndefined();
		expect(
			readMutualInterestList({ matches: [recruiterSide, candidateSide], next: null }, 'recruiter')
				?.matches
		).toHaveLength(1);
		expect(readMutualInterestList({}, 'recruiter')).toBeUndefined();
	});

	it("reads a decision's answer, with the mutual interest it made", () => {
		expect(readDecisionResult({ decision: 'interested', match: null }, 'candidate')).toEqual({
			decision: 'interested',
			match: null
		});
		expect(readDecisionResult({ decision: null, match: null }, 'recruiter')).toEqual({
			decision: null,
			match: null
		});
		expect(
			readDecisionResult({ decision: 'interested', match: recruiterSide }, 'recruiter')?.match
		).toMatchObject({ side: 'recruiter', candidate: { domain: 'jane-doe' } });
		for (const junk of [{}, { decision: 'yes', match: null }, { decision: 'pass' }, null]) {
			expect(readDecisionResult(junk, 'candidate')).toBeUndefined();
		}
		// A mutual interest that does not read is never a plain answer (which Undo would offer to
		// take back): the screen reads it again
		expect(
			readDecisionResult(
				{ decision: 'interested', match: { ...recruiterSide, _id: 'x' } },
				'recruiter'
			)
		).toBeUndefined();
		expect(
			readDecisionResult({ decision: 'interested', match: recruiterSide }, 'candidate')
		).toBeUndefined();
	});

	it('words where a mutual interest stands for each side, never a bare "match"', () => {
		const read = (entry: unknown) => readMutualInterest(entry) as MutualInterest;
		const ended = { endedAt: '2026-11-21T08:00:00.000Z' };
		const recruiter = read(recruiterSide);
		const candidate = read(candidateSide);
		expect(mutualInterestStateText(recruiter)).toBe('Going on');
		expect(
			mutualInterestStateText(read({ ...recruiterSide, ...ended, endReason: 'recruiter' }))
		).toBe('You ended it');
		expect(
			mutualInterestStateText(read({ ...recruiterSide, ...ended, endReason: 'candidate' }))
		).toBe('The candidate ended it');
		expect(
			mutualInterestStateText(read({ ...candidateSide, ...ended, endReason: 'candidate' }))
		).toBe('You ended it');
		expect(
			mutualInterestStateText(read({ ...candidateSide, ...ended, endReason: 'recruiter' }))
		).toBe('The recruiter ended it');
		expect(
			mutualInterestStateText(read({ ...candidateSide, ...ended, endReason: 'job_closed' }))
		).toBe('Ended: the job is no longer open');
		expect(mutualInterestStateText(read({ ...candidateSide, ...ended, endReason: 'x' }))).toBe(
			'Ended'
		);
		expect(mutualInterestChangeText(candidate)).toBeNull();
		const changed = { changedAt: '2026-11-21T09:00:00.000Z' };
		expect(mutualInterestChangeText(read({ ...candidateSide, ...changed }))).toBe(
			'The job description was edited since: you keep the version you said yes to.'
		);
		expect(mutualInterestChangeText(read({ ...recruiterSide, ...changed }))).toBe(
			'The job description was edited since: the candidate keeps the version they said yes to.'
		);
		expect(matchedOnText('2026-11-20T10:00:00.000Z')).toBe('Both interested on 20 Nov 2026');
		withLocale('fr', () => {
			expect(mutualInterestStateText(recruiter)).toBe('En cours');
			expect(
				mutualInterestStateText(read({ ...recruiterSide, ...ended, endReason: 'candidate' }))
			).toBe('Le candidat y a mis fin');
			expect(matchedOnText('2026-11-20T10:00:00.000Z')).toBe('Intérêt réciproque le 20 nov. 2026');
		});
	});
});

describe('discovery and notifications', () => {
	it('reads whether the candidate is proposed, what they miss in order, and their card', () => {
		expect(
			readDiscovery({
				state: 'paused',
				enabledAt: '2026-11-01T00:00:00.000Z',
				consentExpiresAt: '2028-11-01T00:00:00.000Z',
				missing: ['calendar', 'portfolio', 'calendar', 'nothing'],
				minScore: 70,
				card: { headline: 'Data engineer', hiddenExperiences: [JOB_ID, 'x'] }
			})
		).toEqual({
			state: 'paused',
			enabledAt: '2026-11-01T00:00:00.000Z',
			consentExpiresAt: '2028-11-01T00:00:00.000Z',
			missing: ['portfolio', 'calendar'],
			minScore: 70,
			card: { headline: 'Data engineer', hiddenExperiences: [JOB_ID] }
		});
		expect(readDiscovery({ state: 'off', missing: [] })).toEqual({
			state: 'off',
			enabledAt: null,
			consentExpiresAt: null,
			missing: [],
			minScore: null,
			card: { headline: null, hiddenExperiences: [] }
		});
		expect(readDiscovery({ state: 'maybe', missing: [] })).toBeUndefined();
		expect(readDiscovery({ state: 'on' })).toBeUndefined();
	});

	it("reads the candidate's preview, never a withheld criterion among the outcomes", () => {
		expect(
			readCardPreview({
				card: CARD,
				outcomes: ['commute', 'pay', 'cities', 'workMode', 'nope'],
				withheld: {
					headline: true,
					roles: [
						{ experience: JOB_ID, reason: 'title' },
						{ experience: JOB_ID, reason: 'secret' }
					],
					skills: ['Globex SDK', 3]
				}
			})
		).toEqual({
			card: CARD,
			outcomes: ['workMode', 'pay'],
			withheld: {
				headline: true,
				roles: [{ experience: JOB_ID, reason: 'title' }],
				skills: ['Globex SDK']
			}
		});
		expect(readCardPreview({ card: CARD })?.withheld).toEqual({
			headline: false,
			roles: [],
			skills: []
		});
		expect(readCardPreview({ outcomes: [] })).toBeUndefined();
	});

	it('counts the unseen mutual interests of each side, a count that is not one as none', () => {
		expect(readNotifications({ mutualInterests: { candidate: 2, recruiter: 0 } })).toEqual({
			candidate: 2,
			recruiter: 0
		});
		expect(readNotifications({ mutualInterests: { candidate: -1, recruiter: '3' } })).toEqual({
			candidate: 0,
			recruiter: 0
		});
		expect(readNotifications(null)).toEqual({ candidate: 0, recruiter: 0 });
	});

	it('reads a 404 of discovery or notifications as matching being off', () => {
		expect(matchingOff(404)).toBe(true);
		for (const status of [undefined, 401, 403, 500, 503]) expect(matchingOff(status)).toBe(false);
	});
});

describe('the deck', () => {
	type Card = { id: string };
	const key = (card: Card) => card.id;
	const cards = (...ids: string[]) => ids.map((id) => ({ id }));
	const ids = (deck: Deck<Card>) => deck.cards.map(key);
	const NOW = 1_800_000_000_000;

	const deckOf = (...list: string[]) =>
		appendPage(emptyDeck<Card>(), { cards: cards(...list), more: false }, key);

	/** `deck` once its top card was answered with `decision` at `at`, and saved */
	const answered = (deck: Deck<Card>, decision: 'interested' | 'pass' = 'pass', at = NOW) =>
		decisionSaved(startDecision(deck, decision, key, at), key, false);

	it('adds each card once, under those held, with whether the feed has more', () => {
		let deck = appendPage(
			deckLoading(emptyDeck<Card>()),
			{ cards: cards('a', 'b', 'a'), more: true, next: 'c1', pending: true },
			key
		);
		expect(ids(deck)).toEqual(['a', 'b']);
		expect(deck).toMatchObject({ more: true, next: 'c1', pending: true, loading: false });
		deck = appendPage(deck, { cards: cards('b', 'c'), more: false, next: 'ignored' }, key, true);
		expect(ids(deck)).toEqual(['a', 'b', 'c']);
		expect(deck).toMatchObject({ more: false, next: null, pending: false });
		// A read that failed keeps the cards held
		expect(ids(deckLoadFailed(deckLoading(deck)))).toEqual(['a', 'b', 'c']);
	});

	it('answers one card at a time: the top one leaves at once, the next shows', () => {
		const deck = startDecision(deckOf('a', 'b'), 'interested', key, NOW);
		expect(ids(deck)).toEqual(['b']);
		expect(topCard(deck)).toEqual({ id: 'b' });
		expect(deck.sending).toEqual({
			kind: 'decision',
			card: { id: 'a' },
			decision: 'interested',
			at: NOW,
			first: true
		});
		// Nothing else is sent while it is on its way
		expect(canDecide(deck)).toBe(false);
		expect(startDecision(deck, 'pass', key, NOW)).toBe(deck);
		// A card on its way is not added again by a read
		expect(ids(appendPage(deck, { cards: cards('a', 'c'), more: false }, key))).toEqual(['b', 'c']);
		expect(startDecision(emptyDeck<Card>(), 'pass', key, NOW)).toEqual(emptyDeck());
	});

	it('keeps the answer saved to undo, unless it made a mutual interest', () => {
		const deck = answered(deckOf('a', 'b'), 'interested');
		expect(deck.sending).toBeNull();
		expect(deck.answered).toEqual(['a']);
		expect(deck.last).toEqual({ card: { id: 'a' }, decision: 'interested', at: NOW, first: true });
		const mutual = decisionSaved(startDecision(deckOf('a'), 'interested', key, NOW), key, true);
		expect(mutual.last).toBeNull();
		expect(canUndo(mutual, NOW)).toBe(false);
	});

	it('brings a card back on top when its answer failed, or drops it when it is gone', () => {
		const sent = startDecision(deckOf('a', 'b'), 'pass', key, NOW);
		expect(ids(decisionFailed(sent, 'restore'))).toEqual(['a', 'b']);
		expect(ids(decisionFailed(sent, 'drop'))).toEqual(['b']);
		expect(decisionFailed(sent, 'drop').sending).toBeNull();
		expect(decisionFailed(sent, 'drop').last).toBeNull();
	});

	it('offers Undo for the latest answer attempted only, never an earlier card once it failed', () => {
		const first = answered(deckOf('a', 'b', 'c'));
		expect(canUndo(first, NOW)).toBe(true);
		// B is answered: A's Undo goes at once, whatever becomes of B's answer
		const sent = startDecision(first, 'interested', key, NOW + 1000);
		expect(sent.last).toBeNull();
		for (const outcome of ['drop', 'restore'] as const) {
			const failed = decisionFailed(sent, outcome);
			expect(failed.last).toBeNull();
			expect(canUndo(failed, NOW + 1000)).toBe(false);
			expect(startUndo(failed, NOW + 1000)).toBe(failed);
		}
		// Saved, B's answer is the one Undo takes back
		expect(decisionSaved(sent, key, false).last?.card).toEqual({ id: 'b' });
	});

	it('takes no answer for a moment once the card on top changed (a double click, a second tap)', () => {
		expect(answerSettled(NOW, NOW)).toBe(false);
		expect(answerSettled(NOW, NOW + ANSWER_SETTLE_MS - 1)).toBe(false);
		expect(answerSettled(NOW, NOW + ANSWER_SETTLE_MS)).toBe(true);
		// Long enough for the second click of a double click, short enough to read nothing in it
		expect(ANSWER_SETTLE_MS).toBeGreaterThanOrEqual(400);
		expect(ANSWER_SETTLE_MS).toBeLessThanOrEqual(1000);
	});

	it('undoes the latest answer within the window the API allows', () => {
		const deck = answered(deckOf('a', 'b'));
		expect(canUndo(deck, NOW)).toBe(true);
		expect(canUndo(deck, NOW + UNDO_WINDOW_MS)).toBe(true);
		expect(canUndo(deck, NOW + UNDO_WINDOW_MS + 1)).toBe(false);
		expect(UNDO_WINDOW_MS).toBe(MATCHING_LIMITS.undoMinutes * 60_000);
		// Past its window, nothing starts
		expect(startUndo(deck, NOW + UNDO_WINDOW_MS + 1)).toBe(deck);
		// Not while a read is on its way: the card could come back twice
		expect(canUndo(deckLoading(deck), NOW)).toBe(false);
		// Only the latest: another answer replaces it
		const second = answered(deck, 'interested', NOW + 1000);
		expect(second.last?.card).toEqual({ id: 'b' });
	});

	it('brings the card undone back on top, whose next answer can no longer be undone', () => {
		const deck = answered(deckOf('a', 'b'));
		const undoing = startUndo(deck, NOW + 1000);
		expect(undoing.sending).toEqual({ kind: 'undo', card: { id: 'a' } });
		expect(canUndo(undoing, NOW + 1000)).toBe(false);
		expect(canDecide(undoing)).toBe(false);
		const undone = undoSaved(undoing, key);
		expect(ids(undone)).toEqual(['a', 'b']);
		expect(undone.last).toBeNull();
		// Answered again: the API changes it by answering again, never undoes it
		const again = answered(undone, 'interested', NOW + 2000);
		expect(again.last).toMatchObject({ card: { id: 'a' }, first: false });
		expect(canUndo(again, NOW + 2000)).toBe(false);
	});

	it('keeps the answer when its undo failed, to try again or not anymore', () => {
		const undoing = startUndo(answered(deckOf('a', 'b')), NOW);
		expect(undoFailed(undoing, 'keep').last?.card).toEqual({ id: 'a' });
		expect(canUndo(undoFailed(undoing, 'keep'), NOW)).toBe(true);
		expect(undoFailed(undoing, 'final').last).toBeNull();
		expect(ids(undoFailed(undoing, 'final'))).toEqual(['b']);
	});

	it('never adds again a card answered, nor the one whose answer can be undone', () => {
		// "Check again" while an answer is on its way: the read left before it was saved
		const sent = startDecision(deckOf('a', 'b'), 'pass', key, NOW);
		const saved = decisionSaved(sent, key, false);
		expect(ids(appendPage(saved, { cards: cards('a', 'c'), more: false }, key, true))).toEqual([
			'b',
			'c'
		]);
		// Undone, it is held again: once
		const undone = undoSaved(startUndo(saved, NOW), key);
		expect(ids(appendPage(undone, { cards: cards('a', 'c'), more: false }, key, true))).toEqual([
			'a',
			'b',
			'c'
		]);
	});

	it('keeps saying travel times are being computed until a read from the start says otherwise', () => {
		const first = appendPage(
			emptyDeck<Card>(),
			{ cards: cards('a'), more: true, next: 'c1', pending: true },
			key,
			true
		);
		// The next page says nothing of the jobs waiting behind the cursor read since
		const second = appendPage(first, { cards: cards('b'), more: false, pending: false }, key);
		expect(second.pending).toBe(true);
		expect(appendPage(second, { cards: [], more: false, pending: false }, key, true).pending).toBe(
			false
		);
	});

	it('says another card comes after the top one when one is held under it, never how many', () => {
		// A recruiter answers A, reads B (no more after it), then undoes A: B still comes after it
		const answeredA = answered(
			appendPage(emptyDeck<Card>(), { cards: cards('a'), more: true }, key),
			'pass'
		);
		const withB = appendPage(answeredA, { cards: cards('b'), more: false }, key);
		const undone = undoSaved(startUndo(withB, NOW), key);
		expect(ids(undone)).toEqual(['a', 'b']);
		expect(undone.more).toBe(false);
		expect(moreAfterTop(undone)).toBe(true);
		expect(recruiterQueueText(moreAfterTop(undone))).toBe('More candidates after this one.');
		expect(moreAfterTop(deckOf('b'))).toBe(false);
		expect(moreAfterTop({ ...deckOf('b'), more: true })).toBe(true);
	});

	it('shows what is there, never the empty state once it stopped or while a card may come', () => {
		const view = (deck: Deck<Card>, extra: Partial<Parameters<typeof deckView>[0]> = {}) =>
			deckView({
				deck,
				side: 'recruiter',
				started: true,
				stopped: false,
				moment: false,
				readError: false,
				...extra
			});
		expect(view(emptyDeck(), { started: false })).toBe('placeholder');
		expect(view(deckOf('a'))).toBe('card');
		expect(view(deckOf())).toBe('empty');
		// Stopped (signed out, not proposed, the job in review, the terms, matching off): nothing,
		// the page says why, whatever the deck holds
		for (const deck of [deckOf(), deckOf('a'), deckLoading(deckOf())]) {
			expect(view(deck, { stopped: true })).toBe('stopped');
			expect(view(deck, { stopped: true, readError: true })).toBe('stopped');
		}
		// The moment both are interested shows until the person goes on, even once stopped
		expect(view(deckOf(), { moment: true, stopped: true })).toBe('moment');
		// A recruiter's answer on its way, no card left: the next one may come
		const sent = startDecision(
			appendPage(emptyDeck<Card>(), { cards: cards('a'), more: true }, key),
			'pass',
			key,
			NOW
		);
		expect(view(sent)).toBe('waiting');
		expect(view(decisionSaved(sent, key, false))).toBe('waiting');
		expect(view(deckLoading(decisionSaved(sent, key, false)))).toBe('waiting');
		// The last card's answer on its way: not "nothing to answer" until it is saved
		expect(view(startDecision(deckOf('a'), 'pass', key, NOW))).toBe('waiting');
		expect(view(answered(deckOf('a')))).toBe('empty');
		// A read that failed, to try again
		expect(view(decisionSaved(sent, key, false), { readError: true })).toBe('error');
	});

	it("reads a recruiter's next card once the one held is answered, a candidate's next page early", () => {
		const recruiter = appendPage(emptyDeck<Card>(), { cards: cards('a'), more: true }, key);
		expect(shouldLoadMore(recruiter, 'recruiter')).toBe(false);
		const sent = startDecision(recruiter, 'pass', key, NOW);
		// Not until the answer is saved: the API proposes the next card after it
		expect(shouldLoadMore(sent, 'recruiter')).toBe(false);
		const saved = decisionSaved(sent, key, false);
		expect(shouldLoadMore(saved, 'recruiter')).toBe(true);
		expect(shouldLoadMore(deckLoading(saved), 'recruiter')).toBe(false);
		expect(shouldLoadMore({ ...saved, more: false }, 'recruiter')).toBe(false);

		const page = (list: string[], more: boolean) =>
			appendPage(emptyDeck<Card>(), { cards: cards(...list), more, next: 'c1' }, key);
		expect(shouldLoadMore(page(['a', 'b', 'c', 'd'], true), 'candidate')).toBe(false);
		expect(shouldLoadMore(page(['a', 'b', 'c'], true), 'candidate')).toBe(true);
		expect(shouldLoadMore(page(['a'], false), 'candidate')).toBe(false);
	});
});

describe('the keys of the deck', () => {
	const press = (key: string, extra: Record<string, unknown> = {}) =>
		deckKeyAction({ key, target: { tagName: 'BUTTON' }, ...extra });

	it('passes with ←, says Interested with →, undoes with Z', () => {
		expect(press('ArrowLeft')).toBe('pass');
		expect(press('ArrowRight')).toBe('interested');
		expect(press('z')).toBe('undo');
		expect(press('Z')).toBe('undo');
		for (const key of ['ArrowUp', 'Enter', ' ', 'Backspace', 'x', 'Escape']) {
			expect(press(key)).toBeNull();
		}
	});

	it("leaves the browser's, the screen reader's and a field's keys alone", () => {
		for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
			expect(press('ArrowLeft', { [modifier]: true })).toBeNull();
		}
		expect(press('ArrowRight', { isComposing: true })).toBeNull();
		expect(press('ArrowRight', { repeat: true })).toBeNull();
		expect(press('ArrowRight', { defaultPrevented: true })).toBeNull();
		for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'input']) {
			expect(press('ArrowLeft', { target: { tagName } })).toBeNull();
		}
		expect(press('z', { target: { tagName: 'DIV', isContentEditable: true } })).toBeNull();
		expect(press('ArrowLeft', { target: { tagName: 'A' } })).toBe('pass');
		expect(deckKeyAction({ key: 'ArrowLeft' })).toBe('pass');
	});
});

describe('dragging a card', () => {
	it('knows its direction once it moved a little', () => {
		expect(dragAxis({ dx: 6, dy: 3 })).toBeNull();
		expect(dragAxis({ dx: 12, dy: 4 })).toBe('x');
		expect(dragAxis({ dx: -12, dy: 4 })).toBe('x');
		expect(dragAxis({ dx: 4, dy: -14 })).toBe('y');
	});

	it('answers when dragged far enough or flicked, and goes back otherwise', () => {
		const width = 350;
		expect(dragDecision({ dx: 110, dy: 10, width, ms: 2000 })).toBe('interested');
		expect(dragDecision({ dx: -105, dy: 0, width, ms: 2000 })).toBe('pass');
		// A flick: short, but fast
		expect(dragDecision({ dx: 60, dy: 5, width, ms: 100 })).toBe('interested');
		// Short and slow
		expect(dragDecision({ dx: 60, dy: 5, width, ms: 1000 })).toBe('cancel');
		// Not sideways: the page scrolled
		expect(dragDecision({ dx: 40, dy: 200, width, ms: 100 })).toBe('cancel');
		expect(dragDecision({ dx: 8, dy: 0, width, ms: 1 })).toBe('cancel');
		// Fast but short (a quick scroll, a pointer that slipped): no answer
		expect(dragDecision({ dx: 12, dy: 0, width, ms: 20 })).toBe('cancel');
		expect(dragDecision({ dx: -50, dy: 0, width, ms: 20 })).toBe('cancel');
		expect(dragDecision({ dx: 60, dy: 0, width: 0, ms: 100 })).toBe('cancel');
	});

	it('starts with a finger or a pen only, never on a control or the description', () => {
		const on = (match: string | null) => ({
			closest: (selector: string) => (match && selector.split(', ').includes(match) ? {} : null)
		});
		expect(dragStarts('touch', on(null))).toBe(true);
		expect(dragStarts('pen', on(null))).toBe(true);
		// A mouse answers with the buttons and the keys: a drag would fight text selection
		expect(dragStarts('mouse', on(null))).toBe(false);
		expect(dragStarts('', on(null))).toBe(false);
		for (const control of ['a', 'button', 'input', 'summary', 'details', 'label', '.prose']) {
			expect(dragStarts('touch', on(control))).toBe(false);
		}
		expect(dragStarts('touch', null)).toBe(false);
		expect(dragStarts('touch', {})).toBe(false);
	});
});

describe('why a read of a feed failed', () => {
	it('stops the deck for what the page has to say, and reads again otherwise', () => {
		expect(feedFailure(401, 'Unauthorized', 'candidate').kind).toBe('signed-out');
		expect(feedFailure(403, 'You are not proposed to recruiters now', 'candidate').kind).toBe(
			'not-proposed'
		);
		expect(
			feedFailure(409, 'This job description is not proposed to candidates now', 'recruiter').kind
		).toBe('job-not-proposed');
		expect(feedFailure(404, 'Job posting not found', 'recruiter').kind).toBe('job-gone');
		expect(feedFailure(404, 'NOT_FOUND', 'candidate').kind).toBe('off');
		expect(feedFailure(422, { property: 'consent' }, 'recruiter').kind).toBe('terms');
		// The reads of an hour, never the answers of a day, with from when
		const now = Date.parse('2026-11-21T13:00:00.000Z');
		expect(feedFailure(429, '', 'candidate', 120, now)).toEqual({
			kind: 'limit',
			message: m.failure.readLimitUntil(formatMoment(new Date(now + 120_000))),
			retryAfter: 120
		});
		expect(feedFailure(429, '', 'recruiter')).toEqual({
			kind: 'limit',
			message: m.failure.readLimit
		});
		expect(feedFailure(500, 'boom', 'recruiter')).toEqual({
			kind: 'retry',
			message: m.recruiter.loadFailed
		});
		expect(feedFailure(503, new TypeError('fetch failed'), 'candidate')).toEqual({
			kind: 'retry',
			message: m.candidate.loadFailed
		});
	});
});

describe('why an answer failed', () => {
	it('signs out on 401, and stops the deck for what the page has to say', () => {
		expect(decisionFailure(401, 'Unauthorized', 'candidate', 'decide')).toEqual({
			kind: 'signed-out',
			message: m.failure.signedOut
		});
		const notProposed = decisionFailure(
			403,
			'You are not proposed to recruiters now',
			'candidate',
			'decide'
		);
		expect(notProposed.kind).toBe('not-proposed');
		expect(stopsDeck(notProposed)).toBe(true);
		expect(
			decisionFailure(403, 'Create your recruiter space first', 'recruiter', 'decide').kind
		).toBe('no-space');
		expect(
			decisionFailure(
				422,
				{ property: 'consent', message: 'Accept the terms' },
				'recruiter',
				'decide'
			).kind
		).toBe('terms');
		expect(
			decisionFailure(
				409,
				'This job description is not proposed to candidates now',
				'recruiter',
				'decide'
			).kind
		).toBe('job-not-proposed');
		expect(decisionFailure(404, 'Job posting not found', 'recruiter', 'decide').kind).toBe(
			'job-gone'
		);
		// The 404 of a route that does not exist: matching was turned off
		expect(decisionFailure(404, 'NOT_FOUND', 'candidate', 'decide').kind).toBe('off');
		expect(decisionFailure(404, undefined, 'recruiter', 'undo').kind).toBe('off');
	});

	it('drops a card no longer proposed, or both interested already', () => {
		const candidateGone = decisionFailure(404, 'Job posting not found', 'candidate', 'decide');
		expect(candidateGone).toEqual({ kind: 'gone', message: m.candidate.gone });
		expect(stopsDeck(candidateGone)).toBe(false);
		expect(
			decisionFailure(409, 'This candidate is not proposed for this job now', 'recruiter', 'decide')
		).toEqual({ kind: 'gone', message: m.recruiter.gone });
		expect(decisionFailure(409, 'You are both interested already', 'recruiter', 'undo')).toEqual({
			kind: 'mutual',
			message: m.failure.mutual
		});
	});

	it('stops offering Undo once the API says it is final, or gone', () => {
		expect(
			decisionFailure(409, 'This decision can no longer be undone', 'candidate', 'undo')
		).toEqual({ kind: 'final', message: m.failure.final });
		expect(decisionFailure(404, 'There is no decision to undo', 'recruiter', 'undo')).toEqual({
			kind: 'final',
			message: m.failure.nothingToUndo
		});
	});

	it("says the day's limit, and from when its Retry-After lets an answer through", () => {
		const now = Date.parse('2026-11-21T13:00:00.000Z');
		const limited = decisionFailure(429, 'You can answer…', 'recruiter', 'decide', 3600, now);
		expect(limited).toEqual({
			kind: 'limit',
			message: m.failure.limitUntil(formatMoment(new Date(now + 3_600_000))),
			retryAfter: 3600
		});
		// '21 Nov 2026, 14:00' in a browser at UTC: a moment, never a count
		expect(limited.message).toContain(formatMoment(new Date(now + 3_600_000)));
		expect(limited.message).toMatch(
			/^You have answered as many times as a day allows\. You can answer again from /
		);
		withLocale('fr', () => {
			expect(decisionFailure(429, '', 'candidate', 'decide', 60, now).message).toMatch(
				/^Vous avez répondu autant de fois qu'une journée le permet\. Vous pourrez répondre de nouveau à partir du /
			);
		});
		// Without a Retry-After, never "tomorrow": the day is a UTC day
		expect(decisionFailure(429, '', 'candidate', 'decide')).toEqual({
			kind: 'limit',
			message: m.failure.limit
		});
		expect(m.failure.limit).not.toMatch(/tomorrow/);
		expect(retryAfterSeconds(new Headers({ 'Retry-After': '3600' }))).toBe(3600);
		expect(retryAfterSeconds({ 'retry-after': '42' })).toBe(42);
		for (const bad of [
			new Headers(),
			{ 'retry-after': 'Wed, 21 Oct 2026' },
			{ 'retry-after': '0' },
			null
		]) {
			expect(retryAfterSeconds(bad)).toBeUndefined();
		}
	});

	it('tries again after anything else, and when the request got no answer', () => {
		expect(decisionFailure(500, 'boom', 'candidate', 'decide')).toEqual({
			kind: 'retry',
			message: m.failure.retry
		});
		expect(decisionFailure(409, 'Something else', 'recruiter', 'undo')).toEqual({
			kind: 'retry',
			message: m.failure.undo
		});
		expect(decisionFailure(503, new TypeError('fetch failed'), 'candidate', 'decide')).toEqual({
			kind: 'retry',
			message: networkError()
		});
		expect(stopsDeck({ kind: 'retry', message: '' })).toBe(false);
	});
});

describe('what the deck says', () => {
	/** Every text of a group of messages, in a language: functions given words, never numbers */
	const texts = (tree: MessageTree | undefined): string[] =>
		Object.values(tree ?? {}).flatMap((node) => {
			if (typeof node === 'object' && node && 'en' in node && 'fr' in node) {
				return LOCALES.flatMap((locale) => {
					const entry = (node as Record<string, unknown>)[locale];
					return typeof entry === 'function' ? [entry('Staff engineer')] : [String(entry)];
				});
			}
			return texts(node as MessageTree);
		});

	it('never gives a recruiter a number, in either language', () => {
		const source = messageSource(m) as Record<string, MessageTree>;
		const card = messageSource(cards) as Record<string, MessageTree>;
		const mutual = card.mutual as Record<string, MessageTree>;
		const criteria = messageSource(outcomes) as Record<string, MessageTree>;
		const states = source.mutualInterest as Record<string, MessageTree>;
		const changed = states.changed as Record<string, MessageTree>;
		// Every text a recruiter reads: their deck, its failures, the anonymous card, the moment both
		// are interested, the outcomes beside the card, where their mutual interests stand. The
		// durations of roles and skills (formatMonthCount) are time, not counts; a moment of a
		// Retry-After or the day both became interested are dates (functions are given words here)
		const recruiterTexts = [
			...texts(source.recruiter),
			...texts(source.failure),
			...texts({ decision: source.decision, sending: source.sending } as MessageTree),
			...texts(card.candidate),
			...texts({
				heading: mutual.heading,
				recruiter: mutual.recruiter,
				notRevealed: mutual.notRevealed,
				portfolio: mutual.portfolio,
				pageForRecruiters: mutual.pageForRecruiters,
				keepGoing: mutual.keepGoing,
				newTab: mutual.newTab
			} as MessageTree),
			...texts({
				dealBreaker: criteria.dealBreaker,
				commute: (criteria.commute as Record<string, MessageTree>).recruiter
			} as MessageTree),
			...texts({ ...states, changed: changed.recruiter } as MessageTree)
		];
		expect(recruiterTexts.length).toBeGreaterThan(60);
		for (const said of recruiterTexts) expect(said).not.toMatch(/\d/);
		for (const locale of LOCALES) {
			withLocale(locale, () => {
				for (const more of [true, false]) expect(recruiterQueueText(more)).not.toMatch(/\d/);
				for (const event of ['interested', 'pass', 'undone'] as const) {
					expect(deckAnnouncement('recruiter', event)).not.toMatch(/\d/);
				}
			});
		}
	});

	it('says whether more candidates come, never how many', () => {
		expect(recruiterQueueText(true)).toBe('More candidates after this one.');
		expect(recruiterQueueText(false)).toBe('No other candidate for now.');
	});

	it('names the job a candidate answered, and nobody on a recruiter’s card', () => {
		expect(deckAnnouncement('candidate', 'pass', 'Staff engineer')).toBe(
			'You passed Staff engineer.'
		);
		expect(deckAnnouncement('candidate', 'interested', 'Staff engineer')).toBe(
			'Staff engineer interests you: its recruiter sees it.'
		);
		expect(deckAnnouncement('candidate', 'undone', 'Staff engineer')).toBe(
			'Undone: Staff engineer is back.'
		);
		expect(deckAnnouncement('recruiter', 'pass')).toBe('You passed this candidate.');
		expect(deckAnnouncement('recruiter', 'interested')).toBe(
			'This candidate interests you: they see it beside your job.'
		);
	});

	it('says Interested and Pass, never Match (decision 11)', () => {
		expect(decisionLabel('interested')).toBe('Interested');
		expect(decisionLabel('pass')).toBe('Pass');
		withLocale('fr', () => {
			expect(decisionLabel('interested')).toBe("Ça m'intéresse");
			expect(decisionLabel('pass')).toBe('Passer');
			expect(decisionLabel('undo')).toBe('Annuler');
		});
		const all = texts(messageSource(m));
		for (const said of all) expect(said).not.toMatch(/\bmatch(es|ed)?\b|correspondance/i);
	});
});
