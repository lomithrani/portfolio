import {
	CONTRACT_TYPES_WITH_DURATION,
	EDUCATION_LEVELS,
	FR_CONTRACT_TYPES,
	JOB_STATUSES,
	PAY_PERIODS,
	SENIORITY_LEVELS,
	TRAVEL_FREQUENCIES,
	WORKING_TIME_ARRANGEMENTS,
	WORK_MODES
} from 'portfolio-common';
import {
	emptyJobForm,
	jobFormSignature,
	jobToForm,
	type JobForm,
	type JobPostingLike
} from './jobPosting';

// What the job editor keeps in this browser:
// - its unsaved state, per user and posting ('new' while adding): `jobDraft:<userId>:new`,
//   `jobDraft:<userId>:<jobId>`, restored when the recruiter comes back;
// - the draft of the last job description PDF import, per user: `jobImportDraft:<userId>`,
//   written by the import dialog and read by /recruiter/jobs/new?import=1, removed once the
//   posting is saved or the recruiter discards it (an import is paid: a reload keeps it).
// Storage may be missing or throw (private mode, quota, blocked site data): every access is
// guarded, and a failure only loses the draft. What is read back is checked field by field:
// it may come from an older client, or have been edited by hand.

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const browserStorage = (): DraftStorage | undefined => {
	try {
		return globalThis.localStorage ?? undefined;
	} catch {
		return undefined;
	}
};

const read = (key: string, storage: DraftStorage | undefined): unknown => {
	try {
		const raw = storage?.getItem(key);
		return raw ? JSON.parse(raw) : undefined;
	} catch {
		return undefined;
	}
};

const write = (key: string, value: unknown, storage: DraftStorage | undefined): void => {
	try {
		storage?.setItem(key, JSON.stringify(value));
	} catch {
		// Quota or blocked storage: the draft is not kept
	}
};

const remove = (key: string, storage: DraftStorage | undefined): void => {
	try {
		storage?.removeItem(key);
	} catch {
		// Nothing to remove
	}
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value);

// --- The editor's draft -----------------------------------------------------------------

/** `jobDraft:<userId>:new` (adding) or `jobDraft:<userId>:<jobId>` (editing) */
export const jobDraftStorageKey = (userId: string, jobId?: string): string =>
	`jobDraft:${userId}:${jobId ?? 'new'}`;

/**
 * What a draft started from, for a new posting: a blank form, or one imported file. A stored
 * add draft is only restored over the same start: never over another import.
 */
export const draftBasis = (start: JobForm): string => jobFormSignature(start);

/** A stored editor draft: the form, and the signature of the form it started from */
export type StoredJobDraft = { form: JobForm; basis?: string };

const TEXT_FIELDS = [
	'title',
	'description',
	'company',
	'openings',
	'city',
	'postalCode',
	'remoteDaysPerWeek',
	'durationMonths',
	'startDate',
	'trialPeriodMonths',
	'collectiveAgreement',
	'hoursPerWeek',
	'daysPerYear',
	'rttDaysPerYear',
	'payMin',
	'payMax',
	'payVariable',
	'directReports',
	'peers',
	'levelsToCeo'
] as const satisfies readonly (keyof JobForm)[];

const LIST_FIELDS = [
	'skills',
	'languages',
	'benefits'
] as const satisfies readonly (keyof JobForm)[];

const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
	(values as readonly unknown[]).includes(value) ? (value as T) : fallback;

const optionalOneOf = <T extends string>(values: readonly T[], value: unknown): T | '' =>
	(values as readonly unknown[]).includes(value) ? (value as T) : '';

/**
 * A job form read back from storage (or anything else untrusted): every known field of the
 * right type is kept, anything else falls back to the empty form's. undefined when it is not a
 * form at all.
 */
export function jobFormFromStorage(value: unknown): JobForm | undefined {
	if (!isRecord(value)) return undefined;
	const form = emptyJobForm();
	for (const field of TEXT_FIELDS) {
		const text = value[field];
		if (typeof text === 'string') form[field] = text;
	}
	for (const field of LIST_FIELDS) {
		const list = value[field];
		if (Array.isArray(list)) form[field] = list.filter((item) => typeof item === 'string');
	}
	form.status = oneOf(JOB_STATUSES, value.status, form.status);
	form.workMode = oneOf(WORK_MODES, value.workMode, form.workMode);
	form.contractType = oneOf(FR_CONTRACT_TYPES, value.contractType, form.contractType);
	form.arrangement = oneOf(WORKING_TIME_ARRANGEMENTS, value.arrangement, form.arrangement);
	form.payPeriod = oneOf(PAY_PERIODS, value.payPeriod, form.payPeriod);
	form.seniority = optionalOneOf(SENIORITY_LEVELS, value.seniority);
	form.education = optionalOneOf(EDUCATION_LEVELS, value.education);
	form.travel = optionalOneOf(TRAVEL_FREQUENCIES, value.travel);
	if (!/^(\d{4}-\d{2}-\d{2})?$/.test(form.startDate)) form.startDate = '';
	// A duration typed for a contract that has none is dropped when sent: keep the form tidy
	if (!CONTRACT_TYPES_WITH_DURATION.includes(form.contractType)) form.durationMonths = '';
	return form;
}

