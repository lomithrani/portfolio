<!--
@component
The settings of a note step in the owner's editor: the note's title (the step's name on the Hire
page) and its text (Markdown). The rules are the manifest's (portfolio-common's NOTE_STEP_LIMITS):
the editor passes what it says is wrong, shown under the field it is about.
-->
<script lang="ts">
	import { NOTE_STEP_LIMITS } from 'portfolio-common';
	import { noteContent } from '#services/workflow.ts';
	import type { SettingsProps } from './types';

	let { config, onChange, problem, disabled, idPrefix }: SettingsProps = $props();

	let note = $derived(noteContent(config));
	let titleProblem = $derived(problem?.field === 'title' ? problem.message : '');
	let textProblem = $derived(problem?.field === 'text' ? problem.message : '');
</script>

<div class="space-y-3">
	<div class="space-y-1">
		<label class="label-text" for="{idPrefix}-title">Title</label>
		<input
			id="{idPrefix}-title"
			class="input"
			type="text"
			maxlength={NOTE_STEP_LIMITS.title}
			placeholder="e.g. Before you book"
			value={note.title}
			{disabled}
			aria-invalid={titleProblem ? true : undefined}
			aria-describedby="{idPrefix}-title-help"
			oninput={(event) => onChange({ ...note, title: event.currentTarget.value })}
		/>
		<p class="text-xs" id="{idPrefix}-title-help">
			{#if titleProblem}
				<span class="text-error-700-300">{titleProblem}</span>
			{:else}
				<span class="text-surface-700-300">The step's name on your Hire page.</span>
			{/if}
		</p>
	</div>
	<div class="space-y-1">
		<label class="label-text" for="{idPrefix}-text">Note</label>
		<textarea
			id="{idPrefix}-text"
			class="textarea"
			rows="5"
			maxlength={NOTE_STEP_LIMITS.text}
			placeholder="What you are looking for, your conditions…"
			value={note.text}
			{disabled}
			aria-invalid={textProblem ? true : undefined}
			aria-describedby="{idPrefix}-text-help"
			oninput={(event) => onChange({ ...note, text: event.currentTarget.value })}></textarea>
		<p class="flex flex-wrap justify-between gap-x-4 text-xs" id="{idPrefix}-text-help">
			{#if textProblem}
				<span class="text-error-700-300">{textProblem}</span>
			{:else}
				<span class="text-surface-700-300">
					Recruiters read it and confirm before going further. Markdown is supported.
				</span>
			{/if}
			<span class="text-surface-700-300">{note.text.length}/{NOTE_STEP_LIMITS.text}</span>
		</p>
	</div>
</div>
