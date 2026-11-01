<script lang="ts">
	import type { Experience as ExperienceModel } from 'portfolio-api/models/database';
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { Plus } from 'svelte-heros-v2';
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import Experience from '$components/Experience.svelte';
	import ExperienceModal from '$components/modals/ExperienceModal.svelte';
	import Filters from './Filters.svelte';
	import { authenticationStore } from '$services/stores';
	import { isDomainAdmin } from '$services/authentication';
	import { filterExperiences, type SkillFilters } from '$services/filters';

	let { data }: { data: PageData } = $props();

	// Admin-only UI appears after hydration, so the server and client markup match
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});

	let isAdmin = $derived(mounted && isDomainAdmin($authenticationStore, data.domain));
	let showAddModal = $state(false);
	let filters: SkillFilters = $state({
		softSkills: new Set(),
		hardSkills: new Set()
	});

	// `data` is replaced (not mutated) by invalidateAll(), which keeps these derivations fresh
	let allExperiences: ExperienceModel[] = $derived(data.domain.experiences ?? []);
	let experiences: ExperienceModel[] = $derived(filterExperiences(allExperiences, filters));

	let ownerName = $derived(
		data.domain.headerTitle ||
			data.domainName
				.split(/[.\-_]+/)
				.filter(Boolean)
				.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
				.join(' ')
	);

	const onAddResponse = async (response: ExperienceModel | undefined) => {
		showAddModal = false;
		// The POST response is not populated (skills are ids): reload the domain instead
		if (response !== undefined) await invalidateAll();
	};

	// Invite the domain admin (and only them) to add a first experience
	$effect(() => {
		if (isAdmin && allExperiences.length === 0) {
			showAddModal = true;
		}
	});
</script>

<svelte:head>
	<title>{ownerName} | Resume</title>
	<meta
		name="description"
		content={`${ownerName}: professional experiences, personal and educational projects and courses.`}
	/>
</svelte:head>
<div class="relative flex items-start p-4 md:p-6">
	<div class="mx-auto w-full max-w-4xl space-y-4">
		{#if allExperiences.length === 0}
			<p class="text-center text-surface-600-400">No experiences have been published yet.</p>
		{:else}
			<Filters bind:filters {allExperiences} />
			{#each experiences as experience (String(experience._id))}
				<Experience {experience} canEdit={isAdmin} activeFilters={filters} />
			{/each}
		{/if}

		{#if !showAddModal && isAdmin}
			<button
				class="btn-icon btn-icon-sm preset-filled-primary-700-300 fixed bottom-2 right-6 z-10 shadow-lg"
				onclick={() => (showAddModal = true)}
			>
				<Plus size="18" class="stroke-[3]" />
				<span class="sr-only">Add Experience</span>
			</button>
		{/if}
	</div>
</div>

<Dialog open={showAddModal} onOpenChange={(details) => (showAddModal = details.open)}>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex justify-center items-center p-4">
			<Dialog.Content
				class="card bg-surface-100-900 w-full max-w-xl shadow-xl max-h-[calc(100vh-2rem)] overflow-y-auto"
			>
				{#if showAddModal}
					<ExperienceModal
						title="Experience"
						body="Add a new experience to your resume."
						onResponse={onAddResponse}
						onClose={() => (showAddModal = false)}
					/>
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
