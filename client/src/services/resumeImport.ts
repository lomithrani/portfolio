import { ExperienceType, RESUME_IMPORT_CLIENT_TIMEOUT_MS } from 'portfolio-common';
import type { portfolioApi } from '#services';
import {
	draftToForm,
	emptyExperienceForm,
	emptyProject,
	fieldLabel,
	fieldOfServerProperty,
	newClientId,
	normalizeSkillNames,
	sentProjects,
	validateExperienceForm,
	type FieldError,
	type FormData
} from './experienceForm';
import { experiencePeriod, formatMonth, formatMonthRange, fromMonthKey } from './experienceDates';

// Pure helpers of the résumé import (GET / POST /experiences/import): the API reads a PDF
// résumé with Claude and answers with experience drafts, which the owner reviews and adds
// through POST /experiences. Nothing here knows the UI: the dialog builds on these.

type ImportApi = typeof portfolioApi.experiences.import;

/** GET /experiences/import: whether the feature is on, and this user's allowance */
export type ImportStatus = NonNullable<Awaited<ReturnType<ImportApi['get']>>['data']>;

/** POST /experiences/import: the drafts (nothing is saved), warnings and the allowance left */
export type ImportResult = NonNullable<Awaited<ReturnType<ImportApi['post']>>['data']>;

export type ImportQuota = ImportResult['quota'];

/** An experience as the API extracted it from the résumé */
export type ExtractedExperience = ImportResult['experiences'][number];

/** Largest PDF the API takes (decoded), checked before sending */
export const MAX_RESUME_PDF_BYTES = 4 * 1024 * 1024;

/**
 * How long the browser waits for an import (4.5 minutes): longer than the API can take (its
 * deadlines for counting the tokens and for Claude's answer), plus the upload. Shared with the
 * API: an answer the browser stopped waiting for is an import that counted, lost.
 */
export const IMPORT_CLIENT_TIMEOUT_MS = RESUME_IMPORT_CLIENT_TIMEOUT_MS;

// --- The file -------------------------------------------------------------------------

