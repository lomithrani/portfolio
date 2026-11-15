<script lang="ts">
	import '../app.css';
	import ClaimDomain from '#components/ClaimDomain.svelte';
	import { page } from '$app/state';
	import { m } from './error.messages.ts';
	import { m as domainM } from './[domain]/layout.messages.ts';
	import { m as jobM } from '#services/applications.messages.ts';

	// The app's own errors carry a code: their sentence is read here, in the page's language (a
	// data request can be answered in another one, so the text the server chose may not match).
	// SvelteKit's are English only.
	const byCode: Record<NonNullable<App.Error['code']>, () => string> = {
		domainNotFound: () => domainM.domainNotFound,
		notFound: () => domainM.notFound,
		unavailable: () => domainM.unavailable,
		jobNotFound: () => jobM.jobNotFound,
		jobsUnavailable: () => jobM.jobsUnavailable
	};
	let message = $derived.by(() => {
		const code = page.error?.code;
		if (code && Object.hasOwn(byCode, code)) return byCode[code]();
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
