import { RECRUITER_PLANS, RESUME_IMPORT_CLIENT_TIMEOUT_MS } from 'portfolio-common';
import type { portfolioApi } from '#services';
import { jobImportMessages as m } from './jobImport.messages.ts';
import { formatFileSize, formatResetDate } from './resumeImport';

// Pure helpers of the job description import (GET / POST /jobs/import): the API reads a PDF job
// description with Claude and answers with a job posting draft (nothing is saved), which the
// recruiter completes in the job editor (/recruiter/jobs/new?import=1). Imports come with the
// recruiter's plan: 3 on the free plan, for the lifetime of the account. Nothing here knows the
// UI: the dashboard and the import dialog build on these.

export {
	base64OfDataUrl,
	formatElapsed,
	formatFileSize,
	formatResetDate,
	hasPdfHeader
} from './resumeImport';

type ImportApi = typeof portfolioApi.jobs.import;

/** GET /jobs/import: whether the feature is on, the plan's allowance and what can start now */
export type JobImportStatus = NonNullable<Awaited<ReturnType<ImportApi['get']>>['data']>;

/** POST /jobs/import: the draft (nothing is saved), warnings and the allowance left */
export type JobImportResult = NonNullable<Awaited<ReturnType<ImportApi['post']>>['data']>;

export type JobImportQuota = JobImportResult['quota'];

/** The fields of the allowance the texts below read (status or quota) */
type Allowance = Pick<JobImportQuota, 'limit' | 'used' | 'remaining'> & {
	resetsAt?: Date | string | null;
};

/** Largest PDF the API takes (decoded), checked before sending */
export const MAX_JOB_PDF_BYTES = 4 * 1024 * 1024;

/**
 * How long the browser waits for an import: the résumé import's deadlines (the API uses the same
 * ones), plus the upload. An answer the browser stopped waiting for is an import that counted.
 */
export const JOB_IMPORT_CLIENT_TIMEOUT_MS = RESUME_IMPORT_CLIENT_TIMEOUT_MS;

/** Imports of the free plan (3) */
export const FREE_PLAN_IMPORTS = RECRUITER_PLANS.free.jobImports;

// --- The file -------------------------------------------------------------------------

/** What is wrong with a file picked for import, before reading it; undefined when it can go */
export function jobFileProblem(file: {
	name: string;
	type: string;
	size: number;
}): string | undefined {
	const looksLikePdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
	if (!looksLikePdf) return m.file.notPdf;
	if (file.size === 0) return m.file.empty;
	if (file.size > MAX_JOB_PDF_BYTES) return m.file.tooLarge(formatFileSize(file.size));
	return undefined;
}

// --- Allowance ------------------------------------------------------------------------

/** Imports left in the plan (whatever the daily limits allow today) */
export const planImportsLeft = ({ limit, used }: Pick<Allowance, 'limit' | 'used'>): number =>
	Math.max(0, limit - used);

/**
 * Where the recruiter stands:
 * - 'available': an import can start now;
 * - 'plan-used': the plan's imports are all used (only a paid plan lifts that: coming soon);
 * - 'paused': the plan has some left, but a daily limit (the site's, or the recruiter's
 *   attempts) is reached until `resetsAt`.
 */
export type JobImportAvailability = 'available' | 'plan-used' | 'paused';

export const jobImportAvailability = (allowance: Allowance): JobImportAvailability => {
	if (planImportsLeft(allowance) === 0) return 'plan-used';
	return allowance.remaining > 0 ? 'available' : 'paused';
};

/** '2 of 3 free imports left' (the plan's: the daily limits are only told once reached) */
export const jobImportQuotaText = (allowance: Allowance): string =>
	m.quota(planImportsLeft(allowance), allowance.limit);

/** 'You have used your 3 free imports. Paid plans are coming soon.' */
export const planUsedText = ({ limit }: Pick<Allowance, 'limit'>): string => m.planUsed(limit);

const resetIso = (resetsAt: Date | string | null | undefined): string | undefined => {
	if (!resetsAt) return undefined;
	if (resetsAt instanceof Date) {
		return Number.isNaN(resetsAt.getTime()) ? undefined : resetsAt.toISOString();
	}
	return resetsAt;
};

/**
 * What the dashboard says under "Import from PDF": the imports left, that the plan is used up,
 * or when imports start again (in the browser's time zone by default)
 */
export function jobImportAllowanceText(allowance: Allowance, timeZone?: string): string {
	switch (jobImportAvailability(allowance)) {
		case 'plan-used':
			return planUsedText(allowance);
		case 'paused': {
			const when = formatResetDate(resetIso(allowance.resetsAt), timeZone);
			return when ? m.pausedUntil(when) : m.paused;
		}
		default:
			return jobImportQuotaText(allowance);
	}
}

/**
 * 'This import uses 1 of your 2 free imports left, even if you discard the draft.' (the upload
 * step, before an import starts; 0 left never gets there)
 */
export const importCostText = (allowance: Allowance): string => {
	const left = planImportsLeft(allowance);
	return left === 1 ? m.lastImportCost : m.importCost(left);
};

// --- Errors ---------------------------------------------------------------------------

// The session expired, the connection failed, the browser stopped waiting, the recruiter stopped
// the import: `sessionExpired`, `networkError`, `timedOut` and `stopped` of jobImport.messages.ts

/** The text of an API error body: plain text only (a validation object is not about the file) */
const apiText = (value: unknown): string | undefined => {
	if (typeof value !== 'string') return undefined;
	const text = value.trim();
	// A proxy or the hosting edge may answer with an HTML page: not a message to show
	return text && text.length <= 500 && !text.startsWith('<') ? text : undefined;
};

/**
 * What to tell the recruiter when POST /jobs/import fails. The API's own message for the
 * statuses it explains (402, 413, 422, 429, 503): which limit was hit, when the next import is
 * possible, what is wrong with the file. A request that got no answer (the connection failed)
 * reaches here as Eden's 503 holding the fetch error: the connection is to blame, not the API.
 */
export function jobImportErrorMessage(status: number | undefined, value: unknown): string {
	// Eden Treaty answers a fetch that failed (no response at all) as a 503 holding the error
	if (value instanceof Error) return m.networkError;
	const text = apiText(value);
	switch (status) {
		case 401:
			return m.sessionExpired;
		case 402:
			return text ?? planUsedText({ limit: FREE_PLAN_IMPORTS });
		case 403:
			return m.errors.noRecruiterSpace;
		case 404:
			return m.errors.unavailable;
		case 413:
			return text ?? m.errors.tooLarge;
		case 422:
			return text ?? m.errors.unreadable;
		case 429:
			return text ?? m.errors.noImportsAvailable;
		case 503:
			return text ?? m.errors.temporarilyUnavailable;
		default:
			return m.errors.failed;
	}
}

/** Whether a failed import was refused for the allowance: the quota text then says when */
export const isAllowanceRefusal = (status: number | undefined): boolean =>
	status === 402 || status === 429;

/** 'Imported from offer.pdf: 2 things to check' (the toast once the editor opens) */
export const importedToastText = (fileName: string, warnings: readonly string[]): string =>
	m.importedToast(fileName, warnings.length);
