<!--
@component
The link of a portfolio with a button that copies it (the admin's "Get started" and Share tabs, the
owner's preview of their page for recruiters, the landing page's onboarding card). The link stays
in a read-only field: when the browser refuses to copy it (no permission, no clipboard), the field
is selected for the person to copy it themselves. What happened is read out (a polite live
region), and the button says it for a while. A link wider than its field shows its end, the
portfolio's name, rather than the start every link shares; an edge where the link goes on out of
sight fades out, so the glyph the field cuts there never shows sliced in half.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { Check, ClipboardDocument } from 'svelte-heros-v2';
	import { copyText, linkText } from '#services/candidateSetup.ts';
	import { m } from './CopyLink.messages.ts';

	let {
		link,
		caption = '',
		tone = 'primary',
		stacked = false
	}: {
		/** The full address copied ("https://site/jane.doe") */
		link: string;
		/** A line under the field: what the link is for */
		caption?: string;
		/** The button: `tonal` next to the main action of a step */
		tone?: 'primary' | 'tonal';
		/** The button under the field, which takes the whole width: in a narrow column */
		stacked?: boolean;
	} = $props();

	const uid = $props.id();
	let field: HTMLInputElement | undefined = $state();
	let copied = $state(false);
	let refused = $state(false);
	let announcement = $state('');
	/** The link goes on out of sight before (after) what the field shows: that edge fades */
	let fadeStart = $state(false);
	let fadeEnd = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => () => clearTimeout(timer));

	/** Which edges cut the link, wherever the field is scrolled */
	const measureEdges = () => {
		if (!field) return;
		fadeStart = field.scrollLeft >= 1;
		fadeEnd = field.scrollLeft + field.clientWidth < field.scrollWidth - 1;
	};
	/** The end of the link in sight (its name), unless the field is in use */
	const showEnd = () => {
		if (field && document.activeElement !== field) field.scrollLeft = field.scrollWidth;
		measureEdges();
	};
	$effect(() => {
		void link;
		if (!field) return;
		showEnd();
		// Again when the field's width changes (a window resized, the page's layout settling)
		const observer = new ResizeObserver(showEnd);
		observer.observe(field);
		return () => observer.disconnect();
	});

	async function copy() {
		refused = false;
		clearTimeout(timer);
		// Emptied first: copying again is read out again
		announcement = '';
		if (!(await copyText(link))) {
			copied = false;
			refused = true;
			// The field is described by the message once it shows, and the message is read out too
			await tick();
			announcement = m.copyYourself;
			field?.focus();
			field?.select();
			return;
		}
		copied = true;
		await tick();
		announcement = m.copiedAnnouncement(linkText(link));
		timer = setTimeout(() => (copied = false), 2500);
	}
</script>

<div class="space-y-2">
	<div class={['flex gap-2', stacked ? 'flex-col items-start' : 'flex-wrap items-stretch']}>
		<div class={['relative min-w-0', stacked ? 'w-full' : 'flex-1 basis-56']}>
			<input
				bind:this={field}
				class="input h-full min-h-11 font-medium"
				type="text"
				readonly
				value={link}
				aria-label={m.label}
				aria-describedby={caption || refused ? `${uid}-caption` : undefined}
				onfocus={(event) => event.currentTarget.select()}
				onblur={showEnd}
				onscroll={measureEdges}
			/>
			<!-- Over the text's first (last) glyphs, in the field's own colour: a glyph cut at that edge
			     fades out instead of showing half of it. The field stays whole under it, selectable -->
			{#if fadeStart}
				<span class="edge-fade edge-start" data-fade="start" aria-hidden="true"></span>
			{/if}
			{#if fadeEnd}
				<span class="edge-fade edge-end" data-fade="end" aria-hidden="true"></span>
			{/if}
		</div>
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

<style>
	/* From the edge of the text (the field's padding, as Skeleton's `input` sets it) inwards, within
	   its ring; nothing to catch: a press goes through to the field */
	.edge-fade {
		--text-inset: calc((var(--text-base) - var(--spacing) * 0.5) / 2 + var(--spacing));
		position: absolute;
		inset-block: var(--default-ring-width, 1px);
		width: 1.5rem;
		pointer-events: none;
	}
	.edge-start {
		left: var(--text-inset);
		background: linear-gradient(to right, var(--color-surface-50-950), transparent);
	}
	.edge-end {
		right: var(--text-inset);
		background: linear-gradient(to left, var(--color-surface-50-950), transparent);
	}
	/* The system's colours replace the field's: a gradient of the old one would show */
	@media (forced-colors: active) {
		.edge-fade {
			display: none;
		}
	}
</style>
