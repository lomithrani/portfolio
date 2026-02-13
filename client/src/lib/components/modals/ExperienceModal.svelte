<script lang="ts">
	import { portfolioApi } from '$services';
	import { Plus } from 'svelte-heros-v2';
	import { TagsInput, SegmentedControl } from '@skeletonlabs/skeleton-svelte';
	import { ExperienceType } from 'portfolio-common';
	import { newExperienceDataStore, type FormData } from '$lib/stores/newExperienceStore';
	import type {
		Company,
		Experience as ExperienceModel,
		Skill
	} from 'portfolio-api/models/database';
	import { get } from 'svelte/store';

	let {
		existingExperience,
		title = 'Experience',
		body = '',
		onResponse,
		onClose
	}: {
		existingExperience?: ExperienceModel;
		title?: string;
		body?: string;
		onResponse: (response: ExperienceModel | undefined) => void;
		onClose: () => void;
	} = $props();

	let isNewExperience = $state(!existingExperience);

	if (existingExperience) {
		newExperienceDataStore.set({
			title: existingExperience.title,
			type: existingExperience.type,
			summary: existingExperience.summary,
			company: existingExperience.company as unknown as FormData['company'],
			projects: existingExperience.projects.map((project) => {
				return {
					name: project.name,
					start: (<string>(project.start as unknown)).split('T')[0],
					end: (<string>(project.end as unknown)).split('T')[0],
					summary: project.summary ?? '',
					hardSkills: project.hardSkills.map((skill) => (skill.skill as Skill).displayName),
					softSkills: project.softSkills.map((skill) => (skill.skill as Skill).displayName)
				};
			})
		});
	}

	let formData: FormData = $state(structuredClone(get(newExperienceDataStore)));

	$effect(() => {
		if (formData) {
			newExperienceDataStore.set(formData);
		}
	});

	const onFormSubmit = async () => {
		const apiData = {
			...formData,
			projects: formData.projects.map((project) => {
				return {
					...project,
					start: project.start ? new Date(project.start) : undefined,
					end: project.end ? new Date(project.end) : undefined,
					hardSkills: project.hardSkills.map((skillName) => ({
						name: skillName,
						level: -1
					})),
					softSkills: project.softSkills.map((skillName) => ({
						name: skillName,
						level: -1
					}))
				};
			})
		};

		const { data, error } = await portfolioApi.experiences.post(
			apiData as any,
			{ fetch: { credentials: 'include' } }
		);
		if (!error && data) {
			onResponse(data as unknown as ExperienceModel);
		}
	};

	const addEmptyProject = () => {
		const newProject = {
			name: '',
			start: new Date().toISOString().split('T')[0],
			end: new Date().toISOString().split('T')[0],
			summary: '',
			hardSkills: [] as string[],
			softSkills: [] as string[]
		};
		formData.projects = [...formData.projects, newProject];
	};

	const cBase = 'bg-surface-100-900 p-4 max-w-lg w-full shadow-xl space-y-4 rounded-lg';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-300-700 p-4 space-y-4 rounded-lg';
</script>

<div class={cBase}>
	<header class={cHeader}>{title}</header>
	<article>{body}</article>
	<div class="space-y-4 {cForm}">
		<input
			class="w-full rounded border border-surface-300-700 bg-transparent p-2"
			type="text"
			bind:value={formData.title}
			placeholder="Enter title...  eg: Senior Software Engineer"
		/>

		<SegmentedControl
			value={formData.type}
			onValueChange={(details) => formData.type = details.value as ExperienceType}
		>
			{#each Object.values(ExperienceType) as type}
				<SegmentedControl.Item value={type}>
					<SegmentedControl.ItemText>{type}</SegmentedControl.ItemText>
				</SegmentedControl.Item>
			{/each}
			<SegmentedControl.Indicator />
		</SegmentedControl>

		<textarea
			class="w-full rounded border border-surface-300-700 bg-transparent p-2"
			rows={4}
			bind:value={formData.summary}
			placeholder="Enter a brief summary of the overall experience... (supports markdown)"
		></textarea>

		<span>Projects</span>
		<button type="button" class="bg-blue-500 text-white p-1 rounded" onclick={addEmptyProject}>
			<Plus />
		</button>
		{#each formData.projects as project, i}
			<div class="space-y-2 {cForm}">
				<label class="block">
					<span>Title</span>
					<input
						class="w-full rounded border border-surface-300-700 bg-transparent p-2"
						type="text"
						bind:value={project.name}
						placeholder="Enter title..."
					/>
				</label>
				<label class="block">
					<span>Summary</span>
					<textarea
						class="w-full rounded border border-surface-300-700 bg-transparent p-2"
						rows={4}
						bind:value={project.summary}
						placeholder="Enter details about the project, mission..."
					></textarea>
				</label>
				<input class="w-full rounded border border-surface-300-700 bg-transparent p-2" title="Start" type="date" bind:value={project.start} />
				<input class="w-full rounded border border-surface-300-700 bg-transparent p-2" title="End" type="date" bind:value={project.end} />
				<TagsInput
					value={project.hardSkills}
					onValueChange={(details) => { formData.projects[i].hardSkills = details.value; }}
				>
					<TagsInput.Control>
						{#each project.hardSkills as tag, idx}
							<TagsInput.Item value={tag} index={idx}>
								<TagsInput.ItemPreview>
									<TagsInput.ItemText>{tag}</TagsInput.ItemText>
									<TagsInput.ItemDeleteTrigger />
								</TagsInput.ItemPreview>
							</TagsInput.Item>
						{/each}
						<TagsInput.Input placeholder="Enter hard skills..." />
					</TagsInput.Control>
				</TagsInput>
				<TagsInput
					value={project.softSkills}
					onValueChange={(details) => { formData.projects[i].softSkills = details.value; }}
				>
					<TagsInput.Control>
						{#each project.softSkills as tag, idx}
							<TagsInput.Item value={tag} index={idx}>
								<TagsInput.ItemPreview>
									<TagsInput.ItemText>{tag}</TagsInput.ItemText>
									<TagsInput.ItemDeleteTrigger />
								</TagsInput.ItemPreview>
							</TagsInput.Item>
						{/each}
						<TagsInput.Input placeholder="Enter soft skills..." />
					</TagsInput.Control>
				</TagsInput>
			</div>
		{/each}
	</div>
	<footer class="flex justify-end gap-2">
		<button class="btn preset-tonal" onclick={onClose}>Cancel</button>
		<button class="btn preset-filled" onclick={onFormSubmit}>{isNewExperience ? 'Add Experience' : 'Modify Experience'}</button>
	</footer>
</div>