/** '820 KB', '3.4 MB' */
export const formatFileSize = (bytes: number): string =>
	bytes < 1024 * 1024
		? `${Math.max(1, Math.round(bytes / 1024))} KB`
		: `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;

/** What is wrong with a file picked for import, before reading it; undefined when it can go */
export function resumeFileProblem(file: {
	name: string;
	type: string;
	size: number;
}): string | undefined {
	const looksLikePdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
	if (!looksLikePdf) return 'Choose a PDF file: the import only reads PDF résumés.';
	if (file.size === 0) return 'This file is empty. Choose another PDF.';
	if (file.size > MAX_RESUME_PDF_BYTES) {
		return `This PDF is ${formatFileSize(file.size)}: the import takes files of up to 4 MB. Export a lighter version (fewer images) and try again.`;
	}
	return undefined;
}

/** Whether the first bytes of a file are those of a PDF ('%PDF-') */
export const hasPdfHeader = (bytes: Uint8Array): boolean =>
	String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';

/** The base64 of a data URL (what FileReader.readAsDataURL gives), without its header */
export const base64OfDataUrl = (dataUrl: string): string => dataUrl.slice(dataUrl.indexOf(',') + 1);

// --- Quota ----------------------------------------------------------------------------

/** '2 of 3 imports left this month' */
export const quotaText = ({ limit, remaining }: { limit: number; remaining: number }): string =>
	`${remaining} of ${limit} ${limit === 1 ? 'import' : 'imports'} left this month`;

/**
 * 'Nov 20, 2:05 PM GMT+1' (in the given time zone, the browser's by default, named: the API's
 * messages give times in UTC); '' when invalid
 */
export function formatResetDate(iso: string | null | undefined, timeZone?: string): string {
	if (!iso) return '';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZoneName: 'short',
		...(timeZone ? { timeZone } : {})
	});
}

/** '0:42', '3:05' */
export const formatElapsed = (seconds: number): string => {
	const whole = Math.max(0, Math.floor(seconds));
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

// --- Errors ---------------------------------------------------------------------------

export const IMPORT_SESSION_EXPIRED =
	'Your session expired. Sign in again, then import your résumé.';

/** The text of an API error body: plain text, or the message of a validation error */
const apiMessage = (value: unknown): string | undefined => {
	const text =
		typeof value === 'string'
			? value
			: value &&
				  typeof value === 'object' &&
				  typeof (value as { message?: unknown }).message === 'string'
				? (value as { message: string }).message
				: undefined;
	const trimmed = text?.trim();
	// A proxy or the hosting edge may answer with an HTML page: not a message to show
	return trimmed && trimmed.length <= 500 && !trimmed.startsWith('<') ? trimmed : undefined;
};

/**
 * What to tell the owner when POST /experiences/import fails. The API's own message for the
 * statuses it explains (413, 422, 429, 503 and 404): it says which limit was hit and when the
 * next import is possible.
 */
export function importErrorMessage(status: number | undefined, value: unknown): string {
	if (status === 401) return IMPORT_SESSION_EXPIRED;
	// A validation error of the request itself (an object) is not about the résumé
	const text = typeof value === 'string' ? apiMessage(value) : undefined;
	switch (status) {
		case 404:
			return text ?? 'Résumé import is not available on this portfolio.';
		case 413:
			return text ?? 'This PDF is too large: the import takes files of up to 4 MB.';
		case 422:
			return text ?? 'This file could not be read as a résumé. Choose another PDF.';
		case 429:
			return text ?? 'You have used all your imports for now. Try again later.';
		case 503:
			return text ?? 'Résumé import is temporarily unavailable, try again later.';
		default:
			return 'The import failed. Try again in a moment.';
	}
}

/**
 * Why POST /experiences refused a draft, in a line: the field (named as the editor names it)
 * and its problem for a validation error ('Project 2 · Name: Expected string length …')
 */
export function saveErrorMessage(
	status: number | undefined,
	value: unknown,
	form: FormData
): string {
	if (status === 413) return 'This experience is too large: shorten its texts.';
	if (status === 400 || status === 422) {
		const message = apiMessage(value);
		const property =
			value &&
			typeof value === 'object' &&
			typeof (value as { property?: unknown }).property === 'string'
				? (value as { property: string }).property
				: undefined;
		const field = fieldOfServerProperty(
			property,
			sentProjects(form).map((project) => project.id)
		);
		if (message && field) return `${fieldLabel(form, field)}: ${message}`;
		return message ?? 'Some fields are invalid: edit it to fix them.';
	}
	return 'Could not add it. Try again in a moment.';
}

/** Whether POST /experiences refused a draft for its content: editing it can fix that */
export const saveErrorNeedsEdit = (status: number | undefined): boolean =>
	status === 400 || status === 413 || status === 422;

/**
 * What the review says about the drafts "Add" could not add: to edit when each was refused for
 * its content (`toEdit` of them), to add again later when the server or the connection failed
 */
export function failedDraftsText(failed: number, toEdit: number): string {
	const one = failed === 1;
	const count = one
		? '1 experience could not be added.'
		: `${failed} experiences could not be added.`;
	if (toEdit >= failed) {
		return `${count} Edit ${one ? 'it' : 'them'} to fix the problem, then add ${one ? 'it' : 'them'} again.`;
	}
	if (toEdit === 0) return `${count} Try adding ${one ? 'it' : 'them'} again in a moment.`;
	return `${count} Edit the ones marked with a problem, then add them again.`;
}

/** Problems of a draft, in a line: 'End: Choose the end month, or tick …' (+ 'and 2 more') */
export const problemsText = (errors: FieldError[]): string => {
	if (errors.length === 0) return '';
	const first = `${errors[0].label}: ${errors[0].message}`;
	return errors.length === 1 ? first : `${first} (and ${errors.length - 1} more)`;
};

// --- Drafts ---------------------------------------------------------------------------

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const month = (value: unknown): string =>
	typeof value === 'string' && MONTH_KEY.test(value) ? value : '';

const TYPES = Object.values(ExperienceType) as string[];

/** Form months of an extracted period: current means ongoing (and no end) */
const periodToForm = (period: { start?: string; end?: string; current?: boolean }) => {
	const ongoing = period.current === true;
	return { start: month(period.start), end: ongoing ? '' : month(period.end), ongoing };
};

/**
 * The editor's add form for an extracted experience. Skill names reuse the spelling of the
 * portfolio's skills ('typescript' → 'TypeScript'), as the editor does when they are typed.
 * Dates the API left out stay empty: the editor asks for them before saving.
 */
export function extractedToForm(
	extracted: ExtractedExperience,
	knownSkills: readonly string[] = []
): FormData {
	const companyName = extracted.company?.trim() ?? '';
	return {
		...emptyExperienceForm(),
		type: TYPES.includes(extracted.type) ? extracted.type : ExperienceType.Professional,
		title: extracted.title ?? '',
		company: { name: companyName },
		location: extracted.location?.trim() ?? '',
		...periodToForm(extracted),
		summary: extracted.summary ?? '',
		projects: (extracted.projects ?? []).map((project) => ({
			...emptyProject(),
			name: project.name ?? '',
			...periodToForm(project),
			summary: project.summary ?? '',
			hardSkills: normalizeSkillNames(project.hardSkills ?? [], knownSkills),
			softSkills: normalizeSkillNames(project.softSkills ?? [], knownSkills)
		}))
	};
}

/** A title or company name compared loosely: case, accents, punctuation and spacing ignored */
const looseText = (value: string | undefined | null): string =>
	(value ?? '')
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();

/** Key of an experience for duplicate detection: its title and company, normalised */
export const experienceKey = (title: string, companyName?: string | null): string =>
	`${looseText(title)}\u0000${looseText(companyName)}`;

type ListedExperience = { title: string; company?: { name?: string } | null };

/** Keys of the portfolio's experiences */
export const existingExperienceKeys = (experiences: readonly ListedExperience[]): Set<string> =>
	new Set(
		experiences.map((experience) => experienceKey(experience.title, experience.company?.name))
	);

/** Whether a draft has the title and company of an experience already in the portfolio */
export const isDuplicateDraft = (form: FormData, existing: Set<string>): boolean =>
	existing.has(experienceKey(form.title, form.company.name));

/** 'Mar 2022 – Present', 'From Mar 2022' (no end yet), or the period of its projects */
export function draftPeriodText(form: FormData): string {
	const start = MONTH_KEY.test(form.start) ? fromMonthKey(form.start) : undefined;
	const end = MONTH_KEY.test(form.end) ? fromMonthKey(form.end) : undefined;
	if (start) {
		if (form.ongoing) return formatMonthRange(start);
		return end ? formatMonthRange(start, end) : `From ${formatMonth(start)}`;
	}
	if (end) return `Until ${formatMonth(end)}`;
	const period = experiencePeriod({
		projects: form.projects.map((project) => ({
			start: MONTH_KEY.test(project.start) ? fromMonthKey(project.start) : undefined,
			end: !project.ongoing && MONTH_KEY.test(project.end) ? fromMonthKey(project.end) : undefined
		}))
	});
	return period.start ? formatMonthRange(period.start, period.end) : '';
}

/**
 * The first lines of a markdown summary, as plain text: list markers become '• ', headings,
 * emphasis and links lose their markup, empty lines are skipped
 */
export function summaryPreview(markdown: string, maxLines = 3): string {
	return markdown
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line && !/^(```|---|\|)/.test(line))
		.slice(0, maxLines)
		.map((line) =>
			line
				.replace(/^#{1,6}\s+/, '')
				.replace(/^>\s*/, '')
				.replace(/^([-*+]|\d+[.)])\s+/, '• ')
				.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
				.replace(/(\*\*|__|`)/g, '')
		)
		.join('\n');
}

/** Distinct skill names of a draft's projects (technical first), ignoring case */
export const draftSkills = (form: FormData): string[] =>
	normalizeSkillNames(
		form.projects.flatMap((project) => [...project.hardSkills, ...project.softSkills])
	);

// --- Review state, kept in this browser ------------------------------------------------

export type ImportDraftStatus = 'pending' | 'added' | 'failed';

export type ImportDraft = {
	/** Client id: keys the list, never sent */
	id: string;
	/** The editor's add form, prefilled from the résumé */
	form: FormData;
	/** Ticked to be added by "Add N experiences" */
	selected: boolean;
	status: ImportDraftStatus;
	/** Why the last attempt to add it failed */
	error?: string;
};

export type ImportReview = {
	fileName: string;
	/** ISO 8601 */
	importedAt: string;
	warnings: string[];
	drafts: ImportDraft[];
};

/**
 * The review of an import result: one draft per experience, ticked unless the portfolio
 * already has an experience with the same title and company
 */
export function reviewFromResult(
	result: Pick<ImportResult, 'experiences' | 'warnings'>,
	{
		fileName,
		existing,
		knownSkills = [],
		now = new Date()
	}: { fileName: string; existing: Set<string>; knownSkills?: readonly string[]; now?: Date }
): ImportReview {
	return {
		fileName,
		importedAt: now.toISOString(),
		warnings: [...(result.warnings ?? [])],
		drafts: (result.experiences ?? []).map((experience) => {
			const form = extractedToForm(experience, knownSkills);
			return {
				id: newClientId(),
				form,
				selected: !isDuplicateDraft(form, existing),
				status: 'pending' as const
			};
		})
	};
}

/**
 * Unticks the drafts not added yet that the portfolio already has (same title and company), e.g.
 * one added just before a reload could record it: the owner ticks it again if it is not one.
 */
export function untickDuplicates(review: ImportReview, existing: Set<string>): void {
	for (const draft of review.drafts) {
		if (draft.status !== 'added' && isDuplicateDraft(draft.form, existing)) draft.selected = false;
	}
}

/**
 * Takes into the review the changes the editor kept for its drafts: an expired session, or a
 * reload, while one was being edited (the editor stores them; `edited` reads that store).
 * A changed draft that had failed is pending again: its error was about the form before.
 * Returns the ids of the drafts that changed.
 */
export function applyEditedDrafts(
	review: ImportReview,
	edited: (draftId: string) => FormData | undefined
): string[] {
	const changed: string[] = [];
	for (const draft of review.drafts) {
		if (draft.status === 'added') continue;
		const form = edited(draft.id);
		if (!form) continue;
		draft.form = form;
		if (draft.status === 'failed') {
			draft.status = 'pending';
			delete draft.error;
		}
		changed.push(draft.id);
	}
	return changed;
}

/** Problems that stop a draft from being added as it is (the editor shows them in place) */
export const draftProblems = (draft: ImportDraft): FieldError[] =>
	validateExperienceForm(draft.form);

/** Drafts "Add N experiences" sends: ticked and not added yet */
export const draftsToAdd = (review: ImportReview): ImportDraft[] =>
	review.drafts.filter((draft) => draft.selected && draft.status !== 'added');

/** Whether every draft has been added: the import is over */
export const allDraftsAdded = (review: ImportReview): boolean =>
	review.drafts.every((draft) => draft.status === 'added');

const STORAGE_PREFIX = 'resumeImport';
const STORAGE_VERSION = 1;

/** Where the review of a user's import into a domain is kept */
export const importStorageKey = (userId: string, domainName: string): string =>
	`${STORAGE_PREFIX}:${userId}:${domainName}`;

const STATUSES: ImportDraftStatus[] = ['pending', 'added', 'failed'];

/**
 * A stored review, or undefined when the value holds none (or no draft). Defensive: it may
 * come from an older client or have been edited by hand.
 */
export function parseImportReview(value: unknown): ImportReview | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
	const stored = value as Record<string, unknown>;
	if (stored.version !== STORAGE_VERSION || !Array.isArray(stored.drafts)) return undefined;
	const ids = new Set<string>();
	const drafts = stored.drafts.flatMap((entry): ImportDraft[] => {
		if (!entry || typeof entry !== 'object') return [];
		const draft = entry as Record<string, unknown>;
		const form = draftToForm(draft.form);
		if (!form) return [];
		let id = typeof draft.id === 'string' && draft.id ? draft.id : newClientId();
		if (ids.has(id)) id = newClientId();
		ids.add(id);
		const status = STATUSES.includes(draft.status as ImportDraftStatus)
			? (draft.status as ImportDraftStatus)
			: 'pending';
		return [
			{
				id,
				form,
				selected: status !== 'added' && draft.selected === true,
				status,
				...(status === 'failed' && typeof draft.error === 'string' && draft.error
					? { error: draft.error }
					: {})
			}
		];
	});
	if (drafts.length === 0) return undefined;
	const importedAt =
		typeof stored.importedAt === 'string' && !Number.isNaN(Date.parse(stored.importedAt))
			? stored.importedAt
			: new Date(0).toISOString();
	return {
		fileName: typeof stored.fileName === 'string' ? stored.fileName : '',
		importedAt,
		warnings: Array.isArray(stored.warnings)
			? stored.warnings.filter((warning): warning is string => typeof warning === 'string')
			: [],
		drafts
	};
}

/** The review as stored */
export const serializeImportReview = (review: ImportReview): string =>
	JSON.stringify({ version: STORAGE_VERSION, ...review });

type ReviewStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Storage may be missing or throw (private mode, quota, blocked site data): every access is
// guarded, and a failure only loses what a reload would have restored
const browserStorage = (): ReviewStorage | undefined => {
	try {
		return globalThis.localStorage ?? undefined;
	} catch {
		return undefined;
	}
};

export function loadImportReview(
	key: string,
	storage: ReviewStorage | undefined = browserStorage()
): ImportReview | undefined {
	try {
		const raw = storage?.getItem(key);
		return raw ? parseImportReview(JSON.parse(raw)) : undefined;
	} catch {
		return undefined;
	}
}

export function saveImportReview(
	key: string,
	review: ImportReview,
	storage: ReviewStorage | undefined = browserStorage()
): void {
	try {
		storage?.setItem(key, serializeImportReview(review));
	} catch {
		// Quota or blocked storage: a reload loses the review
	}
}

export function clearImportReview(
	key: string,
	storage: ReviewStorage | undefined = browserStorage()
): void {
	try {
		storage?.removeItem(key);
	} catch {
		// Nothing to clear
	}
}
