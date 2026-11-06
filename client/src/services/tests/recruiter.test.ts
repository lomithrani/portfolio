import { describe, it, expect } from 'vitest';
import type { JobStatus } from 'portfolio-common';
import {
	APPLICANT_SOURCE_LABELS,
	NETWORK_ERROR,
	addApplicantError,
	applicantCountText,
	applicantDateText,
	applicantDomainProblem,
	applicantInitials,
	applicantName,
	countByStatus,
	deleteJobText,
	domainFromInput,
	failureText,
	filterJobs,
	formatDay,
	hasPublicPage,
	isJobPostingGone,
	isoDate,
	removeApplicantText,
	shownJobsText,
	statusChangedText,
	statusFilters
} from '../recruiter';

const jobs = (...statuses: JobStatus[]) => statuses.map((status, index) => ({ id: index, status }));

const applied = {
	source: 'applied' as const,
	candidate: { name: 'Ada', surname: 'Lovelace' },
	domain: { name: 'ada.lovelace', headerTitle: 'Ada Lovelace · Engineer' }
};
const added = {
	source: 'added_by_recruiter' as const,
	candidate: {},
	domain: { name: 'louis.gentil', headerTitle: 'Louis Gentil' }
};

describe('dates', () => {
	it('formats a day, from a Date or an ISO string', () => {
		expect(formatDay(new Date('2026-11-03T10:00:00Z'), 'UTC')).toBe('3 Nov 2026');
		expect(formatDay('2026-11-03T23:30:00Z', 'Europe/Paris')).toBe('4 Nov 2026');
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

	it('counts applicants in words', () => {
		expect(applicantCountText(0)).toBe('No applicants yet');
		expect(applicantCountText(1)).toBe('1 applicant');
		expect(applicantCountText(12)).toBe('12 applicants');
	});
});

describe('status', () => {
	it('says what a new status means', () => {
		expect(statusChangedText('open')).toEqual({
			title: 'Status changed to Open',
			description: 'Public: candidates can apply.'
		});
		expect(statusChangedText('draft').description).toBe('Only you can see it.');
	});

	it('has a public page unless it is a draft', () => {
		expect(hasPublicPage('draft')).toBe(false);
		for (const status of ['open', 'on_hold', 'filled', 'closed'] as const) {
			expect(hasPublicPage(status)).toBe(true);
		}
	});
});

describe('applicants', () => {
	it('names those who applied by their name', () => {
		expect(applicantName(applied)).toBe('Ada Lovelace');
		expect(applicantInitials(applied)).toBe('AL');
	});

	it('names the portfolios a recruiter added by their title, else their name', () => {
		expect(applicantName(added)).toBe('Louis Gentil');
		expect(applicantName({ ...added, domain: { name: 'louis.gentil' } })).toBe('louis.gentil');
		expect(applicantName({ ...added, domain: { name: 'x', headerTitle: '  ' } })).toBe('x');
		expect(applicantInitials({ ...added, domain: { name: 'louis.gentil' } })).toBe('LG');
		expect(applicantInitials({ ...added, domain: { name: 'ada' } })).toBe('A');
	});

	it('falls back to the portfolio when an applicant has a blank name', () => {
		expect(applicantName({ ...applied, candidate: { name: ' ', surname: '' } })).toBe(
			'Ada Lovelace · Engineer'
		);
	});

	it('labels the source and the date', () => {
		expect(APPLICANT_SOURCE_LABELS.applied).toBe('Applied');
		expect(APPLICANT_SOURCE_LABELS.added_by_recruiter).toBe('Added by you');
		expect(applicantDateText({ source: 'applied', appliedAt: '2026-11-03T10:00:00Z' }, 'UTC')).toBe(
			'Applied 3 Nov 2026'
		);
		expect(
			applicantDateText(
				{ source: 'added_by_recruiter', appliedAt: new Date('2026-11-03T10:00:00Z') },
				'UTC'
			)
		).toBe('Added 3 Nov 2026');
		expect(applicantDateText({ source: 'applied', appliedAt: 'nope' })).toBe('');
	});

	it('explains what removing an applicant does', () => {
		expect(removeApplicantText(applied)).toMatch(/^Ada Lovelace applied .* can apply again/);
		expect(removeApplicantText(added)).toMatch(/^Louis Gentil is no longer listed.* add the/);
	});

	it('explains what deleting a posting does', () => {
		expect(deleteJobText(0)).toBe('This cannot be undone.');
		expect(deleteJobText(1)).toBe(
			'Its list of 1 applicant is deleted with it. This cannot be undone.'
		);
		expect(deleteJobText(4)).toMatch(/^Its list of 4 applicants/);
	});
});

describe('domainFromInput', () => {
	it('reads a portfolio name, normalised', () => {
		expect(domainFromInput('  Louis.Gentil ')).toBe('louis.gentil');
		expect(domainFromInput('')).toBe('');
		expect(domainFromInput('   ')).toBe('');
	});

	it('reads the portfolio of a pasted address or path', () => {
		expect(domainFromInput('https://portfolio.gentil.tech/louis.gentil/experiences')).toBe(
			'louis.gentil'
		);
		expect(domainFromInput('http://localhost:5173/ada?skills=go')).toBe('ada');
		expect(domainFromInput('/louis.gentil/hire#top')).toBe('louis.gentil');
		expect(domainFromInput('louis.gentil/experiences')).toBe('louis.gentil');
	});

	it('says what is wrong with what was typed', () => {
		expect(applicantDomainProblem('')).toMatch(/Enter the name of a portfolio/);
		expect(applicantDomainProblem('not a name!')).toMatch(/not a portfolio name/);
		expect(applicantDomainProblem('louis.gentil')).toBe(null);
		expect(applicantDomainProblem('https://site.test/louis.gentil/experiences')).toBe(null);
	});
});

describe('isJobPostingGone', () => {
	it('tells a deleted posting from an applicant already removed', () => {
		expect(isJobPostingGone(404, 'Job posting not found')).toBe(true);
		expect(isJobPostingGone(404, { message: 'Job posting not found' })).toBe(true);
		expect(isJobPostingGone(404, 'Applicant not found')).toBe(false);
		expect(isJobPostingGone(409, 'Job posting not found')).toBe(false);
		expect(isJobPostingGone(undefined, new TypeError('Failed to fetch'))).toBe(false);
	});
});

describe('addApplicantError', () => {
	it('puts the problems of the name under the field', () => {
		expect(addApplicantError(404, 'Domain not found', 'ada')).toEqual({
			message: 'No portfolio is named “ada”. Check how it is spelled.',
			field: true
		});
		expect(addApplicantError(409, 'Already an applicant', 'ada')).toEqual({
			message: '“ada” is already an applicant.',
			field: true
		});
		expect(addApplicantError(403, 'You cannot add your own portfolio', 'me')).toEqual({
			message: 'This is your own portfolio: you cannot add it.',
			field: true
		});
		expect(addApplicantError(422, { type: 'validation', message: 'x' }, 'x').field).toBe(true);
	});

	it('reports the problems of the posting or the account as alerts', () => {
		expect(addApplicantError(404, 'Job posting not found', 'ada')).toEqual({
			message: 'This job description no longer exists: it may have been deleted.',
			field: false
		});
		expect(
			addApplicantError(409, 'This job posting has reached its limit of 1000 applicants', 'ada')
		).toEqual({
			message: 'This job description has reached its limit of 1000 applicants.',
			field: false
		});
		expect(addApplicantError(403, 'Create your recruiter space first', 'ada').field).toBe(false);
		expect(addApplicantError(401, 'Unauthorized', 'ada').message).toMatch(/session expired/);
		expect(addApplicantError(503, new TypeError('Failed to fetch'), 'ada')).toEqual({
			message: NETWORK_ERROR,
			field: false
		});
		expect(addApplicantError(500, 'boom', 'ada')).toEqual({
			message: 'Could not add this portfolio. Try again in a moment.',
			field: false
		});
	});
});

describe('failureText', () => {
	it('blames the connection when the request got no answer', () => {
		expect(failureText(new TypeError('Failed to fetch'), 'Could not delete it.')).toBe(
			NETWORK_ERROR
		);
	});

	it('keeps the given text when the API answered', () => {
		expect(failureText('Internal Server Error', 'Could not delete it.')).toBe(
			'Could not delete it.'
		);
		expect(failureText(undefined, 'Could not delete it.')).toBe('Could not delete it.');
	});
});
