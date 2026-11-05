<script lang="ts">
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import { EXPERIENCE_LIMITS } from 'portfolio-common';
	import Markdown from '#components/Markdown.svelte';
	import FieldError from './FieldError.svelte';
	import { getEditorContext } from './context';

	let {
		value = $bindable(''),
		field,
		label,
		labelClass = 'label-text',
		placeholder = '',
		minRows = 6
	}: {
		value?: string;
		field: string;
		label: string;
		labelClass?: string;
		placeholder?: string;
		/** The textarea grows with its content from this height */
		minRows?: number;
	} = $props();

	const editor = getEditorContext();
	const id = $derived(editor.fieldId(field));
	const hintId = $derived(`${id}-hint`);

	let tab = $state('write');
	let textarea: HTMLTextAreaElement | undefined = $state();

	// Grow with the content (the dialog body scrolls, not the textarea). While it is not laid
	// out yet (scrollHeight 0) it keeps its rows, and is measured again on the next frame.
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
	data-markdown-field
>
	<div class="flex flex-wrap items-end justify-between gap-2">
		<label for={id} class={labelClass}>{label}</label>
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
			maxlength={EXPERIENCE_LIMITS.text}
			{placeholder}
			aria-invalid={editor.error(field) ? true : undefined}
			aria-describedby={[hintId, editor.error(field) ? editor.errorId(field) : '']
				.filter(Boolean)
				.join(' ')}></textarea>
	</Tabs.Content>
	<Tabs.Content value="preview">
		<div
			class="min-h-24 rounded-base border border-surface-200-800 p-3 text-sm"
			aria-label="{label} preview"
			role="region"
		>
			{#if value.trim()}
				<Markdown content={value} headingOffset={2} compact />
			{:else}
				<p class="text-surface-600-400">Nothing to preview yet.</p>
			{/if}
		</div>
	</Tabs.Content>
	<p id={hintId} class="text-xs text-surface-600-400">
		Markdown: **bold**, _italic_, lists with “-”, [links](https://…).
	</p>
	<FieldError {field} />
</Tabs>
