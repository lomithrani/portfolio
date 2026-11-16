<script lang="ts">
	import '../../app.css';
	import Header from '#components/Header.svelte';
	import LeftBar from '#components/LeftBar.svelte';
	import LegalLinks from '#components/legal/LegalLinks.svelte';
	import FeedbackButton from '#components/feedback/FeedbackButton.svelte';
	import { Toast } from '@skeletonlabs/skeleton-svelte';
	import { toaster } from '#services/toaster.ts';
	import { common } from '#lib/i18n/common.messages.ts';
	import { recordSpaceShown } from '#services/account.ts';
	import { sessionCheckedStore } from '#services/stores/index.ts';
	import type { LayoutData } from './$types';
	import { untrack, type Snippet } from 'svelte';
	import { get } from 'svelte/store';
	import { browser } from '$app/env';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import LocaleLinks from '#lib/i18n/LocaleLinks.svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// The account's own portfolio records the candidate space as its active one, as the recruiter
	// pages record theirs ((app)/+layout.svelte), so the account menu names the space shown
	const recordShown = () => {
		if (get(sessionCheckedStore)) void recordSpaceShown(page.url.pathname);
	};
	afterNavigate(recordShown);
	$effect(() => {
		if ($sessionCheckedStore) untrack(recordShown);
	});

	let headerTitle = $derived(data.domain.headerTitle?.trim() ?? '');

	$effect(() => {
		if (!browser) return;
		document.documentElement.dataset.theme = data.domain.theme ?? 'wintry';
	});
</script>

<LocaleLinks />

<div class="h-full flex flex-col">
	<!-- Header renders the page's <header> (AppBar) -->
	<!-- A portfolio whose owner set no title is headed by its address name ('jane.doe') -->
	<Header
		headerTitle={headerTitle || data.domain.name}
		headerSubtitle={data.domain.headerSubtitle}
	/>
	<div class="relative flex-1 overflow-hidden">
		<aside>
			<LeftBar domain={data.domain} />
		</aside>
		<!-- relative: the page's absolutely positioned elements (the hidden input of a switch,
		     sr-only text, live regions) are placed in this scroll container and scroll with the
		     page (see (app)/+layout.svelte). Placed in the box around it, they stay where the page
		     was before it scrolled and make that box scrollable: focusing one (a switch pressed
		     further down the page) scrolls the rail and the whole page out of sight -->
		<main class="relative flex h-full flex-col overflow-auto scroll-smooth" id="page">
			<div class="flex-1">
				{@render children()}
			</div>
			<!-- The legal pages, small, at the end of every page of the portfolio: they scroll with it.
			     Its side padding clears the sidebar's handle -->
			<footer class="portfolio-legal border-t border-surface-200-800 px-10 py-3">
				<div class="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-3 gap-y-1">
					<LegalLinks compact class="justify-center" />
					<FeedbackButton class="text-xs" />
				</div>
			</footer>
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
			<Toast.CloseTrigger aria-label={common.dismissNotification} />
		</Toast>
	{/snippet}
</Toast.Group>

<style>
	/* Small screens: the experiences page's floating "Add" button sits at the bottom right, over the
	   end of the page; the links stay above it */
	@media (max-width: 47.999rem) {
		:global(body:has([data-add-fab])) .portfolio-legal {
			padding-bottom: calc(5rem + env(safe-area-inset-bottom));
		}
	}
</style>
