<script lang="ts">
	import type { Experience as ExperienceModel } from 'portfolio-api/models/database';

	import Project from './Project.svelte';
	import { getModalStore, type ModalSettings } from '@skeletonlabs/skeleton';
	import { PencilSquare } from 'svelte-heros-v2';

	export let experience: ExperienceModel;
	export let canEdit: boolean = false;

	const modalStore = getModalStore();

	const showEditExperienceModal = () => {
		const modal: ModalSettings = {
			type: 'component',
			component: 'experienceModal',
			title: 'Experience',
			body: 'Edit an experience from your resume.',
			response: (response: ExperienceModel) => {
				if (response !== undefined) {
					experience = response;
				} else {
					// Click on overlay
				}
			},
			meta: {
				experience
			}
		};
		modalStore.trigger(modal);
	};
</script>

<div class="relative block card card-hover text-left variant-ghost-primary p-2 m-1">
	{#if canEdit}
		<button
			class="absolute top-2 right-2 bg-blue-500 text-white p-1 rounded"
			on:click={showEditExperienceModal}
		>
			<PencilSquare />
		</button>
	{/if}
	<article>
		<h2 id={`${experience._id}`}>{experience.title}</h2>
		<p>{experience.summary}</p>

		<ul>
			{#each experience.projects as project}
				<Project {project} experienceId={`${experience._id}`} />
			{/each}
		</ul>
	</article>
</div>
