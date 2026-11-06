<script lang="ts">
	import '../../app.css';
	import Header from '#components/Header.svelte';
	import { Toast } from '@skeletonlabs/skeleton-svelte';
	import { toaster } from '#services/toaster.ts';
	import type { Snippet } from 'svelte';
	import { browser } from '$app/env';

	// Pages that belong to no portfolio: the recruiter space (/recruiter) and the public job pages
	// (/jobs). Same header and toasts as a portfolio, without its rail.
	let { children }: { children: Snippet } = $props();

	$effect(() => {
		if (!browser) return;
		document.documentElement.dataset.theme = 'wintry';
	});
</script>

<div class="h-full flex flex-col">
	<Header headerTitle="Jobs" headerSubtitle="Job descriptions and the portfolios that apply" />
	<main class="flex-1 overflow-auto scroll-smooth" id="page">
		{@render children()}
	</main>
</div>

<Toast.Group {toaster}>
	{#snippet children(toast)}
		<Toast {toast}>
			<Toast.Message>
				<Toast.Title>{toast.title}</Toast.Title>
				{#if toast.description}
					<Toast.Description>{toast.description}</Toast.Description>
				{/if}
			</Toast.Message>
			{#if toast.action}
				<Toast.ActionTrigger>{toast.action.label}</Toast.ActionTrigger>
			{/if}
			<Toast.CloseTrigger />
		</Toast>
	{/snippet}
</Toast.Group>
