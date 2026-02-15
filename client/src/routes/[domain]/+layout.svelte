<script lang="ts">
	import '../../app.css';
	import Header from '$components/Header.svelte';
	import LeftBar from '$components/LeftBar.svelte';
	import ClaimDomain from '$components/ClaimDomain.svelte';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import { browser } from '$app/environment';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	$effect(() => {
		if (!browser || !data.domain) return;
		document.documentElement.dataset.theme = data.domain.theme ?? 'wintry';
	});
</script>

{#if data.domain}
	<div class="h-full flex flex-col">
		<header>
			<Header headerTitle={data.domain.headerTitle} headerSubtitle={data.domain.headerSubtitle} />
		</header>
		<div class="relative flex-1 overflow-hidden">
			<aside>
				<LeftBar domain={data.domain} />
			</aside>
			<main class="h-full overflow-auto scroll-smooth" id="page">
				{@render children()}
			</main>
		</div>
	</div>
{:else}
	<ClaimDomain domainName={data.domainName} />
{/if}
