<script lang="ts">
	import { portfolioApi } from '$services';
	import { Plus, XMark } from 'svelte-heros-v2';
	import { TagsInput, SegmentedControl } from '@skeletonlabs/skeleton-svelte';
	import { ExperienceType } from 'portfolio-common';
	import {
		newExperienceDataStore,
		resetNewExperienceDraft,
		type FormData
	} from '$lib/stores/newExperienceStore';
	import { draftToForm, experienceToForm, formToExperienceRequest } from '$services/experienceForm';
	import { clearAuthentication } from '$services/authentication';
	import { errorStatus } from '$services/apiErrors';
	import type { Experience as ExperienceModel } from 'portfolio-api/models/database';
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

	let isNewExperience = $derived(!existingExperience);

	let iconError = $state('');
	let submitError = $state('');
	let submitting = $state(false);

	const handleIconUpload = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		iconError = '';
		if (!file) return;

		if (file.size > 16 * 1024) {
			iconError = 'Icon must be 16KB or smaller';
			input.value = '';
			return;
		}

		const reader = new FileReader();
		reader.onload = () => {
			formData.icon = reader.result as string;
		};
		reader.readAsDataURL(file);
	};

	const removeIcon = () => {
		formData.icon = undefined;
	};

	// Editing starts from the experience itself; adding resumes the persisted draft.
	// The draft is only ever written by the "add" flow, so editing cannot clobber it.
	function getInitialFormData(): FormData {
		if (existingExperience) return experienceToForm(existingExperience);
		return draftToForm(structuredClone(get(newExperienceDataStore)));
	}

	let formData: FormData = $state(getInitialFormData());

	$effect(() => {
		if (isNewExperience) {
			newExperienceDataStore.set($state.snapshot(formData));
		}
	});

	const describeError = (status: number | undefined): string => {
		if (status === 401) return 'Your session has expired. Please log in again.';
		if (status === 403) return 'Only the domain admin can edit this portfolio.';
		if (status === 400 || status === 422) return 'Some fields are invalid. Please check the form.';
		return 'Failed to save the experience. Please try again.';
	};

	const onFormSubmit = async () => {
		submitting = true;
		submitError = '';

		try {
			const request = formToExperienceRequest($state.snapshot(formData));
			const fetchOpts = { fetch: { credentials: 'include' } } as const;

			const { data, error } = existingExperience?._id
				? await portfolioApi
						.experiences({ id: String(existingExperience._id) })
						.put(request, fetchOpts)
				: await portfolioApi.experiences.post(request, fetchOpts);

			if (error || !data) {
				const status = errorStatus(error);
				if (status === 401) clearAuthentication();
				submitError = describeError(status);
				return;
			}

			if (isNewExperience) resetNewExperienceDraft();
			onResponse(data as unknown as ExperienceModel);
		} catch {
			submitError = describeError(undefined);
		} finally {
			submitting = false;
		}
	};

	const addEmptyProject = () => {
		const today = new Date().toISOString().split('T')[0];
		formData.projects = [
			...formData.projects,
			{ name: '', start: today, end: today, summary: '', hardSkills: [], softSkills: [] }
		];
	};

	const cBase = 'bg-surface-100-900 p-4 max-w-lg w-full shadow-xl space-y-4 rounded-lg';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-300-700 p-4 space-y-4 rounded-lg';
	const cInput = 'w-full rounded border border-surface-300-700 bg-transparent p-2';
</script>

