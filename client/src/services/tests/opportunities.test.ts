import { describe, expect, it } from 'vitest';
import { MATCHING_LIMITS } from 'portfolio-common';
import {
	appendInterests,
	opportunitiesView,
	opportunitiesViewSearch,
	reviewState,
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
