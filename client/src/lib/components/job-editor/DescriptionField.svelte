<!--
@component
The job description: Markdown, with a Write tab (a textarea that grows with its text) and a
Preview tab (rendered as candidates will read it). The textarea carries the field's id; when
the editor focuses the field while the preview shows, it switches back to Write first
(`data-write-tab`).
-->
<script lang="ts">
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import { JOB_LIMITS } from 'portfolio-common';
	import Markdown from '#components/Markdown.svelte';
	import FieldError from './FieldError.svelte';
	import { getJobEditorContext } from './context';

	let {
		value = $bindable(''),
		label = 'Job description',
		required = false,
		placeholder = '',
		minRows = 10
	}: {
		value?: string;
		label?: string;
		required?: boolean;
		placeholder?: string;
		/** The textarea grows with its content from this height */
		minRows?: number;
	} = $props();

	const editor = getJobEditorContext();
	const id = $derived(editor.fieldId('description'));
	const hintId = $derived(`${id}-hint`);
	let error = $derived(editor.error('description'));

	let tab = $state('write');
	let textarea: HTMLTextAreaElement | undefined = $state();

	// Shown once the text nears the limit (the textarea stops there)
	let countShown = $derived(value.length > JOB_LIMITS.description * 0.9);
	const formatCount = (count: number) => count.toLocaleString('en-GB');

	// Grow with the content (the page scrolls, not the textarea). While it is not laid out yet
	// (scrollHeight 0) it keeps its rows, and is measured again on the next frame.
	const fit = (element: HTMLTextAreaElement, retries = 3) => {
		element.style.height = 'auto';
		if (element.scrollHeight > 0) element.style.height = `${element.scrollHeight + 2}px`;
		else if (retries > 0) requestAnimationFrame(() => fit(element, retries - 1));
	};

	$effect(() => {
		void value;
		if (textarea && tab === 'write') fit(textarea);
	});
</script>

<Tabs
	value={tab}
	onValueChange={(details) => (tab = details.value ?? 'write')}
	class="gap-1"
	data-description-field
>
	<div class="flex flex-wrap items-end justify-between gap-2">
		<label for={id} class="label-text text-sm">
			{label}
			{#if required}
				<span class="text-error-700-300" aria-hidden="true">*</span>
			{/if}
		</label>
		<Tabs.List class="mb-0 gap-1 border-0 pb-0">
			<Tabs.Trigger value="write" class="btn-sm data-selected:preset-tonal" data-write-tab>
				Write
			</Tabs.Trigger>
			<Tabs.Trigger value="preview" class="btn-sm data-selected:preset-tonal">Preview</Tabs.Trigger>
		</Tabs.List>
	</div>
	<Tabs.Content value="write">
		<textarea
			bind:this={textarea}
			bind:value
			{id}
			class="textarea resize-y leading-relaxed"
			rows={minRows}
			maxlength={JOB_LIMITS.description}
			{placeholder}
			aria-required={required ? true : undefined}
			aria-invalid={error ? true : undefined}
			aria-describedby={[hintId, error ? editor.errorId('description') : '']
				.filter(Boolean)
				.join(' ')}></textarea>
	</Tabs.Content>
	<Tabs.Content value="preview">
		<div
			class="min-h-40 rounded-base border border-surface-200-800 p-3 text-sm sm:p-4"
			aria-label="{label} preview"
			role="region"
		>
			{#if value.trim()}
				<!-- As candidates will read it (JobDetails): raw HTML as text, headings under the
				     section's h3 -->
				<Markdown content={value} topHeadingLevel={4} html={false} compact />
			{:else}
				<p class="text-surface-700-300">Nothing to preview yet.</p>
			{/if}
		</div>
	</Tabs.Content>
	<div class="flex flex-wrap justify-between gap-x-3 text-xs text-surface-700-300">
		<p id={hintId}>
			Markdown: ## headings, **bold**, _italic_, lists with “-”, [links](https://…).
		</p>
		{#if countShown}
			<p class={value.length >= JOB_LIMITS.description ? 'text-warning-800-200' : ''}>
				{formatCount(value.length)} / {formatCount(JOB_LIMITS.description)} characters
			</p>
		{/if}
	</div>
	<FieldError field="description" />
</Tabs>
