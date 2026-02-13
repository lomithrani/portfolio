<script lang="ts">
	import type {
		Experience as ExperienceModel,
		Skill as SkillModel
	} from 'portfolio-api/models/database';
	import type { PageData } from './$types';
	import { PlusCircle } from 'svelte-heros-v2';
	import { Dialog } from '@skeletonlabs/skeleton-svelte';
	import Experience from '$components/Experience.svelte';
	import ExperienceModal from '$components/modals/ExperienceModal.svelte';
	import Filters from './Filters.svelte';
	import { isDomainAdmin } from '$services/authentication';

	let { data }: { data: PageData } = $props();
	let showAddModal = $state(false);
	let filters: { softSkills: Set<string>; hardSkills: Set<string> } = $state({
		softSkills: new Set(),
		hardSkills: new Set()
	});
	let experiences: ExperienceModel[] | undefined = $state(undefined);

	$effect(() => {
		if (data?.domain) filterExperiences();
	});
	$effect(() => {
		if (filters) filterExperiences();
	});

	const showAddExperienceModal = () => {
		showAddModal = true;
	};

	const onAddResponse = (response: ExperienceModel | undefined) => {
		if (response !== undefined) {
			data.domain?.experiences.push(response);
			data.domain = data.domain;
		}
		showAddModal = false;
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
					project.softSkills.some((softSkill) =>
						filters.softSkills.has((softSkill.skill as SkillModel).displayName)
					) ||
					project.hardSkills.some((hardSkill) =>
						filters.hardSkills.has((hardSkill.skill as SkillModel).displayName)
					)
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
<div class="relative flex items-start gap-10 p-4">
	<div class="mx-auto text-center flex-1">
		{#if !experiences}
			Loading
		{/if}
		{#if experiences}
			<Filters bind:filters {experiences} />

			{#if !showAddModal && isDomainAdmin(data?.domain)}
				<button class="sticky bg-blue-500 text-white p-1 rounded" onclick={showAddExperienceModal}>
					<PlusCircle />
				</button>
			{/if}
			{#each experiences as experience}
				<Experience {experience} canEdit={isDomainAdmin(data?.domain)} />
			{/each}
		{/if}
	</div>
</div>

<Dialog open={showAddModal} onOpenChange={(details) => showAddModal = details.open}>
	<Dialog.Backdrop />
	<Dialog.Positioner>
		<Dialog.Content>
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
</Dialog>
