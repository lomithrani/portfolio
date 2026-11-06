import { describe, it, expect } from 'vitest';
import {
	APPLICATION_NETWORK_MESSAGE,
	JOB_NOT_FOUND_MESSAGE,
	applicationFailure,
	applicationSummary,
	applyView,
	closedNotice,
	formatDay,
	isJobNotFound,
	isJobPostingId,
	isOwnPosting,
	jobPageTitle,
	jobShareDescription,
	needsApplicationStatus,
	openPositionsText,
	publishedText,
	readApplicationStatus,
	truncateText
} from '../applications';
import type { JobPostingLike } from '../jobPosting';

const job: JobPostingLike & { recruiter: string } = {
	title: 'Backend engineer',
	company: 'Acme',
	status: 'open',
	recruiter: 'recruiter-1',
	location: { country: 'FR', city: 'Lyon', workMode: 'hybrid', remoteDaysPerWeek: 2 },
	contract: { type: 'cdi' },
	pay: { min: 45000, max: 55000, currency: 'EUR', period: 'year' }
};

describe('isJobPostingId', () => {
	it('accepts 24 hexadecimal characters only', () => {
		expect(isJobPostingId('65a1f0c2b3d4e5f6a7b8c9d0')).toBe(true);
		expect(isJobPostingId('65A1F0C2B3D4E5F6A7B8C9D0')).toBe(true);
		for (const id of ['', 'abc', '65a1f0c2b3d4e5f6a7b8c9d', '65a1f0c2b3d4e5f6a7b8c9dz', '../x']) {
			expect(isJobPostingId(id)).toBe(false);
		}
		expect(isJobPostingId(undefined)).toBe(false);
	});
});

describe('isJobNotFound', () => {
	it("is the API's own 404 (or a 422 for an id that is not one)", () => {
		expect(isJobNotFound({ status: 404, value: JOB_NOT_FOUND_MESSAGE })).toBe(true);
		expect(isJobNotFound({ status: 404, value: ` ${JOB_NOT_FOUND_MESSAGE}\n` })).toBe(true);
		expect(isJobNotFound({ status: 422, value: { type: 'validation' } })).toBe(true);
	});

	it('is not any other 404 (a wrong API URL, the hosting edge) nor another error', () => {
		expect(isJobNotFound({ status: 404, value: 'NOT_FOUND' })).toBe(false);
		expect(isJobNotFound({ status: 404, value: { message: JOB_NOT_FOUND_MESSAGE } })).toBe(false);
		expect(isJobNotFound({ status: 500, value: JOB_NOT_FOUND_MESSAGE })).toBe(false);
		expect(isJobNotFound(null)).toBe(false);
	});
});

describe('openPositionsText', () => {
	it('counts open positions', () => {
		expect(openPositionsText(0)).toBe('No open positions');
		expect(openPositionsText(1)).toBe('1 open position');
		expect(openPositionsText(12)).toBe('12 open positions');
	});
});

describe('formatDay and publishedText', () => {
	it('formats a day, from a Date or an ISO string', () => {
		expect(formatDay(new Date('2026-11-06T10:00:00Z'), 'UTC')).toBe('6 Nov 2026');
		expect(formatDay('2026-11-06T23:30:00Z', 'Europe/Paris')).toBe('7 Nov 2026');
		expect(formatDay(undefined)).toBe('');
		expect(formatDay('not a date')).toBe('');
	});

	it('says when the posting was published, else created (in UTC by default)', () => {
		expect(
			publishedText({
				publishedAt: new Date('2026-11-03T23:30:00Z'),
				createdAt: new Date('2026-10-01T00:00:00Z')
			})
		).toBe('Published 3 Nov 2026');
		expect(publishedText({ createdAt: '2026-10-01T08:00:00Z' })).toBe('Published 1 Oct 2026');
		expect(publishedText({})).toBe('');
	});
});

describe('jobPageTitle', () => {
	it('names the job and its company', () => {
		expect(jobPageTitle(job)).toBe('Backend engineer at Acme');
		expect(jobPageTitle({ title: ' Backend engineer ', company: ' ' })).toBe('Backend engineer');
		expect(jobPageTitle({})).toBe('Job posting');
	});
});

describe('truncateText', () => {
	it('keeps short text and cuts long text at a word', () => {
		expect(truncateText('short', 10)).toBe('short');
		expect(truncateText('one two three four', 12)).toBe('one two…');
		expect(truncateText('one two three four', 12).length).toBeLessThanOrEqual(12);
	});

	it('cuts inside a long word rather than leaving almost nothing', () => {
		expect(truncateText('a supercalifragilistic', 10)).toBe('a superca…');
	});
});

