<script lang="ts">
	import type { Experience as ExperienceModel } from 'portfolio-api/models/database';
	import type { PageData } from './$types';
	import { PlusCircle } from 'svelte-heros-v2';
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import Experience from '$components/Experience.svelte';
	import ExperienceModal from '$components/modals/ExperienceModal.svelte';
	import Filters from './Filters.svelte';
	import { authenticationStore } from '$services/stores';
	import { browser } from '$app/environment';
	import { filterExperiences } from '$services/filters';

	let { data }: { data: PageData } = $props();

	let mounted = $state(false);
	$effect(() => { mounted = true; });

	let isAdmin = $derived(
		mounted && browser &&
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
<div class="relative flex items-start gap-10 p-4">
	<div class="mx-auto text-center flex-1">
		{#if !experiences}
			Loading
		{/if}
		{#if experiences}
			<Filters bind:filters {experiences} />

			{#if !showAddModal && isAdmin}
				<button class="sticky bg-blue-500 text-white p-1 rounded" onclick={() => showAddModal = true}>
					<PlusCircle />
				</button>
			{/if}
			{#each experiences as experience}
				<Experience {experience} canEdit={isAdmin} />
			{/each}
		{/if}
	</div>
</div>

<Dialog open={showAddModal} onOpenChange={(details) => showAddModal = details.open}>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex justify-center items-center p-4">
			<Dialog.Content class="card bg-surface-100-900 w-full max-w-xl shadow-xl max-h-[calc(100vh-2rem)] overflow-y-auto">
				{#if showAddModal}
					<ExperienceModal
						title="Experience"
						body="Add a new experience to your resume."
						onResponse={onAddResponse}
						onClose={() => showAddModal = false}
					/>
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
