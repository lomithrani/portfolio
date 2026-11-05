<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { Dialog, SegmentedControl } from '@skeletonlabs/skeleton-svelte';
	import { ArrowPath, ArrowUturnLeft, Plus, Trash, XMark } from 'svelte-heros-v2';
	import { EXPERIENCE_LIMITS, ExperienceType } from 'portfolio-common';
	import type { Experience as ExperienceModel } from 'portfolio-api/models/database';
	import { portfolioApi } from '#services';
	import { clearAuthentication } from '#services/authentication.ts';
	import { errorStatus } from '#services/apiErrors.ts';
	import {
		emptyProject,
		fieldLabel,
		fieldOfServerProperty,
		fieldSnapshot,
		formSignature,
		formToExperienceRequest,
		ongoingLabel,
		sentProjects,
		serializeForm,
		validateExperienceForm,
		type FieldError as FormFieldError,
		type FieldKey,
		type FormData,
		type FormProject
	} from '#services/experienceForm.ts';
	import FieldError from './FieldError.svelte';
	import LogoInput from './LogoInput.svelte';
	import MarkdownField from './MarkdownField.svelte';
	import PeriodFields from './PeriodFields.svelte';
	import ProjectItem from './ProjectItem.svelte';
	import { experiencePeriod, formatMonthRange, fromMonthKey } from '#services/experienceDates.ts';
	import { setEditorContext } from './context';
	import {
		clearDraft,
		draftStorageKey,
		loadDraft,
		removeLegacyDraft,
		saveDraft,
		startingForms
	} from './drafts';

	type EditorFormProps = {
		experience?: ExperienceModel | null;
		/** Add mode: the prefilled form to start from (see ExperienceEditor) */
		initialForm?: FormData | null;
		draftKey: string;
		knownSkills?: { hard: string[]; soft: string[] };
		onClose: () => void;
		onSaved: (saved: ExperienceModel, mode: 'created' | 'updated') => void;
		onDeleted: (id: string) => void;
	};

	let {
		experience = null,
		initialForm = null,
		draftKey,
		knownSkills = { hard: [], soft: [] },
		onClose,
		onSaved,
		onDeleted
	}: EditorFormProps = $props();

	const TYPES = [
		{ value: ExperienceType.Professional, label: 'Professional' },
		{ value: ExperienceType.Personal, label: 'Personal' },
		{ value: ExperienceType.Educational, label: 'Education' },
		{ value: ExperienceType.Leisure, label: 'Leisure' }
	];
	const MONTH = /^\d{4}-\d{2}$/;
	const withCredentials = { fetch: { credentials: 'include' } } as const;
	const SESSION_EXPIRED =
		'Your session expired. Sign in again (your changes are kept), then save. Closing this window keeps them as a draft.';
	const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.';

	// The editor works on the experience as it was when opened: the parent remounts it for
	// another experience or a new opening
	const initial = untrack(() => experience);
	const mode: 'add' | 'edit' = initial ? 'edit' : 'add';
	const experienceId = initial ? String(initial._id) : undefined;
	const storageKey = draftStorageKey(
		untrack(() => draftKey),
		experienceId
	);
	removeLegacyDraft();
	// A state proxy cannot be cloned: the prefilled form is copied as plain data
	const start = startingForms(
		{ experience: initial, initialForm: untrack(() => $state.snapshot(initialForm)) },
		() => loadDraft(storageKey)
	);
	const baseline = start.baseline;
	const baselineSignature = formSignature(baseline);
	const savedTitle = baseline.title;

	let form: FormData = $state(start.form);
	let restoredNotice = $state(start.restored);
	let dirty = $derived(formSignature(form) !== baselineSignature);

	let status = $state<'idle' | 'saving' | 'deleting'>('idle');
	// close: leave with unsaved changes; reset: drop the add draft and stay; delete: the experience
	let confirming = $state<'close' | 'reset' | 'delete' | null>(null);
	let submitError = $state('');
	let announcement = $state('');
	// Set once saved, deleted or discarded: nothing is written to the draft afterwards
	let finished = false;
	// After a 401: signing in again needs the page, so closing keeps the draft without asking
	let sessionExpired = false;

	type ShownError = FormFieldError & { snapshot: string };
	let shownErrors: ShownError[] = $state([]);
	// An error stays until its field changes
	let visibleErrors = $derived(
		shownErrors.filter((error) => fieldSnapshot(form, error.field) === error.snapshot)
	);
	let errorByField = $derived(new Map(visibleErrors.map((error) => [error.field, error.message])));

	const expandedFor = (projects: FormProject[]) =>
		Object.fromEntries(projects.length === 1 ? [[projects[0].id, true]] : []);
	let expanded: Record<string, boolean> = $state(expandedFor(start.form.projects));
	let removed: { project: FormProject; index: number; expanded: boolean } | null = $state(null);

	const uid = $props.id();
	const fieldId = (field: FieldKey) => `${uid}-${field.replace(/[^\w-]/g, '-')}`;
	const errorId = (field: FieldKey) => `${fieldId(field)}-error`;
	setEditorContext({ fieldId, errorId, error: (field) => errorByField.get(field) });

	let summaryElement: HTMLElement | undefined = $state();
	let undoButton: HTMLButtonElement | undefined = $state();
	let confirmButton: HTMLButtonElement | undefined = $state();
	// What had focus when a confirmation opened, to return there (by its data-footer key when
	// the footer button it was has been re-rendered)
	let returnFocus: Element | null = null;
	let returnFooterKey: string | undefined;

	let formSkills = $derived(form.projects.flatMap((p) => [...p.hardSkills, ...p.softSkills]));
	let known = $derived([...knownSkills.hard, ...knownSkills.soft, ...formSkills]);
	let hardSuggestions = $derived([
		...knownSkills.hard,
		...form.projects.flatMap((p) => p.hardSkills)
	]);
	let softSuggestions = $derived([
		...knownSkills.soft,
		...form.projects.flatMap((p) => p.softSkills)
	]);

	// Keep unsaved changes in this browser: a reload, a navigation or an expired session
	// loses nothing. A form back to its saved state has no draft.
	$effect(() => {
		const changed = dirty;
		const serialized = serializeForm(form);
		if (finished) return;
		if (changed) saveDraft(storageKey, serialized);
		else clearDraft(storageKey);
	});

	const projectOf = (field: FieldKey) =>
		field.startsWith('projects.') ? field.split('.')[1] : undefined;
	const projectHasErrors = (id: string) =>
		visibleErrors.some((error) => projectOf(error.field) === id);

	async function focusField(field: FieldKey) {
		const projectId = projectOf(field);
		if (projectId && !expanded[projectId]) {
			expanded[projectId] = true;
			await tick();
		}
		const element = document.getElementById(fieldId(field));
		// A markdown field showing its preview: back to its Write tab first
		if (element?.closest('[hidden]')) {
			element
				.closest('[data-markdown-field]')
				?.querySelector<HTMLElement>('[data-write-tab]')
				?.click();
			await tick();
		}
		element?.focus();
	}

	async function showErrors(errors: FormFieldError[]) {
		shownErrors = errors.map((error) => ({ ...error, snapshot: fieldSnapshot(form, error.field) }));
		for (const error of errors) {
			const projectId = projectOf(error.field);
			if (projectId) expanded[projectId] = true;
		}
		await tick();
		await focusField(errors[0].field);
	}

	async function showSubmitError(message: string) {
		submitError = message;
		await tick();
		summaryElement?.focus();
	}

	const validationBody = (value: unknown): { property?: string; message?: string } => {
		if (!value || typeof value !== 'object') return {};
		const { property, message } = value as Record<string, unknown>;
		return {
			property: typeof property === 'string' ? property : undefined,
			message: typeof message === 'string' ? message : undefined
		};
	};

	async function handleSaveError(error: { status: unknown; value?: unknown }, sentIds: string[]) {
		const code = errorStatus(error);
		if (code === 401) {
			clearAuthentication();
			sessionExpired = true;
			return showSubmitError(SESSION_EXPIRED);
		}
		if (code === 403) return showSubmitError('Only the owner of this portfolio can change it.');
		if (code === 404) {
			return showSubmitError(
				mode === 'edit'
					? 'This experience no longer exists: it may have been deleted in another tab.'
					: 'Claim a portfolio before adding experiences.'
			);
		}
		if (code === 413) {
			return showSubmitError('This experience is too large. Use a smaller logo or shorter texts.');
		}
		if (code === 400 || code === 422) {
			const body = validationBody(error.value);
			const field = fieldOfServerProperty(body.property, sentIds);
			if (field && body.message) {
				return showErrors([{ field, label: fieldLabel(form, field), message: body.message }]);
			}
			return showSubmitError(body.message ?? 'Some fields are invalid. Check them and try again.');
		}
		return showSubmitError('Could not save the experience. Try again in a moment.');
	}

	async function save() {
		if (status !== 'idle' || finished) return;
		submitError = '';
		const errors = validateExperienceForm(form);
		if (errors.length > 0) return showErrors(errors);

		shownErrors = [];
		status = 'saving';
		const snapshot = $state.snapshot(form) as FormData;
		const sentIds = sentProjects(snapshot).map((project) => project.id);
		try {
			const request = formToExperienceRequest(snapshot);
			const { data, error } = experienceId
				? await portfolioApi.experiences({ id: experienceId }).put(request, withCredentials)
				: await portfolioApi.experiences.post(request, withCredentials);
			if (error || !data) {
				status = 'idle';
				return handleSaveError(error ?? { status: undefined }, sentIds);
			}
			finished = true;
			clearDraft(storageKey);
			onSaved(data as ExperienceModel, mode === 'add' ? 'created' : 'updated');
		} catch {
			status = 'idle';
			await showSubmitError(NETWORK_ERROR);
		}
	}

	async function deleteExperience() {
		if (!experienceId || status !== 'idle') return;
		status = 'deleting';
		submitError = '';
		try {
			const { error } = await portfolioApi
				.experiences({ id: experienceId })
				.delete(undefined, withCredentials);
			const code = errorStatus(error);
			// 404: already deleted (another tab), which is what was asked
			if (error && code !== 404) {
				if (code === 401) {
					clearAuthentication();
					sessionExpired = true;
				}
				status = 'idle';
				confirming = null;
				return showSubmitError(
					code === 401
						? 'Your session expired. Sign in again, then delete the experience.'
						: code === 403
							? 'Only the owner of this portfolio can change it.'
							: 'Could not delete the experience. Try again in a moment.'
				);
			}
			finished = true;
			clearDraft(storageKey);
			onDeleted(experienceId);
		} catch {
			status = 'idle';
			confirming = null;
			await showSubmitError(NETWORK_ERROR);
		}
	}

	async function openConfirm(kind: 'close' | 'reset' | 'delete') {
		returnFocus = document.activeElement;
		returnFooterKey = (returnFocus as HTMLElement | null)?.dataset?.footer;
		confirming = kind;
		await tick();
		confirmButton?.focus();
	}

	async function cancelConfirm() {
		confirming = null;
		await tick();
		if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
		else if (returnFooterKey) {
			document.querySelector<HTMLElement>(`[data-footer="${returnFooterKey}"]`)?.focus();
		}
	}

	function discardAndClose() {
		finished = true;
		clearDraft(storageKey);
		onClose();
	}

	/** Escape, backdrop, Cancel and the close button: asks first when there are unsaved changes */
	export function requestClose() {
		if (status !== 'idle') return;
		if (confirming) {
			cancelConfirm();
			return;
		}
		if (!dirty || sessionExpired) onClose();
		else openConfirm('close');
	}

	/** Back to the saved experience (or the empty / prefilled add form), without the draft */
	async function resetForm() {
		form = structuredClone(baseline);
		expanded = expandedFor(form.projects);
		removed = null;
		restoredNotice = false;
		confirming = null;
		shownErrors = [];
		submitError = '';
		clearDraft(storageKey);
		announcement = mode === 'add' ? 'Draft discarded.' : 'Changes discarded.';
		await tick();
		document.getElementById(fieldId('title'))?.focus();
	}

	async function addProject() {
		const project = emptyProject();
		form.projects.push(project);
		expanded[project.id] = true;
		await tick();
		document.getElementById(fieldId(`projects.${project.id}.name`))?.focus();
	}

	const projectName = (project: FormProject) => project.name.trim() || 'Untitled project';

	async function moveProject(index: number, offset: -1 | 1) {
		const target = index + offset;
		if (target < 0 || target >= form.projects.length) return;
		const [project] = form.projects.splice(index, 1);
		form.projects.splice(target, 0, project);
		announcement = `Moved “${projectName(project)}” to position ${target + 1} of ${form.projects.length}.`;
		await tick();
		// Moving the node loses focus: put it back on the same arrow, or the other one at an end
		const item = document.querySelector(`[data-project-item="${project.id}"]`);
		const same = item?.querySelector<HTMLButtonElement>(
			`[data-move="${offset < 0 ? 'up' : 'down'}"]`
		);
		const other = item?.querySelector<HTMLButtonElement>('[data-move]:not(:disabled)');
		(same && !same.disabled ? same : other)?.focus();
	}

	async function removeProject(index: number) {
		const [project] = form.projects.splice(index, 1);
		removed = {
			project: $state.snapshot(project) as FormProject,
			index,
			expanded: !!expanded[project.id]
		};
		delete expanded[project.id];
		await tick();
		undoButton?.focus();
	}

	async function undoRemove() {
		if (!removed) return;
		const { project, index } = removed;
		form.projects.splice(Math.min(index, form.projects.length), 0, project);
		expanded[project.id] = removed.expanded;
		removed = null;
		announcement = `Restored “${projectName(project)}”.`;
		await tick();
		document.querySelector<HTMLElement>(`[data-project-toggle="${project.id}"]`)?.focus();
	}

	let statusText = $derived(
		status === 'saving'
			? 'Saving…'
			: status === 'deleting'
				? 'Deleting…'
				: dirty
					? 'Unsaved changes'
					: ''
	);
	let busy = $derived(status !== 'idle');

	// What the card shows when the experience has no dates of its own
	const monthDate = (month: string) => (MONTH.test(month) ? fromMonthKey(month) : undefined);
	let projectsPeriod = $derived.by(() => {
		const period = experiencePeriod({
			projects: form.projects.map((project) => ({
				start: monthDate(project.start),
				end: project.ongoing ? undefined : monthDate(project.end)
			}))
		});
		return period.start ? formatMonthRange(period.start, period.end) : '';
	});
	let atProjectLimit = $derived(form.projects.length >= EXPERIENCE_LIMITS.projects);
	const formId = `${uid}-form`;
