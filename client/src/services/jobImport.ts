import { RECRUITER_PLANS, RESUME_IMPORT_CLIENT_TIMEOUT_MS } from 'portfolio-common';
import type { portfolioApi } from '#services';
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
	if (!looksLikePdf) return 'Choose a PDF file: the import only reads PDF job descriptions.';
	if (file.size === 0) return 'This file is empty. Choose another PDF.';
	if (file.size > MAX_JOB_PDF_BYTES) {
		return `This PDF is ${formatFileSize(file.size)}: the import takes files of up to 4 MB. Export a lighter version (fewer images) and try again.`;
	}
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
export const jobImportQuotaText = (allowance: Allowance): string => {
	const left = planImportsLeft(allowance);
	return `${left} of ${allowance.limit} free ${allowance.limit === 1 ? 'import' : 'imports'} left`;
};

/** 'You have used your 3 free imports. Paid plans are coming soon.' */
export const planUsedText = ({ limit }: Pick<Allowance, 'limit'>): string =>
	`You have used your ${limit} free ${limit === 1 ? 'import' : 'imports'}. Paid plans are coming soon.`;

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
			return when
				? `No imports available right now: you can import again from ${when}.`
				: 'No imports available right now. Try again later.';
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
	return left === 1
		? 'This is your last free import: it counts even if you discard the draft.'
		: `This import uses 1 of your ${left} free imports left, even if you discard the draft.`;
};

// --- Errors ---------------------------------------------------------------------------

export const JOB_IMPORT_SESSION_EXPIRED =
	'Your session expired. Sign in again, then import the job description.';

export const JOB_IMPORT_NETWORK_ERROR =
	'Could not reach the server. Check your connection and try again. If the import had started, it may still count toward your free imports.';

export const JOB_IMPORT_TIMED_OUT =
	'The import took too long and was stopped. It may still count toward your free imports: try again later, or with a shorter PDF.';

export const JOB_IMPORT_STOPPED =
	'Import stopped. If Claude had already started reading the PDF, it still counts toward your free imports.';

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
 * possible, what is wrong with the file.
 */
export function jobImportErrorMessage(status: number | undefined, value: unknown): string {
	const text = apiText(value);
	switch (status) {
		case 401:
			return JOB_IMPORT_SESSION_EXPIRED;
		case 402:
			return text ?? planUsedText({ limit: FREE_PLAN_IMPORTS });
		case 403:
			return 'Your account has no recruiter space yet. Create it from your recruiter space, then import the PDF.';
		case 404:
			return 'Job description import is not available on this site right now.';
		case 413:
			return text ?? 'This PDF is too large: the import takes files of up to 4 MB.';
		case 422:
			return text ?? 'This file could not be read as a job description. Choose another PDF.';
		case 429:
			return text ?? 'No imports are available right now. Try again later.';
		case 503:
			return text ?? 'Job description import is temporarily unavailable. Try again later.';
		default:
			return 'The import failed. Try again in a moment.';
	}
}

/** Whether a failed import was refused for the allowance: the quota text then says when */
export const isAllowanceRefusal = (status: number | undefined): boolean =>
	status === 402 || status === 429;

/** 'Imported from offer.pdf: 2 things to check' (the toast once the editor opens) */
export const importedToastText = (fileName: string, warnings: readonly string[]): string => {
	const from = fileName ? ` from ${fileName}` : '';
	if (warnings.length === 0) return `Read${from}. Complete it, then create the posting.`;
	return `Read${from}. Check the ${warnings.length === 1 ? 'note' : `${warnings.length} notes`} above the form, then create the posting.`;
};
