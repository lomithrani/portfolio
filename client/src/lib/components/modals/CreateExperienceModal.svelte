<script lang="ts">
	import { portfolioApi } from '$services';
	import { Plus } from 'svelte-heros-v2';

	// Props
	/** Exposes parent props to this component. */
	export let parent: any;
	// Stores
	import { RadioGroup, RadioItem, getModalStore } from '@skeletonlabs/skeleton';
	import { ExperienceType } from 'portfolio-common';
	const modalStore = getModalStore();

	// Form Data
	const formData: Parameters<typeof portfolioApi.experiences.post>[0] = {
		title: '',
		summary: '',
		type: ExperienceType.Professional,
		projects: [],
		$fetch: { credentials: 'include' }
	};
	// We've created a custom submit function to pass the response and close the modal.
	const onFormSubmit = async () => {
		if ($modalStore[0].response) {
			const { data, error } = await portfolioApi.experiences.post(formData);
			if (error) {
				console.log(error);
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
		<header class={cHeader}>{$modalStore[0].title ?? '(title missing)'}</header>
		<article>{$modalStore[0].body ?? '(body missing)'}</article>
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

<script lang="ts">
	import { portfolioApi } from '$services';
	import { Plus } from 'svelte-heros-v2';

	// Props
	/** Exposes parent props to this component. */
	export let parent: any;
	// Stores
	import { RadioGroup, RadioItem, getModalStore } from '@skeletonlabs/skeleton';
	import { ExperienceType } from 'portfolio-common';
	const modalStore = getModalStore();

	// Form Data
	const formData: Parameters<typeof portfolioApi.experiences.post>[0] = {
		title: '',
		summary: '',
		type: ExperienceType.Professional,
		projects: [],
		$fetch: { credentials: 'include' }
	};
	// We've created a custom submit function to pass the response and close the modal.
	const onFormSubmit = async () => {
		if ($modalStore[0].response) {
			const { data, error } = await portfolioApi.experiences.post(formData);
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
		<header class={cHeader}>{$modalStore[0].title ?? '(title missing)'}</header>
		<article>{$modalStore[0].body ?? '(body missing)'}</article>
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
				</form>
			{/each}

			<button type="button" class="btn-icon variant-filled" on:click={addEmptyProject}
				><Plus /></button
			>
		</form>
		<!-- prettier-ignore -->
		<footer class="modal-footer {parent.regionFooter}">
        <button class="btn {parent.buttonNeutral}" on:click={parent.onClose}>{parent.buttonTextCancel}</button>
        <button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>Add Experience</button>
    </footer>
	</div>
{/if}
