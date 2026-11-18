import {
	CONTRACT_TYPES_WITH_DURATION,
	EDUCATION_LEVELS,
	FR_CONTRACT_TYPES,
	JOB_STATUSES,
	PAY_PERIODS,
	SENIORITY_LEVELS,
	TRAVEL_FREQUENCIES,
	WORKING_TIME_ARRANGEMENTS,
	WORK_MODES,
	changedLockedFields,
	getLocale
} from 'portfolio-common';
import {
	LOCKED_FORM_FIELDS,
	duplicateJobForm,
	emptyJobForm,
	formToJobInput,
	jobFormFieldOf,
	jobFormSignature,
	jobToForm,
	openedJobForm,
	withLockedTerms,
	type JobForm,
	type JobFormField,
	type JobPostingLike
} from './jobPosting';

// What the job editor keeps in this browser:
// - its unsaved state, per user and posting, restored when the recruiter comes back:
//   `jobDraft:<userId>:<jobId>` (editing), `jobDraft:<userId>:new` (adding, from a blank form),
//   `jobDraft:<userId>:import` (adding, from the import below; it goes with that import),
//   `jobDraft:<userId>:copy:<jobId>` (adding, from a copy of the posting `jobId`: Duplicate);
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

/** `jobDraft:<userId>:new` (adding from a blank form) or `jobDraft:<userId>:<jobId>` (editing) */
export const jobDraftStorageKey = (userId: string, jobId?: string): string =>
	`jobDraft:${userId}:${jobId ?? 'new'}`;

/**
 * `jobDraft:<userId>:import`: the changes made to the imported draft (adding from an import). A
 * key of its own: editing an import never overwrites the draft of a blank form, nor the reverse.
 */
export const importEditsStorageKey = (userId: string): string => `jobDraft:${userId}:import`;

/**
 * `jobDraft:<userId>:copy:<jobId>`: a new posting copied from the posting `jobId` (Duplicate), a
 * key of its own per posting copied
 */
export const duplicateDraftStorageKey = (userId: string, jobId: string): string =>
	`jobDraft:${userId}:copy:${jobId}`;

/**
 * The key of the editor's draft, for what it edits: a posting, an import, a copy of a posting
 * (`duplicateOf`) or a blank form
 */
export const editorDraftStorageKey = (
	userId: string,
	{
		jobId,
		imported = false,
		duplicateOf
	}: { jobId?: string; imported?: boolean; duplicateOf?: string } = {}
): string =>
	jobId
		? jobDraftStorageKey(userId, jobId)
		: imported
			? importEditsStorageKey(userId)
			: duplicateOf
				? duplicateDraftStorageKey(userId, duplicateOf)
				: jobDraftStorageKey(userId);

/**
 * What a draft started from: the posting as it was loaded, or the imported file. A posting's
 * draft made before the posting was saved elsewhere is `stale`; an import's draft is only
 * restored over that same import (a new import replaces the previous one).
 */
export const draftBasis = (start: JobForm): string => jobFormSignature(start);

/** The lists that take typed items (ListInput): skills, languages, benefits */
export type JobListField = 'skills' | 'languages' | 'benefits';

/**
 * Text typed in a list and not added yet (no Enter): part of the posting (a save adds it), so a
 * change the draft keeps and the unsaved-changes guard counts
 */
export type PendingListText = Record<JobListField, string>;

export const emptyPendingText = (): PendingListText => ({
	skills: '',
	languages: '',
	benefits: ''
});

/** Whether any list holds text not added yet */
export const hasPendingText = (pending: PendingListText | undefined): boolean =>
	!!pending && Object.values(pending).some((text) => text.trim() !== '');

/**
 * A stored editor draft: the form, the signature of the form it started from, and the text typed
 * in the lists and not added yet
 */
export type StoredJobDraft = { form: JobForm; basis?: string; pending?: PendingListText };

