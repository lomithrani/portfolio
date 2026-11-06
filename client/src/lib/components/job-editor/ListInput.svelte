<!--
@component
A short list of the job editor (skills, languages, benefits): type an item and press Enter (or
Add); paste several lines to add one item per line. Items show as chips with a remove button.
Duplicates (ignoring case), blanks and what goes over the limits are not added, and the reason
is announced. Text typed and not added yet is added when the editor saves (it registers how); what
cannot be added then stops the save, as the field's error. The text input carries the field's
id: the label and the error summary point to it.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { Plus, XMark } from 'svelte-heros-v2';
	import { addListItems, type JobFormField } from '#services/jobPosting.ts';
	import FieldError from './FieldError.svelte';
	import { getJobEditorContext } from './context';

	let {
		field,
		label,
		value = $bindable([]),
		max,
		maxLength,
		itemName,
		placeholder = '',
		hint = ''
	}: {
		field: JobFormField;
		label: string;
		value?: string[];
		/** Items the list can hold */
		max: number;
		/** Characters per item */
		maxLength: number;
		/** What one item is called in messages: 'skill', 'language', 'benefit' */
		itemName: string;
		placeholder?: string;
		hint?: string;
	} = $props();

	const editor = getJobEditorContext();
	let id = $derived(editor.fieldId(field));
	let hintId = $derived(`${id}-hint`);
	let error = $derived(editor.error(field));

	let text = $state('');
	/** Announced to screen readers: what was added or removed, and why something was not */
	let message = $state('');
	/** Shown under the field too: why what was typed was not added */
	let problem = $state('');
	let input: HTMLInputElement | undefined = $state();
	let list: HTMLUListElement | undefined = $state();
	let full = $derived(value.length >= max);

	const quoted = (items: string[]) => items.map((item) => `“${item}”`).join(', ');

	let problems = $derived({
		duplicate: `Already in the list.`,
		full: `The list is full: ${max} ${itemName}s at most.`,
		too_long: `Each ${itemName} must be at most ${maxLength} characters.`
	});

	function add(raw: string) {
		const result = addListItems(value, raw, { max, maxLength });
		if (result.added.length > 0) value = result.list;
		const added = result.added.length > 0 ? `Added ${quoted(result.added)}.` : '';
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
		if (!text.trim()) return undefined;
		const result = addListItems(value, text, { max, maxLength });
		if (result.added.length > 0) value = result.list;
		problem = '';
		if (!result.problem || result.problem === 'duplicate') {
			text = '';
			message = result.added.length > 0 ? `Added ${quoted(result.added)}.` : '';
			return undefined;
		}
		return result.problem === 'full'
			? `Not added: the list is full (${max} ${itemName}s at most). Remove one, or clear the text.`
			: `Not added: each ${itemName} must be at most ${maxLength} characters. Shorten it, or clear it.`;
	}

	$effect(() => editor.registerPendingText(field, commit));

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.isComposing) return;
		// Enter adds the item, it never submits the form
		event.preventDefault();
		if (text.trim()) add(text);
	}

	function onpaste(event: ClipboardEvent) {
		const pasted = event.clipboardData?.getData('text') ?? '';
		if (!/\r?\n/.test(pasted.trim())) return;
		event.preventDefault();
		add(`${text}${pasted}`);
	}

	async function remove(index: number) {
		const item = value[index];
		value = value.filter((_, position) => position !== index);
		problem = '';
		message = `Removed “${item}”.`;
		editor.pendingTextChanged(field);
		await tick();
		// The next chip's remove button, else the previous one, else the text field
		const buttons = list?.querySelectorAll<HTMLButtonElement>('[data-remove-item]');
		const next = buttons?.[Math.min(index, (buttons?.length ?? 0) - 1)];
		(next ?? input)?.focus();
	}
</script>

<div class="min-w-0 space-y-2">
	<label for={id} class="label-text text-sm">{label}</label>
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
			disabled={full && !text}
			placeholder={full ? `${max} ${itemName}s at most` : placeholder}
			aria-invalid={error ? true : undefined}
			aria-describedby={[hintId, error ? editor.errorId(field) : ''].filter(Boolean).join(' ')}
			{onkeydown}
			{onpaste}
		/>
		<button
			type="button"
			class="btn preset-tonal-primary shrink-0"
			disabled={full || !text.trim()}
			onclick={() => {
				add(text);
				input?.focus();
			}}
		>
			<Plus size="18" aria-hidden="true" />
			Add<span class="sr-only"> {itemName}</span>
		</button>
	</div>
	{#if problem}
		<p class="text-sm text-warning-800-200" aria-hidden="true">{problem}</p>
	{/if}
	<p id={hintId} class="text-xs text-surface-700-300">
		{hint ? `${hint} ` : ''}Press Enter to add. {value.length} of {max}.
	</p>
	{#if value.length > 0}
		<ul bind:this={list} class="flex flex-wrap gap-2" aria-label="{label} added">
			{#each value as item, index (item)}
				<li class="chip preset-tonal-primary max-w-full gap-1 py-1 ps-3 pe-1 text-sm">
					<span class="min-w-0 break-words whitespace-normal">{item}</span>
					<button
						type="button"
						class="btn-icon size-7 shrink-0 rounded-full hover:preset-tonal"
						aria-label="Remove {itemName} {item}"
						data-remove-item
						onclick={() => remove(index)}
					>
						<XMark size="14" aria-hidden="true" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	<p class="sr-only" aria-live="polite">{message}</p>
	<FieldError {field} />
</div>