</script>

<!-- Header -->
<div
	class="flex items-start gap-3 border-b border-surface-200-800 px-4 py-3 sm:px-6 sm:py-4"
	data-editor-header
>
	<div class="min-w-0 flex-1">
		<Dialog.Title>
			{#snippet element(attributes)}
				<h2 {...attributes} class="truncate text-lg font-semibold sm:text-xl">
					{mode === 'add' ? 'New experience' : `Edit · ${savedTitle}`}
				</h2>
			{/snippet}
		</Dialog.Title>
		<div class="flex flex-wrap items-center gap-x-2 text-sm text-surface-600-400">
			<Dialog.Description>
				{#snippet element(attributes)}
					<p {...attributes} class={statusText ? 'max-sm:sr-only' : ''}>
						Fields marked * are required.
					</p>
				{/snippet}
			</Dialog.Description>
			{#if statusText}
				<span class="max-sm:hidden" aria-hidden="true">·</span>
				<span
					class="flex items-center gap-1 {status === 'idle' ? 'text-warning-800-200' : ''}"
					role="status"
				>
					{#if busy}
						<ArrowPath
							size="14"
							class="animate-spin motion-reduce:animate-none"
							aria-hidden="true"
						/>
					{/if}
					{statusText}
				</span>
			{/if}
		</div>
	</div>
	<button
		type="button"
		class="btn-icon size-10 shrink-0 hover:preset-tonal"
		aria-label="Close"
		disabled={busy}
		onclick={requestClose}
	>
		<XMark size="20" aria-hidden="true" />
	</button>
</div>

<!-- Body -->
<form
	id={formId}
	class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
	novalidate
	onsubmit={(event) => {
		event.preventDefault();
		save();
	}}
>
	<div class="space-y-8 px-4 py-5 sm:px-6">
		{#if restoredNotice}
			<div
				class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-base preset-tonal-warning px-3 py-2 text-sm"
				role="status"
			>
				<span>Restored unsaved changes.</span>
				<button type="button" class="btn btn-sm px-2 underline" onclick={resetForm}>
					Discard
				</button>
			</div>
		{/if}

		{#if visibleErrors.length > 0 || submitError}
			<div
				bind:this={summaryElement}
				tabindex="-1"
				class="space-y-2 rounded-base border border-error-500/60 preset-tonal-error p-3 text-sm text-surface-950-50 outline-none focus-visible:ring-2 focus-visible:ring-error-500 sm:p-4"
				aria-labelledby="{uid}-summary-title"
			>
				{#if submitError}
					<p id="{uid}-summary-title" class="font-semibold text-error-800-200" role="alert">
						{submitError}
					</p>
				{/if}
				{#if visibleErrors.length > 0}
					<p id={submitError ? undefined : `${uid}-summary-title`} class="font-semibold">
						{visibleErrors.length === 1
							? 'Fix 1 problem before saving:'
							: `Fix ${visibleErrors.length} problems before saving:`}
					</p>
					<ul class="list-disc space-y-1 ps-5">
						{#each visibleErrors as error (error.field)}
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

		<section class="space-y-4" aria-labelledby="{uid}-basics">
			<h3 id="{uid}-basics" class="text-base font-semibold">Basics</h3>
			<div class="space-y-1">
				<label for={fieldId('title')} class="label-text">
					Title <span class="text-error-700-300" aria-hidden="true">*</span>
				</label>
				<input
					id={fieldId('title')}
					class="input"
					type="text"
					autocomplete="off"
					required
					maxlength={EXPERIENCE_LIMITS.title}
					placeholder="e.g. Senior Software Engineer"
					bind:value={form.title}
					aria-invalid={errorByField.has('title') || undefined}
					aria-describedby={errorByField.has('title') ? errorId('title') : undefined}
					data-initial-focus
				/>
				<FieldError field="title" />
			</div>
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="space-y-1">
					<label for={fieldId('company.name')} class="label-text">Company or school</label>
					<input
						id={fieldId('company.name')}
						class="input"
						type="text"
						autocomplete="organization"
						maxlength={EXPERIENCE_LIMITS.companyName}
						placeholder="e.g. Acme Inc."
						bind:value={form.company.name}
						aria-invalid={errorByField.has('company.name') || undefined}
						aria-describedby={errorByField.has('company.name')
							? errorId('company.name')
							: undefined}
					/>
					<FieldError field="company.name" />
				</div>
				<div class="space-y-1">
					<label for={fieldId('location')} class="label-text">Location</label>
					<input
						id={fieldId('location')}
						class="input"
						type="text"
						autocomplete="off"
						maxlength={EXPERIENCE_LIMITS.location}
						placeholder="e.g. Paris, France · Remote"
						bind:value={form.location}
						aria-invalid={errorByField.has('location') || undefined}
						aria-describedby={errorByField.has('location') ? errorId('location') : undefined}
					/>
					<FieldError field="location" />
				</div>
			</div>
			<SegmentedControl
				value={form.type}
				onValueChange={(details) => {
					if (details.value) form.type = details.value as ExperienceType;
				}}
				orientation="horizontal"
				name="{uid}-type"
				class="gap-1"
			>
				<SegmentedControl.Label>Type</SegmentedControl.Label>
				<SegmentedControl.Control class="grid w-full grid-cols-2 gap-1 p-1 sm:flex">
					<SegmentedControl.Indicator />
					{#each TYPES as type (type.value)}
						<SegmentedControl.Item value={type.value} class="min-h-10">
							<SegmentedControl.ItemText>{type.label}</SegmentedControl.ItemText>
							<SegmentedControl.ItemHiddenInput />
						</SegmentedControl.Item>
					{/each}
				</SegmentedControl.Control>
			</SegmentedControl>
			<div class="space-y-2">
				<PeriodFields
					bind:start={form.start}
					bind:end={form.end}
					bind:ongoing={form.ongoing}
					ongoingLabel={ongoingLabel(form.type)}
				/>
				{#if projectsPeriod && !form.start && !form.end && !form.ongoing}
					<p class="text-xs text-surface-600-400">
						Left empty, the period of the projects is shown: {projectsPeriod}.
					</p>
				{/if}
			</div>
		</section>

		<section class="space-y-3" aria-labelledby="{uid}-logo">
			<h3 id="{uid}-logo" class="text-base font-semibold">Logo</h3>
			<LogoInput value={form.icon} onchange={(icon) => (form.icon = icon)} />
		</section>

		<section class="space-y-3">
			<MarkdownField
				bind:value={form.summary}
				field="summary"
				label="Summary"
				labelClass="text-base font-semibold"
				placeholder="Your role, the context and what you achieved."
			/>
		</section>

		<section class="space-y-3" aria-labelledby="{uid}-projects">
			<div>
				<h3 id="{uid}-projects" class="text-base font-semibold">
					Projects
					{#if form.projects.length > 0}
						<span class="ms-1 text-sm font-normal text-surface-600-400">
							({form.projects.length})
						</span>
					{/if}
				</h3>
				<p class="text-sm text-surface-600-400">
					Missions, products or courses of this experience, each with its own skills.
				</p>
			</div>
			<FieldError field="projects" />
			{#if form.projects.length > 0}
				<ol class="divide-y divide-surface-200-800 border-y border-surface-200-800">
					{#each form.projects as project, index (project.id)}
						<li data-project-item={project.id}>
							<ProjectItem
								bind:project={form.projects[index]}
								{index}
								count={form.projects.length}
								expanded={!!expanded[project.id]}
								hasErrors={projectHasErrors(project.id)}
								{known}
								{hardSuggestions}
								{softSuggestions}
								ontoggle={() => (expanded[project.id] = !expanded[project.id])}
								onmove={(offset) => moveProject(index, offset)}
								onremove={() => removeProject(index)}
							/>
						</li>
					{/each}
				</ol>
			{/if}
			{#if removed}
				<div
					class="flex flex-wrap items-center gap-2 rounded-base preset-tonal px-3 py-2 text-sm"
					role="status"
				>
					<span class="min-w-0 flex-1">Removed “{projectName(removed.project)}”.</span>
					<button
						bind:this={undoButton}
						type="button"
						class="btn btn-sm preset-tonal-primary"
						onclick={undoRemove}
					>
						<ArrowUturnLeft size="16" aria-hidden="true" />
						Undo
					</button>
					<button
						type="button"
						class="btn-icon size-8 hover:preset-tonal"
						aria-label="Dismiss"
						onclick={() => (removed = null)}
					>
						<XMark size="16" aria-hidden="true" />
					</button>
				</div>
			{/if}
			<button
				id={fieldId('projects')}
				type="button"
				class="btn preset-tonal-primary"
				disabled={atProjectLimit}
				onclick={addProject}
			>
				<Plus size="18" aria-hidden="true" />
				Add project
			</button>
		</section>
	</div>
	<p class="sr-only" aria-live="polite">{announcement}</p>
</form>

<!-- Footer -->
<div
	class="border-t border-surface-200-800 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"
>
	{#if confirming}
		<div
			class="flex flex-wrap items-center justify-end gap-x-3 gap-y-2"
			role="group"
			aria-labelledby="{uid}-confirm"
		>
			<p id="{uid}-confirm" class="me-auto min-w-0 font-medium">
				{#if confirming === 'close'}
					Discard your changes?
				{:else if confirming === 'reset'}
					Discard this draft?
				{:else}
					Delete “{savedTitle}”? This cannot be undone.
				{/if}
			</p>
			<div class="flex gap-2">
				<button
					bind:this={confirmButton}
					type="button"
					class="btn preset-tonal"
					disabled={busy}
					onclick={cancelConfirm}
				>
					{confirming === 'close'
						? 'Keep editing'
						: confirming === 'reset'
							? 'Keep draft'
							: 'Cancel'}
				</button>
				{#if confirming === 'close'}
					<button type="button" class="btn preset-filled-error-500" onclick={discardAndClose}>
						Discard
					</button>
				{:else if confirming === 'reset'}
					<button type="button" class="btn preset-filled-error-500" onclick={resetForm}>
						Discard
					</button>
				{:else}
					<button
						type="button"
						class="btn preset-filled-error-500"
						disabled={busy}
						onclick={deleteExperience}
					>
						{#if status === 'deleting'}
							<ArrowPath
								size="16"
								class="animate-spin motion-reduce:animate-none"
								aria-hidden="true"
							/>
							Deleting…
						{:else}
							Delete
						{/if}
					</button>
				{/if}
			</div>
		</div>
	{:else}
		<div class="flex flex-wrap items-center justify-end gap-2">
			{#if mode === 'edit'}
				<button
					type="button"
					class="btn me-auto text-error-700-300 hover:preset-tonal-error"
					data-footer="delete"
					disabled={busy}
					onclick={() => openConfirm('delete')}
				>
					<Trash size="18" aria-hidden="true" />
					Delete
				</button>
			{:else if dirty}
				<button
					type="button"
					class="btn me-auto px-2 underline hover:preset-tonal"
					data-footer="discard"
					disabled={busy}
					onclick={() => openConfirm('reset')}
				>
					<span class="sm:hidden">Discard</span>
					<span class="max-sm:hidden">Discard draft</span>
				</button>
			{/if}
			<button
				type="button"
				class="btn preset-tonal"
				data-footer="cancel"
				disabled={busy}
				onclick={requestClose}
			>
				Cancel
			</button>
			<button
				type="submit"
				form={formId}
				class="btn preset-filled-primary-500 {status === 'saving' ? 'disabled:opacity-100' : ''}"
				disabled={busy}
			>
				{#if status === 'saving'}
					<ArrowPath size="18" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
					Saving…
				{:else}
					{mode === 'add' ? 'Add experience' : 'Save changes'}
				{/if}
			</button>
		</div>
	{/if}
</div>
