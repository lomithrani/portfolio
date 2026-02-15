<script lang="ts">
	import type { Experience as ExperienceModel } from 'portfolio-api/models/database';
	import type { PageData } from './$types';
	import { Plus } from 'svelte-heros-v2';
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import Experience from '$components/Experience.svelte';
	import ExperienceModal from '$components/modals/ExperienceModal.svelte';
	import Filters from './Filters.svelte';
	import { authenticationStore } from '$services/stores';
	import { browser } from '$app/environment';
	import { filterExperiences } from '$services/filters';

	let { data }: { data: PageData } = $props();

	let mounted = $state(false);
	$effect(() => {
		mounted = true;
	});

	let isAdmin = $derived(
		mounted &&
			browser &&
			$authenticationStore.user?._id != null &&
			data?.domain?.admin != null &&
			$authenticationStore.user._id == data.domain.admin
	);
	let showAddModal = $state(false);
	let filters: { softSkills: Set<string>; hardSkills: Set<string> } = $state({
		softSkills: new Set(),
		hardSkills: new Set()
	});

	let experiences: ExperienceModel[] | undefined = $derived.by(() => {
		if (!data?.domain?.experiences) return undefined;
		return filterExperiences(data.domain.experiences, filters);
	});

	const onAddResponse = (response: ExperienceModel | undefined) => {
		if (response !== undefined) {
			data.domain?.experiences.push(response);
			data.domain = data.domain;
		}
		showAddModal = false;
	};

	$effect(() => {
		if (data.domain?.experiences.length === 0) {
			showAddModal = true;
		}
	});
</script>

<svelte:head>
	<title>Louis Gentil | Resume</title>
	<meta
		name="Louis Gentil Resume"
		content="All of my professional experiences, as well as my personal and educational projects and courses."
	/>
</svelte:head>
<div class="relative flex items-start p-4 md:p-6">
	<div class="mx-auto w-full max-w-4xl space-y-4">
		{#if !experiences}
			<p class="text-center text-surface-600-400">Loading...</p>
		{/if}
		{#if experiences}
			<Filters bind:filters allExperiences={data.domain!.experiences} />

			{#if !showAddModal && isAdmin}
				<button
					class="btn-icon btn-icon-sm preset-filled-primary-700-300 fixed bottom-2 right-6 z-10 shadow-lg"
					onclick={() => (showAddModal = true)}
				>
					<Plus size="18" class="stroke-[3]" />
					<span class="sr-only">Add Experience</span>
				</button>
			{/if}
			{#each experiences as experience}
				<Experience {experience} canEdit={isAdmin} activeFilters={filters} />
			{/each}
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
