import { describe, it, expect } from 'vitest';
import { RESUME_IMPORT_CLIENT_TIMEOUT_MS } from 'portfolio-common';
import {
	FREE_PLAN_IMPORTS,
	JOB_IMPORT_CLIENT_TIMEOUT_MS,
	JOB_IMPORT_NETWORK_ERROR,
	JOB_IMPORT_SESSION_EXPIRED,
	MAX_JOB_PDF_BYTES,
	base64OfDataUrl,
	formatElapsed,
	hasPdfHeader,
	importCostText,
	importedToastText,
	isAllowanceRefusal,
	jobFileProblem,
	jobImportAllowanceText,
	jobImportAvailability,
	jobImportErrorMessage,
	jobImportQuotaText,
	planImportsLeft,
	planUsedText
} from '../jobImport';

const allowance = (used: number, remaining: number, resetsAt: Date | null = null) => ({
	limit: 3,
	used,
	remaining,
	resetsAt
});

describe('job import limits', () => {
	it('waits as long as the résumé import (same API deadlines)', () => {
		expect(JOB_IMPORT_CLIENT_TIMEOUT_MS).toBe(RESUME_IMPORT_CLIENT_TIMEOUT_MS);
	});

	it('includes 3 imports in the free plan', () => {
		expect(FREE_PLAN_IMPORTS).toBe(3);
	});
});

describe('jobFileProblem', () => {
	it('accepts a PDF of up to 4 MB', () => {
		expect(jobFileProblem({ name: 'offer.pdf', type: 'application/pdf', size: 1000 })).toBe(
			undefined
		);
		expect(jobFileProblem({ name: 'offer.pdf', type: '', size: MAX_JOB_PDF_BYTES })).toBe(
			undefined
		);
	});

	it('accepts a .pdf name without a type, whatever its case', () => {
		expect(jobFileProblem({ name: 'OFFER.PDF', type: '', size: 10 })).toBe(undefined);
	});

	it('refuses other files, empty files and files over 4 MB', () => {
		expect(jobFileProblem({ name: 'offer.docx', type: 'application/msword', size: 10 })).toMatch(
			/Choose a PDF file/
		);
		expect(jobFileProblem({ name: 'offer.pdf', type: 'application/pdf', size: 0 })).toMatch(
			/empty/
		);
		expect(
			jobFileProblem({ name: 'offer.pdf', type: 'application/pdf', size: MAX_JOB_PDF_BYTES + 1 })
		).toMatch(/This PDF is 4 MB: the import takes files of up to 4 MB/);
	});
});

describe('generic file helpers (shared with the résumé import)', () => {
	it('reads PDF headers, data URLs and elapsed times', () => {
		expect(hasPdfHeader(new TextEncoder().encode('%PDF-1.7'))).toBe(true);
		expect(hasPdfHeader(new TextEncoder().encode('PK\u0003\u0004'))).toBe(false);
		expect(base64OfDataUrl('data:application/pdf;base64,JVBERi0=')).toBe('JVBERi0=');
		expect(formatElapsed(65)).toBe('1:05');
	});
});

describe('allowance', () => {
	it('counts what is left of the plan', () => {
		expect(planImportsLeft({ limit: 3, used: 1 })).toBe(2);
		expect(planImportsLeft({ limit: 3, used: 5 })).toBe(0);
	});

	it('is available while an import can start', () => {
		expect(jobImportAvailability(allowance(0, 3))).toBe('available');
		expect(jobImportAvailability(allowance(2, 1))).toBe('available');
	});

	it('is used up once the plan has none left, whatever the daily limits', () => {
		expect(jobImportAvailability(allowance(3, 0))).toBe('plan-used');
	});

	it('is paused when a daily limit holds the imports the plan still has', () => {
		expect(jobImportAvailability(allowance(1, 0, new Date('2026-11-07T00:00:00Z')))).toBe('paused');
	});

	it('says how many free imports are left in the plan', () => {
		expect(jobImportQuotaText(allowance(1, 2))).toBe('2 of 3 free imports left');
		// A daily limit lower than the plan does not change the plan's count
		expect(jobImportQuotaText(allowance(0, 1))).toBe('3 of 3 free imports left');
		expect(jobImportQuotaText({ limit: 1, used: 0, remaining: 1 })).toBe('1 of 1 free import left');
	});

	it('says that paid plans are coming once the plan is used', () => {
		expect(planUsedText({ limit: 3 })).toBe(
			'You have used your 3 free imports. Paid plans are coming soon.'
		);
		expect(jobImportAllowanceText(allowance(3, 0))).toBe(planUsedText({ limit: 3 }));
	});

	it('says when imports start again after a daily limit, in the given time zone', () => {
		const text = jobImportAllowanceText(
			allowance(1, 0, new Date('2026-11-07T00:00:00Z')),
			'Europe/Paris'
		);
		expect(text).toBe(
			'No imports available right now: you can import again from Nov 7, 1:00 AM GMT+1.'
		);
		// The date may arrive as an ISO string (not through Eden)
		expect(
			jobImportAllowanceText(
				{ limit: 3, used: 1, remaining: 0, resetsAt: '2026-11-07T00:00:00.000Z' },
				'UTC'
			)
		).toBe('No imports available right now: you can import again from Nov 7, 12:00 AM UTC.');
	});

	it('does without a reset date when there is none', () => {
		expect(jobImportAllowanceText(allowance(1, 0))).toBe(
			'No imports available right now. Try again later.'
		);
		expect(jobImportAllowanceText(allowance(1, 0, new Date('invalid')))).toBe(
			'No imports available right now. Try again later.'
		);
	});

	it('shows the plan count while available', () => {
		expect(jobImportAllowanceText(allowance(1, 2))).toBe('2 of 3 free imports left');
	});

	it('warns that an import counts even if the draft is discarded', () => {
		expect(importCostText(allowance(1, 2))).toBe(
			'This import uses 1 of your 2 free imports left, even if you discard the draft.'
		);
		expect(importCostText(allowance(2, 1))).toBe(
			'This is your last free import: it counts even if you discard the draft.'
		);
	});
});

