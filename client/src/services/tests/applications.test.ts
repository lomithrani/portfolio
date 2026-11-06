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
	jobPageAction,
	jobPageTitle,
	jobShareDescription,
	leaveAction,
	leaveCopy,
	needsApplicationStatus,
	openPositionsText,
	publishedText,
	readApplicationStatus,
	truncateText
} from '../applications';
import type { JobPostingLike } from '../jobPosting';

const job: JobPostingLike = {
	title: 'Backend engineer',
	company: 'Acme',
	status: 'open',
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
			'Acme · Lyon · Hybrid · CDI (permanent) · €45,000 – €55,000 gross per year'
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
	const notApplied = { applied: false };

	it('says a posting that is not open takes no applications, even before the session check', () => {
		for (const status of ['on_hold', 'filled', 'closed'] as const) {
			expect(
				applyView({
					job: { ...job, status },
					user: undefined,
					sessionChecked: false,
					status: undefined
				})
			).toBe('not-open');
			expect(
				applyView({
					job: { ...job, status },
					user: candidate,
					sessionChecked: true,
					status: notApplied
				})
			).toBe('not-open');
		}
	});

	it('waits for the session check, then for where the signed-in viewer stands', () => {
		expect(applyView({ job, user: candidate, sessionChecked: false, status: undefined })).toBe(
			'checking'
		);
		expect(applyView({ job, user: undefined, sessionChecked: false, status: undefined })).toBe(
			'checking'
		);
		// Signed in: the API tells whether the posting is theirs before anything is offered
		expect(applyView({ job, user: candidate, sessionChecked: true, status: undefined })).toBe(
			'checking'
		);
		expect(
			applyView({ job, user: { _id: 'recruiter-1' }, sessionChecked: true, status: undefined })
		).toBe('checking');
	});

	it("recognises the posting's recruiter from the API's answer (postings never name them)", () => {
		const own = { applied: false, own: true };
		expect(
			applyView({ job, user: { _id: 'recruiter-1' }, sessionChecked: true, status: own })
		).toBe('own-posting');
		// Even with a portfolio of their own
		expect(
			applyView({
				job,
				user: { _id: 'recruiter-1', domain: 'rita' },
				sessionChecked: true,
				status: own
			})
		).toBe('own-posting');
	});

	it('asks to sign in, then to claim a portfolio, then offers to apply', () => {
		expect(applyView({ job, user: undefined, sessionChecked: true, status: undefined })).toBe(
			'signed-out'
		);
		expect(
			applyView({ job, user: { _id: 'candidate-1' }, sessionChecked: true, status: notApplied })
		).toBe('no-portfolio');
		expect(applyView({ job, user: candidate, sessionChecked: true, status: notApplied })).toBe(
			'can-apply'
		);
		// The status could not be loaded: the panel offers what it can (and to try again)
		expect(applyView({ job, user: candidate, sessionChecked: true, status: null })).toBe(
			'can-apply'
		);
	});
});

describe('needsApplicationStatus', () => {
	it('asks once the session is known, for anyone signed in', () => {
		expect(needsApplicationStatus({ _id: 'candidate-1', domain: 'jane.doe' }, true)).toBe(true);
		// Without a portfolio too: the posting may be theirs
		expect(needsApplicationStatus({ _id: 'recruiter-1' }, true)).toBe(true);
		expect(needsApplicationStatus({ _id: 'candidate-1' }, false)).toBe(false);
		expect(needsApplicationStatus(undefined, true)).toBe(false);
	});
});

describe('jobPageAction', () => {
	it('holds a placeholder until the panel knows, so the link never changes once shown', () => {
		expect(jobPageAction('checking', undefined)).toBe('pending');
	});

	it('leads the recruiter to manage the posting, whatever its status', () => {
		expect(jobPageAction('own-posting', { applied: false, own: true })).toBe('manage');
		expect(jobPageAction('not-open', { applied: false, own: true })).toBe('manage');
	});

	it('leads a candidate to their application, or to apply', () => {
		expect(jobPageAction('can-apply', { applied: true })).toBe('application');
		expect(jobPageAction('can-apply', { applied: false })).toBe('apply');
		expect(jobPageAction('can-apply', null)).toBe('apply');
		expect(jobPageAction('signed-out', undefined)).toBe('apply');
		expect(jobPageAction('no-portfolio', { applied: false })).toBe('apply');
	});

	it('offers nothing on a posting that takes no applications', () => {
		expect(jobPageAction('not-open', undefined)).toBe('none');
		expect(jobPageAction('not-open', { applied: true })).toBe('none');
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

	it("reads the recruiter's own posting", () => {
		expect(readApplicationStatus({ applied: false, own: true })).toEqual({
			applied: false,
			own: true
		});
		expect(readApplicationStatus({ applied: false, own: 'yes' })).toEqual({ applied: false });
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

	it('speaks of the applicant list when the recruiter added the portfolio', () => {
		expect(applicationFailure('remove', 401).message).toBe(
			'Your session expired. Sign in again to remove yourself from the list.'
		);
		expect(applicationFailure('remove', 404, 'You have not applied to this job posting')).toEqual({
			kind: 'not-applied',
			message: 'You were no longer on the applicant list.'
		});
		expect(applicationFailure('remove', 404, JOB_NOT_FOUND_MESSAGE).kind).toBe('not-found');
		expect(applicationFailure('remove', 500).message).toBe(
			'Could not remove you from the list. Try again.'
		);
	});

	it('treats withdrawing an application that is gone as done', () => {
		const gone = applicationFailure('withdraw', 404, 'You have not applied to this job posting');
		expect(gone.kind).toBe('not-applied');
		// Withdrawn in another tab, or removed by the recruiter: the wording blames no one
		expect(gone.message).toBe('You are no longer on this job’s applicant list.');
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

describe('leaveAction and leaveCopy', () => {
	it('withdraws an application the candidate sent', () => {
		expect(leaveAction('applied')).toBe('withdraw');
		expect(leaveAction(undefined)).toBe('withdraw');
		const copy = leaveCopy('applied');
		expect(copy.button).toBe('Withdraw my application');
		expect(copy.question).toMatch(/^Withdraw your application\?/);
		expect(copy.confirm).toBe('Withdraw');
		expect(copy.done).toBe('Application withdrawn');
	});

	it('removes a portfolio the recruiter added, never calling it an application', () => {
		expect(leaveAction('added_by_recruiter')).toBe('remove');
		const copy = leaveCopy('added_by_recruiter');
		expect(copy.button).toBe('Remove me from the list');
		expect(copy.confirm).toBe('Remove me');
		expect(copy.done).toBe('Removed from the applicant list');
		for (const text of Object.values(copy)) expect(text).not.toMatch(/application|withdraw/i);
	});
});
