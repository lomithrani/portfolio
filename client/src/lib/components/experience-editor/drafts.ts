import type { Experience } from 'portfolio-api/models/database';
import {
	draftToForm,
	emptyExperienceForm,
	experienceToForm,
	formSignature,
	serializeForm,
	type FormData
} from '#services/experienceForm.ts';

// Unsaved editor state, kept in this browser per user and domain (the draft key) and per
// experience ('new' while adding). Storage may be missing or throw (private mode, quota,
// blocked site data): every access is guarded and a failure only loses the draft.

const PREFIX = 'experienceDraft';

/** Where the global add-draft of older clients lived (any user, any domain) */
const LEGACY_KEY = 'newExperience';

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const browserStorage = (): DraftStorage | undefined => {
	try {
		return globalThis.localStorage ?? undefined;
	} catch {
		return undefined;
	}
};

/** `experienceDraft:<draftKey>:new` (adding) or `experienceDraft:<draftKey>:<experience id>` */
export const draftStorageKey = (draftKey: string, experienceId?: string): string =>
	`${PREFIX}:${draftKey}:${experienceId ?? 'new'}`;

export function loadDraft(
	key: string,
	storage: DraftStorage | undefined = browserStorage()
): FormData | undefined {
	try {
		const raw = storage?.getItem(key);
		return raw ? draftToForm(JSON.parse(raw)) : undefined;
	} catch {
		return undefined;
	}
}

/** Stores a form (or its serialized form) */
export function saveDraft(
	key: string,
	form: FormData | string,
	storage: DraftStorage | undefined = browserStorage()
): void {
	try {
		storage?.setItem(key, typeof form === 'string' ? form : serializeForm(form));
	} catch {
		// Quota or blocked storage: the draft is not kept
	}
}

export function clearDraft(
	key: string,
	storage: DraftStorage | undefined = browserStorage()
): void {
	try {
		storage?.removeItem(key);
	} catch {
		// Nothing to clear
	}
}

/** Removes the global draft older clients kept: it was not tied to a user or a domain */
export function removeLegacyDraft(storage: DraftStorage | undefined = browserStorage()): void {
	clearDraft(LEGACY_KEY, storage);
}

/**
 * What the editor starts from. `baseline` is what the dirty check compares to (and what a
 * discarded draft goes back to): the experience being edited, else the prefilled add form
 * (`initialForm`, e.g. read from a résumé), else an empty form. `form` is what is shown: the
 * stored draft when there is one that differs from the baseline (`restored`), else a copy of
 * the baseline. A stored add draft is never restored over a prefilled form: that form is what
 * was asked for. `initialForm` must be a plain object (not a Svelte state proxy).
 */
export function startingForms(
	{ experience, initialForm }: { experience?: Experience | null; initialForm?: FormData | null },
	readDraft: () => FormData | undefined
): { baseline: FormData; form: FormData; restored: boolean } {
	const prefilled = !experience && initialForm ? draftToForm(initialForm) : undefined;
	const baseline = experience ? experienceToForm(experience) : (prefilled ?? emptyExperienceForm());
	const draft = prefilled ? undefined : readDraft();
	if (draft && formSignature(draft) !== formSignature(baseline)) {
		return { baseline, form: draft, restored: true };
	}
	return { baseline, form: structuredClone(baseline), restored: false };
}
