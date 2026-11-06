<script lang="ts" module>
	const sectionClass =
		'card preset-outlined-surface-200-800 bg-surface-50-950 space-y-4 p-4 sm:p-6';
	const headingClass = 'text-lg font-semibold';
	const introClass = 'text-sm text-surface-700-300';
	const optionalClass = 'text-sm font-normal text-surface-700-300';
	const DESCRIPTION_PLACEHOLDER =
		'## The job\n\nWhat the role is about, the team, the stack…\n\n## Your missions\n\n- …';
</script>

<!--
@component
The job posting editor, as a section of a page (/recruiter/jobs/new, /recruiter/jobs/:id/edit):
every field of a posting in sections, validated with the API's own rules (jobFormErrors) after
a first attempt to save, then live; an error summary at the top links to the fields.

It owns the API calls (POST /jobs, PUT /jobs/:id), the unsaved-changes guard (beforeNavigate:
a dialog for links and Back, the browser's prompt for a reload or closing the tab) and the
drafts kept in this browser (`jobDraft:<userId>:new` / `jobDraft:<userId>:<jobId>`, restored
with a notice). The page owns the session gate, the toast and where to go after a save.

- `job` set: edit mode (the posting as GET /recruiter/jobs/:id returns it); else add mode.
- `imported` (add mode): starts from a job description import (the stored result of
  POST /jobs/import), with a banner listing its warnings; the import is removed from this
  browser once the posting is saved or the recruiter discards it (`onImportDiscarded`).
- Mounted once per posting: remount it (e.g. `{#key}`) to start over with other props.
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
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
		type WorkMode,
		type WorkingTimeArrangement
	} from 'portfolio-common';
	import { portfolioApi } from '#services';
	import { clearAuthentication } from '#services/authentication.ts';
	import { errorStatus } from '#services/apiErrors.ts';
	import {
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
	import {
		clearImportedDraft,
		clearJobDraft,
		jobDraftStorageKey,
		loadJobDraft,
		saveJobDraft,
		startingJobForms,
		type ImportedJobDraft
	} from '#services/jobDrafts.ts';
	import DescriptionField from './DescriptionField.svelte';
	import Field from './Field.svelte';
	import LeaveDialog from './LeaveDialog.svelte';
	import ListInput from './ListInput.svelte';
	import { setJobEditorContext } from './context';

	type SavedJob = NonNullable<Awaited<ReturnType<(typeof portfolioApi)['jobs']['post']>>['data']>;

	/** A message above the form, with an optional way out */
	type SubmitError = { message: string; link?: { href: string; label: string } };

	let {
		userId,
		job = null,
		imported = null,
		cancelHref,
		recruiterHref,
		onSaved,
		onImportDiscarded
	}: {
		/** The recruiter's user id: scopes the drafts kept in this browser */
		userId: string;
		/** The posting to edit (GET /recruiter/jobs/:id); null or undefined to add one */
		job?: (JobPostingLike & { _id: string }) | null;
		/** Add mode: the job description import to start from */
		imported?: ImportedJobDraft | null;
		/** Where Cancel goes (the posting, or the recruiter space) */
		cancelHref: string;
		/** The recruiter space, where an account without one creates it */
		recruiterHref: string;
		/** After a save; the draft is already gone. Typically a toast and a navigation */
		onSaved: (saved: SavedJob, mode: 'created' | 'updated') => void | Promise<void>;
		/** The recruiter discarded the import (already removed from this browser) */
		onImportDiscarded?: () => void;
	} = $props();

	const withCredentials = { fetch: { credentials: 'include' } } as const;
	const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.';
	const RECRUITER_SPACE_REQUIRED = 'Create your recruiter space first';

	// The editor works on the props as they were when it was mounted
	const initialJob = untrack(() => job);
	const initialImport = untrack(() => (initialJob ? null : imported));
	const owner = untrack(() => userId);
	const mode: 'add' | 'edit' = initialJob ? 'edit' : 'add';
	const jobId = initialJob?._id;
	const storageKey = jobDraftStorageKey(owner, jobId);
	const start = startingJobForms({ job: initialJob, imported: initialImport?.draft }, () =>
		loadJobDraft(storageKey)
	);
	const baselineSignature = jobFormSignature(start.baseline);

	let form: JobForm = $state(start.form);
	let dirty = $derived(jobFormSignature(form) !== baselineSignature);
	let restoredNotice = $state(start.restored);
	let importBanner = $state(!!initialImport);
	let confirming = $state<'reset' | 'import' | null>(null);

	let status = $state<'idle' | 'saving' | 'saved'>('idle');
	let submitError = $state<SubmitError | null>(null);
	let announcement = $state('');
	// Saved or discarded: nothing is written to the draft any more, and leaving asks nothing
	let finished = false;
	// Whether the stored draft is this editor's (restored, or written since): only then does a
	// form back to its start remove it. A stored draft of another start (a blank form's, while
	// this one starts from an import) is left alone
	let ownsDraft = mode === 'edit' || start.restored;

	// Keep unsaved changes in this browser: a reload, a navigation or an expired session loses
	// nothing. A form back to where it started has no draft.
	$effect(() => {
		const changed = dirty;
		const snapshot = $state.snapshot(form) as JobForm;
		if (finished) return;
		if (changed) {
			saveJobDraft(storageKey, { form: snapshot, basis: start.basis });
			ownsDraft = true;
		} else if (ownsDraft) {
			clearJobDraft(storageKey);
		}
	});

	// --- Errors ---------------------------------------------------------------------------

	// Errors show once saving was attempted, then follow the form as it changes
	let attempted = $state(false);
	// A field the API refused (422): shown until that field changes
	let serverError = $state<{ field: JobFormField; message: string; snapshot: string } | null>(null);
	const snapshotOf = (field: JobFormField) => JSON.stringify(form[field]);
	let errors = $derived.by(() => {
		const found = attempted ? jobFormErrors(form) : {};
		if (serverError && snapshotOf(serverError.field) === serverError.snapshot) {
			found[serverError.field] ??= serverError.message;
		}
		return found;
	});
	let errorList = $derived(orderedJobFormErrors(errors));

	const uid = $props.id();
	const fieldId = (field: JobFormField) => `${uid}-${field}`;
	const errorId = (field: JobFormField) => `${fieldId(field)}-error`;
	setJobEditorContext({ fieldId, errorId, error: (field) => errors[field] });

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

	async function handleSaveError(error: { status: unknown; value?: unknown }) {
		const code = errorStatus(error);
		const text = apiText(error.value);
		if (code === 401) {
			clearAuthentication();
			return showSubmitError({
				message:
					'Your session expired. Sign in again (top of the page), then save: your changes are kept in this browser.'
			});
		}
		if (code === 403) {
			return showSubmitError(
				text === RECRUITER_SPACE_REQUIRED
					? {
							message:
								'This account has no recruiter space yet. Open the recruiter space to create it, then come back to save: your changes are kept in this browser.',
							link: { href: recruiterHref, label: 'Open the recruiter space' }
						}
					: { message: text ?? 'You cannot save this job posting.' }
			);
		}
		if (code === 404 && mode === 'edit') {
			return showSubmitError({
				message: 'This job posting no longer exists: it may have been deleted in another tab.',
				link: { href: recruiterHref, label: 'Back to your job postings' }
			});
		}
		if (code === 409) {
			return showSubmitError({
				message: text ?? 'You have too many job postings: delete one to add another.'
			});
		}
		if (code === 413) {
			return showSubmitError({
				message: 'This job posting is too large: shorten the description and try again.'
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
			return showSubmitError({
				message: text ?? 'Some fields are invalid. Check them and try again.'
			});
		}
		return showSubmitError({ message: 'Could not save the job posting. Try again in a moment.' });
	}

	// --- Saving ---------------------------------------------------------------------------

	async function save() {
		if (status !== 'idle' || finished) return;
		attempted = true;
		submitError = null;
		const found = orderedJobFormErrors(jobFormErrors(form));
		if (found.length > 0) {
			announcement =
				found.length === 1
					? '1 field needs fixing before saving.'
					: `${found.length} fields need fixing before saving.`;
			await tick();
			return focusField(found[0].field);
		}

		status = 'saving';
		announcement = 'Saving…';
		const body = formToJobInput($state.snapshot(form) as JobForm);
		let saved: SavedJob;
		try {
			const { data, error } = jobId
				? await portfolioApi.jobs({ id: jobId }).put(body, withCredentials)
				: await portfolioApi.jobs.post(body, withCredentials);
			if (error || !data) {
				status = 'idle';
				announcement = '';
				return handleSaveError(error ?? { status: undefined });
			}
			saved = data;
		} catch {
			status = 'idle';
			announcement = '';
			return showSubmitError({ message: NETWORK_ERROR });
		}

		// Saved: from here on, nothing may offer to save it again (a second posting)
		finished = true;
		status = 'saved';
		announcement = 'Saved.';
		clearJobDraft(storageKey);
		if (initialImport) clearImportedDraft(owner);
		try {
			await onSaved(saved, mode === 'add' ? 'created' : 'updated');
		} catch {
			await showSubmitError({
				message: 'The job posting is saved, but its page could not be opened.',
				link: { href: recruiterHref, label: 'Go to your job postings' }
			});
		}
	}

	// --- Drafts and the import ------------------------------------------------------------

	/** Back to where the editor started (the posting, the import or a blank form) */
	async function resetForm() {
		form = structuredClone(start.baseline);
		restoredNotice = false;
		confirming = null;
		attempted = false;
		serverError = null;
		submitError = null;
		clearJobDraft(storageKey);
		announcement = 'Draft discarded.';
		await tick();
		document.getElementById(fieldId('title'))?.focus();
	}

	function discardImport() {
		finished = true;
		confirming = null;
		clearImportedDraft(owner);
		// The changes made to the import go with it (a blank form's draft stays)
		if (ownsDraft) clearJobDraft(storageKey);
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

	beforeNavigate((navigation) => {
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

	async function leave(discard: boolean) {
		const target = leaveTarget;
		if (!target) return;
		if (discard) {
			finished = true;
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
			? 'Saving…'
			: status === 'saved'
				? 'Saved'
				: dirty
					? 'Unsaved changes'
					: mode === 'edit'
						? 'No changes yet'
						: ''
	);
	const formId = `${uid}-form`;
	const daysOptions = [1, 2, 3, 4];
</script>

<div class="space-y-6">
	{#if importBanner && initialImport}
		<section
			class="space-y-3 rounded-container border border-primary-500/40 preset-tonal-primary p-4 text-sm text-surface-950-50 sm:p-5"
			aria-labelledby="{uid}-import-title"
		>
			<div class="flex items-start gap-3">
				<DocumentArrowUp size="20" class="mt-0.5 shrink-0" aria-hidden="true" />
				<div class="min-w-0 flex-1 space-y-2">
					<h3 id="{uid}-import-title" class="font-semibold break-words">
						Imported from {initialImport.fileName || 'your PDF'}: check every field before saving.
					</h3>
					{#if initialImport.warnings.length > 0}
						<ul class="list-disc space-y-1 ps-5">
							{#each initialImport.warnings as warning, index (index)}
								<li>{warning}</li>
							{/each}
						</ul>
					{:else}
						<p>Nothing was left out, but the reading can still be wrong.</p>
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
						Discard this import? It still counts as one of your imports.
					</p>
					<button
						type="button"
						class="btn btn-sm preset-tonal"
						data-cancel
						onclick={() => cancelConfirm('import')}
					>
						Keep it
					</button>
					<button type="button" class="btn btn-sm preset-filled-error-500" onclick={discardImport}>
						Discard import
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
						Discard import
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
					Restored your unsaved changes from this browser.
					{#if start.stale}
						This job posting was saved since you made them: check them before saving.
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
						{mode === 'edit'
							? 'Discard your changes and go back to the saved job posting?'
							: 'Discard this draft?'}
					</p>
					<button
						type="button"
						class="btn btn-sm preset-tonal"
						data-cancel
						onclick={() => cancelConfirm('reset')}
					>
						Keep it
					</button>
					<button type="button" class="btn btn-sm preset-filled-error-500" onclick={resetForm}>
						Discard
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
						Discard draft
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
							<a href={submitError.link.href} class="btn btn-sm preset-filled-error-500">
								{submitError.link.label}
							</a>
						{/if}
					</div>
				</div>
			{/if}
			{#if errorList.length > 0}
				<p id={submitError ? undefined : `${uid}-summary-title`} class="font-semibold">
					{errorList.length === 1
						? 'Fix 1 problem before saving:'
						: `Fix ${errorList.length} problems before saving:`}
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
								}}>{error.label}: {error.message}</a
							>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<p class="text-sm text-surface-700-300">
		Fields marked <span class="text-error-700-300" aria-hidden="true">*</span><span class="sr-only"
			>with a star</span
		> are required.
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
		<!-- Basics -->
		<section class={sectionClass} aria-labelledby="{uid}-section-basics">
			<h3 id="{uid}-section-basics" class={headingClass}>Basics</h3>
			<Field field="title" label="Job title" required>
				{#snippet control(attributes)}
					<input
						{...attributes}
						class="input"
						type="text"
						autocomplete="off"
						maxlength={JOB_LIMITS.title}
						placeholder="e.g. Senior backend engineer"
						bind:value={form.title}
					/>
				{/snippet}
			</Field>
			<Field field="company" label="Company" hint="Leave it empty to keep the company anonymous.">
				{#snippet control(attributes)}
					<input
						{...attributes}
						class="input"
						type="text"
						autocomplete="organization"
						maxlength={JOB_LIMITS.company}
						placeholder="e.g. Acme"
						bind:value={form.company}
					/>
				{/snippet}
			</Field>
			<div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
				<Field field="status" label="Status" hint={JOB_STATUS_DESCRIPTIONS[form.status]}>
					{#snippet control(attributes)}
						<select {...attributes} class="select" bind:value={form.status}>
							{#each JOB_STATUSES as value (value)}
								<option {value}>{JOB_STATUS_LABELS[value]}</option>
							{/each}
						</select>
					{/snippet}
				</Field>
				<Field field="openings" label="Openings" unit="positions">
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
				<h3 id="{uid}-section-description" class={headingClass}>Description</h3>
				<p class={introClass}>
					The job, its team and its missions, as candidates will read them on the job page.
				</p>
			</div>
			<DescriptionField
				bind:value={form.description}
				required
				placeholder={DESCRIPTION_PLACEHOLDER}
			/>
		</section>

		<!-- Location -->
		<section class={sectionClass} aria-labelledby="{uid}-section-location">
			<h3 id="{uid}-section-location" class={headingClass}>Location</h3>
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
					Work mode <span class="text-error-700-300" aria-hidden="true">*</span>
				</SegmentedControl.Label>
				<SegmentedControl.Control class="grid w-full grid-cols-3 gap-1 p-1">
					<SegmentedControl.Indicator />
					{#each WORK_MODES as value (value)}
						<SegmentedControl.Item {value} class="min-h-10 px-2">
							<SegmentedControl.ItemText>{WORK_MODE_LABELS[value]}</SegmentedControl.ItemText>
							<SegmentedControl.ItemHiddenInput />
						</SegmentedControl.Item>
					{/each}
				</SegmentedControl.Control>
			</SegmentedControl>
			<div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
				<Field
					field="city"
					label="City"
					required={form.workMode !== 'remote'}
					hint={form.workMode === 'remote' ? 'Optional for a fully remote job.' : ''}
				>
					{#snippet control(attributes)}
						<input
							{...attributes}
							class="input"
							type="text"
							autocomplete="address-level2"
							maxlength={JOB_LIMITS.city}
							placeholder="e.g. Lyon"
							bind:value={form.city}
						/>
					{/snippet}
				</Field>
				<Field field="postalCode" label="Postal code">
					{#snippet control(attributes)}
						<input
							{...attributes}
							class="input"
							type="text"
							inputmode="numeric"
							autocomplete="postal-code"
							maxlength={JOB_LIMITS.postalCode}
							placeholder="e.g. 69003"
							bind:value={form.postalCode}
						/>
					{/snippet}
				</Field>
			</div>
			{#if form.workMode === 'hybrid'}
				<Field field="remoteDaysPerWeek" label="Remote days a week" class="sm:max-w-xs">
					{#snippet control(attributes)}
						<select {...attributes} class="select" bind:value={form.remoteDaysPerWeek}>
							<option value="">Not specified</option>
							{#each daysOptions as days (days)}
								<option value={String(days)}>{days} {days === 1 ? 'day' : 'days'} a week</option>
							{/each}
						</select>
					{/snippet}
				</Field>
			{/if}
			<div class="space-y-1">
				<p class="label-text text-sm" id="{uid}-country-label">Country</p>
				<p class="font-medium" aria-describedby="{uid}-country-hint">
					{COUNTRY_LABELS.FR}
				</p>
				<p id="{uid}-country-hint" class="text-xs text-surface-700-300">
					Only jobs in France for now.
				</p>
			</div>
		</section>

		<!-- Contract -->
		<section class={sectionClass} aria-labelledby="{uid}-section-contract">
			<h3 id="{uid}-section-contract" class={headingClass}>Contract</h3>
			<div class="grid gap-4 sm:grid-cols-2">
				<Field field="contractType" label="Contract type" required>
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
						label="Duration"
						unit="months"
						required={contractNeedsDuration(form.contractType)}
						hint={contractNeedsDuration(form.contractType)
							? ''
							: 'Optional for a freelance mission.'}
					>
						{#snippet control(attributes)}
							<input
								{...attributes}
								class="input"
								type="text"
								inputmode="numeric"
								autocomplete="off"
								placeholder="e.g. 6"
								bind:value={form.durationMonths}
							/>
						{/snippet}
					</Field>
				{/if}
				<Field
					field="startDate"
					label="Start date"
					hint={form.startDate ? '' : 'Leave it empty for as soon as possible.'}
				>
					{#snippet control(attributes)}
						<div class="flex gap-2">
							<input
								{...attributes}
								class="input min-w-0 flex-1"
								type="date"
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
									Clear<span class="sr-only"> the start date (as soon as possible)</span>
								</button>
							{/if}
						</div>
					{/snippet}
				</Field>
				<Field field="trialPeriodMonths" label="Trial period" unit="months">
					{#snippet control(attributes)}
						<input
							{...attributes}
							class="input"
							type="text"
							inputmode="numeric"
							autocomplete="off"
							placeholder="e.g. 3"
							bind:value={form.trialPeriodMonths}
						/>
					{/snippet}
				</Field>
				<Field field="collectiveAgreement" label="Collective agreement" class="sm:col-span-2">
					{#snippet control(attributes)}
						<input
							{...attributes}
							class="input"
							type="text"
							autocomplete="off"
							maxlength={JOB_LIMITS.collectiveAgreement}
							placeholder="e.g. Syntec"
							bind:value={form.collectiveAgreement}
						/>
					{/snippet}
				</Field>
			</div>
		</section>

		<!-- Working time -->
		<section class={sectionClass} aria-labelledby="{uid}-section-working-time">
			<h3 id="{uid}-section-working-time" class={headingClass}>Working time</h3>
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
					Counted in <span class="text-error-700-300" aria-hidden="true">*</span>
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
						label="Hours per week"
						unit="h / week"
						required
						hint="35 h is full time in France; less is part-time."
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
						label="Days per year"
						unit="days / year"
						required
						hint="{FR_FORFAIT_JOURS_STANDARD_DAYS} days is the standard forfait jours."
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
					label="RTT days"
					unit="days / year"
					hint="Reduced working time days, if any."
				>
					{#snippet control(attributes)}
						<input
							{...attributes}
							class="input"
							type="text"
							inputmode="numeric"
							autocomplete="off"
							placeholder="e.g. 10"
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
					Pay <span class="text-error-700-300" aria-hidden="true">*</span>
				</h3>
				<p class={introClass}>
					Gross amounts (brut) in euros. The same minimum and maximum for a fixed pay.
				</p>
			</div>
			<div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
				<Field field="payMin" label="Minimum pay" unit="€" required>
					{#snippet control(attributes)}
						<input
							{...attributes}
							class="input"
							type="text"
							inputmode="decimal"
							autocomplete="off"
							placeholder="e.g. 45 000"
							bind:value={form.payMin}
						/>
					{/snippet}
				</Field>
				<Field field="payMax" label="Maximum pay" unit="€" required>
					{#snippet control(attributes)}
						<input
							{...attributes}
							class="input"
							type="text"
							inputmode="decimal"
							autocomplete="off"
							placeholder="e.g. 55 000"
							bind:value={form.payMax}
						/>
					{/snippet}
				</Field>
				<Field field="payPeriod" label="Pay period" required class="col-span-2 sm:col-span-1">
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
					Candidates see: <span class="font-medium text-surface-950-50">{payPreview}</span>
				</p>
			{/if}
			<Field
				field="payVariable"
				label="Variable pay"
				hint="Bonus, commission, profit-sharing… in a few words."
			>
				{#snippet control(attributes)}
					<input
						{...attributes}
						class="input"
						type="text"
						autocomplete="off"
						maxlength={JOB_LIMITS.variablePay}
						placeholder="e.g. Up to 10% annual bonus"
						bind:value={form.payVariable}
					/>
				{/snippet}
			</Field>
		</section>

		<!-- Team & organisation -->
		<section class={sectionClass} aria-labelledby="{uid}-section-team">
			<div>
				<h3 id="{uid}-section-team" class={headingClass}>
					Team &amp; organisation <span class={optionalClass}>(optional)</span>
				</h3>
				<p class={introClass}>Where the job sits: candidates often ask.</p>
			</div>
			<div class="grid gap-4 sm:grid-cols-3">
				<Field field="directReports" label="Direct reports" hint="People reporting to this job.">
					{#snippet control(attributes)}
						<input
							{...attributes}
							class="input"
							type="text"
							inputmode="numeric"
							autocomplete="off"
							placeholder="e.g. 0"
							bind:value={form.directReports}
						/>
					{/snippet}
				</Field>
				<Field field="peers" label="Peers" hint="Colleagues under the same manager.">
					{#snippet control(attributes)}
						<input
							{...attributes}
							class="input"
							type="text"
							inputmode="numeric"
							autocomplete="off"
							placeholder="e.g. 5"
							bind:value={form.peers}
						/>
					{/snippet}
				</Field>
				<Field field="levelsToCeo" label="Levels to the CEO" hint="1 = reports to the CEO.">
					{#snippet control(attributes)}
						<input
							{...attributes}
							class="input"
							type="text"
							inputmode="numeric"
							autocomplete="off"
							placeholder="e.g. 3"
							bind:value={form.levelsToCeo}
						/>
					{/snippet}
				</Field>
			</div>
		</section>

		<!-- Requirements -->
		<section class={sectionClass} aria-labelledby="{uid}-section-requirements">
			<h3 id="{uid}-section-requirements" class={headingClass}>
				Requirements <span class={optionalClass}>(optional)</span>
			</h3>
			<div class="grid gap-4 sm:grid-cols-2">
				<Field field="seniority" label="Seniority">
					{#snippet control(attributes)}
						<select {...attributes} class="select" bind:value={form.seniority}>
							<option value="">Not specified</option>
							{#each SENIORITY_LEVELS as value (value)}
								<option {value}>{SENIORITY_LABELS[value]}</option>
							{/each}
						</select>
					{/snippet}
				</Field>
				<Field field="education" label="Education">
					{#snippet control(attributes)}
						<select {...attributes} class="select" bind:value={form.education}>
							<option value="">Not specified</option>
							{#each EDUCATION_LEVELS as value (value)}
								<option {value}>{EDUCATION_LABELS[value]}</option>
							{/each}
						</select>
					{/snippet}
				</Field>
			</div>
			<ListInput
				field="skills"
				label="Skills"
				itemName="skill"
				bind:value={form.skills}
				max={JOB_LIMITS.skills}
				maxLength={JOB_LIMITS.listItem}
				placeholder="e.g. TypeScript"
			/>
			<ListInput
				field="languages"
				label="Languages"
				itemName="language"
				bind:value={form.languages}
				max={JOB_LIMITS.languages}
				maxLength={JOB_LIMITS.listItem}
				placeholder="e.g. English (C1)"
			/>
		</section>

		<!-- Conditions -->
		<section class={sectionClass} aria-labelledby="{uid}-section-conditions">
			<h3 id="{uid}-section-conditions" class={headingClass}>
				Conditions <span class={optionalClass}>(optional)</span>
			</h3>
			<ListInput
				field="benefits"
				label="Benefits"
				itemName="benefit"
				bind:value={form.benefits}
				max={JOB_LIMITS.benefits}
				maxLength={JOB_LIMITS.listItem}
				placeholder="e.g. Meal vouchers"
			/>
			<Field field="travel" label="Travel" class="sm:max-w-xs">
				{#snippet control(attributes)}
					<select {...attributes} class="select" bind:value={form.travel}>
						<option value="">Not specified</option>
						{#each TRAVEL_FREQUENCIES as value (value)}
							<option {value}>{TRAVEL_LABELS[value]}</option>
						{/each}
					</select>
				{/snippet}
			</Field>
		</section>

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
					<span class="max-sm:hidden">· kept in this browser</span>
				{/if}
			</p>
			<div class="flex gap-2 max-sm:w-full">
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved by the page -->
				<a href={cancelHref} class="btn preset-tonal max-sm:flex-1" aria-disabled={busy}>
					Cancel
				</a>
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
						Saving…
					{:else}
						{mode === 'add' ? 'Create job posting' : 'Save changes'}
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
