<script lang="ts">
	import '../../app.css';
	import Header from '#components/Header.svelte';
	import ThemeToggle from '#components/ThemeToggle.svelte';
	import LegalFooter from '#components/legal/LegalFooter.svelte';
	import { Toast } from '@skeletonlabs/skeleton-svelte';
	import { toaster } from '#services/toaster.ts';
	import { isCurrentSection } from '#services/account.ts';
	import type { Snippet } from 'svelte';
	import { browser } from '$app/env';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	// The site's own pages, which belong to no portfolio: the landing page (/), the legal pages
	// (/legal...) and the account page (/account). Same header and toasts as the other layouts,
	// with the legal footer. The header offers no Google sign-in here: the landing page signs in
	// after its age and terms checkbox, and nothing else on these pages needs a session to read.
	let { children }: { children: Snippet } = $props();

	$effect(() => {
		if (!browser) return;
		document.documentElement.dataset.theme = 'wintry';
	});

	let pathname = $derived(page.url.pathname);
	let onHome = $derived(pathname === resolve('/(site)'));

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

	const linkClass = (current: boolean) =>
		`btn btn-sm ${current ? 'preset-tonal-primary font-semibold' : 'hover:preset-tonal'}`;
</script>

<div class="h-full flex flex-col">
	<Header
		headerTitle={header.title}
		headerSubtitle={header.subtitle}
		headerLang={french ? 'fr' : undefined}
		showSignIn={false}
	/>
	<div
		class="flex items-center gap-2 border-b border-surface-200-800 bg-surface-50-950 px-3 py-1.5 md:px-4"
	>
		<nav aria-label="Site" class="min-w-0 flex-1 overflow-x-auto" lang={french ? 'fr' : undefined}>
			<ul class="flex items-center gap-1">
				<li class="shrink-0">
					<a
						href={resolve('/(site)')}
						class={linkClass(onHome)}
						aria-current={onHome ? 'page' : undefined}>{french ? 'Accueil' : 'Home'}</a
					>
				</li>
				<li class="shrink-0">
					<a href={resolve('/(app)/jobs')} class={linkClass(false)}
						>{french ? "Offres d'emploi" : 'Browse jobs'}</a
					>
				</li>
				<li class="shrink-0">
					<a href={resolve('/(app)/recruiter')} class={linkClass(false)}
						>{french ? 'Pour les recruteurs' : 'For recruiters'}</a
					>
				</li>
			</ul>
		</nav>
		<ThemeToggle />
	</div>
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
