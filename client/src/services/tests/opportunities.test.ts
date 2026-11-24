import { MATCH_NOT_FOUND } from '../apiBodies';
import { describe, expect, it } from 'vitest';
import {
	DISCOVERY_CONSENT_MONTHS,
	DISCOVERY_CONSENT_RENEWAL_DAYS,
	MATCHING_LIMITS
} from 'portfolio-common';
import {
	appendInterests,
	consentEndsSoon,
	interestFailure,
	opportunitiesView,
	opportunitiesViewSearch,
	reviewState,
	undoableHere,
	undoOpen,
	unseenInterests
} from '../opportunities';
import type { CandidateMutualInterest, DiscoveryStatus } from '../matching';

// The candidate's inbox of matching (/opportunities): its views in the address, what the jobs to
// review show where the candidate stands, the window of an answer's undo, the mutual interests

describe('the views of the inbox', () => {
	it('opens on the jobs to review unless the address names the mutual interests', () => {
		expect(opportunitiesView(null)).toBe('review');
		expect(opportunitiesView('review')).toBe('review');
		expect(opportunitiesView('interests')).toBe('interests');
		expect(opportunitiesView('passed')).toBe('review');
		expect(opportunitiesView('')).toBe('review');
	});

	it('keeps the view in the address, the default leaving no parameter, the others kept', () => {
		expect(opportunitiesViewSearch('', 'interests')).toBe('view=interests');
		expect(opportunitiesViewSearch('?lang=fr', 'interests')).toBe('lang=fr&view=interests');
		expect(opportunitiesViewSearch('?view=interests&lang=fr', 'review')).toBe('lang=fr');
		expect(opportunitiesViewSearch('?view=interests', 'review')).toBe('');
		// Unchanged: nothing to replace
		expect(opportunitiesViewSearch('', 'review')).toBeNull();
		expect(opportunitiesViewSearch('?view=interests', 'interests')).toBeNull();
		// A view the page does not have, in the address, is replaced by the one shown
		expect(opportunitiesViewSearch('?view=passed', 'review')).toBe('');
	});
});

describe('reviewState', () => {
	const status = (overrides: Partial<DiscoveryStatus> = {}): DiscoveryStatus => ({
		state: 'on',
		enabledAt: '2026-11-01T10:00:00.000Z',
		consentExpiresAt: '2028-11-01T10:00:00.000Z',
		missing: [],
		minScore: 70,
		card: { headline: null, hiddenExperiences: [] },
		...overrides
	});

	it('shows the deck to a candidate proposed to recruiters', () => {
		expect(reviewState(status(), true)).toBe('on');
	});

	it('says why there is none otherwise', () => {
		expect(reviewState(status({ state: 'off', enabledAt: null }), true)).toBe('off');
		expect(reviewState(status({ state: 'lapsed' }), true)).toBe('lapsed');
		expect(reviewState(status({ state: 'paused', missing: ['calendar'] }), true)).toBe('paused');
		// On, but something went missing since: proposed to nobody
		expect(reviewState(status({ missing: ['schedule'] }), true)).toBe('paused');
	});

	it('asks for a portfolio first, whatever discovery says', () => {
		expect(reviewState(status(), false)).toBe('no-portfolio');
		expect(reviewState(status({ state: 'off', missing: ['portfolio', 'terms'] }), true)).toBe(
			'no-portfolio'
		);
	});
});

describe('consentEndsSoon', () => {
	const DAY = 24 * 60 * 60_000;
	const now = new Date('2026-11-21T10:00:00.000Z');
	/** Given `daysLeft` days before it lapses (DISCOVERY_CONSENT_MONTHS after it was given) */
	const givenWith = (daysLeft: number): DiscoveryStatus => {
		const expires = new Date(now.getTime() + daysLeft * DAY);
		const enabled = new Date(expires);
		enabled.setUTCMonth(enabled.getUTCMonth() - DISCOVERY_CONSENT_MONTHS);
		return {
			state: 'on',
			enabledAt: enabled.toISOString(),
			consentExpiresAt: expires.toISOString(),
			missing: [],
			minScore: 70,
			card: { headline: null, hiddenExperiences: [] }
		};
	};

	it('says when the consent ends in its last days, when it can be confirmed again', () => {
		const soon = givenWith(DISCOVERY_CONSENT_RENEWAL_DAYS - 2);
		expect(consentEndsSoon(soon, now)).toBe(soon.consentExpiresAt);
	});

	it('says nothing while it holds for a while yet, nor where the inbox shows no deck', () => {
		expect(consentEndsSoon(givenWith(DISCOVERY_CONSENT_RENEWAL_DAYS + 5), now)).toBeNull();
		const soon = givenWith(3);
		// Paused or ended: the inbox says why there is no deck instead
		expect(consentEndsSoon({ ...soon, missing: ['schedule'] }, now)).toBeNull();
		expect(consentEndsSoon({ ...soon, state: 'lapsed' }, now)).toBeNull();
		expect(consentEndsSoon({ ...soon, state: 'off', enabledAt: null }, now)).toBeNull();
		expect(consentEndsSoon({ ...soon, consentExpiresAt: null }, now)).toBeNull();
	});
});

