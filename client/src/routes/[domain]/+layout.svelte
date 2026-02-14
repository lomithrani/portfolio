<script lang="ts">
	import '../../app.css';
	import Header from '$components/Header.svelte';
	import LeftBar from '$components/LeftBar.svelte';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import { browser } from '$app/environment';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	$effect(() => {
		if (!browser) return;
		document.documentElement.dataset.theme = data.domain.theme ?? 'wintry';
	});
</script>

<div class="h-full flex flex-col">
	<header>
		<Header headerTitle={data.domain.headerTitle} headerSubtitle={data.domain.headerSubtitle} />
	</header>
	<div class="flex flex-1 overflow-hidden">
		<aside class="w-auto h-full">
			<LeftBar domain={data.domain} />
		</aside>
		<main class="flex-1 overflow-auto scroll-smooth" id="page">
			{@render children()}
		</main>
	</div>
</div>
