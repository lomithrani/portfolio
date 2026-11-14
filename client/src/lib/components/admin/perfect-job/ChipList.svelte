<!--
@component
A short list of a perfect job criterion (job titles, places, skills): type an item and press
Enter (or Add); several at once separated by commas or pasted one per line. Items show as chips
with a remove button. What is typed is also added when the field is left, so nothing typed is
lost on a save. Duplicates (ignoring case), blanks and what goes over the limits are not added,
and the reason is said.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { Plus, XMark } from 'svelte-heros-v2';
	import { addListItems } from '#services/jobPosting.ts';

	let {
		label,
		value = $bindable([]),
		max,
		maxLength,
		itemName,
		placeholder = '',
		hint = '',
		error = '',
		disabled = false,
		id
	}: {
		label: string;
		value?: string[];
		/** Items the list can hold */
		max: number;
		/** Characters per item */
		maxLength: number;
		/** What one item is called in messages: 'skill', 'place', 'job title' */
		itemName: string;
		placeholder?: string;
		hint?: string;
		/** What is wrong with the list, shown under it */
		error?: string;
		disabled?: boolean;
		/** Unique in the page: the text input's id */
		id: string;
	} = $props();

	let text = $state('');
	/** Announced to screen readers: what was added or removed, and why something was not */
	let message = $state('');
	/** Shown under the field too: why what was typed was not added */
	let problem = $state('');
	let input: HTMLInputElement | undefined = $state();
	let list: HTMLUListElement | undefined = $state();
	let full = $derived(value.length >= max);

	const quoted = (items: string[]) => items.map((item) => `“${item}”`).join(', ');

	function add(raw: string) {
		const result = addListItems(value, raw.replace(/[,;]/g, '\n'), { max, maxLength });
		if (result.added.length > 0) value = result.list;
		const added = result.added.length > 0 ? `Added ${quoted(result.added)}.` : '';
		problem =
			result.problem === 'full'
				? `The list is full: ${max} ${itemName}s at most.`
				: result.problem === 'too_long'
					? `Each ${itemName} must be at most ${maxLength} characters.`
					: result.problem === 'duplicate'
						? 'Already in the list.'
						: '';
		message = [added, problem].filter(Boolean).join(' ');
		// What could not be added stays in the field, to fix it
		if (!result.problem || result.problem === 'duplicate' || result.added.length > 0) text = '';
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.isComposing) return;
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
			oninput={() => (problem = '')}
			onblur={() => {
				if (text.trim()) add(text);
			}}
			{id}
			class="input min-w-0 flex-1"
			type="text"
			autocomplete="off"
			enterkeyhint="done"
			maxlength={maxLength}
			disabled={disabled || (full && !text)}
			placeholder={full ? `${max} ${itemName}s at most` : placeholder}
			aria-invalid={error ? true : undefined}
			aria-describedby="{id}-hint{error ? ` ${id}-error` : ''}"
			{onkeydown}
			{onpaste}
		/>
		<button
			type="button"
			class="btn preset-tonal-primary shrink-0"
			disabled={disabled || full || !text.trim()}
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
	<p id="{id}-hint" class="text-xs text-surface-700-300">
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
						{disabled}
						onclick={() => remove(index)}
					>
						<XMark size="14" aria-hidden="true" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	<p class="sr-only" aria-live="polite">{message}</p>
	{#if error}
		<p class="text-sm text-error-700-300" id="{id}-error">{error}</p>
	{/if}
</div>
