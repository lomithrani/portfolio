import { describe, expect, it } from 'vitest';
import { opportunityPath } from 'portfolio-common';
import { isJobPostingId, jobViewFailure, jobViewTitle } from '../jobView';

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

	it('offers to try again when the API could not answer', () => {
		// A 404 that is not the API's (a route it does not have, a proxy), a failure, no answer
		expect(jobViewFailure(404, 'NOT_FOUND')).toBe('error');
		expect(jobViewFailure(500, 'Internal Server Error')).toBe('error');
		expect(jobViewFailure(503, new TypeError('Failed to fetch'))).toBe('error');
		expect(jobViewFailure(undefined, null)).toBe('error');
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