export function loadJobDraft(
	key: string,
	storage: DraftStorage | undefined = browserStorage()
): StoredJobDraft | undefined {
	const stored = read(key, storage);
	if (!isRecord(stored)) return undefined;
	const form = jobFormFromStorage(stored.form);
	if (!form) return undefined;
	return { form, basis: typeof stored.basis === 'string' ? stored.basis : undefined };
}

export function saveJobDraft(
	key: string,
	draft: StoredJobDraft,
	storage: DraftStorage | undefined = browserStorage()
): void {
	write(key, draft, storage);
}

export function clearJobDraft(
	key: string,
	storage: DraftStorage | undefined = browserStorage()
): void {
	remove(key, storage);
}

/**
 * What the editor starts from. `baseline` is what the unsaved-changes check compares to (and
 * what "Discard draft" goes back to): the posting being edited, else the imported draft, else
 * an empty form. `form` is what is shown: the stored draft when it differs from the baseline
 * (`restored`), else a copy of the baseline. A new posting's stored draft is only restored over
 * the start it was made from (`basis`): a blank form's draft never replaces a fresh import, an
 * import's never a blank form. A posting's draft is always restored, `stale` when the posting
 * was saved since the draft started.
 */
export function startingJobForms(
	{ job, imported }: { job?: JobPostingLike | null; imported?: JobPostingLike | null },
	readDraft: () => StoredJobDraft | undefined
): { baseline: JobForm; form: JobForm; restored: boolean; stale: boolean; basis: string } {
	const baseline = job
		? jobToForm(job)
		: imported
			? (importedForm(imported) ?? emptyJobForm())
			: emptyJobForm();
	const basis = draftBasis(baseline);
	const draft = readDraft();
	const sameStart = !!job || draft?.basis === basis;
	if (draft && sameStart && jobFormSignature(draft.form) !== jobFormSignature(baseline)) {
		// A posting saved since the draft started (e.g. in another tab): the draft is older
		const stale = !!job && !!draft.basis && draft.basis !== basis;
		return { baseline, form: draft.form, restored: true, stale, basis };
	}
	return { baseline, form: structuredClone(baseline), restored: false, stale: false, basis };
}

// --- The imported draft -----------------------------------------------------------------

/** The form of an imported draft, its values checked (it was read back from storage) */
export const importedForm = (draft: JobPostingLike): JobForm | undefined => {
	try {
		return jobFormFromStorage(jobToForm(draft));
	} catch {
		return undefined;
	}
};

/**
 * The result of a job description import (POST /jobs/import), kept until the posting is saved
 * or discarded. `draft` is the API's JobPostingDraft (dates may have become Dates through Eden:
 * they are stored as strings, which jobToForm reads too).
 */
export type ImportedJobDraft = {
	draft: JobPostingLike;
	/** What the import left out, changed or could not find: shown above the form */
	warnings: string[];
	/** Name of the imported PDF */
	fileName: string;
};

/** `jobImportDraft:<userId>` */
export const importedDraftStorageKey = (userId: string): string => `jobImportDraft:${userId}`;

/** Keeps an import's result for /recruiter/jobs/new?import=1 (replaces the previous one) */
export function saveImportedDraft(
	userId: string,
	imported: ImportedJobDraft,
	storage: DraftStorage | undefined = browserStorage()
): void {
	write(importedDraftStorageKey(userId), imported, storage);
}

/** The import kept for this user; undefined when there is none (or it cannot be read) */
export function loadImportedDraft(
	userId: string,
	storage: DraftStorage | undefined = browserStorage()
): ImportedJobDraft | undefined {
	const stored = read(importedDraftStorageKey(userId), storage);
	if (!isRecord(stored) || !isRecord(stored.draft)) return undefined;
	if (!importedForm(stored.draft as JobPostingLike)) return undefined;
	const warnings = Array.isArray(stored.warnings)
		? stored.warnings.filter((warning): warning is string => typeof warning === 'string')
		: [];
	const fileName = typeof stored.fileName === 'string' ? stored.fileName : '';
	return { draft: stored.draft as JobPostingLike, warnings, fileName };
}

export function clearImportedDraft(
	userId: string,
	storage: DraftStorage | undefined = browserStorage()
): void {
	remove(importedDraftStorageKey(userId), storage);
}