const TEXT_FIELDS = [
	'title',
	'description',
	'company',
	'openings',
	'city',
	'postalCode',
	'address',
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
	const pending = emptyPendingText();
	if (isRecord(stored.pending)) {
		for (const field of LIST_FIELDS) {
			const text = stored.pending[field];
			if (typeof text === 'string') pending[field] = text;
		}
	}
	return {
		form,
		basis: typeof stored.basis === 'string' ? stored.basis : undefined,
		...(hasPendingText(pending) ? { pending } : {})
	};
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
 * what "Discard draft" goes back to): the posting being edited, else the imported draft, else a
 * copy of the posting `duplicate` (as a draft), else an empty form. `form` is what is shown: the
 * stored draft when it differs from the baseline (`restored`), else a copy of the baseline. A
 * posting's draft, a copy's and a blank form's are always restored (their keys say what they were
 * made from), a posting's draft `stale` when the posting was saved since the draft started; an
 * import's draft only over the same import (`basis`).
 *
 * `locked`: the posting was opened, its terms (LOCKED_FORM_FIELDS) are its own. The baseline is
 * openedJobForm's (`capped`: its pay range brought down to the top it is scored with), and what a
 * draft holds of the terms gives way to the posting's in the form, text typed in a locked list
 * included: they cannot be saved. A draft that changed nothing else is not restored. The terms it
 * changed (e.g. typed before the posting was opened in another tab) are not lost: `droppedTerms`
 * names them and `typedDraft` is the draft as it was stored, which the editor keeps in this browser
 * (withHeldTerms) until the recruiter duplicates the posting with them or discards them.
 *
 * `basis` is the signature of the baseline. `draftBasis` is the basis to store with the draft
 * from now on: the baseline's, except for a stale draft, which keeps its own so that the warning
 * stays until the recruiter saves or discards it. `pending` is the text typed in the lists and not
 * added yet: the restored draft's (a draft of such text alone is restored too), else none.
 */
export function startingJobForms(
	{
		job,
		imported,
		duplicate,
		locked = false
	}: {
		job?: JobPostingLike | null;
		imported?: JobPostingLike | null;
		/** With the day it was opened, if it was: a copy of an opened posting starts capped */
		duplicate?: (JobPostingLike & { publishedAt?: Date | string | null }) | null;
		locked?: boolean;
	},
	readDraft: () => StoredJobDraft | undefined
): {
	baseline: JobForm;
	form: JobForm;
	restored: boolean;
	stale: boolean;
	basis: string;
	draftBasis: string;
	pending: PendingListText;
	capped: boolean;
	droppedTerms: JobFormField[];
	typedDraft?: StoredJobDraft;
} {
	const opened = job && locked ? openedJobForm(job) : undefined;
	const capped = opened?.capped ?? false;
	const baseline = job
		? (opened?.form ?? jobToForm(job))
		: imported
			? (importedForm(imported) ?? emptyJobForm())
			: duplicate
				? duplicateJobForm(duplicate)
				: emptyJobForm();
	const basis = draftBasis(baseline);
	const stored = readDraft();
	const draft = stored && opened ? withPostingTerms(stored, baseline) : stored;
	const droppedTerms = stored && opened ? droppedTermsOf(stored, baseline) : [];
	const dropped = droppedTerms.length > 0 ? { droppedTerms, typedDraft: stored } : { droppedTerms };
	const sameStart = !!job || !imported || draft?.basis === basis;
	const changed =
		!!draft &&
		(jobFormSignature(draft.form) !== jobFormSignature(baseline) || hasPendingText(draft.pending));
	if (draft && sameStart && changed) {
		// A posting saved since the draft started (e.g. in another tab): the draft is older
		const stale = !!job && !!draft.basis && draft.basis !== basis;
		return {
			baseline,
			form: draft.form,
			restored: true,
			stale,
			basis,
			draftBasis: stale && draft.basis ? draft.basis : basis,
			pending: { ...emptyPendingText(), ...draft.pending },
			capped,
			...dropped
		};
	}
	return {
		baseline,
		form: structuredClone(baseline),
		restored: false,
		stale: false,
		basis,
		draftBasis: basis,
		pending: emptyPendingText(),
		capped,
		...dropped
	};
}

/**
 * The terms a draft changed that an opened posting (its form: `terms`) keeps as they are, compared
 * as the API compares them (changedLockedFields, on the normalised posting: a value typed in a
 * field that does not apply is no change), and the locked lists holding text not added yet
 */
const droppedTermsOf = (draft: StoredJobDraft, terms: JobForm): JobFormField[] => {
	const changed = new Set(
		changedLockedFields(formToJobInput(terms), formToJobInput(draft.form)).flatMap((path) => {
			const field = jobFormFieldOf(path);
			return field ? [field] : [];
		})
	);
	for (const field of LIST_FIELDS) {
		if (LOCKED_FORM_FIELDS.includes(field) && draft.pending?.[field]?.trim()) changed.add(field);
	}
	return LOCKED_FORM_FIELDS.filter((field) => changed.has(field));
};

