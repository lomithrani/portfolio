<script lang="ts" module>
	const sectionClass =
		'card preset-outlined-surface-200-800 bg-surface-50-950 space-y-4 p-4 sm:p-6';
	const headingClass = 'text-lg font-semibold';
	const introClass = 'text-sm text-surface-700-300';
	const optionalClass = 'text-sm font-normal text-surface-700-300';
</script>

<!--
@component
The job posting editor, as a section of a page (/recruiter/jobs/new, /recruiter/jobs/:id/edit):
every field of a posting in sections, validated with the API's own rules (jobFormErrors) after
a first attempt to save, then live; an error summary at the top links to the fields.

It owns the API calls (POST /jobs, PUT /jobs/:id), the unsaved-changes guard (beforeNavigate:
a dialog for links and Back, the browser's prompt for a reload or closing the tab) and the
drafts kept in this browser (`jobDraft:<userId>:<jobId>`, `jobDraft:<userId>:new` for a blank
form, `jobDraft:<userId>:import` for an import; restored with a notice). The page owns the
session gate, the toast and where to go after a save. A save the recruiter left during still
ends: `onSaved` is told (`left`), and a failure is a toast (the changes stay in this browser).

- `job` set: edit mode (the posting as GET /recruiter/jobs/:id returns it); else add mode.
- `imported` (add mode): starts from a job description import (the stored result of
  POST /jobs/import), with a banner listing its warnings; the import is removed from this
  browser once the posting is saved or the recruiter discards it (`onImportDiscarded`).
- Mounted once per posting: remount it (e.g. `{#key}`) to start over with other props.
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { SegmentedControl } from '@skeletonlabs/skeleton-svelte';
	import {
		ArrowPath,
		DocumentArrowUp,
		ExclamationTriangle,
		InformationCircle
	} from 'svelte-heros-v2';
	import {
		CONTRACT_TYPE_LABELS,
		COUNTRY_LABELS,
		EDUCATION_LABELS,
		EDUCATION_LEVELS,
		FR_CONTRACT_TYPES,
		FR_FORFAIT_JOURS_STANDARD_DAYS,
		FR_FULL_TIME_HOURS_PER_WEEK,
		JOB_LIMITS,
		JOB_STATUSES,
		JOB_STATUS_LABELS,
		PAY_PERIODS,
		PAY_PERIOD_LABELS,
		SENIORITY_LABELS,
		SENIORITY_LEVELS,
		TRAVEL_FREQUENCIES,
		TRAVEL_LABELS,
		WORKING_TIME_ARRANGEMENTS,
		WORKING_TIME_LABELS,
		WORK_MODES,
		WORK_MODE_LABELS,
		type AddressSuggestion,
		type OfficePlace as OfficePlaceFound,
		type WorkMode,
		type WorkingTimeArrangement
	} from 'portfolio-common';
	import { common } from '#lib/i18n/common.messages.ts';
	import Rich from '#lib/i18n/Rich.svelte';
	import { portfolioApi } from '#services';
	import { clearAuthentication } from '#services/authentication.ts';
	import { errorStatus } from '#services/apiErrors.ts';
	import {
		JOB_FIELD_LABELS,
		JOB_STATUS_DESCRIPTIONS,
		contractHasDuration,
		contractNeedsDuration,
		formToJobInput,
		formatPay,
		jobFieldOfProperty,
		jobFormErrors,
		jobFormSignature,
		orderedJobFormErrors,
		parseFormNumber,
		type JobForm,
		type JobFormField,
		type JobPostingLike
	} from '#services/jobPosting.ts';
	import { officeFromSuggestion, officeKey, type OfficeAddress } from '#services/addressSearch.ts';
	import { toaster } from '#services/toaster.ts';
	import AddressSearch from '#components/address/AddressSearch.svelte';
	import {
		clearImportedDraft,
		clearJobDraft,
		editorDraftStorageKey,
		emptyPendingText,
		hasPendingText,
		loadJobDraft,
		saveJobDraft,
		startingJobForms,
		type ImportedJobDraft,
		type PendingListText
	} from '#services/jobDrafts.ts';
	import DescriptionField from './DescriptionField.svelte';
	import Field from './Field.svelte';
	import LeaveDialog from './LeaveDialog.svelte';
	import ListInput from './ListInput.svelte';
	import OfficePlace from './OfficePlace.svelte';
	import { setJobEditorContext } from './context';
	import { m } from './JobEditor.messages.ts';

	type SavedJob = NonNullable<Awaited<ReturnType<(typeof portfolioApi)['jobs']['post']>>['data']>;

	/** A message above the form, with an optional way out (a link, or a button's action) */
	type SubmitError = {
		message: string;
		link?: { href: string; label: string };
		action?: { label: string; run: () => void };
	};

	let {
		userId,
		job = null,
		imported = null,
		cancelHref,
		recruiterHref,
		onSaved,
		onImportDiscarded,
		onSessionExpired
	}: {
		/** The recruiter's user id: scopes the drafts kept in this browser */
		userId: string;
		/**
		 * The posting to edit (GET /recruiter/jobs/:id); null or undefined to add one. Its
		 * `updatedAt` goes with the save: a posting changed since (in another tab) is not overwritten
		 */
		job?: (JobPostingLike & { _id: string; updatedAt?: Date | string }) | null;
		/** Add mode: the job description import to start from */
		imported?: ImportedJobDraft | null;
		/** Where Cancel goes (the posting, or the recruiter space) */
		cancelHref: string;
		/** The recruiter space, where an account without one creates it */
		recruiterHref: string;
		/**
		 * After a save; the draft is already gone. Typically a toast and a navigation, but not
		 * when the recruiter `left` the editor while it was saving (no navigation then)
		 */
		onSaved: (
			saved: SavedJob,
			mode: 'created' | 'updated',
			context: { left: boolean }
		) => void | Promise<void>;
		/** The recruiter discarded the import (already removed from this browser) */
		onImportDiscarded?: () => void;
		/**
		 * A save found the session expired (401), just before the session is cleared: the page
		 * keeps the editor (its form and its message to sign in again) until the next sign-in
		 */
		onSessionExpired?: () => void;
	} = $props();

	const withCredentials = { fetch: { credentials: 'include' } } as const;
	// How each field is named: its label here, and in the error summary
	const labels = JOB_FIELD_LABELS;
	// The API's 403 of an account without a recruiter space: matched, not shown (the API sends it
	// in English whatever the language)
	const RECRUITER_SPACE_REQUIRED = 'Create your recruiter space first';
	/** The API's 409 when the posting changed since the editor loaded it (PUT /jobs/:id) */
	const JOB_CHANGED = 'This job posting was changed since you opened it';

	// The editor works on the props as they were when it was mounted
	const initialJob = untrack(() => job);
	const initialImport = untrack(() => (initialJob ? null : imported));
	const owner = untrack(() => userId);
	const mode: 'add' | 'edit' = initialJob ? 'edit' : 'add';
	const jobId = initialJob?._id;
	const storageKey = editorDraftStorageKey(owner, { jobId, imported: !!initialImport });
	const start = startingJobForms({ job: initialJob, imported: initialImport?.draft }, () =>
		loadJobDraft(storageKey)
	);
	const baselineSignature = jobFormSignature(start.baseline);
	// Stored with the draft: what it started from (a stale draft keeps its own, to keep warning)
	let basisToStore = start.draftBasis;
	/** The version the edit starts from (PUT /jobs/:id answers 409 when it changed since) */
	const loadedVersion = (() => {
		const updatedAt = initialJob?.updatedAt;
		const date = updatedAt ? new Date(updatedAt) : undefined;
		return date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
	})();

	let form: JobForm = $state(start.form);

	// Where the office is found on the map (OfficePlace.svelte): looked up for the office the
	// editor opened with, then each time the recruiter leaves its fields
	const office = (): OfficeAddress => ({
		address: form.address,
		postalCode: form.postalCode,
		city: form.city
	});
	let officeAsked: OfficeAddress = $state.raw(untrack(office));
	/** The address last picked in the search's list: found already */
	let officePicked = $state.raw<{ key: string; place: OfficePlaceFound } | null>(null);

	function pickOffice(suggestion: AddressSuggestion) {
		const picked = officeFromSuggestion(suggestion, office());
		form.address = picked.address;
		form.postalCode = picked.postalCode;
		form.city = picked.city;
		// A town picked has no street: the office is looked up (the town's, or a street typed beside it)
		officePicked =
			suggestion.kind === 'municipality'
				? null
				: { key: officeKey(picked), place: { found: 'street', label: suggestion.label } };
		officeAsked = picked;
	}
	// Text typed in the lists (skills…) and not added yet: a change too (ListInput's bind:text)
	let pendingText: PendingListText = $state(start.pending);
	let dirty = $derived(jobFormSignature(form) !== baselineSignature || hasPendingText(pendingText));
	let restoredNotice = $state(start.restored);
	let importBanner = $state(!!initialImport);
	let confirming = $state<'reset' | 'import' | null>(null);

	let status = $state<'idle' | 'saving' | 'saved'>('idle');
	let submitError = $state<SubmitError | null>(null);
	let announcement = $state('');
	// Saved or discarded: nothing is written to the draft any more, and leaving asks nothing
	let finished = false;
	// The page went on without this editor (e.g. a link followed while saving)
	let destroyed = false;
	$effect(() => () => {
		destroyed = true;
	});

	// Keep unsaved changes in this browser: a reload, a navigation or an expired session loses
	// nothing. A form back to where it started has no draft. Each start has its own key, so the
	// draft under it is this editor's.
	$effect(() => {
		const changed = dirty;
		const snapshot = $state.snapshot(form) as JobForm;
		const pending = $state.snapshot(pendingText);
		if (finished) return;
		if (changed) {
			saveJobDraft(storageKey, {
				form: snapshot,
				basis: basisToStore,
				...(hasPendingText(pending) ? { pending } : {})
			});
		} else {
			clearJobDraft(storageKey);
			// Back to the current posting: changes from now on start from it
			basisToStore = start.basis;
		}
	});

	// --- Errors ---------------------------------------------------------------------------

	// Errors show once saving was attempted, then follow the form as it changes
	let attempted = $state(false);
	// A field the API refused (422): shown until that field changes
	let serverError = $state<{ field: JobFormField; message: string; snapshot: string } | null>(null);
	const snapshotOf = (field: JobFormField) => JSON.stringify(form[field]);
	// Text typed in a list (skills…) that a save could not add: shown until that text changes
	let pendingTextErrors = $state<Partial<Record<JobFormField, string>>>({});
	let errors = $derived.by(() => {
		const found = { ...(attempted ? jobFormErrors(form) : {}), ...pendingTextErrors };
		if (serverError && snapshotOf(serverError.field) === serverError.snapshot) {
			found[serverError.field] ??= serverError.message;
		}
		return found;
	});
	let errorList = $derived(orderedJobFormErrors(errors));

	// How each list adds the text typed in it and not added yet (ListInput registers it). Only
	// read by save(): nothing shows it, so it need not be reactive
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- see above
	const pendingTextCommits = new Map<JobFormField, () => string | undefined>();

	/** Adds the text typed in the lists and not added yet; what cannot be added, per field */
	function commitPendingText(): Partial<Record<JobFormField, string>> {
		const problems: Partial<Record<JobFormField, string>> = {};
		for (const [field, commit] of pendingTextCommits) {
			const problem = commit();
			if (problem) problems[field] = problem;
		}
		return problems;
	}

	const uid = $props.id();
	const fieldId = (field: JobFormField) => `${uid}-${field}`;
	const errorId = (field: JobFormField) => `${fieldId(field)}-error`;
	setJobEditorContext({
		fieldId,
		errorId,
		error: (field) => errors[field],
		registerPendingText: (field, commit) => {
			pendingTextCommits.set(field, commit);
			return () => {
				if (pendingTextCommits.get(field) === commit) pendingTextCommits.delete(field);
			};
		},
		pendingTextChanged: (field) => {
			if (!(field in pendingTextErrors)) return;
			const rest = { ...pendingTextErrors };
			delete rest[field];
			pendingTextErrors = rest;
		}
	});

	let summaryElement: HTMLElement | undefined = $state();

	const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	async function focusField(field: JobFormField) {
		let element = document.getElementById(fieldId(field));
		// The description showing its preview: back to its Write tab first
		if (element?.closest('[hidden]')) {
			element
				.closest('[data-description-field]')
				?.querySelector<HTMLElement>('[data-write-tab]')
				?.click();
			await tick();
			element = document.getElementById(fieldId(field));
		}
		// A group (the work mode, the working time): its checked option, else its first one
		if (element && !element.matches('input, select, textarea, button')) {
			element =
				element.querySelector<HTMLElement>('input:checked') ??
				element.querySelector<HTMLElement>('input, select, textarea, button');
		}
		if (!element) {
			summaryElement?.focus();
			return;
		}
		element.focus({ preventScroll: true });
		// Centred: the sticky action bar would cover a field scrolled to the bottom edge
		element.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'instant' : 'smooth' });
	}

	async function showSubmitError(error: SubmitError) {
		submitError = error;
		await tick();
		summaryElement?.focus({ preventScroll: true });
		summaryElement?.scrollIntoView({
			block: 'start',
			behavior: reduceMotion() ? 'instant' : 'smooth'
		});
	}

	/** The text of an API error body (plain text or a validation error's message) */
	const apiText = (value: unknown): string | undefined => {
		const text =
			typeof value === 'string'
				? value
				: value && typeof value === 'object' && 'message' in value
					? String((value as { message: unknown }).message)
					: undefined;
		const trimmed = text?.trim();
		// A proxy or the hosting edge may answer with an HTML page: not a message to show
		return trimmed && trimmed.length <= 300 && !trimmed.startsWith('<') ? trimmed : undefined;
	};

	const validationProperty = (value: unknown): string | undefined =>
		value && typeof value === 'object' && 'property' in value
			? String((value as { property: unknown }).property)
			: undefined;

	/**
	 * A save that ended after the recruiter left the editor: the page is another one, so a toast
	 * says it, with the way back (the changes are kept in this browser)
	 */
	function saveFailedAfterLeaving(code: number | undefined, editorUrl: string) {
		toaster.error({
			title: mode === 'add' ? m.leftToast.notCreated : m.leftToast.notSaved,
			description: code === 401 ? m.leftToast.sessionExpired : m.leftToast.failed,
			action: {
				label: m.leftToast.openEditor,
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- this editor's own URL
				onClick: () => goto(editorUrl)
			}
		});
	}

	async function handleSaveError(error: { status: unknown; value?: unknown }, editorUrl: string) {
		const code = errorStatus(error);
		const text = apiText(error.value);
		if (destroyed) {
			if (code === 401) clearAuthentication();
			return saveFailedAfterLeaving(code, editorUrl);
		}
		if (code === 401) {
			onSessionExpired?.();
			clearAuthentication();
			return showSubmitError({ message: m.sessionExpired });
		}
		if (code === 403) {
			return showSubmitError(
				text === RECRUITER_SPACE_REQUIRED
					? {
							message: m.noRecruiterSpace,
							link: { href: recruiterHref, label: m.openRecruiterSpace }
						}
					: { message: text ?? m.cannotSave }
			);
		}
		if (code === 404 && mode === 'edit') {
			return showSubmitError({
				message: m.gone,
				link: { href: recruiterHref, label: m.backToJobs }
			});
		}
		if (code === 409 && mode === 'edit' && text === JOB_CHANGED) {
			return showSubmitError({
				message: m.changedSince,
				action: { label: m.reload, run: reloadEditor }
			});
		}
		if (code === 409) {
			return showSubmitError({ message: text ?? m.tooManyJobs });
		}
		if (code === 413) {
			return showSubmitError({ message: m.tooLarge });
		}
		if (code === 422 && validationProperty(error.value) === 'consent') {
			return showSubmitError({
				message: m.termsRequired,
				link: { href: recruiterHref, label: m.openRecruiterSpace }
			});
		}
		if (code === 400 || code === 422) {
			const field = jobFieldOfProperty(validationProperty(error.value));
			if (field && text) {
				serverError = { field, message: text, snapshot: snapshotOf(field) };
				submitError = null;
				await tick();
				return focusField(field);
			}
			return showSubmitError({ message: text ?? m.invalidFields });
		}
		return showSubmitError({ message: m.saveFailed });
	}

	// --- Saving ---------------------------------------------------------------------------

	async function save() {
		if (status !== 'idle' || finished) return;
		attempted = true;
		submitError = null;
		// Text typed in a list without pressing Enter is part of the posting: added now
		pendingTextErrors = commitPendingText();
		const found = orderedJobFormErrors({ ...jobFormErrors(form), ...pendingTextErrors });
		if (found.length > 0) {
			announcement = m.fieldsToFix(found.length);
			await tick();
			return focusField(found[0].field);
		}

		// The fields are disabled while saving (see the form): what is sent is all there is
		status = 'saving';
		announcement = common.saving;
		const body = formToJobInput($state.snapshot(form) as JobForm);
		// Where to come back to, should the recruiter leave before the answer and it fail
		const editorUrl = `${location.pathname}${location.search}`;
		let saved: SavedJob;
		try {
			const { data, error } = jobId
				? await portfolioApi
						.jobs({ id: jobId })
						.put(loadedVersion ? { ...body, updatedAt: loadedVersion } : body, withCredentials)
				: await portfolioApi.jobs.post(body, withCredentials);
			if (error || !data) {
				status = 'idle';
				announcement = '';
				return handleSaveError(error ?? { status: undefined }, editorUrl);
			}
			saved = data;
		} catch {
			status = 'idle';
			announcement = '';
			if (destroyed) return saveFailedAfterLeaving(undefined, editorUrl);
			return showSubmitError({ message: m.networkError });
		}

		// Saved: from here on, nothing may offer to save it again (a second posting)
		finished = true;
		status = 'saved';
		announcement = m.savedAnnouncement;
		clearJobDraft(storageKey);
		if (initialImport) clearImportedDraft(owner);
		const savedMode = mode === 'add' ? 'created' : 'updated';
		// Left while it was saving: the page the recruiter went to stays
		if (destroyed) return onSaved(saved, savedMode, { left: true });
		try {
			await onSaved(saved, savedMode, { left: false });
		} catch {
			await showSubmitError({
				message: m.savedPageNotOpened,
				link: { href: recruiterHref, label: m.goToJobs }
			});
		}
	}

	// --- Drafts and the import ------------------------------------------------------------

	/**
	 * The page again, with the posting as it is now: the draft kept in this browser comes back
	 * over it, marked as made before the last save (startingJobForms' `stale`)
	 */
	function reloadEditor() {
		leaveAllowed = true;
		location.reload();
	}

	/** The form as the editor started (the posting, the import or a blank form), no draft */
	function startOver() {
		form = structuredClone(start.baseline);
		// The office is the starting one again: its note is looked up for it
		officeAsked = office();
		pendingText = emptyPendingText();
		restoredNotice = false;
		confirming = null;
		attempted = false;
		serverError = null;
		pendingTextErrors = {};
		submitError = null;
		clearJobDraft(storageKey);
		basisToStore = start.basis;
	}

	/** "Discard draft": back to where the editor started */
	async function resetForm() {
		startOver();
		announcement = m.draftDiscarded;
		await tick();
		document.getElementById(fieldId('title'))?.focus();
	}

	function discardImport() {
		finished = true;
		confirming = null;
		// The changes made to the import go with it (a blank form's draft has its own key)
		clearImportedDraft(owner);
		importBanner = false;
		onImportDiscarded?.();
	}

	async function openConfirm(kind: 'reset' | 'import') {
		confirming = kind;
		await tick();
		document.querySelector<HTMLElement>(`[data-confirm="${kind}"] [data-cancel]`)?.focus();
	}

	async function cancelConfirm(kind: 'reset' | 'import') {
		confirming = null;
		await tick();
		document.querySelector<HTMLElement>(`[data-ask="${kind}"]`)?.focus();
	}

	// --- Leaving --------------------------------------------------------------------------

	type LeaveTarget = { url: URL; delta?: number; external: boolean };
	let leaveTarget = $state<LeaveTarget | null>(null);
	let leaveAllowed = false;
	// The recruiter left with "Discard changes": should the page keep this editor (a link to
	// the same page), it starts over
	let discardedOnLeave = false;

	beforeNavigate((navigation) => {
		// A shallow navigation only changes the URL (the discarded import): the editor stays.
		// While saving, leaving is allowed: the save still ends (see save)
		if (navigation.shallow) return;
		if (finished || leaveAllowed || !dirty || status === 'saving') return;
		// A reload, closing the tab, typing an address: the browser asks
		if (navigation.type === 'leave') {
			navigation.cancel();
			return;
		}
		if (!navigation.to) return;
		navigation.cancel();
		leaveTarget = {
			url: navigation.to.url,
			delta: navigation.type === 'popstate' ? navigation.delta : undefined,
			external: navigation.willUnload
		};
	});

	// After a navigation that kept this editor (a link to the same page), it guards again, and
	// starts over when the recruiter left discarding their changes. (Also called for the
	// navigation that brought it, if any: nothing to do then.)
	afterNavigate((navigation) => {
		if (navigation.shallow) return;
		leaveAllowed = false;
		if (discardedOnLeave) {
			discardedOnLeave = false;
			finished = false;
			startOver();
		}
	});

	async function leave(discard: boolean) {
		const target = leaveTarget;
		if (!target) return;
		if (discard) {
			finished = true;
			discardedOnLeave = true;
			clearJobDraft(storageKey);
		}
		leaveAllowed = true;
		// Closed before the page goes: its focus trap must not outlive the page
		leaveTarget = null;
		await tick();
		if (target.delta) history.go(target.delta);
		else if (target.external) window.location.assign(target.url);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- a URL SvelteKit resolved
		else await goto(target.url);
	}

	// --- Field helpers --------------------------------------------------------------------

	/** Prefills the number of the arrangement chosen, when it is empty: 35 h, or 218 days */
	function setArrangement(arrangement: WorkingTimeArrangement) {
		form.arrangement = arrangement;
		if (arrangement === 'weekly_hours' && !form.hoursPerWeek.trim()) {
			form.hoursPerWeek = String(FR_FULL_TIME_HOURS_PER_WEEK);
		}
		if (arrangement === 'annual_days' && !form.daysPerYear.trim()) {
			form.daysPerYear = String(FR_FORFAIT_JOURS_STANDARD_DAYS);
		}
	}

	// How candidates will read the pay, once both amounts are numbers
	let payPreview = $derived.by(() => {
		const min = parseFormNumber(form.payMin);
		const max = parseFormNumber(form.payMax);
		if (min === undefined || max === undefined || !Number.isFinite(min + max)) return '';
		if (min <= 0 || max < min) return '';
		return formatPay({ min, max, currency: 'EUR', period: form.payPeriod });
	});

	let busy = $derived(status !== 'idle');
	let statusText = $derived(
		status === 'saving'
			? common.saving
			: status === 'saved'
				? m.saved
				: dirty
					? m.unsavedChanges
					: mode === 'edit'
						? m.noChanges
						: ''
	);
	const formId = `${uid}-form`;
	const daysOptions = [1, 2, 3, 4];
