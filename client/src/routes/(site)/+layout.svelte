<script lang="ts">
	import '../../app.css';
	import Header from '#components/Header.svelte';
	import LegalFooter from '#components/legal/LegalFooter.svelte';
	import { Toast } from '@skeletonlabs/skeleton-svelte';
	import { toaster } from '#services/toaster.ts';
	import { isCurrentSection } from '#services/account.ts';
	import type { Snippet } from 'svelte';
	import { browser } from '$app/env';
	import { page } from '$app/state';

	// The site's own pages, which belong to no portfolio: the landing page (/), the legal pages
	// (/legal...) and the account page (/account). Same header and toasts as the other layouts
	// (its logo leads back to the landing page), with the site footer: the job board, the
	// recruiter space, the light/dark switch and the legal pages. The header offers no Google
	// sign-in here: the landing page signs in after its age and terms checkbox, and nothing else
	// on these pages needs a session to read.
	let { children }: { children: Snippet } = $props();

	$effect(() => {
		if (!browser) return;
		document.documentElement.dataset.theme = 'wintry';
	});

	let pathname = $derived(page.url.pathname);

	/** The French legal pages (`?lang=fr`): their header, site links and footer are in French */
	let french = $derived(
		isCurrentSection(pathname, '/legal') && page.url.searchParams.get('lang') === 'fr'
	);

	let header = $derived.by(() => {
		if (isCurrentSection(pathname, '/legal')) {
			return french
				? {
						title: 'Informations légales',
						subtitle: 'Mentions légales, confidentialité, conditions et cookies'
					}
				: { title: 'Legal', subtitle: 'Legal notice, privacy, terms and cookies' };
		}
		if (isCurrentSection(pathname, '/account')) {
			return { title: 'Your account', subtitle: 'Your data, the terms you accepted, deletion' };
		}
		return {
			title: 'Portfolio',
			subtitle: 'Your portfolio, your way. Hiring without the back-and-forth.'
		};
	});
</script>

<div class="h-full flex flex-col">
	<Header
		headerTitle={header.title}
		headerSubtitle={header.subtitle}
		headerLang={french ? 'fr' : undefined}
		showSignIn={false}
		homeLink
	/>
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
		<LegalFooter lang={french ? 'fr' : 'en'} />
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
