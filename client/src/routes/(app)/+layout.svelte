<script lang="ts">
	import '../../app.css';
	import Header from '#components/Header.svelte';
	import ThemeToggle from '#components/ThemeToggle.svelte';
	import { Toast } from '@skeletonlabs/skeleton-svelte';
	import { toaster } from '#services/toaster.ts';
	import { isCurrentSection, recordSpaceShown } from '#services/account.ts';
	import { isSessionValid } from '#services/authentication.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { untrack, type Snippet } from 'svelte';
	import { get } from 'svelte/store';
	import { browser } from '$app/env';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	// Pages that belong to no portfolio: the recruiter space (/recruiter) and the public job pages
	// (/jobs). Same header and toasts as a portfolio; a slim bar replaces its rail (sections and
	// the light/dark switch).
	let { children }: { children: Snippet } = $props();

	$effect(() => {
		if (!browser) return;
		document.documentElement.dataset.theme = 'wintry';
	});

	let inRecruiterSpace = $derived(isCurrentSection(page.url.pathname, '/recruiter'));

	// "My job descriptions" once the session is known to have a recruiter space
	let isRecruiter = $derived(
		$sessionCheckedStore &&
			isSessionValid($authenticationStore) &&
			!!$authenticationStore.user?.recruiter
	);

	let inJobs = $derived(isCurrentSection(page.url.pathname, '/jobs'));

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

	let header = $derived(
		inRecruiterSpace
			? {
					title: 'Recruiter space',
					subtitle: 'Your job descriptions and the portfolios that apply'
				}
			: { title: 'Jobs', subtitle: 'Open job descriptions: apply with your portfolio' }
	);

	const linkClass = (current: boolean) =>
		`btn btn-sm ${current ? 'preset-tonal-primary font-semibold' : 'hover:preset-tonal'}`;
</script>

<div class="h-full flex flex-col">
	<Header headerTitle={header.title} headerSubtitle={header.subtitle} />
	<div
		class="flex items-center gap-2 border-b border-surface-200-800 bg-surface-50-950 px-3 py-1.5 md:px-4"
	>
		<nav aria-label="Jobs" class="min-w-0 flex-1 overflow-x-auto">
			<ul class="flex items-center gap-1">
				{#if isRecruiter || inRecruiterSpace}
					<li class="shrink-0">
						<a
							href={resolve('/(app)/recruiter')}
							class={linkClass(inRecruiterSpace)}
							aria-current={inRecruiterSpace ? 'page' : undefined}>My job descriptions</a
						>
					</li>
				{/if}
				<li class="shrink-0">
					<a
						href={resolve('/(app)/jobs')}
						class={linkClass(inJobs)}
						aria-current={inJobs ? 'page' : undefined}>Browse jobs</a
					>
				</li>
			</ul>
		</nav>
		<ThemeToggle />
	</div>
	<!-- relative: the page's absolutely positioned elements (sr-only text, live regions) are
	     placed in this scroll container, not at the top of the document, which they would make
	     scrollable: following an in-page link would then scroll the header out of reach -->
	<main class="relative flex-1 overflow-auto scroll-smooth" id="page">
		{@render children()}
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
