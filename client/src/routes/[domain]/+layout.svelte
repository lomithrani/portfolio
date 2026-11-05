<script lang="ts">
	import '../../app.css';
	import Header from '#components/Header.svelte';
	import LeftBar from '#components/LeftBar.svelte';
	import { Toast } from '@skeletonlabs/skeleton-svelte';
	import { toaster } from '#services/toaster.ts';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import { browser } from '$app/env';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	$effect(() => {
		if (!browser) return;
		document.documentElement.dataset.theme = data.domain.theme ?? 'wintry';
	});
</script>

<div class="h-full flex flex-col">
	<!-- Header renders the page's <header> (AppBar) -->
	<Header headerTitle={data.domain.headerTitle} headerSubtitle={data.domain.headerSubtitle} />
	<div class="relative flex-1 overflow-hidden">
		<aside>
			<LeftBar domain={data.domain} />
		</aside>
		<main class="h-full overflow-auto scroll-smooth" id="page">
			{@render children()}
		</main>
	</div>
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