</script>

<!-- relative: what is only for screen readers (sr-only) is placed in the editor, not at the top
     of the document, which scrollIntoView would then scroll -->
<div class="relative space-y-6">
	{#if importBanner && initialImport}
		<section
			class="space-y-3 rounded-container border border-primary-500/40 preset-tonal-primary p-4 text-sm text-surface-950-50 sm:p-5"
			aria-labelledby="{uid}-import-title"
		>
			<div class="flex items-start gap-3">
				<DocumentArrowUp size="20" class="mt-0.5 shrink-0" aria-hidden="true" />
				<div class="min-w-0 flex-1 space-y-2">
					<h3 id="{uid}-import-title" class="font-semibold break-words">
						{m.importedFrom(initialImport.fileName)}
					</h3>
					{#if initialImport.warnings.length > 0}
						<ul class="list-disc space-y-1 ps-5">
							{#each initialImport.warnings as warning, index (index)}
								<li>{warning}</li>
							{/each}
						</ul>
					{:else if initialImport.warningsHidden}
						<p>{m.warningsOtherLanguage}</p>
					{:else}
						<p>{m.nothingLeftOut}</p>
					{/if}
				</div>
			</div>
			{#if confirming === 'import'}
				<div
					class="flex flex-wrap items-center gap-2 border-t border-primary-500/30 pt-3"
					role="group"
					aria-labelledby="{uid}-confirm-import"
					data-confirm="import"
				>
					<p id="{uid}-confirm-import" class="me-auto font-medium">
						{m.discardImportQuestion}
					</p>
					<button
						type="button"
						class="btn btn-sm preset-tonal"
						data-cancel
						onclick={() => cancelConfirm('import')}
					>
						{m.keepIt}
					</button>
					<button
						type="button"
						class="btn btn-sm preset-filled-error-700-300"
						onclick={discardImport}
					>
						{m.discardImport}
					</button>
				</div>
			{:else}
				<div class="flex justify-end">
					<button
						type="button"
						class="btn btn-sm underline hover:preset-tonal"
						data-ask="import"
						onclick={() => openConfirm('import')}
					>
						{m.discardImport}
					</button>
				</div>
			{/if}
		</section>
	{/if}

	{#if restoredNotice}
		<div
			class="space-y-2 rounded-container border border-warning-500/40 preset-tonal-warning px-4 py-3 text-sm text-surface-950-50"
			role="status"
		>
			<div class="flex items-start gap-2">
				<InformationCircle size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
				<p class="min-w-0 flex-1">
					{m.restored}
					{#if start.stale}
						{m.restoredStale}
					{/if}
				</p>
			</div>
			{#if confirming === 'reset'}
				<div
					class="flex flex-wrap items-center gap-2"
					role="group"
					aria-labelledby="{uid}-confirm-reset"
					data-confirm="reset"
				>
					<p id="{uid}-confirm-reset" class="me-auto font-medium">
						{mode === 'edit' ? m.discardChangesQuestion : m.discardDraftQuestion}
					</p>
					<button
						type="button"
						class="btn btn-sm preset-tonal"
						data-cancel
						onclick={() => cancelConfirm('reset')}
					>
						{m.keepIt}
					</button>
					<button type="button" class="btn btn-sm preset-filled-error-700-300" onclick={resetForm}>
						{m.discard}
					</button>
				</div>
			{:else}
				<div class="flex justify-end">
					<button
						type="button"
						class="btn btn-sm underline hover:preset-tonal"
						data-ask="reset"
						onclick={() => openConfirm('reset')}
					>
						{m.discardDraft}
					</button>
				</div>
			{/if}
		</div>
	{/if}

	{#if errorList.length > 0 || submitError}
		<div
			bind:this={summaryElement}
			tabindex="-1"
			class="space-y-2 rounded-container border border-error-500/60 preset-tonal-error p-4 text-sm text-surface-950-50 outline-none focus-visible:ring-2 focus-visible:ring-error-500"
			aria-labelledby="{uid}-summary-title"
		>
			{#if submitError}
				<div class="flex items-start gap-2" role="alert">
					<ExclamationTriangle size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
					<div class="min-w-0 space-y-2">
						<p id="{uid}-summary-title" class="font-semibold">{submitError.message}</p>
						{#if submitError.link}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved by the page -->
							<a href={submitError.link.href} class="btn btn-sm preset-filled-error-700-300">
								{submitError.link.label}
							</a>
						{/if}
						{#if submitError.action}
							<button
								type="button"
								class="btn btn-sm preset-filled-error-700-300"
								onclick={submitError.action.run}
							>
								{submitError.action.label}
							</button>
						{/if}
					</div>
				</div>
			{/if}
			{#if errorList.length > 0}
				<p id={submitError ? undefined : `${uid}-summary-title`} class="font-semibold">
					{m.problemsToFix(errorList.length)}
				</p>
				<ul class="list-disc space-y-1 ps-5">
					{#each errorList as error (error.field)}
						<li>
							<a
								href="#{fieldId(error.field)}"
								class="underline underline-offset-2 hover:no-underline"
								onclick={(event) => {
									event.preventDefault();
									focusField(error.field);
								}}>{m.fieldProblem(error.label, error.message)}</a
							>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<p class="text-sm text-surface-700-300">
		<Rich text={m.requiredNote}>
			{#snippet star(text: string)}<span class="text-error-700-300" aria-hidden="true">{text}</span
				>{/snippet}
			{#snippet spoken(text: string)}<span class="sr-only">{text}</span>{/snippet}
		</Rich>
	</p>

	<form
		id={formId}
		class="space-y-6"
		novalidate
		aria-busy={status === 'saving'}
		onsubmit={(event) => {
			event.preventDefault();
			save();
		}}
	>
		<!-- Disabled while saving: what is typed then would be lost (the save sends what was
		     there when it started, then the draft goes). min-w-0: a fieldset is no narrower
		     than its content otherwise -->
		<fieldset class="min-w-0 space-y-6" disabled={busy}>
			<!-- Basics -->
			<section class={sectionClass} aria-labelledby="{uid}-section-basics">
				<h3 id="{uid}-section-basics" class={headingClass}>{m.sections.basics}</h3>
				<Field field="title" label={labels.title} required>
					{#snippet control(attributes)}
						<input
							{...attributes}
							class="input"
							type="text"
							autocomplete="off"
							maxlength={JOB_LIMITS.title}
							placeholder={m.titlePlaceholder}
							bind:value={form.title}
						/>
					{/snippet}
				</Field>
				<Field field="company" label={labels.company} hint={m.companyHint}>
					{#snippet control(attributes)}
						<input
							{...attributes}
							class="input"
							type="text"
							autocomplete="organization"
							maxlength={JOB_LIMITS.company}
							placeholder={m.example('Acme')}
							bind:value={form.company}
						/>
					{/snippet}
				</Field>
				<div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
					<Field field="status" label={labels.status} hint={JOB_STATUS_DESCRIPTIONS[form.status]}>
						{#snippet control(attributes)}
							<select {...attributes} class="select" bind:value={form.status}>
								{#each JOB_STATUSES as value (value)}
									<option {value}>{JOB_STATUS_LABELS[value]}</option>
								{/each}
							</select>
						{/snippet}
					</Field>
					<Field field="openings" label={labels.openings} unit={m.positions}>
						{#snippet control(attributes)}
							<input
								{...attributes}
								class="input"
								type="text"
								inputmode="numeric"
								autocomplete="off"
								bind:value={form.openings}
							/>
						{/snippet}
					</Field>
				</div>
			</section>

			<!-- Description -->
			<section class={sectionClass} aria-labelledby="{uid}-section-description">
				<div>
					<h3 id="{uid}-section-description" class={headingClass}>{m.sections.description}</h3>
					<p class={introClass}>{m.descriptionIntro}</p>
				</div>
				<DescriptionField
					bind:value={form.description}
					required
					placeholder={m.descriptionPlaceholder}
				/>
			</section>

			<!-- Location -->
			<section class={sectionClass} aria-labelledby="{uid}-section-location">
				<h3 id="{uid}-section-location" class={headingClass}>{m.sections.location}</h3>
				<SegmentedControl
					value={form.workMode}
					onValueChange={(details) => {
						if (details.value) form.workMode = details.value as WorkMode;
					}}
					name="{uid}-work-mode"
					ids={{ root: fieldId('workMode') }}
					class="gap-1"
				>
					<SegmentedControl.Label class="label-text text-sm">
						{labels.workMode} <span class="text-error-700-300" aria-hidden="true">*</span>
					</SegmentedControl.Label>
					<SegmentedControl.Control class="grid w-full grid-cols-3 gap-1 p-1">
						<SegmentedControl.Indicator />
						{#each WORK_MODES as value (value)}
							<SegmentedControl.Item {value} class="min-h-10 px-2">
								<!-- May take two lines: « Télétravail complet » at 390 px -->
								<SegmentedControl.ItemText class="text-center whitespace-normal">
									{WORK_MODE_LABELS[value]}
								</SegmentedControl.ItemText>
								<SegmentedControl.ItemHiddenInput />
							</SegmentedControl.Item>
						{/each}
					</SegmentedControl.Control>
				</SegmentedControl>
				<!-- Leaving the three fields looks the office up on the map -->
				<div
					class="space-y-4"
					onfocusout={(event) => {
						if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
							officeAsked = office();
						}
					}}
				>
					<div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
						<Field
							field="city"
							label={labels.city}
							required={form.workMode !== 'remote'}
							hint={form.workMode === 'remote' ? m.cityOptional : ''}
						>
							{#snippet control(attributes)}
								<input
									{...attributes}
									class="input"
									type="text"
									autocomplete="address-level2"
									maxlength={JOB_LIMITS.city}
									placeholder={m.example('Lyon')}
									bind:value={form.city}
								/>
							{/snippet}
						</Field>
						<Field field="postalCode" label={labels.postalCode}>
							{#snippet control(attributes)}
								<input
									{...attributes}
									class="input"
									type="text"
									inputmode="numeric"
									autocomplete="postal-code"
									maxlength={JOB_LIMITS.postalCode}
									placeholder={m.example('69003')}
									bind:value={form.postalCode}
								/>
							{/snippet}
						</Field>
					</div>
					<Field field="address" label={labels.address} hint={m.addressHint}>
						{#snippet control(attributes)}
							<!-- No browser autofill: its list would cover the addresses found -->
							<AddressSearch
								{...attributes}
								autocomplete="off"
								maxlength={JOB_LIMITS.address}
								placeholder={m.example('12 rue de la République')}
								bind:value={form.address}
								near={{ postalCode: form.postalCode, city: form.city }}
								onpick={pickOffice}
							/>
						{/snippet}
					</Field>
					{#if form.workMode !== 'remote'}
						<OfficePlace asked={officeAsked} current={office()} picked={officePicked} />
					{/if}
				</div>
				{#if form.workMode === 'hybrid'}
					<Field field="remoteDaysPerWeek" label={labels.remoteDaysPerWeek} class="sm:max-w-xs">
						{#snippet control(attributes)}
							<select {...attributes} class="select" bind:value={form.remoteDaysPerWeek}>
								<option value="">{m.notSpecified}</option>
								{#each daysOptions as days (days)}
									<option value={String(days)}>{m.daysAWeek(days)}</option>
								{/each}
							</select>
						{/snippet}
					</Field>
				{/if}
				<div class="space-y-1">
					<p class="label-text text-sm" id="{uid}-country-label">{m.country}</p>
					<p class="font-medium" aria-describedby="{uid}-country-hint">
						{COUNTRY_LABELS.FR}
					</p>
					<p id="{uid}-country-hint" class="text-xs text-surface-700-300">
						{m.countryHint}
					</p>
				</div>
			</section>

			<!-- Contract -->
			<section class={sectionClass} aria-labelledby="{uid}-section-contract">
				<h3 id="{uid}-section-contract" class={headingClass}>{m.sections.contract}</h3>
				<div class="grid gap-4 sm:grid-cols-2">
					<Field field="contractType" label={labels.contractType} required>
						{#snippet control(attributes)}
							<select {...attributes} class="select" bind:value={form.contractType}>
								{#each FR_CONTRACT_TYPES as value (value)}
									<option {value}>{CONTRACT_TYPE_LABELS[value]}</option>
								{/each}
							</select>
						{/snippet}
					</Field>
					{#if contractHasDuration(form.contractType)}
						<Field
							field="durationMonths"
							label={labels.durationMonths}
							unit={m.months}
							required={contractNeedsDuration(form.contractType)}
							hint={contractNeedsDuration(form.contractType) ? '' : m.durationOptional}
						>
							{#snippet control(attributes)}
								<input
									{...attributes}
									class="input"
									type="text"
									inputmode="numeric"
									autocomplete="off"
									placeholder={m.example('6')}
									bind:value={form.durationMonths}
								/>
							{/snippet}
						</Field>
					{/if}
					<Field
						field="startDate"
						label={labels.startDate}
						hint={form.startDate ? '' : m.startDateHint}
					>
						{#snippet control(attributes)}
							<div class="flex gap-2">
								<input
									{...attributes}
									class="input min-w-0 flex-1"
									type="date"
									min="{JOB_LIMITS.startDateYear.min}-01-01"
									max="{JOB_LIMITS.startDateYear.max}-12-31"
									bind:value={form.startDate}
								/>
								{#if form.startDate}
									<button
										type="button"
										class="btn preset-tonal shrink-0"
										onclick={() => {
											form.startDate = '';
											document.getElementById(fieldId('startDate'))?.focus();
										}}
									>
										<Rich text={m.clearStartDate}>
											{#snippet spoken(text: string)}<span class="sr-only">{text}</span>{/snippet}
										</Rich>
									</button>
								{/if}
							</div>
						{/snippet}
					</Field>
					<Field field="trialPeriodMonths" label={labels.trialPeriodMonths} unit={m.months}>
						{#snippet control(attributes)}
							<input
								{...attributes}
								class="input"
								type="text"
								inputmode="numeric"
								autocomplete="off"
								placeholder={m.example('3')}
								bind:value={form.trialPeriodMonths}
							/>
						{/snippet}
					</Field>
					<Field
						field="collectiveAgreement"
						label={labels.collectiveAgreement}
						class="sm:col-span-2"
					>
						{#snippet control(attributes)}
							<input
								{...attributes}
								class="input"
								type="text"
								autocomplete="off"
								maxlength={JOB_LIMITS.collectiveAgreement}
								placeholder={m.example('Syntec')}
								bind:value={form.collectiveAgreement}
							/>
						{/snippet}
					</Field>
				</div>
			</section>

			<!-- Working time -->
			<section class={sectionClass} aria-labelledby="{uid}-section-working-time">
				<h3 id="{uid}-section-working-time" class={headingClass}>{m.sections.workingTime}</h3>
				<SegmentedControl
					value={form.arrangement}
					onValueChange={(details) => {
						if (details.value) setArrangement(details.value as WorkingTimeArrangement);
					}}
					name="{uid}-arrangement"
					ids={{ root: fieldId('arrangement') }}
					class="gap-1"
				>
					<SegmentedControl.Label class="label-text text-sm">
						{m.countedIn} <span class="text-error-700-300" aria-hidden="true">*</span>
					</SegmentedControl.Label>
					<SegmentedControl.Control class="grid w-full grid-cols-2 gap-1 p-1">
						<SegmentedControl.Indicator />
						{#each WORKING_TIME_ARRANGEMENTS as value (value)}
							<SegmentedControl.Item {value} class="min-h-10 px-2">
								<SegmentedControl.ItemText class="text-center whitespace-normal">
									{WORKING_TIME_LABELS[value]}
								</SegmentedControl.ItemText>
								<SegmentedControl.ItemHiddenInput />
							</SegmentedControl.Item>
						{/each}
					</SegmentedControl.Control>
				</SegmentedControl>
				<div class="grid gap-4 sm:grid-cols-2">
					{#if form.arrangement === 'weekly_hours'}
						<Field
							field="hoursPerWeek"
							label={labels.hoursPerWeek}
							unit={m.hoursUnit}
							unitLabel=""
							required
							hint={m.hoursHint}
						>
							{#snippet control(attributes)}
								<input
									{...attributes}
									class="input"
									type="text"
									inputmode="decimal"
									autocomplete="off"
									bind:value={form.hoursPerWeek}
								/>
							{/snippet}
						</Field>
					{:else}
						<Field
							field="daysPerYear"
							label={labels.daysPerYear}
							unit={m.daysPerYearUnit}
							unitLabel=""
							required
							hint={m.forfaitHint(FR_FORFAIT_JOURS_STANDARD_DAYS)}
						>
							{#snippet control(attributes)}
								<input
									{...attributes}
									class="input"
									type="text"
									inputmode="numeric"
									autocomplete="off"
									bind:value={form.daysPerYear}
								/>
							{/snippet}
						</Field>
					{/if}
					<Field
						field="rttDaysPerYear"
						label={m.rttDays}
						unit={m.daysPerYearUnit}
						unitLabel={m.daysPerYearSpoken}
						hint={m.rttHint}
					>
						{#snippet control(attributes)}
							<input
								{...attributes}
								class="input"
								type="text"
								inputmode="numeric"
								autocomplete="off"
								placeholder={m.example('10')}
								bind:value={form.rttDaysPerYear}
							/>
						{/snippet}
					</Field>
				</div>
			</section>

			<!-- Pay -->
			<section class={sectionClass} aria-labelledby="{uid}-section-pay">
				<div>
					<h3 id="{uid}-section-pay" class={headingClass}>
						{m.sections.pay} <span class="text-error-700-300" aria-hidden="true">*</span>
					</h3>
					<p class={introClass}>{m.payIntro}</p>
					<p class="mt-1 {introClass}">{m.payScoredOnMinimum}</p>
				</div>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
					<Field field="payMin" label={labels.payMin} unit="€" unitLabel={m.eurosGross} required>
						{#snippet control(attributes)}
							<input
								{...attributes}
								class="input"
								type="text"
								inputmode="decimal"
								autocomplete="off"
								placeholder={m.example('45 000')}
								bind:value={form.payMin}
							/>
						{/snippet}
					</Field>
					<Field field="payMax" label={labels.payMax} unit="€" unitLabel={m.eurosGross} required>
						{#snippet control(attributes)}
							<input
								{...attributes}
								class="input"
								type="text"
								inputmode="decimal"
								autocomplete="off"
								placeholder={m.example('55 000')}
								bind:value={form.payMax}
							/>
						{/snippet}
					</Field>
					<Field
						field="payPeriod"
						label={labels.payPeriod}
						required
						class="col-span-2 sm:col-span-1"
					>
						{#snippet control(attributes)}
							<select {...attributes} class="select" bind:value={form.payPeriod}>
								{#each PAY_PERIODS as value (value)}
									<option {value}>{PAY_PERIOD_LABELS[value]}</option>
								{/each}
							</select>
						{/snippet}
					</Field>
				</div>
				{#if payPreview}
					<p class="text-sm text-surface-700-300">
						{m.candidatesSee} <span class="font-medium text-surface-950-50">{payPreview}</span>
					</p>
				{/if}
				<Field field="payVariable" label={labels.payVariable} hint={m.variablePayHint}>
					{#snippet control(attributes)}
						<input
							{...attributes}
							class="input"
							type="text"
							autocomplete="off"
							maxlength={JOB_LIMITS.variablePay}
							placeholder={m.variablePayPlaceholder}
							bind:value={form.payVariable}
						/>
					{/snippet}
				</Field>
			</section>

			<!-- Team & organisation -->
			<section class={sectionClass} aria-labelledby="{uid}-section-team">
				<div>
					<h3 id="{uid}-section-team" class={headingClass}>
						{m.sections.team} <span class={optionalClass}>({common.optional})</span>
					</h3>
					<p class={introClass}>{m.teamIntro}</p>
				</div>
				<div class="grid gap-4 sm:grid-cols-3">
					<Field field="directReports" label={labels.directReports} hint={m.directReportsHint}>
						{#snippet control(attributes)}
							<input
								{...attributes}
								class="input"
								type="text"
								inputmode="numeric"
								autocomplete="off"
								placeholder={m.example('0')}
								bind:value={form.directReports}
							/>
						{/snippet}
					</Field>
					<Field field="peers" label={m.peers} hint={m.peersHint}>
						{#snippet control(attributes)}
							<input
								{...attributes}
								class="input"
								type="text"
								inputmode="numeric"
								autocomplete="off"
								placeholder={m.example('5')}
								bind:value={form.peers}
							/>
						{/snippet}
					</Field>
					<Field field="levelsToCeo" label={labels.levelsToCeo} hint={m.levelsHint}>
						{#snippet control(attributes)}
							<input
								{...attributes}
								class="input"
								type="text"
								inputmode="numeric"
								autocomplete="off"
								placeholder={m.example('3')}
								bind:value={form.levelsToCeo}
							/>
						{/snippet}
					</Field>
				</div>
			</section>

			<!-- Requirements -->
			<section class={sectionClass} aria-labelledby="{uid}-section-requirements">
				<h3 id="{uid}-section-requirements" class={headingClass}>
					{m.sections.requirements} <span class={optionalClass}>({common.optional})</span>
				</h3>
				<div class="grid gap-4 sm:grid-cols-2">
					<Field field="seniority" label={labels.seniority}>
						{#snippet control(attributes)}
							<select {...attributes} class="select" bind:value={form.seniority}>
								<option value="">{m.notSpecified}</option>
								{#each SENIORITY_LEVELS as value (value)}
									<option {value}>{SENIORITY_LABELS[value]}</option>
								{/each}
							</select>
						{/snippet}
					</Field>
					<Field field="education" label={labels.education}>
						{#snippet control(attributes)}
							<select {...attributes} class="select" bind:value={form.education}>
								<option value="">{m.notSpecified}</option>
								{#each EDUCATION_LEVELS as value (value)}
									<option {value}>{EDUCATION_LABELS[value]}</option>
								{/each}
							</select>
						{/snippet}
					</Field>
				</div>
				<ListInput
					field="skills"
					label={labels.skills}
					bind:value={form.skills}
					bind:text={pendingText.skills}
					max={JOB_LIMITS.skills}
					maxLength={JOB_LIMITS.listItem}
					placeholder={m.example('TypeScript')}
				/>
				<ListInput
					field="languages"
					label={labels.languages}
					bind:value={form.languages}
					bind:text={pendingText.languages}
					max={JOB_LIMITS.languages}
					maxLength={JOB_LIMITS.listItem}
					placeholder={m.languagePlaceholder}
				/>
			</section>

			<!-- Conditions -->
			<section class={sectionClass} aria-labelledby="{uid}-section-conditions">
				<h3 id="{uid}-section-conditions" class={headingClass}>
					{m.sections.conditions} <span class={optionalClass}>({common.optional})</span>
				</h3>
				<ListInput
					field="benefits"
					label={labels.benefits}
					bind:value={form.benefits}
					bind:text={pendingText.benefits}
					max={JOB_LIMITS.benefits}
					maxLength={JOB_LIMITS.listItem}
					placeholder={m.benefitPlaceholder}
				/>
				<Field field="travel" label={labels.travel} class="sm:max-w-xs">
					{#snippet control(attributes)}
						<select {...attributes} class="select" bind:value={form.travel}>
							<option value="">{m.notSpecified}</option>
							{#each TRAVEL_FREQUENCIES as value (value)}
								<option {value}>{TRAVEL_LABELS[value]}</option>
							{/each}
						</select>
					{/snippet}
				</Field>
			</section>
		</fieldset>

		<!-- Actions: stuck to the bottom of the page while it scrolls -->
		<div
			class="sticky bottom-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-surface-200-800 bg-surface-50-950/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur max-sm:-mx-4 sm:rounded-container sm:border sm:px-5"
		>
			<p
				class="flex min-w-0 flex-1 items-center gap-1.5 text-sm {status === 'idle' && dirty
					? 'text-warning-800-200'
					: 'text-surface-700-300'}"
			>
				{#if status === 'saving'}
					<ArrowPath size="16" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
				{/if}
				<span>{statusText}</span>
				{#if dirty && status === 'idle'}
					<span class="max-sm:hidden">{m.keptInBrowser}</span>
				{/if}
			</p>
			<div class="flex gap-2 max-sm:w-full">
				{#if busy}
					<!-- Saving: Cancel would leave a save behind it -->
					<button type="button" class="btn preset-tonal max-sm:flex-1" disabled>
						{common.cancel}
					</button>
				{:else}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved by the page -->
					<a href={cancelHref} class="btn preset-tonal max-sm:flex-1">{common.cancel}</a>
				{/if}
				<button
					type="submit"
					class="btn preset-filled-primary-700-300 max-sm:flex-1 {status === 'saving'
						? 'disabled:opacity-100'
						: ''}"
					disabled={busy}
				>
					{#if status === 'saving'}
						<ArrowPath
							size="18"
							class="animate-spin motion-reduce:animate-none"
							aria-hidden="true"
						/>
						{common.saving}
					{:else}
						{mode === 'add' ? m.create : m.saveChanges}
					{/if}
				</button>
			</div>
		</div>
	</form>
	<p class="sr-only" aria-live="polite">{announcement}</p>
</div>

<LeaveDialog
	open={!!leaveTarget}
	onStay={() => (leaveTarget = null)}
	onLeave={() => leave(false)}
	onDiscard={() => leave(true)}
/>
