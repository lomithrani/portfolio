<!--
@component
A short list of the job editor (skills, languages, benefits): type an item and press Enter (or
Add); paste several lines to add one item per line. Items show as chips with a remove button.
Duplicates (ignoring case), blanks and what goes over the limits are not added, and the reason
is announced. Text typed and not added yet is added when the editor saves (it registers how); what
cannot be added then stops the save, as the field's error. Until then it is the editor's too
(`bind:text`): an unsaved change, kept with the draft. The text input carries the field's id: the
label and the error summary point to it. A list of the terms of a posting opened before (the
editor's `locked`) is read-only: its items show without their remove buttons, with a lock.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { LockClosed, Plus, XMark } from 'svelte-heros-v2';
	import { common } from '#lib/i18n/common.messages.ts';
	import type { JobListField } from '#services/jobDrafts.ts';
	import { addListItems } from '#services/jobPosting.ts';
	import FieldError from './FieldError.svelte';
	import { getJobEditorContext } from './context';
	import { m as fieldMessages } from './Field.messages.ts';
	import { m } from './ListInput.messages.ts';

	let {
		field,
		label,
		value = $bindable([]),
		text = $bindable(''),
		max,
		maxLength,
		placeholder = '',
		hint = ''
	}: {
		/** The list: what one item is called in messages depends on it (a skill, a language, a benefit) */
		field: JobListField;
		label: string;
		value?: string[];
		/** What is typed in the field and not added yet */
		text?: string;
		/** Items the list can hold */
		max: number;
		/** Characters per item */
		maxLength: number;
		placeholder?: string;
		hint?: string;
	} = $props();

	const editor = getJobEditorContext();
	let id = $derived(editor.fieldId(field));
	let hintId = $derived(`${id}-hint`);
	let lockedId = $derived(`${id}-locked`);
	let error = $derived(editor.error(field));
	let locked = $derived(editor.locked(field));

	/** Announced to screen readers: what was added or removed, and why something was not */
	let message = $state('');
	/** Shown under the field too: why what was typed was not added */
	let problem = $state('');
	let input: HTMLInputElement | undefined = $state();
	let list: HTMLUListElement | undefined = $state();
	let full = $derived(value.length >= max);

	let problems = $derived({
		duplicate: m.duplicate,
		full: m.full(field, max),
		too_long: m.tooLong(field, maxLength)
	});

	function add(raw: string) {
		// Locked: nothing is added, whatever reaches it (a paste included)
		if (locked) return;
		const result = addListItems(value, raw, { max, maxLength });
		if (result.added.length > 0) value = result.list;
		const added = result.added.length > 0 ? m.added(result.added) : '';
		problem = result.problem ? problems[result.problem] : '';
		message = [added, problem].filter(Boolean).join(' ');
		// Keep what could not be added in the field, to fix it; clear it otherwise
		if (!result.problem || result.added.length > 0) text = '';
		editor.pendingTextChanged(field);
	}

	/**
	 * Before a save: adds the text typed and not added yet (a duplicate is already there: the
	 * text goes). Answers why it cannot be added, if it cannot: the text stays, to fix it.
	 */
	function commit(): string | undefined {
		if (locked || !text.trim()) return undefined;
		const result = addListItems(value, text, { max, maxLength });
		if (result.added.length > 0) value = result.list;
		problem = '';
		if (!result.problem || result.problem === 'duplicate') {
			text = '';
			message = result.added.length > 0 ? m.added(result.added) : '';
			return undefined;
		}
		return result.problem === 'full'
			? m.notAddedFull(field, max)
			: m.notAddedTooLong(field, maxLength);
	}

	$effect(() => editor.registerPendingText(field, commit));

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.isComposing) return;
		// Enter adds the item, it never submits the form
		event.preventDefault();
		if (!locked && text.trim()) add(text);
	}

	function onpaste(event: ClipboardEvent) {
		// A read-only input still gets paste events: a locked list takes nothing
		if (locked) return;
		const pasted = event.clipboardData?.getData('text') ?? '';
		if (!/\r?\n/.test(pasted.trim())) return;
		event.preventDefault();
		add(`${text}${pasted}`);
	}

	async function remove(index: number) {
		if (locked) return;
		const item = value[index];
		value = value.filter((_, position) => position !== index);
		problem = '';
		message = m.removed(item);
		editor.pendingTextChanged(field);
		await tick();
		// The next chip's remove button, else the previous one, else the text field
		const buttons = list?.querySelectorAll<HTMLButtonElement>('[data-remove-item]');
		const next = buttons?.[Math.min(index, (buttons?.length ?? 0) - 1)];
		(next ?? input)?.focus();
	}
</script>

<div class="min-w-0 space-y-2">
	<label for={id} class="label-text text-sm">
		{label}
		{#if locked}
			<LockClosed
				size="14"
				class="ms-0.5 inline-block align-[-2px] text-surface-700-300"
				aria-hidden="true"
			/>
		{/if}
	</label>
	{#if locked}
		<span id={lockedId} class="sr-only">{fieldMessages.locked}</span>
	{/if}
	<div class="flex gap-2">
		<input
			bind:this={input}
			bind:value={text}
			oninput={() => {
				problem = '';
				editor.pendingTextChanged(field);
			}}
			{id}
			class="input min-w-0 flex-1"
			type="text"
			autocomplete="off"
			enterkeyhint="done"
			maxlength={maxLength}
			disabled={full && !text && !locked}
			readonly={locked}
			placeholder={locked ? '' : full ? m.atMost(field, max) : placeholder}
			aria-invalid={error ? true : undefined}
			aria-describedby={[locked ? lockedId : '', hintId, error ? editor.errorId(field) : '']
				.filter(Boolean)
				.join(' ')}
			{onkeydown}
			{onpaste}
		/>
		<button
			type="button"
			class="btn preset-tonal-primary shrink-0"
			disabled={locked || full || !text.trim()}
			onclick={() => {
				add(text);
				input?.focus();
			}}
		>
			<Plus size="18" aria-hidden="true" />
			{common.add}<span class="sr-only">{` ${m.addWhat(field)}`}</span>
		</button>
	</div>
	{#if problem}
		<p class="text-sm text-warning-800-200" aria-hidden="true">{problem}</p>
	{/if}
	<p id={hintId} class="text-xs text-surface-700-300">
		{hint ? `${hint} ` : ''}{locked ? '' : m.pressEnter(value.length, max)}
	</p>
	{#if value.length > 0}
		<ul bind:this={list} class="flex flex-wrap gap-2" aria-label={m.addedItems(field, label)}>
			{#each value as item, index (item)}
				<li
					class="chip preset-tonal-primary max-w-full gap-1 py-1 ps-3 text-sm {locked
						? 'pe-3'
						: 'pe-1'}"
				>
					<span class="min-w-0 break-words whitespace-normal">{item}</span>
					{#if !locked}
						<button
							type="button"
							class="btn-icon size-7 shrink-0 rounded-full hover:preset-tonal"
							aria-label={m.removeItem(field, item)}
							data-remove-item
							onclick={() => remove(index)}
						>
							<XMark size="14" aria-hidden="true" />
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	<p class="sr-only" aria-live="polite">{message}</p>
	<FieldError {field} />
</div>
