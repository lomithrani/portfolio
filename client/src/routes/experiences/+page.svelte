<script lang="ts">
	import Experience from '$components/Experience.svelte';
	import type { PageData } from './$types';
	import Filters from './Filters.svelte';
	import type { Experience as ExperienceModel } from 'portfolio-api/models';
	export let data: PageData;

	let filters: { softSkills: Set<string>; hardSkills: Set<string> } = {
		softSkills: new Set(),
		hardSkills: new Set()
	};
	let experiences: ExperienceModel[] | null = null;

	$: if (data?.experiences) filterExperiences();
	$: if (filters) filterExperiences();

	const filterExperiences = () => {
		console.log('filter experiences');
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

<div class="text-column">
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
