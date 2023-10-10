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
	<title>Experiences</title>
	<meta name="description" content="My experiences" />
</svelte:head>

<div class="box">
	{#if !experiences}
		Loading
	{/if}
	{#if experiences}
		<Filters bind:filters {experiences} />
		<div
			class="layout-docs-content page-container-aside"
			use:tocCrawler={{ mode: 'generate', scrollTarget: '#page' }}
		>
			{#each experiences as experience, index}
				<Experience {experience} {index} />
			{/each}
		</div>
	{/if}
	<TableOfContents
		class="fixed right-0 top-1/2 transform -translate-y-1/2 bg-transparent m-2 p-2"
	/>
</div>
