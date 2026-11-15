<!--
@component
A page-wide notice of the recruiter pages, in place of their content: signed out, no recruiter
space, a posting not found, an error. Icon, title, text (children) and actions (links, a retry
button).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Briefcase } from 'svelte-heros-v2';

	let {
		title,
		icon: Icon,
		tone = 'neutral',
		children,
		actions
	}: {
		title: string;
		icon: typeof Briefcase;
		/** error: something failed; neutral: a state to explain */
		tone?: 'neutral' | 'error';
		children: Snippet;
		actions?: Snippet;
	} = $props();

	const uid = $props.id();
</script>

<section
	class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-4 p-6 text-center md:p-10"
	aria-labelledby="{uid}-title"
>
	<div
		class="mx-auto flex size-12 items-center justify-center rounded-full {tone === 'error'
			? 'preset-tonal-error'
			: 'preset-tonal-primary'}"
	>
		<Icon size="24" aria-hidden="true" />
	</div>
	<h2 id="{uid}-title" class="text-xl font-bold">{title}</h2>
	<div class="mx-auto max-w-md space-y-2 text-surface-700-300">{@render children()}</div>
	{#if actions}
		<div class="flex flex-wrap justify-center gap-3">{@render actions()}</div>
	{/if}
</section>
