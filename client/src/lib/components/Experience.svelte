<script lang="ts">
	import type { Experience as ExperienceModel } from 'portfolio-api/models/database';

	import Project from './Project.svelte';
	import ExperienceModal from './modals/ExperienceModal.svelte';
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import { PencilSquare, Briefcase, User, AcademicCap, Heart } from 'svelte-heros-v2';
	import { ExperienceType } from 'portfolio-common';
	import { marked } from 'marked';

	const typeIcons: Record<ExperienceType, typeof Briefcase> = {
		[ExperienceType.Professional]: Briefcase,
		[ExperienceType.Personal]: User,
		[ExperienceType.Educational]: AcademicCap,
		[ExperienceType.Leisure]: Heart
	};

	let { experience, canEdit = false, activeFilters = { softSkills: new Set<string>(), hardSkills: new Set<string>() } }: {
		experience: ExperienceModel;
		canEdit?: boolean;
		activeFilters?: { softSkills: Set<string>; hardSkills: Set<string> };
	} = $props();

	let DefaultIcon = $derived(typeIcons[experience.type]);
	let showEditModal = $state(false);

	const onEditResponse = (response: ExperienceModel | undefined) => {
		if (response !== undefined) {
			experience = response;
		}
		showEditModal = false;
	};
</script>

<div class="card preset-outlined-surface-200-800 relative rounded-lg p-4 text-left shadow-md">
	{#if canEdit}
		<button
			class="btn-icon btn-icon-sm preset-tonal-primary absolute top-3 right-3"
			onclick={() => showEditModal = true}
		>
			<PencilSquare size="16" />
			<span class="sr-only">Edit</span>
		</button>
	{/if}
	<article class="space-y-3">
		<div class="flex items-center gap-2">
			{#if experience.icon}
				<img src={experience.icon} alt={experience.type} class="size-6" />
			{:else}
				<DefaultIcon size="24" />
			{/if}
			<h2 class="text-xl font-bold">{experience.title}</h2>
		</div>
		<div class="summary text-sm opacity-90">
			{@html marked(experience.summary)}
		</div>
		{#if experience.projects.length > 0}
			<div class="space-y-3 pt-2">
				{#each experience.projects as project}
					<Project {project} experienceId={`${experience._id}`} {activeFilters} />
				{/each}
			</div>
		{/if}
	</article>
</div>

<Dialog open={showEditModal} onOpenChange={(details) => showEditModal = details.open}>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex justify-center items-center p-4">
			<Dialog.Content class="card bg-surface-100-900 w-full max-w-xl shadow-xl max-h-[calc(100vh-2rem)] overflow-y-auto">
				{#if showEditModal}
					<ExperienceModal
						existingExperience={experience}
						title="Experience"
						body="Edit an experience from your resume."
						onResponse={onEditResponse}
						onClose={() => showEditModal = false}
					/>
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>

<style>
	.summary :global(ul) {
		list-style: disc;
		padding-left: 1.25rem;
	}
	.summary :global(p) {
		margin-bottom: 0.25rem;
	}
</style>
