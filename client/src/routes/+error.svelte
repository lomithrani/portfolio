<script lang="ts">
	import '../app.css';
	import ClaimDomain from '#components/ClaimDomain.svelte';
	import { page } from '$app/state';
	import { m } from './error.messages.ts';

	// The app's own errors come in the page's language; SvelteKit's are English only
	let message = $derived.by(() => {
		const text = page.error?.message;
		if (text === 'Not Found') return m.kit.notFound;
		if (text === 'Internal Error') return m.kit.internal;
		return text ?? m.fallback;
	});
</script>

<svelte:head>
	<title>{page.status === 404 ? m.pageTitle.notFound : m.pageTitle.error}</title>
</svelte:head>

<!-- domainName is only set for an unknown but claimable name (see [domain]/+layout.server.ts) -->
{#if page.status === 404 && page.error?.domainName}
	<ClaimDomain domainName={page.error.domainName} />
{:else}
	<div class="h-full flex flex-col items-center justify-center gap-4 p-8">
		<h1 class="text-4xl font-bold">{page.status}</h1>
		<p class="text-lg text-surface-600-400">{message}</p>
	</div>
{/if}
