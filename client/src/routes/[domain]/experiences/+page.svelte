<script lang="ts">
	import type { Experience as ExperienceModel } from 'portfolio-api/models/database';
	import type { PageData } from './$types';
	import { afterNavigate, beforeNavigate, invalidateAll, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { onMount, tick, untrack } from 'svelte';
	import { Briefcase, DocumentArrowUp, Plus } from 'svelte-heros-v2';
	import Experience from '#components/Experience.svelte';
	import ExperienceEditor from '#components/experience-editor/ExperienceEditor.svelte';
	import ProjectPreview from '#components/experience-list/ProjectPreview.svelte';
	import Timeline from '#components/experience-timeline/Timeline.svelte';
	import ResumeImport from '#components/resume-import/ResumeImport.svelte';
	import Filters from './Filters.svelte';
	import ViewSwitch from './ViewSwitch.svelte';
	import { portfolioApi } from '#services';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { isDomainAdmin } from '#services/authentication.ts';
	import type { FormData } from '#services/experienceForm.ts';
	import { importStorageKey, type ImportStatus } from '#services/resumeImport.ts';
	import {
		activeFilters,
		applyFilters,
		emptyFilters,
		experienceUsesSkill,
		filtersFromSearchParams,
		isSkillHighlighted,
		type ExperienceFilters
	} from '#services/filters.ts';
	import { sortExperiences } from '#services/experienceDates.ts';
	import {
		viewFromSearchParams,
		viewToSearchParams,
		type ExperienceView
	} from '#services/timeline.ts';
	import { toaster } from '#services/toaster.ts';
	import { collectKnownSkills } from '#components/experience-list/experienceList.ts';

	let { data }: { data: PageData } = $props();

	// Admin-only UI appears once the session has been checked with the API (in the browser,
	// after hydration): never for a stale local session, and the SSR markup stays the same
	let isAdmin = $derived($sessionCheckedStore && isDomainAdmin($authenticationStore, data.domain));
	// "Hire me" is for everyone but the owner. The server renders it (it cannot know the visitor);
	// in the browser it steps aside as soon as the kept session says this is the owner's own
	// portfolio, before the API confirms it (a stale session is cleared, and brings it back)
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});
	let maybeOwner = $derived(hydrated && isDomainAdmin($authenticationStore, data.domain));

	// A shared filtered link renders filtered on the server too (Filters keeps the URL in sync)
	let filters: ExperienceFilters = $state(filtersFromSearchParams(page.url.searchParams));
	// The list, or the timeline (`?view=timeline`: a shared link opens on it, on the server too)
	let view: ExperienceView = $state(viewFromSearchParams(page.url.searchParams));
	// A link to this same page (e.g. the rail's "Experiences") keeps the component: follow its URL
	afterNavigate(({ type }) => {
		if (type === 'enter') return;
		filters = filtersFromSearchParams(page.url.searchParams);
		view = viewFromSearchParams(page.url.searchParams);
	});

	// The URL follows the view, as it follows the filters (see Filters.svelte for why replaceState,
	// why the browser's URL is the one to compare with, and why the first run is skipped)
	let viewUrlReady = false;
	$effect(() => {
		const next = view;
		if (!viewUrlReady) {
			viewUrlReady = true;
			return;
		}
		const current = new URLSearchParams(location.search);
		const search = viewToSearchParams(next, current).toString();
		if (search === current.toString()) return;
		untrack(() => {
			const domain = page.params.domain;
			if (!domain) return;
			const target = search
				? resolve(`/[domain]/experiences?${search}`, { domain })
				: resolve('/[domain]/experiences', { domain });
			replaceState(target, page.state).catch(() => {});
		});
	});

	// `data` is replaced (not mutated) by invalidateAll(), which keeps these derivations fresh
	let allExperiences: ExperienceModel[] = $derived(sortExperiences(data.domain.experiences ?? []));
	let experiences: ExperienceModel[] = $derived(applyFilters(allExperiences, filters));
	// Without the selections no experience has any more (see activeFilters)
	let active = $derived(activeFilters(allExperiences, filters));
	let highlightSkill = $derived((displayName: string) => isSkillHighlighted(active, displayName));
	let knownSkills = $derived(collectKnownSkills(allExperiences));

	// Key of the skill whose tag is hovered or focused (ProjectPreview): its projects are outlined,
	// in the cards and on the timeline, and the list's other cards step back
	let previewSkill: string | null = $state(null);
	// The list's other cards only step back when a listed card has that skill: the filters' tags
	// name every skill, those of the experiences the current filters hide too
	let previewListed = $derived.by(() => {
		const key = previewSkill;
		return key !== null && experiences.some((experience) => experienceUsesSkill(experience, key));
	});

	// --- Timeline view ------------------------------------------------------------------------
	// The experience picked on the timeline: its card shows under it
	let selectedId: string | null = $state(null);
	let selectedExperience = $derived(
		allExperiences.find((experience) => String(experience._id) === selectedId) ?? null
	);
	// The project picked on the timeline (its position in the selected experience), outlined briefly
	let revealedProject: number | null = $state(null);
	let revealedProjectTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => () => clearTimeout(revealedProjectTimer));

	const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	/** A bar of the timeline was pressed: shows the experience's card, at the project if one was */
	const selectOnTimeline = async (experienceId: string, projectIndex?: number) => {
		selectedId = experienceId;
		clearTimeout(revealedProjectTimer);
		revealedProject = projectIndex ?? null;
		if (projectIndex !== undefined) {
			revealedProjectTimer = setTimeout(() => (revealedProject = null), 2500);
		}
		await tick();
		const card = document.getElementById(`experience-${experienceId}`);
		const project =
			projectIndex === undefined
				? null
				: card?.querySelector(`[data-project-index="${projectIndex}"]`);
		// Only as far as needed: a card already in sight stays where it is
		(project ?? card)?.scrollIntoView({
			behavior: prefersReducedMotion() ? 'instant' : 'smooth',
			block: 'nearest'
		});
	};

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
		card.scrollIntoView({
			behavior: prefersReducedMotion() ? 'instant' : 'smooth',
			block: 'start'
		});
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
	const announceSaved = async (id: string, title: string, hidden: string) => {
		// The timeline shows one card, the selected experience's: what was saved becomes it
		if (view === 'timeline') {
			selectedId = id;
			revealedProject = null;
			await tick();
		}
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
		await announceSaved(
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
		await announceSaved(
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

<!-- The page's floating corner: the view switch, and next to it what this visitor is most likely
	here for: "Hire me" for a visitor, "Add experience" for the owner on a small screen once the
	toolbar has scrolled away. First in the page, so the keyboard reaches it before the list.
	Always one row (the page's bottom padding and the toasts count on its height): the owner's
	button reads "Add" there, and the view switch drops its labels on the narrowest screens -->
{#if allExperiences.length > 0}
	<div
		class="dock pointer-events-none fixed z-10 flex items-stretch justify-end gap-2"
		data-page-dock
	>
		<ViewSwitch bind:view class="pointer-events-auto shadow-xl" />
		{#if isAdmin}
			{#if !toolbarVisible}
				<button
					type="button"
					class="btn preset-filled-primary-700-300 pointer-events-auto min-h-11 px-5 shadow-xl md:hidden"
					data-add-fab
					onclick={() => openEditor(null)}
				>
					<Plus size="20" aria-hidden="true" />
					<!-- "Add" to fit the row; the space stays outside the inner span (Svelte trims those at
						the edges of a tag) -->
					<span>Add <span class="sr-only">experience</span></span>
				</button>
			{/if}
		{:else if !maybeOwner}
			<a
				href={resolve('/[domain]/hire', { domain: data.domain.name })}
				class="btn preset-filled-primary-700-300 pointer-events-auto min-h-11 px-5 font-semibold shadow-xl"
				data-hire-me
			>
				<Briefcase size="20" aria-hidden="true" />
				Hire me
			</a>
		{/if}
	</div>
{/if}

<!-- Bottom space for the floating corner: it never hides the end of the list. Owners get more
	on small screens, where the toasts (bottom-end) sit above it: e.g. the Edit button of a card
	just added last stays in reach. (Each with its own md: variant: md:p-6 would win over a bare
	pb-24 on wide screens) -->
<div
	class="p-4 md:p-6 {allExperiences.length === 0
		? ''
		: isAdmin
			? 'pb-40 md:pb-24'
			: 'pb-24 md:pb-24'}"
>
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
			<!-- The owner's heading and buttons (phones: the buttons share a row under it). Visitors
				have neither: their page starts with the filters -->
			{#if isAdmin}
				<div class="flex flex-wrap items-center gap-3">
					<h2 class="text-xl font-bold md:text-2xl">Experiences</h2>
					<div class="ml-auto flex flex-wrap gap-2 max-sm:w-full" bind:this={toolbar}>
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

			{#if view === 'list'}
				{#each experiences as experience (String(experience._id))}
					<Experience
						{experience}
						canEdit={isAdmin}
						onEdit={() => openEditor(experience)}
						{highlightSkill}
						highlighted={highlightedId === String(experience._id)}
						{previewSkill}
						muted={previewListed &&
							previewSkill !== null &&
							!experienceUsesSkill(experience, previewSkill)}
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
		{/if}
	</div>

	{#if view === 'timeline' && allExperiences.length > 0}
		<!-- Wider than the list: the years need the room. Every experience is on it: the filters
			make their projects stand out instead of hiding the others -->
		<div class="mx-auto mt-4 w-full max-w-7xl">
			<Timeline
				experiences={allExperiences}
				filters={active}
				{previewSkill}
				{selectedId}
				onSelect={selectOnTimeline}
			/>
		</div>
		<div class="mx-auto mt-4 w-full max-w-4xl">
			{#if selectedExperience}
				{#key selectedId}
					<Experience
						experience={selectedExperience}
						canEdit={isAdmin}
						onEdit={() => openEditor(selectedExperience)}
						{highlightSkill}
						highlighted={highlightedId === selectedId}
						{revealedProject}
						{previewSkill}
					/>
				{/key}
			{/if}
		</div>
	{/if}
</div>

<!-- The projects behind a skill tag (or a bar of the timeline) while it is hovered or focused -->
{#if allExperiences.length > 0}
	<ProjectPreview experiences={allExperiences} {view} onSkill={(key) => (previewSkill = key)} />
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
	/* Clear of the page's scrollbar on wide screens (it belongs to <main>, under the corner) */
	.dock {
		bottom: calc(1rem + env(safe-area-inset-bottom));
		right: calc(1rem + env(safe-area-inset-right));
		left: calc(1rem + env(safe-area-inset-left));
	}
	@media (min-width: 48rem) {
		.dock {
			right: calc(1.5rem + env(safe-area-inset-right));
		}
	}

	/* What the page scrolls into view (a project picked on the timeline, the focused element)
		stops above the floating corner, not under it. <main id="page"> is the page's scroller */
	:global(main#page:has([data-page-dock])) {
		scroll-padding-bottom: 5rem;
	}

	/* The toasts (bottom-end) sit above the floating corner rather than over it. The group's own
		offset is an inline style */
	:global(body:has([data-page-dock]) [data-scope='toast'][data-part='group'][data-side='bottom']) {
		bottom: calc(5rem + env(safe-area-inset-bottom, 0px)) !important;
	}
</style>