describe('jobShareDescription', () => {
	it('is plain text: company, city, work mode, contract and pay', () => {
		expect(jobShareDescription(job)).toBe(
			'Acme · Lyon · Hybrid · CDI · €45,000 – €55,000 gross per year'
		);
	});

	it('starts with the status of a posting that is not open', () => {
		expect(jobShareDescription({ ...job, status: 'filled' })).toMatch(/^Filled · Acme · /);
	});

	it('never includes the Markdown description, and stays short', () => {
		const long = {
			...job,
			description: '# Heading\n\n**bold**',
			company: 'A very long company name '.repeat(12)
		};
		const description = jobShareDescription(long);
		expect(description).not.toContain('#');
		expect(description).not.toContain('**');
		expect(description.length).toBeLessThanOrEqual(200);
		expect(description.endsWith('…')).toBe(true);
	});

	it('has a fallback for a posting that says nothing', () => {
		expect(jobShareDescription({})).toBe('A job description: apply with your portfolio.');
	});
});

describe('applyView', () => {
	const candidate = { _id: 'candidate-1', domain: 'jane.doe' };

	it('says a posting that is not open takes no applications, even before the session check', () => {
		for (const status of ['on_hold', 'filled', 'closed'] as const) {
			expect(applyView({ job: { ...job, status }, user: undefined, sessionChecked: false })).toBe(
				'not-open'
			);
			expect(applyView({ job: { ...job, status }, user: candidate, sessionChecked: true })).toBe(
				'not-open'
			);
		}
	});

	it('waits for the session check before anything that depends on the viewer', () => {
		expect(applyView({ job, user: candidate, sessionChecked: false })).toBe('checking');
		expect(applyView({ job, user: undefined, sessionChecked: false })).toBe('checking');
	});

	it("recognises the posting's recruiter", () => {
		expect(applyView({ job, user: { _id: 'recruiter-1' }, sessionChecked: true })).toBe(
			'own-posting'
		);
		// Even with a portfolio of their own
		expect(
			applyView({ job, user: { _id: 'recruiter-1', domain: 'rita' }, sessionChecked: true })
		).toBe('own-posting');
	});

	it('asks to sign in, then to claim a portfolio, then offers to apply', () => {
		expect(applyView({ job, user: undefined, sessionChecked: true })).toBe('signed-out');
		expect(applyView({ job, user: { _id: 'candidate-1' }, sessionChecked: true })).toBe(
			'no-portfolio'
		);
		expect(applyView({ job, user: candidate, sessionChecked: true })).toBe('can-apply');
	});
});

describe('isOwnPosting', () => {
	it('compares ids as strings', () => {
		expect(isOwnPosting({ recruiter: 'abc' }, { _id: 'abc' })).toBe(true);
		expect(isOwnPosting({ recruiter: { toString: () => 'abc' } }, { _id: 'abc' })).toBe(true);
		expect(isOwnPosting({ recruiter: 'abc' }, { _id: 'def' })).toBe(false);
		expect(isOwnPosting({ recruiter: 'abc' }, undefined)).toBe(false);
		expect(isOwnPosting({}, { _id: 'abc' })).toBe(false);
	});
});

describe('needsApplicationStatus', () => {
	const candidate = { _id: 'candidate-1', domain: 'jane.doe' };

	it('asks whenever the viewer can apply', () => {
		expect(needsApplicationStatus('can-apply', job, candidate, true)).toBe(true);
	});

	it('asks on a posting that is not open, for a candidate with a portfolio only', () => {
		const closed = { ...job, status: 'closed' as const };
		expect(needsApplicationStatus('not-open', closed, candidate, true)).toBe(true);
		expect(needsApplicationStatus('not-open', closed, candidate, false)).toBe(false);
		expect(needsApplicationStatus('not-open', closed, { _id: 'candidate-1' }, true)).toBe(false);
		expect(needsApplicationStatus('not-open', closed, undefined, true)).toBe(false);
		expect(
			needsApplicationStatus('not-open', closed, { _id: 'recruiter-1', domain: 'r' }, true)
		).toBe(false);
	});

	it('does not ask otherwise', () => {
		for (const view of ['checking', 'own-posting', 'signed-out', 'no-portfolio'] as const) {
			expect(needsApplicationStatus(view, job, candidate, true)).toBe(false);
		}
	});
});

