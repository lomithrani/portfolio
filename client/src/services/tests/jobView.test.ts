import { describe, expect, it } from 'vitest';
import { opportunityPath } from 'portfolio-common';
import { withLocale } from 'portfolio-common';
import {
	isJobPostingId,
	jobViewFailure,
	jobViewLimitText,
	jobViewRetryAt,
	jobViewTitle,
	readJobViewAccess
} from '../jobView';

// The private page of a job description (/opportunities/:id): what its address may hold, and
// what the page says when GET /opportunities/jobs/:id gives no posting

describe('the address of a job description shared with a candidate', () => {
	it('is the page the invitation links, for any posting id', () => {
		expect(opportunityPath('65e2e00000000000000000aa')).toBe(
			'/opportunities/65e2e00000000000000000aa'
		);
		// Whatever it is given stays one segment of the path
		expect(opportunityPath('a/b?c')).toBe('/opportunities/a%2Fb%3Fc');
	});

	it('takes the id of a posting only', () => {
		expect(isJobPostingId('65e2e00000000000000000aa')).toBe(true);
		expect(isJobPostingId('65E2E00000000000000000AA')).toBe(true);
		for (const id of [
			'',
			'not-an-id',
			'65e2e00000000000000000a',
			'65e2e00000000000000000aaa',
			null
		]) {
			expect({ id, valid: isJobPostingId(id) }).toEqual({ id, valid: false });
		}
	});
});

describe('jobViewFailure', () => {
	it('asks to sign in again when the session ended', () => {
		expect(jobViewFailure(401, 'Unauthorized')).toBe('signed-out');
	});

	it('says the posting is not shared on the API’s own 404, and for an id that is not one', () => {
		expect(jobViewFailure(404, 'Job posting not found')).toBe('not-shared');
		expect(jobViewFailure(422, { type: 'validation', property: '/id' })).toBe('not-shared');
	});

	it('says a read refused for now (429: matching’s reads of an hour), never a connection to check', () => {
		expect(jobViewFailure(429, 'Too many reads')).toBe('limited');
	});

	it('offers to try again when the API could not answer', () => {
		// A 404 that is not the API's (a route it does not have, a proxy), a failure, no answer
		expect(jobViewFailure(404, 'NOT_FOUND')).toBe('error');
		expect(jobViewFailure(500, 'Internal Server Error')).toBe('error');
		expect(jobViewFailure(503, new TypeError('Failed to fetch'))).toBe('error');
		expect(jobViewFailure(undefined, null)).toBe('error');
	});
});

describe('a read refused for now', () => {
	const now = Date.UTC(2026, 10, 21, 10, 0);

	it('can go again once its Retry-After has passed', () => {
		expect(jobViewRetryAt(new Headers({ 'Retry-After': '120' }), now)).toBe(now + 120_000);
		expect(jobViewRetryAt({ 'retry-after': '60' }, now)).toBe(now + 60_000);
		// None, or one that is not a number of seconds: not said
		expect(jobViewRetryAt(new Headers(), now)).toBeNull();
		expect(jobViewRetryAt(new Headers({ 'Retry-After': 'soon' }), now)).toBeNull();
		expect(jobViewRetryAt(undefined, now)).toBeNull();
	});

	it('says from when it can read again, or later when that is not known', () => {
		expect(jobViewLimitText(now + 3_600_000)).toMatch(
			/^You have read jobs as often as an hour allows\. Try again from .*2026.*\.$/
		);
		expect(jobViewLimitText(null)).toBe(
			'You have read jobs as often as an hour allows. Try again later.'
		);
		expect(withLocale('fr', () => jobViewLimitText(null))).toBe(
			"Vous avez consulté des offres aussi souvent qu'une heure le permet. Réessayez plus tard."
		);
		for (const text of [jobViewLimitText(now), jobViewLimitText(null)]) {
			expect(text).not.toMatch(/connection/i);
		}
	});
});

describe('jobViewTitle', () => {
	it('names the tab after the posting once loaded', () => {
		expect(jobViewTitle('Staff Engineer')).toBe('Staff Engineer | Portfolio');
		expect(jobViewTitle('  Staff Engineer  ')).toBe('Staff Engineer | Portfolio');
	});

	it('says what the page is until then, and for a posting without a title', () => {
		expect(jobViewTitle()).toBe('Job description | Portfolio');
		expect(jobViewTitle(null)).toBe('Job description | Portfolio');
		expect(jobViewTitle('   ')).toBe('Job description | Portfolio');
	});
});

describe('readJobViewAccess', () => {
	const MATCH_ID = '65e2e00000000000000000c1';

	it('keeps the day a version was shared on a journey, and nothing without one', () => {
		expect(readJobViewAccess({ access: 'journey', sharedAt: '2026-11-12T09:00:00.000Z' })).toEqual({
			kind: 'journey',
			sharedAt: '2026-11-12T09:00:00.000Z'
		});
		expect(readJobViewAccess({ access: 'journey' })).toEqual({ kind: 'journey' });
		expect(readJobViewAccess({ access: 'journey', sharedAt: 'not a date' })).toEqual({
			kind: 'journey'
		});
	});

	it('reads a job proposed to the candidate: their score, the recruiter’s interest, their answer', () => {
		expect(
			readJobViewAccess({
				access: 'feed',
				jobMatch: { score: 86, minScore: 70, criteria: [{ criterion: 'pay', outcome: 'match' }] },
				interested: true,
				decision: 'pass'
			})
		).toMatchObject({
			kind: 'feed',
			score: { score: 86, minScore: 70, criteria: [{ criterion: 'pay', outcome: 'match' }] },
			interested: true,
			decision: 'pass'
		});
		// No answer yet, a score that is not one: nothing made up
		expect(
			readJobViewAccess({ access: 'feed', jobMatch: { score: 120 }, decision: 'maybe' })
		).toEqual({ kind: 'feed', score: null, interested: false, decision: null });
	});

	it('reads a mutual interest, and fails closed on one that does not read', () => {
		expect(
			readJobViewAccess({
				access: 'match',
				match: {
					_id: MATCH_ID,
					matchedAt: '2026-11-20T10:00:00.000Z',
					changedAt: null,
					endedAt: '2026-11-21T10:00:00.000Z',
					endReason: 'recruiter'
				}
			})
		).toEqual({
			kind: 'match',
			interest: {
				side: 'candidate',
				_id: MATCH_ID,
				matchedAt: '2026-11-20T10:00:00.000Z',
				changedAt: null,
				endedAt: '2026-11-21T10:00:00.000Z',
				endReason: 'recruiter'
			}
		});
		// An end reason without an end is none
		expect(
			readJobViewAccess({
				access: 'match',
				match: { _id: MATCH_ID, matchedAt: '2026-11-20T10:00:00.000Z', endReason: 'candidate' }
			})
		).toMatchObject({ kind: 'match', interest: { endedAt: null, endReason: null } });
		expect(readJobViewAccess({ access: 'match', match: { _id: 'nope' } })).toBeUndefined();
		expect(readJobViewAccess({ access: 'match' })).toBeUndefined();
	});
});