describe('undoableHere', () => {
	it('offers Undo on a job’s page only for the first answer on the job, given there', () => {
		// The page read no answer, and gave none: this one is the first
		expect(undoableHere(null, false)).toBe(true);
	});

	it('never for an answer that replaces another (the API undoes only the first: DECISION_FINAL)', () => {
		// The page read an answer given in the deck: answering again here changes it, never undone
		expect(undoableHere('interested', false)).toBe(false);
		expect(undoableHere('pass', false)).toBe(false);
		// An answer (or its undo) was given here before
		expect(undoableHere(null, true)).toBe(false);
	});
});

describe('interestFailure', () => {
	it('reads the API’s answers: gone, matching off, signed out, no answer, another failure', () => {
		expect(interestFailure({ status: 404, value: MATCH_NOT_FOUND })).toBe('gone');
		expect(interestFailure({ status: 404, value: ` ${MATCH_NOT_FOUND}\n` })).toBe('gone');
		// The 404 of a route that does not exist: matching was turned off
		expect(interestFailure({ status: 404, value: 'NOT_FOUND' })).toBe('off');
		expect(interestFailure({ status: 401, value: 'Unauthorized' })).toBe('signed-out');
		expect(interestFailure({ status: 503, value: new TypeError('Failed to fetch') })).toBe(
			'network'
		);
		expect(interestFailure({ status: 500, value: 'Internal Server Error' })).toBe('error');
		expect(interestFailure({ status: 403, value: 'Create your recruiter space first' })).toBe(
			'error'
		);
	});
});

describe('undoOpen', () => {
	it('offers Undo within MATCHING_LIMITS.undoMinutes of an answer given on the page', () => {
		const at = Date.UTC(2026, 10, 21, 10, 0);
		const window = MATCHING_LIMITS.undoMinutes * 60_000;
		expect(undoOpen(at, at)).toBe(true);
		expect(undoOpen(at, at + window)).toBe(true);
		expect(undoOpen(at, at + window + 1)).toBe(false);
		// No answer given on the page: nothing to undo here
		expect(undoOpen(null, at)).toBe(false);
	});
});

describe('mutual interests', () => {
	const interest = (_id: string, overrides: Partial<CandidateMutualInterest> = {}) =>
		({
			_id,
			side: 'candidate',
			matchedAt: '2026-11-20T10:00:00.000Z',
			changedAt: null,
			endedAt: null,
			endReason: null,
			seen: false,
			score: 90,
			minScore: 70,
			criteria: [],
			job: null,
			...overrides
		}) satisfies CandidateMutualInterest;

	it('adds a page each once (a mutual interest made between two reads moves the pages)', () => {
		const a = interest('65e2e00000000000000000a1');
		const b = interest('65e2e00000000000000000a2');
		const c = interest('65e2e00000000000000000a3');
		expect(appendInterests([a, b], [b, c]).map(({ _id }) => _id)).toEqual([a._id, b._id, c._id]);
	});

	it('marks seen only those going on and not seen yet', () => {
		expect(
			unseenInterests([
				interest('65e2e00000000000000000b1'),
				interest('65e2e00000000000000000b2', { seen: true }),
				interest('65e2e00000000000000000b3', {
					endedAt: '2026-11-21T10:00:00.000Z',
					endReason: 'recruiter'
				})
			])
		).toEqual(['65e2e00000000000000000b1']);
	});
});
