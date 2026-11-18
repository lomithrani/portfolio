<script lang="ts">
	import '../../app.css';
	import Header from '#components/Header.svelte';
	import LegalFooter from '#components/legal/LegalFooter.svelte';
	import { Toast } from '@skeletonlabs/skeleton-svelte';
	import { toaster } from '#services/toaster.ts';
	import { common } from '#lib/i18n/common.messages.ts';
	import { isCurrentSection } from '#services/account.ts';
	import type { Snippet } from 'svelte';
	import { browser } from '$app/env';
	import { page } from '$app/state';
	import { SITE_NAME } from '#components/legal/legalDocuments.ts';
	import { m } from './layout.messages.ts';

	// The site's own pages, which belong to no portfolio: the landing page (/), the legal pages
	// (/legal...) and the account page (/account). Same header and toasts as the other layouts
	// (its logo leads back to the landing page), with the site footer: the recruiter space, the
	// language and light/dark switches and the legal pages. The header offers no Google
	// sign-in here: the landing page signs in after its age and terms checkbox, and nothing else
	// on these pages needs a session to read.
	let { children }: { children: Snippet } = $props();

	$effect(() => {
		if (!browser) return;
		document.documentElement.dataset.theme = 'wintry';
	});

	let pathname = $derived(page.url.pathname);

	let header = $derived.by(() => {
		if (isCurrentSection(pathname, '/legal')) return m.legal;
		if (isCurrentSection(pathname, '/account')) return m.account;
		return { title: SITE_NAME, subtitle: m.home.subtitle };
	});
</script>

<div class="h-full flex flex-col">
	<Header headerTitle={header.title} headerSubtitle={header.subtitle} showSignIn={false} homeLink />
	<!-- relative: the page's absolutely positioned elements (sr-only text, live regions) are
	     placed in this scroll container, not at the top of the document (see (app)/+layout.svelte).
	     The footer scrolls with the page: it closes every page, it does not take room from it -->
	<main
		class="relative flex flex-1 flex-col overflow-auto scroll-smooth motion-reduce:scroll-auto"
		id="page"
	>
		<div class="flex-1">
			{@render children()}
		</div>
		<LegalFooter />
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
			<Toast.CloseTrigger aria-label={common.dismissNotification} />
		</Toast>
	{/snippet}
</Toast.Group>
