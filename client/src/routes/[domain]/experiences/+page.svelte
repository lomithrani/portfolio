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
	import { isDomainAdmin } from '$services/authentication';

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
		const modal: ModalSettings = {
			type: 'component',
			component: 'experienceModal',
			title: 'Experience',
			body: 'Add a new experience to your resume.',
			response: (response: ExperienceModel) => {
				if (response !== undefined) {
					data.domain?.experiences.push(response);
					data.domain = data.domain;
				} else {
					// Click on overlay
				}
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
	<div
		class="layout-docs-content page-container-aside mx-auto text-center"
		use:tocCrawler={{ mode: 'generate', scrollTarget: '#page' }}
	>
		{#if !experiences}
			Loading
		{/if}
		{#if experiences}
			<Filters bind:filters {experiences} />

			{#if !$modalStore[0] && isDomainAdmin(data?.domain)}
				<button class="sticky bg-blue-500 text-white p-1 rounded" on:click={showAddExperienceModal}>
					<PlusCircle />
				</button>
			{/if}
			{#each experiences as experience}
				<Experience {experience} canEdit={isDomainAdmin(data?.domain)} />
			{/each}
		{/if}
	</div>
	<aside class="layout-cols-aside sticky top-0 hidden lg:block space-y-1 w-72">
		<!-- Table of Contents -->
		<TableOfContents>{' '}</TableOfContents>
	</aside>
</div>
