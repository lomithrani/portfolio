<!--
@component
The link of a portfolio with a button that copies it (the admin's "Get started" tab, the landing
page's onboarding card). The link stays in a read-only field: when the browser refuses to copy it
(no permission, no clipboard), the field is selected for the person to copy it themselves. What
happened is read out (a polite live region), and the button says it for a while.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { Check, ClipboardDocument } from 'svelte-heros-v2';
	import { copyText, linkText } from '#services/candidateSetup.ts';
	import { m } from './CopyLink.messages.ts';

	let {
		link,
		caption = '',
		tone = 'primary'
	}: {
		/** The full address copied ("https://site/jane.doe") */
		link: string;
		/** A line under the field: what the link is for */
		caption?: string;
		/** The button: `tonal` next to the main action of a step */
		tone?: 'primary' | 'tonal';
	} = $props();

	const uid = $props.id();
	let field: HTMLInputElement | undefined = $state();
	let copied = $state(false);
	let refused = $state(false);
	let announcement = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => () => clearTimeout(timer));

	async function copy() {
		refused = false;
		clearTimeout(timer);
		if (!(await copyText(link))) {
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
		announcement = m.copiedAnnouncement(linkText(link));
		timer = setTimeout(() => (copied = false), 2500);
	}
</script>

<div class="space-y-2">
	<div class="flex flex-wrap items-stretch gap-2">
		<input
			bind:this={field}
			class="input min-h-11 min-w-0 flex-1 basis-56 font-medium"
			type="text"
			readonly
			value={link}
			aria-label={m.label}
			aria-describedby={caption || refused ? `${uid}-caption` : undefined}
			onfocus={(event) => event.currentTarget.select()}
		/>
		<button
			type="button"
			class={[
				'btn min-h-11 max-sm:w-full',
				tone === 'primary' ? 'preset-filled-primary-700-300' : 'preset-tonal-primary'
			]}
			data-copy-link
			onclick={copy}
		>
			{#if copied}
				<Check size="18" aria-hidden="true" />
				{m.copied}
			{:else}
				<ClipboardDocument size="18" aria-hidden="true" />
				{m.copy}
			{/if}
		</button>
	</div>
	{#if caption || refused}
		<p
			id="{uid}-caption"
			class={['text-sm', refused ? 'text-warning-800-200' : 'text-surface-700-300']}
		>
			{refused ? m.copyYourself : caption}
		</p>
	{/if}
	<p class="sr-only" aria-live="polite">{announcement}</p>
</div>
