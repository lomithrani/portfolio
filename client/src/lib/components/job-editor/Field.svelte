<!--
@component
A labelled field of the job editor: label (with a required mark), the control, an optional unit
after it, a hint and the field's error. The control is a snippet given the attributes to spread
on the input or select (`id`, `aria-invalid`, `aria-describedby`, `aria-required`), so the
label, the hint, the error and the error summary's link all point to it.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { JobFormField } from '#services/jobPosting.ts';
	import FieldError from './FieldError.svelte';
	import { getJobEditorContext, type ControlAttributes } from './context';

	let {
		field,
		label,
		required = false,
		hint = '',
		unit = '',
		class: className = '',
		control
	}: {
		field: JobFormField;
		label: string;
		/** Marks the label (*) and the control (aria-required) */
		required?: boolean;
		hint?: string;
		/** Shown after the control, e.g. 'months' */
		unit?: string;
		class?: string;
		control: Snippet<[ControlAttributes]>;
	} = $props();

	const editor = getJobEditorContext();
	let id = $derived(editor.fieldId(field));
	let hintId = $derived(`${id}-hint`);
	let error = $derived(editor.error(field));
	let attributes: ControlAttributes = $derived({
		id,
		'aria-invalid': error ? true : undefined,
		'aria-describedby':
			[hint ? hintId : '', error ? editor.errorId(field) : ''].filter(Boolean).join(' ') ||
			undefined,
		'aria-required': required ? true : undefined
	});
</script>

<div class="min-w-0 space-y-1 {className}">
	<label for={id} class="label-text text-sm">
		{label}
		{#if required}
			<span class="text-error-700-300" aria-hidden="true">*</span>
		{/if}
	</label>
	{#if unit}
		<div class="flex items-center gap-2">
			<div class="min-w-0 flex-1">{@render control(attributes)}</div>
			<span class="shrink-0 text-sm text-surface-700-300">{unit}</span>
		</div>
	{:else}
		{@render control(attributes)}
	{/if}
	{#if hint}
		<p id={hintId} class="text-xs text-surface-700-300">{hint}</p>
	{/if}
	<FieldError {field} />
</div>
