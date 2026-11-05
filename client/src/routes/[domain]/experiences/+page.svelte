<script lang="ts">
	import type { Experience as ExperienceModel } from 'portfolio-api/models/database';
	import type { PageData } from './$types';
	import { afterNavigate, beforeNavigate, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';
	import { Briefcase, Plus } from 'svelte-heros-v2';
	import Experience from '#components/Experience.svelte';
	import ExperienceEditor from '#components/experience-editor/ExperienceEditor.svelte';
	import Filters from './Filters.svelte';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { isDomainAdmin } from '#services/authentication.ts';
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

	// One editor for the page: Add and every card's Edit open it
	let editorOpen = $state(false);
	// Mounted once the owner is known, then kept: a 401 while saving clears the session (isAdmin
	// turns false) in the same tick as the editor closes, and unmounting the closing Dialog then
	// would let its focus trap read state of the destroyed component (Svelte's derived_inert)
	let editorMounted = $state(false);
	$effect(() => {
		if (isAdmin) editorMounted = true;
	});
	// Raw: the editor reads (and may clone) it, a deep $state proxy would get in the way
	let editing: ExperienceModel | null = $state.raw(null);
	let draftKey = $state('');
	let addButton: HTMLButtonElement | undefined = $state();

	const openEditor = (experience: ExperienceModel | null) => {
		editing = experience;
		// Fixed while the editor is open: a 401 clears the session, the draft must keep its key
		draftKey = `${$authenticationStore.user?._id ?? ''}:${data.domain.name}`;
		editorOpen = true;
	};

	// Close the dialog before the page unmounts: an open Dialog's focus trap would otherwise read
	// state of the destroyed page (Svelte's derived_inert warning)
	beforeNavigate(() => {
		editorOpen = false;
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

	const clearFiltersAndReveal = async (id: string) => {
		filters = emptyFilters();
		await tick();
		reveal(id);
	};

	const onSaved = async (saved: ExperienceModel, mode: 'created' | 'updated') => {
		editorOpen = false;
		await invalidateAll();
		await tick();
		const id = String(saved._id);
		const title = mode === 'created' ? 'Experience added' : 'Changes saved';
		if (reveal(id)) {
			toaster.success({ title });
		} else {
			toaster.success({
				title,
				description: 'The current filters hide it.',
				action: { label: 'Show it', onClick: () => void clearFiltersAndReveal(id) }
			});
		}
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

<!-- Owners get extra bottom space: neither the floating button (small screens) nor the toasts
	(bottom-end) hide the end of the list, e.g. the Edit button of a card just added last -->
<div class="p-4 md:p-6 {isAdmin ? 'pb-24 md:pb-24' : ''}">
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
					<!-- Actions row: room for more ways to add experiences -->
					<div class="flex flex-wrap justify-center gap-3">
						<button
							type="button"
							class="btn preset-filled-primary-500 min-h-11"
							onclick={() => openEditor(null)}
							bind:this={addButton}
						>
							<Plus size="18" aria-hidden="true" />
							Add your first experience
						</button>
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
					<button
						type="button"
						class="btn preset-filled-primary-500 min-h-10"
						onclick={() => openEditor(null)}
						bind:this={addButton}
					>
						<Plus size="18" aria-hidden="true" />
						Add experience
					</button>
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
		class="fab btn preset-filled-primary-500 fixed z-10 h-12 rounded-full px-5 shadow-xl md:hidden"
		onclick={() => openEditor(null)}
	>
		<Plus size="20" aria-hidden="true" />
		Add experience
	</button>
{/if}

<!-- Mounted for the owner; kept after a 401 cleared the session (the draft and form stay) -->
{#if editorMounted}
	<ExperienceEditor
		open={editorOpen}
		experience={editing}
		{draftKey}
		{knownSkills}
		onClose={() => (editorOpen = false)}
		{onSaved}
		{onDeleted}
	/>
{/if}

<style>
	.fab {
		bottom: calc(1rem + env(safe-area-inset-bottom));
		right: calc(1rem + env(safe-area-inset-right));
	}
</style>
