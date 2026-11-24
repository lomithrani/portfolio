import { describe, it, expect } from 'vitest';
import { withLocale, type JobStatus } from 'portfolio-common';
import {
	DUPLICATE_PARAM,
	countByStatus,
	duplicateJobHref,
	duplicateSourceId,
	failureText,
	filterJobs,
	formatDay,
	isoDate,
	networkError,
	shownJobsText,
	statusChangedText,
	statusFilters
} from '../recruiter';
import { m } from '../recruiter.messages';

const jobs = (...statuses: JobStatus[]) => statuses.map((status, index) => ({ id: index, status }));

describe('dates', () => {
	it('formats a day, from a Date or an ISO string, kept on one line in a sentence', () => {
		// No-break spaces: the day, the month and the year never break apart at a line's end
		expect(formatDay(new Date('2026-11-03T10:00:00Z'), 'UTC')).toBe('3\u00a0Nov\u00a02026');
		expect(formatDay('2026-11-03T23:30:00Z', 'Europe/Paris')).toBe('4\u00a0Nov\u00a02026');
		expect(withLocale('fr', () => formatDay('2028-11-21T10:00:00Z', 'UTC'))).toBe(
			'21\u00a0nov.\u00a02028'
		);
	});

	it('gives nothing for a missing or invalid date', () => {
		expect(formatDay(undefined)).toBe('');
		expect(formatDay(null)).toBe('');
		expect(formatDay('not a date')).toBe('');
		expect(isoDate('not a date')).toBe('');
		expect(isoDate(new Date('2026-11-03T10:00:00Z'))).toBe('2026-11-03T10:00:00.000Z');
	});
});

describe('status filters', () => {
	it('counts postings per status', () => {
		expect(countByStatus(jobs('open', 'open', 'draft'))).toEqual({
			draft: 1,
			open: 2,
			on_hold: 0,
			filled: 0,
			closed: 0
		});
	});

	it('offers All and the statuses in use, in status order, with counts', () => {
		expect(statusFilters(jobs('closed', 'open', 'draft', 'open'))).toEqual([
			{ value: 'all', label: 'All', count: 4 },
			{ value: 'draft', label: 'Drafts', count: 1 },
			{ value: 'open', label: 'Open', count: 2 },
			{ value: 'closed', label: 'Closed', count: 1 }
		]);
	});

	it('offers no filter when every posting has the same status (or there is none)', () => {
		expect(statusFilters(jobs('open', 'open'))).toEqual([]);
		expect(statusFilters([])).toEqual([]);
	});

	it('filters, keeping the order', () => {
		const list = jobs('open', 'draft', 'open');
		expect(filterJobs(list, 'all')).toEqual(list);
		expect(filterJobs(list, 'open').map((job) => job.id)).toEqual([0, 2]);
		expect(filterJobs(list, 'filled')).toEqual([]);
	});

	it('says what a filter shows', () => {
		expect(shownJobsText(3, 3, 'all')).toBe('3 job descriptions');
		expect(shownJobsText(1, 1, 'all')).toBe('1 job description');
		expect(shownJobsText(2, 6, 'open')).toBe('Open: 2 of 6 job descriptions');
		expect(shownJobsText(1, 6, 'on_hold')).toBe('On hold: 1 of 6 job descriptions');
	});
});

describe('status', () => {
	it('says what a new status means', () => {
		expect(statusChangedText('open')).toEqual({
			title: 'Status changed to Open',
			description: "Hiring: you can pick it on a candidate's page for recruiters."
		});
		expect(statusChangedText('draft').description).toBe('Only you can see it.');
	});

	it('never calls a posting public: only an open one can be picked', () => {
		for (const status of ['draft', 'open', 'on_hold', 'filled', 'closed'] as const) {
			expect(statusChangedText(status).description).not.toMatch(/public|apply/i);
		}
		expect(statusChangedText('closed').description).toBe(
			'Marked as closed: it can no longer be picked.'
		);
	});

	it('says that deleting a posting cannot be undone', () => {
		expect(m.deleteJob).toBe('This cannot be undone.');
	});
});

describe('Duplicate', () => {
	it('reads the posting id of a ?duplicate= parameter, in either case, and nothing else', () => {
		expect(duplicateSourceId('65e2e0000000000000000abc')).toBe('65e2e0000000000000000abc');
		expect(duplicateSourceId('65E2E0000000000000000ABC')).toBe('65E2E0000000000000000ABC');
		for (const param of [
			'abc',
			'65e2e0000000000000000abcd',
			'65e2e000000000000000000g',
			'',
			null
		]) {
			expect(duplicateSourceId(param)).toBeNull();
		}
		expect(duplicateSourceId(undefined)).toBeNull();
	});

	it('links the new posting page with the posting to copy', () => {
		expect(DUPLICATE_PARAM).toBe('duplicate');
		expect(duplicateJobHref('/recruiter/jobs/new', '65e2e0000000000000000abc')).toBe(
			'/recruiter/jobs/new?duplicate=65e2e0000000000000000abc'
		);
		// Encoded, whatever it is given
		expect(duplicateJobHref('/recruiter/jobs/new', 'a&b c')).toBe(
			'/recruiter/jobs/new?duplicate=a%26b%20c'
		);
	});
});

describe('failureText', () => {
	it('blames the connection when the request got no answer', () => {
		expect(failureText(new TypeError('Failed to fetch'), 'Could not delete it.')).toBe(
			networkError()
		);
	});

	it('keeps the given text when the API answered', () => {
		expect(failureText('Internal Server Error', 'Could not delete it.')).toBe(
			'Could not delete it.'
		);
		expect(failureText(undefined, 'Could not delete it.')).toBe('Could not delete it.');
	});
});