<div class={cBase}>
	<header class={cHeader}>{title}</header>
	<article>{body}</article>
	<div class="space-y-4 {cForm}">
		<input
			class={cInput}
			type="text"
			bind:value={formData.title}
			aria-label="Title"
			placeholder="Enter title...  eg: Senior Software Engineer"
		/>

		<SegmentedControl
			value={formData.type}
			onValueChange={(details) => (formData.type = details.value as ExperienceType)}
		>
			{#each Object.values(ExperienceType) as type (type)}
				<SegmentedControl.Item value={type}>
					<SegmentedControl.ItemText>{type}</SegmentedControl.ItemText>
					<SegmentedControl.ItemHiddenInput />
				</SegmentedControl.Item>
			{/each}
			<SegmentedControl.Indicator />
		</SegmentedControl>

		<fieldset class="block">
			<legend>Icon</legend>
			<div class="flex items-center gap-3">
				{#if formData.icon}
					<img src={formData.icon} alt="Icon preview" class="size-8" />
					<button type="button" class="btn btn-sm preset-tonal" onclick={removeIcon}>
						<XMark size="16" />
						<span>Remove</span>
					</button>
				{:else}
					<input
						type="file"
						accept=".ico,image/x-icon"
						class="text-sm"
						aria-label="Upload icon"
						onchange={handleIconUpload}
					/>
				{/if}
			</div>
			{#if iconError}
				<span class="text-xs text-error-500" role="alert">{iconError}</span>
			{/if}
		</fieldset>

		<textarea
			class={cInput}
			rows={4}
			bind:value={formData.summary}
			aria-label="Summary"
			placeholder="Enter a brief summary of the overall experience... (supports markdown)"
		></textarea>

		<span>Projects</span>
		<button type="button" class="bg-blue-500 text-white p-1 rounded" onclick={addEmptyProject}>
			<Plus />
			<span class="sr-only">Add project</span>
		</button>
		{#each formData.projects as project, i (i)}
			<div class="space-y-2 {cForm}">
				<label class="block">
					<span>Title</span>
					<input
						class={cInput}
						type="text"
						bind:value={project.name}
						placeholder="Enter title..."
					/>
				</label>
				<label class="block">
					<span>Summary</span>
					<textarea
						class={cInput}
						rows={4}
						bind:value={project.summary}
						placeholder="Enter details about the project, mission..."></textarea>
				</label>
				<label class="block">
					<span>Start</span>
					<input class={cInput} type="date" bind:value={project.start} />
				</label>
				<label class="block">
					<span>End</span>
					<input class={cInput} type="date" bind:value={project.end} />
				</label>
				<TagsInput
					value={project.hardSkills}
					onValueChange={(details) => {
						formData.projects[i].hardSkills = details.value;
					}}
				>
					<TagsInput.Control>
						{#each project.hardSkills as tag, idx (idx)}
							<TagsInput.Item value={tag} index={idx}>
								<TagsInput.ItemPreview>
									<TagsInput.ItemText>{tag}</TagsInput.ItemText>
									<TagsInput.ItemDeleteTrigger />
								</TagsInput.ItemPreview>
							</TagsInput.Item>
						{/each}
						<TagsInput.Input placeholder="Enter hard skills..." aria-label="Hard skills" />
					</TagsInput.Control>
				</TagsInput>
				<TagsInput
					value={project.softSkills}
					onValueChange={(details) => {
						formData.projects[i].softSkills = details.value;
					}}
				>
					<TagsInput.Control>
						{#each project.softSkills as tag, idx (idx)}
							<TagsInput.Item value={tag} index={idx}>
								<TagsInput.ItemPreview>
									<TagsInput.ItemText>{tag}</TagsInput.ItemText>
									<TagsInput.ItemDeleteTrigger />
								</TagsInput.ItemPreview>
							</TagsInput.Item>
						{/each}
						<TagsInput.Input placeholder="Enter soft skills..." aria-label="Soft skills" />
					</TagsInput.Control>
				</TagsInput>
			</div>
		{/each}
	</div>
	{#if submitError}
		<div class="p-3 rounded bg-error-500/10 text-error-500" role="alert">{submitError}</div>
	{/if}
	<footer class="flex justify-end gap-2">
		<button class="btn preset-tonal" onclick={onClose}>Cancel</button>
		<button class="btn preset-filled" onclick={onFormSubmit} disabled={submitting}
			>{isNewExperience ? 'Add Experience' : 'Modify Experience'}</button
		>
	</footer>
</div>
