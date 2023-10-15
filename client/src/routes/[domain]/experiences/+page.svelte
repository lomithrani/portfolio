<script lang="ts">
	import type { Experience as ExperienceModel } from 'portfolio-api/models';
	import type { PageData } from './$types';

	import { TableOfContents, tocCrawler } from '@skeletonlabs/skeleton';

	import Experience from '$components/Experience.svelte';
	import Filters from './Filters.svelte';

	export let data: PageData;

	let filters: { softSkills: Set<string>; hardSkills: Set<string> } = {
		softSkills: new Set(),
		hardSkills: new Set()
	};
	let experiences: ExperienceModel[] | null = null;

	$: if (data?.experiences) filterExperiences();
	$: if (filters) filterExperiences();

	const filterExperiences = () => {
		if (filters.softSkills.size === 0 && filters.hardSkills.size === 0) {
			return (experiences = data?.experiences);
		}

		if (data?.experiences === null) {
			return (experiences = null);
		}

		return (experiences = data.experiences.filter((experience) =>
			experience.projects.some(
				(project) =>
					project.softSkills.some((softSkill) => filters.softSkills.has(softSkill.name)) ||
					project.hardSkills.some((hardSkill) => filters.hardSkills.has(hardSkill.name))
			)
		));
	};
</script>

<svelte:head>
	<title>Louis Gentil | Resume</title>
	<meta
		name="Louis Gentil Resume"
		content="All of my professional experiences, as well as my personal and educational projects and courses."
	/>
</svelte:head>

<div class="layout-docs page-padding flex items-start gap-10">
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

	<aside class="layout-cols-aside sticky top-0 hidden xl:block space-y-1 w-72">
		<!-- Table of Contents -->
		<TableOfContents>{' '}</TableOfContents>
	</aside>
</div>
