<!--
@component
A message with marked-up passages (see rich.ts), each rendered by the snippet named like its tag:

    <Rich text={m.details}>
      {#snippet privacy(text)}<a href={resolve('/(site)/legal/privacy')}>{text}</a>{/snippet}
    </Rich>

for `details: { en: 'Details in the <privacy>privacy policy</privacy>.', fr: ... }`. A passage
without a snippet is shown as plain text. The text is never read as HTML.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { richParts } from './rich.ts';

	let { text, ...tags }: { text: string; [tag: string]: Snippet<[string]> | string } = $props();

	let parts = $derived(richParts(text));
</script>

<!-- One line: no white space may be added between the parts of a sentence -->
<!-- prettier-ignore -->
{#each parts as part, index (index)}{@const tag = part.tag ? tags[part.tag] : undefined}{#if typeof tag === 'function'}{@render tag(part.text)}{:else}{part.text}{/if}{/each}
