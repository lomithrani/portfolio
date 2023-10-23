<script lang="ts">
	import type { Experience as ExperienceModel } from 'portfolio-api/models/database';
	import type { PageData } from './$types';
	import { PlusCircle } from 'svelte-heros-v2';
	import {
		TableOfContents,
		tocCrawler,
		type ModalComponent,
		type ModalSettings,
		getModalStore
	} from '@skeletonlabs/skeleton';
	import Experience from '$components/Experience.svelte';
	import Filters from './Filters.svelte';
	import CreateExperienceModal from '$components/modals/CreateExperienceModal.svelte';

	export let data: PageData;
	const modalStore = getModalStore();
	let filters: { softSkills: Set<string>; hardSkills: Set<string> } = {
		softSkills: new Set(),
		hardSkills: new Set()
	};
	let experiences: ExperienceModel[] | undefined = undefined;

	$: if (data?.domain) filterExperiences();
	$: if (filters) filterExperiences();

	const showAddExperienceModal = () => {
		const modalComponent: ModalComponent = { ref: CreateExperienceModal };
		const modal: ModalSettings = {
			type: 'component',
			component: modalComponent,
			title: 'Add new Experience',
			response: (response: ExperienceModel) => {
				data.domain?.experiences.push(response);
				data.domain = data.domain;
			}
		};
		modalStore.trigger(modal);
	};
	const filterExperiences = () => {
		if (filters.softSkills.size === 0 && filters.hardSkills.size === 0) {
			return (experiences = data?.domain?.experiences);
		}
		if (data?.domain?.experiences === undefined) {
			return (experiences = undefined);
		}
		return (experiences = data.domain.experiences.filter((experience) =>
			experience.projects.some(
				(project) =>
					project.softSkills.some((softSkill) => filters.softSkills.has(softSkill.name)) ||
					project.hardSkills.some((hardSkill) => filters.hardSkills.has(hardSkill.name))
			)
		));
	};

	if (data.domain?.experiences.length === 0) {
		showAddExperienceModal();
	}
</script>

<svelte:head>
	<title>Louis Gentil | Resume</title>
	<meta
		name="Louis Gentil Resume"
		content="All of my professional experiences, as well as my personal and educational projects and courses."
	/>
</svelte:head>
<div class="relative layout-docs page-padding flex items-start gap-10">
	{#if !$modalStore[0]}
		<button
			class="absolute sticky top-0 left-0 m-2 px-4 py-2 bg-blue-500 text-white circle"
			on:click={showAddExperienceModal}
		>
			<PlusCircle />
		</button>
	{/if}
	<div
		class="layout-docs-content page-container-aside mx-auto"
		use:tocCrawler={{ mode: 'generate', scrollTarget: '#page' }}
	>
		{#if !experiences}
			Loading
		{/if}
		{#if experiences}
			<Filters bind:filters {experiences} />
			{#each experiences as experience}
				<Experience {experience} />
			{/each}
		{/if}
	</div>
	<aside class="layout-cols-aside sticky top-0 hidden lg:block space-y-1 w-72">
		<!-- Table of Contents -->
		<TableOfContents>{' '}</TableOfContents>
	</aside>
</div>
