<script lang="ts">
	import { portfolioApi } from '$services';
	import { Plus } from 'svelte-heros-v2';
	import type { SvelteComponent } from 'svelte';

	// Props
	export let parent: SvelteComponent;

	import { InputChip, RadioGroup, RadioItem, getModalStore } from '@skeletonlabs/skeleton';
	import { ExperienceType } from 'portfolio-common';

	import { newExperienceDataStore, type FormData } from '$lib/stores/newExperienceStore';
	import type { Company, Experience as ExperienceModel } from 'portfolio-api/models/database';

	const modalStore = getModalStore();

	if ($modalStore[0].meta?.experience) {
		const experienceInput = $modalStore[0].meta.experience as ExperienceModel;

		newExperienceDataStore.set({
			title: experienceInput.title,
			type: experienceInput.type,
			summary: experienceInput.summary,
			company: experienceInput.company as Company,
			projects: experienceInput.projects.map((project) => {
				return {
					name: project.name,
					start: (<string>(project.start as unknown)).split('T')[0],
					end: (<string>(project.end as unknown)).split('T')[0],
					summary: project.summary ?? '',
					hardSkills: project.hardSkills.map((skill) => skill.name),
					softSkills: project.softSkills.map((skill) => skill.name)
				};
			})
		});
	}

	// Form Data
	let formData: FormData;

	newExperienceDataStore.subscribe((value) => {
		formData = value;
	});

	// Update the store whenever formData changes
	$: if (formData) {
		newExperienceDataStore.set(formData);
	}

	// We've created a custom submit function to pass the response and close the modal.
	const onFormSubmit = async () => {
		if ($modalStore[0].response) {
			const apiData: Parameters<typeof portfolioApi.experiences.post>[0] = {
				...formData,
				projects: formData.projects.map((project) => {
					return {
						...project,
						hardSkills: project.hardSkills.map((skillName) => ({
							name: skillName,
							level: -1, // Temporary , waiting from custom inputChip - TODO
							svg: undefined // Temporary , waiting from custom inputChip - TODO
						})),
						softSkills: project.softSkills.map((skillName) => ({
							name: skillName,
							level: -1, // Temporary , waiting from custom inputChip - TODO
							svg: undefined // Temporary , waiting from custom inputChip - TODO
						}))
					};
				})
			};

			const { data, error } = await portfolioApi.experiences.post(apiData);
			if (error) {
			} else {
				$modalStore[0].response(data);
				modalStore.close();
			}
		}
	};

	const addEmptyProject = () => {
		const newProject = {
			name: '',
			start: new Date().toISOString().split('T')[0],
			end: new Date().toISOString().split('T')[0],
			summary: '',
			hardSkills: [],
			softSkills: []
		};
		formData.projects = [...formData.projects, newProject];
	};

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4';
	const cHeader = 'text-2xl font-bold';
	const cForm =
		'border border-surface-500 p-4 space-y-4 rounded-container-token place-content-center';
</script>

<!-- @component This example creates a simple form modal. -->

{#if $modalStore[0]}
	<div class="modal-example-form {cBase}">
		<header class={cHeader}>{$modalStore[0].title}</header>
		<article>{$modalStore[0].body}</article>
		<!-- Enable for debugging: -->
		<form class="modal-form {cForm}">
			<input
				class="input"
				type="text"
				bind:value={formData.title}
				placeholder="Enter title...  eg: Senior Software Engineer"
			/>

			<RadioGroup>
				{#each Object.values(ExperienceType) as value}
					<RadioItem bind:group={formData.type} name="justify" {value}>{value}</RadioItem>
				{/each}
			</RadioGroup>

			<textarea
				class="textarea"
				rows="4"
				bind:value={formData.summary}
				placeholder="Enter a brief summary of the overall experience..."
			/>

			<span>Projects</span>
			{#each formData.projects as project}
				<form class="modal-form {cForm}">
					<label class="label">
						<span>Title</span>
						<input
							class="input"
							type="text"
							bind:value={project.name}
							placeholder="Enter title..."
						/>
					</label>
					<label class="label">
						<span>Summary</span>
						<textarea
							class="textarea"
							rows="4"
							bind:value={project.summary}
							placeholder="Enter details about the project, mission..."
						/>
					</label>
					<input class="input" title="Start" type="date" bind:value={project.start} />
					<input class="input" title="End" type="date" bind:value={project.end} />
					<InputChip
						name="Hard Skills"
						bind:value={project.hardSkills}
						placeholder="Enter hard skills..."
					/>
					<InputChip
						name="Soft Skills"
						bind:value={project.softSkills}
						placeholder="Enter soft skills..."
					/>
				</form>
			{/each}

			<button type="button" class="btn-icon variant-filled" on:click={addEmptyProject}
				><Plus /></button
			>
		</form>
		<!-- prettier-ignore -->
		<footer class="modal-footer {parent.regionFooter}">
        <button class="btn {parent.buttonNeutral}" on:click={modalStore.close}>{parent.buttonTextCancel}</button>
        <button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>Add Experience</button>
    </footer>
	</div>
{/if}