describe('closedNotice', () => {
	it('explains each status that takes no applications', () => {
		expect(closedNotice('on_hold').title).toBe('On hold');
		expect(closedNotice('filled').title).toBe('Position filled');
		expect(closedNotice('closed').title).toBe('Position closed');
		for (const status of ['on_hold', 'filled', 'closed', 'draft', undefined] as const) {
			expect(closedNotice(status).text).toMatch(/not taking applications/);
		}
	});
});

describe('readApplicationStatus', () => {
	it('reads an application, its date arriving as a Date (Eden) or a string', () => {
		const appliedAt = new Date('2026-11-06T10:00:00Z');
		expect(readApplicationStatus({ applied: true, appliedAt, source: 'applied' })).toEqual({
			applied: true,
			appliedAt,
			source: 'applied'
		});
		expect(
			readApplicationStatus({
				applied: true,
				appliedAt: '2026-11-06T10:00:00.000Z',
				source: 'added_by_recruiter'
			})
		).toEqual({ applied: true, appliedAt, source: 'added_by_recruiter' });
	});

	it('drops what it cannot read', () => {
		expect(readApplicationStatus({ applied: false, appliedAt: new Date() })).toEqual({
			applied: false
		});
		expect(readApplicationStatus({ applied: true, appliedAt: 'nope', source: 'other' })).toEqual({
			applied: true
		});
		expect(readApplicationStatus({ applied: 'yes' })).toBeUndefined();
		expect(readApplicationStatus(null)).toBeUndefined();
		expect(readApplicationStatus('applied')).toBeUndefined();
	});
});

describe('applicationSummary', () => {
	const appliedAt = new Date('2026-11-06T10:00:00Z');

	it('says when and how the viewer became an applicant', () => {
		expect(applicationSummary({ applied: true, appliedAt, source: 'applied' }, 'UTC')).toBe(
			'You applied on 6 Nov 2026'
		);
		expect(
			applicationSummary({ applied: true, appliedAt, source: 'added_by_recruiter' }, 'UTC')
		).toBe('The recruiter added your portfolio on 6 Nov 2026');
		expect(applicationSummary({ applied: true })).toBe('You applied');
		expect(applicationSummary({ applied: false })).toBe('');
	});
});

describe('applicationFailure', () => {
	it('clears nothing itself but says the session expired on a 401', () => {
		expect(applicationFailure('apply', 401, 'Unauthorized')).toEqual({
			kind: 'session-expired',
			message: 'Your session expired. Sign in again to apply.'
		});
		expect(applicationFailure('withdraw', 401).message).toMatch(/withdraw/);
	});

	it("reads the API's 403 messages", () => {
		expect(applicationFailure('apply', 403, 'You cannot apply to your own job posting').kind).toBe(
			'own-posting'
		);
		expect(applicationFailure('apply', 403, 'Claim a portfolio before applying').kind).toBe(
			'no-portfolio'
		);
		expect(applicationFailure('apply', 403, 'Forbidden')).toEqual({
			kind: 'error',
			message: 'Could not send your application. Try again.'
		});
	});

	it("reads the API's 409 messages", () => {
		expect(applicationFailure('apply', 409, 'You already applied').kind).toBe('already-applied');
		expect(
			applicationFailure('apply', 409, 'This job posting is not taking applications').kind
		).toBe('not-open');
		expect(
			applicationFailure('apply', 409, 'This job posting has reached its limit of 1000 applicants')
				.kind
		).toBe('full');
		expect(applicationFailure('apply', 409, { message: 'You already applied' }).kind).toBe(
			'already-applied'
		);
	});

	it('treats withdrawing an application that is gone as done', () => {
		expect(
			applicationFailure('withdraw', 404, 'You have not applied to this job posting').kind
		).toBe('not-applied');
		expect(applicationFailure('apply', 404, JOB_NOT_FOUND_MESSAGE).kind).toBe('not-found');
		expect(applicationFailure('withdraw', 404, JOB_NOT_FOUND_MESSAGE).kind).toBe('not-found');
	});

	it('has a message per action for anything else, and for a network failure', () => {
		expect(applicationFailure('withdraw', 500).message).toBe(
			'Could not withdraw your application. Try again.'
		);
		expect(applicationFailure('status', 503).message).toBe(
			'Could not check whether you applied. Try again.'
		);
		expect(applicationFailure('apply', undefined)).toEqual({
			kind: 'network',
			message: APPLICATION_NETWORK_MESSAGE
		});
	});
});
