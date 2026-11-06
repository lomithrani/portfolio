<script lang="ts">
	import type { Experience as ExperienceModel } from 'portfolio-api/models/database';
	import type { PageData } from './$types';
	import { afterNavigate, beforeNavigate, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { tick, untrack } from 'svelte';
	import { Briefcase, DocumentArrowUp, Plus } from 'svelte-heros-v2';
	import Experience from '#components/Experience.svelte';
	import ExperienceEditor from '#components/experience-editor/ExperienceEditor.svelte';
	import ResumeImport from '#components/resume-import/ResumeImport.svelte';
	import Filters from './Filters.svelte';
	import { portfolioApi } from '#services';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { isDomainAdmin } from '#services/authentication.ts';
	import type { FormData } from '#services/experienceForm.ts';
	import { importStorageKey, type ImportStatus } from '#services/resumeImport.ts';
	import {
		applyFilters,
		emptyFilters,
		filtersFromSearchParams,
		isSkillHighlighted,
		type ExperienceFilters
	} from '#services/filters.ts';
	import { sortExperiences } from '#services/experienceDates.ts';
	import { toaster } from '#services/toaster.ts';
	import { collectKnownSkills } from '#components/experience-list/experienceList.ts';

	let { data }: { data: PageData } = $props();

	// Admin-only UI appears once the session has been checked with the API (in the browser,
	// after hydration): never for a stale local session, and the SSR markup stays the same
	let isAdmin = $derived($sessionCheckedStore && isDomainAdmin($authenticationStore, data.domain));

	// A shared filtered link renders filtered on the server too (Filters keeps the URL in sync)
	let filters: ExperienceFilters = $state(filtersFromSearchParams(page.url.searchParams));
	// A link to this same page (e.g. the rail's "Experiences") keeps the component: follow its URL
	afterNavigate(({ type }) => {
		if (type !== 'enter') filters = filtersFromSearchParams(page.url.searchParams);
	});

	// `data` is replaced (not mutated) by invalidateAll(), which keeps these derivations fresh
	let allExperiences: ExperienceModel[] = $derived(sortExperiences(data.domain.experiences ?? []));
	let experiences: ExperienceModel[] = $derived(applyFilters(allExperiences, filters));
	let highlightSkill = $derived((displayName: string) => isSkillHighlighted(filters, displayName));
	let knownSkills = $derived(collectKnownSkills(allExperiences));

	let ownerName = $derived(
		data.domain.headerTitle ||
			data.domainName
				.split(/[.\-_]+/)
				.filter(Boolean)
				.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
				.join(' ')
	);

	// One editor for the page: Add, every card's Edit and the résumé import's Edit open it
	let editorOpen = $state(false);
	// Mounted once the owner is known, then kept: a 401 while saving clears the session (isAdmin
	// turns false) in the same tick as the editor closes, and unmounting the closing Dialog then
	// would let its focus trap read state of the destroyed component (Svelte's derived_inert)
	let editorMounted = $state(false);
	// Raw: the editor reads (and may clone) it, a deep $state proxy would get in the way
	let editing: ExperienceModel | null = $state.raw(null);
	// A draft of the résumé import to add (a new object per opening: the editor starts over)
	let editorInitialForm: FormData | null = $state.raw(null);
	// The import draft the editor is adding, marked as added once it is saved
	let importDraftId: string | null = null;
	let draftKey = $state('');
	let addButton: HTMLButtonElement | undefined = $state();

	const ownerKey = () => `${$authenticationStore.user?._id ?? ''}:${data.domain.name}`;

	const openEditor = (experience: ExperienceModel | null) => {
		editing = experience;
		editorInitialForm = null;
		importDraftId = null;
		// Fixed while the editor is open: a 401 clears the session, the draft must keep its key
		draftKey = ownerKey();
		editorOpen = true;
	};

	// --- Résumé import (owner only, when the API has it on) ---------------------------------
	let importStatus = $state<ImportStatus | null>(null);
	let importOpen = $state(false);
	let importKey = $state('');
	// The editor's drafts while it adds import drafts (one per draft, apart from the "Add
	// experience" one): what it keeps without saving goes back into the import's review
	let importEditorKey = $state('');
	const importDraftEditorKey = (draftId: string) => `${importEditorKey}:${draftId}`;
	// The toolbar's (or the empty state's) import button: the import dialog gives it the focus back
	let importTrigger: HTMLButtonElement | undefined = $state();
	let importHasReview = $state(false);
	let importDialog: ReturnType<typeof ResumeImport> | undefined = $state();
	// A kept review stays reachable even if the feature was turned off since
	let importAvailable = $derived(isAdmin && (!!importStatus?.enabled || importHasReview));

	const refreshImportStatus = async () => {
		try {
			const { data: status } = await portfolioApi.experiences.import.get({
				fetch: { credentials: 'include' }
			});
			if (status) importStatus = status;
		} catch {
			// Unknown for now: the button stays as it was
		}
	};

	$effect(() => {
		if (!isAdmin) return;
		untrack(() => {
			importKey = importStorageKey(String($authenticationStore.user?._id ?? ''), data.domain.name);
			importEditorKey = `${ownerKey()}:import`;
			editorMounted = true;
			refreshImportStatus();
		});
	});

	// The editor takes the import's place while it adds one of its drafts (one dialog at a time:
	// an open dialog makes the rest of the page inert, the other dialog included)
	const editImportDraft = (draftId: string, form: FormData) => {
		editing = null;
		editorInitialForm = form;
		importDraftId = draftId;
		draftKey = importDraftEditorKey(draftId);
		importOpen = false;
		editorOpen = true;
	};

	const closeEditor = () => {
		editorOpen = false;
		// Back to the import's review
		if (importDraftId) importOpen = true;
		importDraftId = null;
	};

	beforeNavigate((navigation) => {
		// Drafts being added (or a résumé being read): leaving now would lose track of what was
		// published, and adding them again later would publish them twice. Back, a link or a reload
		// waits (the browser asks before a reload or closing the tab)
		if (importDialog?.isBusy()) {
			navigation.cancel();
			return;
		}
		// Close the dialogs before the page unmounts: an open Dialog's focus trap would otherwise
		// read state of the destroyed page (Svelte's derived_inert warning)
		editorOpen = false;
		importOpen = false;
	});

	let highlightedId: string | null = $state(null);
	let highlightTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => () => clearTimeout(highlightTimer));

	/** Scrolls a card into view and outlines it briefly; false when it is not listed */
	const reveal = (id: string): boolean => {
		const card = document.getElementById(`experience-${id}`);
		if (!card) return false;
		const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		card.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'start' });
		highlightedId = id;
		clearTimeout(highlightTimer);
		highlightTimer = setTimeout(() => (highlightedId = null), 2500);
		return true;
	};

	/**
	 * After a dialog closed: the focus went back to the button that opened it, unless that button
	 * is gone (the empty state's, once the first experience is in). Then the new card's Edit button
	 * takes it, rather than the page's body.
	 */
	const keepFocusInPage = async (id: string) => {
		// The closed dialog's focus trap gives the focus back in a timeout: after it
		await new Promise((resolve) => setTimeout(resolve));
		const active = document.activeElement;
		if (active && active !== document.body && active.isConnected) return;
		const edit = document.querySelector<HTMLElement>(`#experience-${id} [data-edit-experience]`);
		(edit ?? addButton)?.focus({ preventScroll: true });
	};

	const clearFiltersAndReveal = async (id: string) => {
		filters = emptyFilters();
		await tick();
		reveal(id);
	};

	/** Toasts what was saved, after scrolling to it (or offering to clear the filters hiding it) */
	const announceSaved = (id: string, title: string, hidden: string) => {
		if (reveal(id)) {
			toaster.success({ title });
		} else {
			toaster.success({
				title,
				description: hidden,
				action: { label: 'Show it', onClick: () => void clearFiltersAndReveal(id) }
			});
		}
	};

	const onSaved = async (saved: ExperienceModel, mode: 'created' | 'updated') => {
		editorOpen = false;
		const id = String(saved._id);
		const fromImport = importDraftId;
		importDraftId = null;
		if (fromImport) {
			// Back to the review, unless that was its last draft
			const over = importDialog?.markAdded(fromImport) ?? false;
			if (!over) importOpen = true;
			await invalidateAll();
			await tick();
			if (!over) return;
		} else {
			await invalidateAll();
			await tick();
		}
		announceSaved(
			id,
			mode === 'created' ? 'Experience added' : 'Changes saved',
			'The current filters hide it.'
		);
		await keepFocusInPage(id);
	};

	/** Drafts of the résumé import were added; `done`: the import is over */
	const onImportAdded = async (ids: string[], done: boolean) => {
		if (done) importOpen = false;
		await invalidateAll();
		await tick();
		const title = ids.length === 1 ? 'Experience added' : `${ids.length} experiences added`;
		// Still open: the review lists what failed, and the toast would sit under it
		if (!done) return;
		announceSaved(
			ids[0],
			title,
			ids.length === 1 ? 'The current filters hide it.' : 'The current filters hide them.'
		);
		await keepFocusInPage(ids[0]);
	};

	const onDeleted = async () => {
		editorOpen = false;
		await invalidateAll();
		toaster.success({ title: 'Experience deleted' });
		await tick();
		// The deleted card held the focus (its Edit button): keep it in the page
		if (!document.activeElement || document.activeElement === document.body) {
			addButton?.focus({ preventScroll: true });
		}
	};

	// Small screens: a floating "Add experience" button once the toolbar has scrolled away
	let toolbar: HTMLElement | undefined = $state();
	let toolbarVisible = $state(true);
	$effect(() => {
		const element = toolbar;
		if (!element) {
			toolbarVisible = true;
			return;
		}
		const observer = new IntersectionObserver(([entry]) => {
			toolbarVisible = entry.isIntersecting;
		});
		observer.observe(element);
		return () => observer.disconnect();
	});
