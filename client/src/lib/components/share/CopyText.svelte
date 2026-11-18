<!--
@component
A text to copy, with its button (the Share tab's reply and LinkedIn text): the text stays in a
read-only field, so that when the browser refuses to copy it (no permission, no clipboard) the
field is selected for the person to copy it themselves. What happened is read out (a polite live
region), and the button says it for a while. Like CopyLink, for a text of several lines.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { Check, ClipboardDocument } from 'svelte-heros-v2';
	import { copyText } from '#services/candidateSetup.ts';
	import { m } from './CopyText.messages.ts';

	let {
		text,
		label,
		copyLabel,
		rows = 8
	}: {
		/** What is copied */
		text: string;
		/** The field's name for screen readers, also what the announcement names ("Your reply") */
		label: string;
		/** The button ("Copy the reply") */
		copyLabel: string;
		/** The fewest lines the field shows */
		rows?: number;
	} = $props();

	// The field grows with its text (field-sizing), so the whole text shows; where the browser
	// cannot size it so, it shows as many lines as the text has, counting a long line as several
	let lines = $derived(
		Math.max(
			rows,
			text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 60)), 0)
		)
	);

	const uid = $props.id();
	let field: HTMLTextAreaElement | undefined = $state();
	let copied = $state(false);
	let refused = $state(false);
	let announcement = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => () => clearTimeout(timer));

	// A text that changes is not the one copied anymore
	$effect(() => {
		void text;
		copied = false;
		refused = false;
	});

	async function copy() {
		refused = false;
		clearTimeout(timer);
		if (!(await copyText(text))) {
			copied = false;
			refused = true;
			field?.focus();
			field?.select();
			return;
		}
		copied = true;
		// Emptied first: copying again is read out again
		announcement = '';
		await tick();
		announcement = m.copiedAnnouncement(label);
		timer = setTimeout(() => (copied = false), 2500);
	}
</script>

<div class="space-y-2">
	<textarea
		bind:this={field}
		class="textarea field-sizing-content w-full resize-y text-sm leading-relaxed"
		rows={lines}
		readonly
		value={text}
		aria-label={label}
		aria-describedby={refused ? `${uid}-refused` : undefined}
		onfocus={(event) => event.currentTarget.select()}></textarea>
	<button
		type="button"
		class="btn min-h-11 preset-filled-primary-700-300 max-sm:w-full"
		data-copy-text
		onclick={copy}
	>
		{#if copied}
			<Check size="18" aria-hidden="true" />
			{m.copied}
		{:else}
			<ClipboardDocument size="18" aria-hidden="true" />
			{copyLabel}
		{/if}
	</button>
	{#if refused}
		<p id="{uid}-refused" class="text-sm text-warning-800-200">{m.copyYourself}</p>
	{/if}
	<p class="sr-only" aria-live="polite">{announcement}</p>
</div>
