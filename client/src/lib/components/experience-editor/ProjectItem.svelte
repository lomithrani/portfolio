<script lang="ts">
	import { ArrowDown, ArrowUp, ChevronRight, ExclamationCircle, Trash } from 'svelte-heros-v2';
	import { EXPERIENCE_LIMITS } from 'portfolio-common';
	import { projectOngoingLabel, type FormProject } from '#services/experienceForm.ts';
	import { m as formMessages } from '#services/experienceForm.messages.ts';
	import { formatMonthRange, fromMonthKey } from '#services/experienceDates.ts';
	import FieldError from './FieldError.svelte';
	import MarkdownField from './MarkdownField.svelte';
	import PeriodFields from './PeriodFields.svelte';
	import SkillsInput from './SkillsInput.svelte';
	import { getEditorContext } from './context';
	import { m } from './editor.messages.ts';

	let {
		project = $bindable(),
		index,
		count,
		expanded,
		hasErrors,
		known,
		hardSuggestions,
		softSuggestions,
		ontoggle,
		onmove,
		onremove
	}: {
		project: FormProject;
		index: number;
		count: number;
		expanded: boolean;
		/** Some field of the project shows an error */
		hasErrors: boolean;
		known: readonly string[];
		hardSuggestions: readonly string[];
		softSuggestions: readonly string[];
		ontoggle: () => void;
		onmove: (offset: -1 | 1) => void;
		onremove: () => void;
	} = $props();

	const editor = getEditorContext();
	const prefix = $derived(`projects.${project.id}.`);
	const nameField = $derived(`${prefix}name`);
	const headerId = $derived(`${editor.fieldId(prefix)}header`);
	const panelId = $derived(`${editor.fieldId(prefix)}panel`);

	let displayName = $derived(project.name.trim() || m.project.untitled);

	const isMonth = (value: string) => /^\d{4}-\d{2}$/.test(value);
	let period = $derived.by(() => {
		if (!isMonth(project.start)) return m.project.noDates;
		const start = fromMonthKey(project.start);
		if (project.ongoing) return formatMonthRange(start);
		if (!isMonth(project.end)) return `${formatMonthRange(start, start)} – …`;
		return formatMonthRange(start, fromMonthKey(project.end));
	});

	let skillCount = $derived(project.hardSkills.length + project.softSkills.length);
</script>

<div class="py-2">
	<div class="flex items-center gap-1">
		<button
			id={headerId}
			type="button"
			class="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-base px-1 py-1.5 text-left hover:bg-surface-200-800/50"
			aria-expanded={expanded}
			aria-controls={panelId}
			data-project-toggle={project.id}
			onclick={ontoggle}
		>
			<ChevronRight
				size="18"
				class="shrink-0 transition-transform motion-reduce:transition-none {expanded
					? 'rotate-90'
					: ''}"
				aria-hidden="true"
			/>
			<span class="min-w-0 flex-1">
				<span class="block truncate font-medium {project.name.trim() ? '' : 'italic opacity-80'}">
					{displayName}
				</span>
				<span class="block truncate text-xs text-surface-700-300">
					{period} · {m.project.skills(skillCount)}
				</span>
			</span>
			{#if hasErrors}
				<span class="flex shrink-0 items-center gap-1 text-xs text-error-700-300">
					<ExclamationCircle size="16" aria-hidden="true" />
					<span class="sr-only sm:not-sr-only">{m.project.needsAttention}</span>
				</span>
			{/if}
		</button>
		<button
			type="button"
			class="btn-icon size-10 hover:preset-tonal"
			aria-label={m.project.moveUp(displayName)}
			disabled={index === 0}
			data-move="up"
			onclick={() => onmove(-1)}
		>
			<ArrowUp size="18" aria-hidden="true" />
		</button>
		<button
			type="button"
			class="btn-icon size-10 hover:preset-tonal"
			aria-label={m.project.moveDown(displayName)}
			disabled={index === count - 1}
			data-move="down"
			onclick={() => onmove(1)}
		>
			<ArrowDown size="18" aria-hidden="true" />
		</button>
		<button
			type="button"
			class="btn-icon size-10 hover:preset-tonal-error"
			aria-label={m.project.remove(displayName)}
			onclick={onremove}
		>
			<Trash size="18" aria-hidden="true" />
		</button>
	</div>

	{#if expanded}
		<div id={panelId} role="region" aria-labelledby={headerId} class="space-y-4 pt-3 pb-4 sm:ps-7">
			<div class="space-y-1">
				<label for={editor.fieldId(nameField)} class="label-text">
					{formMessages.fields.name}
					<span class="text-error-700-300" aria-hidden="true">*</span>
				</label>
				<input
					id={editor.fieldId(nameField)}
					class="input"
					type="text"
					autocomplete="off"
					required
					maxlength={EXPERIENCE_LIMITS.projectName}
					placeholder={m.project.namePlaceholder}
					bind:value={project.name}
					aria-invalid={editor.error(nameField) ? true : undefined}
					aria-describedby={editor.error(nameField) ? editor.errorId(nameField) : undefined}
				/>
				<FieldError field={nameField} />
			</div>

			<PeriodFields
				bind:start={project.start}
				bind:end={project.end}
				bind:ongoing={project.ongoing}
				ongoingLabel={projectOngoingLabel()}
				fieldPrefix={prefix}
			/>

			<MarkdownField
				bind:value={project.summary}
				field="{prefix}summary"
				label={formMessages.fields.summary}
				minRows={4}
				placeholder={m.project.summaryPlaceholder}
			/>

			<SkillsInput
				field="{prefix}hardSkills"
				label={formMessages.fields.hardSkills}
				variant="hard"
				value={project.hardSkills}
				{known}
				suggestions={hardSuggestions}
				onchange={(skills) => (project.hardSkills = skills)}
			/>
			<SkillsInput
				field="{prefix}softSkills"
				label={formMessages.fields.softSkills}
				variant="soft"
				value={project.softSkills}
				{known}
				suggestions={softSuggestions}
				onchange={(skills) => (project.softSkills = skills)}
			/>
		</div>
	{/if}
</div>