/**
 * A form, and the text typed in its lists, with the terms of `held` (startingJobForms'
 * `typedDraft`: terms an opened posting could not take), the text typed in its locked lists
 * included: what the editor keeps in this browser until the recruiter duplicates them or discards
 * them
 */
export const withHeldTerms = (
	form: JobForm,
	pending: PendingListText,
	held: StoredJobDraft
): { form: JobForm; pending: PendingListText } => {
	const kept = { ...emptyPendingText(), ...pending };
	for (const field of LIST_FIELDS) {
		if (LOCKED_FORM_FIELDS.includes(field)) kept[field] = held.pending?.[field] ?? '';
	}
	return { form: withLockedTerms(form, held.form), pending: kept };
};

/**
 * The draft to keep once an opened posting's other changes are saved (`job`, as saved) while terms
 * are still held: those terms over the posting, so that its editor offers them again
 */
export const heldTermsDraft = (job: JobPostingLike, held: StoredJobDraft): StoredJobDraft => {
	const posting = openedJobForm(job).form;
	const kept = withHeldTerms(posting, emptyPendingText(), held);
	return {
		form: kept.form,
		basis: draftBasis(posting),
		...(hasPendingText(kept.pending) ? { pending: kept.pending } : {})
	};
};

/** A draft of an opened posting, its terms (and the text typed in a locked list) the posting's */
const withPostingTerms = (draft: StoredJobDraft, terms: JobForm): StoredJobDraft => {
	const pending = { ...emptyPendingText(), ...draft.pending };
	for (const field of LIST_FIELDS) {
		if (LOCKED_FORM_FIELDS.includes(field)) pending[field] = '';
	}
	return {
		...draft,
		form: withLockedTerms(draft.form, terms),
		...(draft.pending ? { pending } : {})
	};
};

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
	/**
	 * Set when it is read back: the warnings are the API's sentences, in the language the page had
	 * at the import; kept from another language, they are left out and the editor says so
	 */
	warningsHidden?: true;
	/** Name of the imported PDF */
	fileName: string;
};

/** `jobImportDraft:<userId>` */
export const importedDraftStorageKey = (userId: string): string => `jobImportDraft:${userId}`;

/**
 * Keeps an import's result for /recruiter/jobs/new?import=1. It replaces the previous import,
 * and the changes made to it (they were made to another file).
 */
export function saveImportedDraft(
	userId: string,
	imported: ImportedJobDraft,
	storage: DraftStorage | undefined = browserStorage()
): void {
	remove(importEditsStorageKey(userId), storage);
	const { draft, warnings, fileName } = imported;
	write(
		importedDraftStorageKey(userId),
		{ draft, warnings, fileName, locale: getLocale() },
		storage
	);
}

/** The import kept for this user; undefined when there is none (or it cannot be read) */
export function loadImportedDraft(
	userId: string,
	storage: DraftStorage | undefined = browserStorage()
): ImportedJobDraft | undefined {
	const stored = read(importedDraftStorageKey(userId), storage);
	if (!isRecord(stored) || !isRecord(stored.draft)) return undefined;
	if (!importedForm(stored.draft as JobPostingLike)) return undefined;
	const kept = Array.isArray(stored.warnings)
		? stored.warnings.filter((warning): warning is string => typeof warning === 'string')
		: [];
	// An import kept before languages existed is in English
	const sameLanguage = (typeof stored.locale === 'string' ? stored.locale : 'en') === getLocale();
	const fileName = typeof stored.fileName === 'string' ? stored.fileName : '';
	return {
		draft: stored.draft as JobPostingLike,
		warnings: sameLanguage ? kept : [],
		fileName,
		...(!sameLanguage && kept.length > 0 ? { warningsHidden: true as const } : {})
	};
}

/** Removes the import kept for this user, and the changes made to it */
export function clearImportedDraft(
	userId: string,
	storage: DraftStorage | undefined = browserStorage()
): void {
	remove(importedDraftStorageKey(userId), storage);
	remove(importEditsStorageKey(userId), storage);
}