describe('jobImportErrorMessage', () => {
	it('asks to sign in again after a 401', () => {
		expect(jobImportErrorMessage(401, 'Unauthorized')).toBe(JOB_IMPORT_SESSION_EXPIRED);
	});

	it("shows the API's message for the statuses it explains", () => {
		const plan =
			'You have used the 3 job description imports included in the free plan. Paid plans are coming soon.';
		expect(jobImportErrorMessage(402, plan)).toBe(plan);
		expect(jobImportErrorMessage(413, 'The file is too large')).toBe('The file is too large');
		expect(jobImportErrorMessage(422, 'This PDF is too long for an import')).toBe(
			'This PDF is too long for an import'
		);
		expect(jobImportErrorMessage(429, 'Try again after 00:00 UTC')).toBe(
			'Try again after 00:00 UTC'
		);
		expect(jobImportErrorMessage(503, 'The import did not finish')).toBe(
			'The import did not finish'
		);
	});

	it('has its own words when the API gave none (or an HTML page, or a validation object)', () => {
		expect(jobImportErrorMessage(402, undefined)).toBe(planUsedText({ limit: 3 }));
		expect(jobImportErrorMessage(413, '<html>Too large</html>')).toMatch(/up to 4 MB/);
		expect(jobImportErrorMessage(422, { type: 'validation', message: 'Expected string' })).toMatch(
			/could not be read as a job description/
		);
		expect(jobImportErrorMessage(429, '')).toMatch(/Try again later/);
		expect(jobImportErrorMessage(503, undefined)).toMatch(/temporarily unavailable/);
	});

	it('explains a missing recruiter space and a feature that is off', () => {
		expect(jobImportErrorMessage(403, 'Create your recruiter space first')).toMatch(
			/no recruiter space/
		);
		expect(jobImportErrorMessage(404, 'Job description import is not enabled on this server')).toBe(
			'Job description import is not available on this site right now.'
		);
	});

	it('blames the connection when no answer came (Eden: a 503 holding the fetch error)', () => {
		expect(jobImportErrorMessage(503, new TypeError('Failed to fetch'))).toBe(
			JOB_IMPORT_NETWORK_ERROR
		);
		expect(jobImportErrorMessage(503, 'The import did not finish')).toBe(
			'The import did not finish'
		);
	});

	it('falls back to a generic message', () => {
		expect(jobImportErrorMessage(500, 'Internal error')).toBe(
			'The import failed. Try again in a moment.'
		);
		expect(jobImportErrorMessage(undefined, undefined)).toBe(
			'The import failed. Try again in a moment.'
		);
	});

	it('knows which refusals are about the allowance', () => {
		expect(isAllowanceRefusal(402)).toBe(true);
		expect(isAllowanceRefusal(429)).toBe(true);
		expect(isAllowanceRefusal(422)).toBe(false);
	});
});

describe('importedToastText', () => {
	it('says what to do next, and how many notes to check', () => {
		expect(importedToastText('offer.pdf', [])).toBe(
			'Read from offer.pdf. Complete it, then create the posting.'
		);
		expect(importedToastText('offer.pdf', ['a'])).toBe(
			'Read from offer.pdf. Check the note above the form, then create the posting.'
		);
		expect(importedToastText('', ['a', 'b'])).toBe(
			'Read. Check the 2 notes above the form, then create the posting.'
		);
	});
});
