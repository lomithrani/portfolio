<script lang="ts">
	import type { Experience as ExperienceModel } from 'portfolio-api/models/database';

	import Project from './Project.svelte';
	import ExperienceModal from './modals/ExperienceModal.svelte';
	import { Dialog } from '@skeletonlabs/skeleton-svelte';
	import { PencilSquare } from 'svelte-heros-v2';
	import { marked } from 'marked';

	let { experience, canEdit = false }: { experience: ExperienceModel; canEdit?: boolean } = $props();

	let showEditModal = $state(false);

	const onEditResponse = (response: ExperienceModel | undefined) => {
		if (response !== undefined) {
			experience = response;
		}
		showEditModal = false;
	};
</script>

<div class="preset-outlined-surface-200-800 relative block rounded-lg p-2 m-1 text-left hover:brightness-110 transition-all">
	{#if canEdit}
		<button
			class="absolute top-2 right-2 bg-blue-500 text-white p-1 rounded"
			onclick={() => showEditModal = true}
		>
			<PencilSquare />
		</button>
	{/if}
	<article>
		<h2 id={`${experience._id}`}>{experience.title}</h2>
		<div class="summary">
			{@html marked(experience.summary)}
		</div>
		<ul>
			{#each experience.projects as project}
				<Project {project} experienceId={`${experience._id}`} />
			{/each}
		</ul>
	</article>
</div>

<Dialog open={showEditModal} onOpenChange={(details) => showEditModal = details.open}>
	<Dialog.Backdrop />
	<Dialog.Positioner>
		<Dialog.Content>
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
</Dialog>

<style>
	.summary ul {
		list-style: disc;
		padding-left: 20px;
	}
</style>