</script>

<svelte:head>
	<title>{ownerName} | Resume</title>
	<meta
		name="description"
		content={`${ownerName}: professional experiences, personal and educational projects and courses.`}
	/>
</svelte:head>

<!-- Owners get extra bottom space: neither the floating button (small screens, with the toasts
	above it) nor the toasts (bottom-end) hide the end of the list, e.g. the Edit button of a card
	just added last -->
<div class="p-4 md:p-6 {isAdmin ? 'pb-40 md:pb-24' : ''}">
	<div class="mx-auto w-full max-w-4xl space-y-4">
		{#if allExperiences.length === 0}
			{#if isAdmin}
				<section
					class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-4 p-6 text-center md:p-10"
					aria-labelledby="empty-owner-title"
				>
					<div
						class="mx-auto flex size-12 items-center justify-center rounded-full preset-tonal-primary"
					>
						<Briefcase size="24" aria-hidden="true" />
					</div>
					<h2 id="empty-owner-title" class="text-xl font-bold">
						Your portfolio has no experiences yet
					</h2>
					<p class="mx-auto max-w-md text-surface-700-300">
						Add your jobs, studies and projects. Visitors see them here, the most recent first.
					</p>
					<div class="flex flex-wrap justify-center gap-3">
						<button
							type="button"
							class="btn preset-filled-primary-700-300 min-h-11"
							onclick={() => openEditor(null)}
							bind:this={addButton}
						>
							<Plus size="18" aria-hidden="true" />
							Add your first experience
						</button>
						{#if importAvailable}
							{@render importButton('min-h-11')}
						{/if}
					</div>
				</section>
			{:else}
				<section
					class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-3 p-6 text-center md:p-10"
					aria-labelledby="empty-visitor-title"
				>
					<div
						class="mx-auto flex size-12 items-center justify-center rounded-full preset-tonal-primary"
					>
						<Briefcase size="24" aria-hidden="true" />
					</div>
					<h2 id="empty-visitor-title" class="text-xl font-bold">
						No experiences have been published yet.
					</h2>
					<p class="mx-auto max-w-md text-surface-700-300">
						This portfolio is still being written. Have a project in mind? Let’s talk.
					</p>
					<a
						href={resolve('/[domain]/hire', { domain: data.domain.name })}
						class="btn preset-tonal-primary min-h-11"
					>
						Get in touch
					</a>
				</section>
			{/if}
		{:else}
			{#if isAdmin}
				<div class="flex flex-wrap items-center justify-between gap-3" bind:this={toolbar}>
					<h2 class="text-xl font-bold md:text-2xl">Experience</h2>
					<!-- Phones: both buttons share a row under the heading -->
					<div class="flex flex-wrap gap-2 max-sm:w-full">
						{#if importAvailable}
							{@render importButton('min-h-10 max-sm:flex-1')}
						{/if}
						<button
							type="button"
							class="btn preset-filled-primary-700-300 min-h-10 max-sm:flex-1"
							onclick={() => openEditor(null)}
							bind:this={addButton}
						>
							<Plus size="18" aria-hidden="true" />
							Add experience
						</button>
					</div>
				</div>
			{/if}

			<Filters experiences={allExperiences} bind:filters resultCount={experiences.length} />

			{#each experiences as experience (String(experience._id))}
				<Experience
					{experience}
					canEdit={isAdmin}
					onEdit={() => openEditor(experience)}
					{highlightSkill}
					highlighted={highlightedId === String(experience._id)}
				/>
			{:else}
				<div class="card preset-outlined-surface-200-800 space-y-3 p-6 text-center">
					<p class="text-surface-700-300">No experience matches these filters.</p>
					<button
						type="button"
						class="btn preset-tonal min-h-10"
						onclick={() => (filters = emptyFilters())}
					>
						Clear filters
					</button>
				</div>
			{/each}
		{/if}
	</div>
</div>

{#if isAdmin && allExperiences.length > 0 && !toolbarVisible}
	<button
		type="button"
		class="fab btn preset-filled-primary-700-300 fixed z-10 h-12 rounded-full px-5 shadow-xl md:hidden"
		data-add-fab
		onclick={() => openEditor(null)}
	>
		<Plus size="20" aria-hidden="true" />
		Add experience
	</button>
{/if}

{#snippet importButton(classes: string)}
	<button
		type="button"
		class="btn preset-tonal {classes}"
		onclick={() => (importOpen = true)}
		bind:this={importTrigger}
	>
		<DocumentArrowUp size="18" aria-hidden="true" />
		{#if importHasReview}
			Continue import
		{:else}
			<!-- "Import résumé" on phones, to fit next to "Add experience". The spaces stay outside
				the inner span: Svelte trims those at the edges of a tag -->
			<span>Import <span class="max-sm:hidden">from</span> résumé</span>
		{/if}
	</button>
{/snippet}

<!-- Mounted for the owner; kept after a 401 cleared the session (the drafts and form stay) -->
{#if editorMounted}
	<ResumeImport
		bind:this={importDialog}
		open={importOpen}
		status={importStatus}
		storageKey={importKey}
		existing={allExperiences}
		{knownSkills}
		onClose={() => (importOpen = false)}
		onEditDraft={editImportDraft}
		onAdded={onImportAdded}
		onQuota={(quota) => {
			if (importStatus) importStatus = { ...importStatus, ...quota };
		}}
		refreshStatus={refreshImportStatus}
		editorDraftKey={importDraftEditorKey}
		finalFocusEl={() => (importTrigger?.isConnected ? importTrigger : null)}
		onReviewChange={(hasReview) => (importHasReview = hasReview)}
	/>
	<ExperienceEditor
		open={editorOpen}
		experience={editing}
		initialForm={editorInitialForm}
		{draftKey}
		{knownSkills}
		onClose={closeEditor}
		{onSaved}
		{onDeleted}
	/>
{/if}

<style>
	.fab {
		bottom: calc(1rem + env(safe-area-inset-bottom));
		right: calc(1rem + env(safe-area-inset-right));
	}

	/* While the floating button shows (small screens), the toasts (bottom-end) sit above it rather
		than over it. The group's own offset is an inline style */
	@media (max-width: 47.999rem) {
		:global(body:has([data-add-fab]) [data-scope='toast'][data-part='group'][data-side='bottom']) {
			bottom: calc(5rem + env(safe-area-inset-bottom, 0px)) !important;
		}
	}
</style>
