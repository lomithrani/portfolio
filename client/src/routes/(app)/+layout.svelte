<script lang="ts">
	import '../../app.css';
	import Header from '#components/Header.svelte';
	import ThemeToggle from '#components/ThemeToggle.svelte';
	import LegalLinks from '#components/legal/LegalLinks.svelte';
	import FeedbackButton from '#components/feedback/FeedbackButton.svelte';
	import { Toast } from '@skeletonlabs/skeleton-svelte';
	import { toaster } from '#services/toaster.ts';
	import { common } from '#lib/i18n/common.messages.ts';
	import { isCurrentSection, recordSpaceShown } from '#services/account.ts';
	import { sessionCheckedStore } from '#services/stores/index.ts';
	import { untrack, type Snippet } from 'svelte';
	import { get } from 'svelte/store';
	import { browser } from '$app/env';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import LanguageSwitch from '#lib/i18n/LanguageSwitch.svelte';
	import LocaleLinks from '#lib/i18n/LocaleLinks.svelte';
	import { NOINDEX, isNoindexRoute } from '#lib/robots.ts';
	import { m } from './layout.messages.ts';

	// Pages that belong to no portfolio: the recruiter space (/recruiter) and the public job pages
	// (/jobs). Same header and toasts as a portfolio, without its rail: the account menu leads
	// from one to the other (the spaces, Browse jobs), the header's logo to the landing page, and
	// the language and light/dark switches close the page, next to the legal links.
	let { children }: { children: Snippet } = $props();

	$effect(() => {
		if (!browser) return;
		document.documentElement.dataset.theme = 'wintry';
	});

	let inRecruiterSpace = $derived(isCurrentSection(page.url.pathname, '/recruiter'));

	// A page of the recruiter space records it as the account's active space (recordSpaceShown),
	// so the account menu names the space shown: after each navigation (a link, a bookmark, the
	// menu, which only navigates), and once the session is known for the page the visit began on.
	// A navigation the page kept (unsaved changes) records nothing.
	const recordShown = () => {
		if (get(sessionCheckedStore)) void recordSpaceShown(page.url.pathname);
	};
	afterNavigate(recordShown);
	$effect(() => {
		if ($sessionCheckedStore) untrack(recordShown);
	});

	let header = $derived(inRecruiterSpace ? m.recruiter : m.jobs);

	// The pages of the recruiter space that hold a job description are not listed by search
	// engines (#lib/robots.ts; the server sends the same as a header): no canonical or hreflang
	// link there, only the others name their addresses
	let noindex = $derived(isNoindexRoute(page.route.id));
</script>

<svelte:head>
	{#if noindex}
		<meta name="robots" content={NOINDEX} />
	{/if}
</svelte:head>
{#if !noindex}
	<LocaleLinks />
{/if}

<div class="h-full flex flex-col">
	<Header headerTitle={header.title} headerSubtitle={header.subtitle} homeLink />
	<!-- relative: the page's absolutely positioned elements (sr-only text, live regions) are
	     placed in this scroll container, not at the top of the document, which they would make
	     scrollable: following an in-page link would then scroll the header out of reach -->
	<main class="relative flex flex-1 flex-col overflow-auto scroll-smooth" id="page">
		<div class="flex-1">
			{@render children()}
		</div>
		<!-- The legal pages, small, and the language and light/dark switches at the end of every
		     page: they scroll with it -->
		<footer
			class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-surface-200-800 px-4 py-3 md:px-6"
		>
			<LegalLinks compact class="justify-center" />
			<FeedbackButton class="text-xs" />
			<div class="flex items-center gap-2">
				<LanguageSwitch />
				<ThemeToggle />
			</div>
		</footer>
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
