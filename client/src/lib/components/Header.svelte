<script lang="ts">
	import { isLogged, isSessionValid, watchSessionExpiry } from '#services/authentication.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import Login, { SIGN_IN_ID } from '#components/Login.svelte';
	import AccountMenu, { ACCOUNT_MENU_TRIGGER_ID } from '#components/AccountMenu.svelte';
	import SpaceChooser from '#components/SpaceChooser.svelte';
	import FeedbackDialog from '#components/feedback/FeedbackDialog.svelte';
	import { AppBar } from '@skeletonlabs/skeleton-svelte';
	import Logo from '#images/logo.svelte';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from './Header.messages.ts';

	let {
		headerTitle,
		headerSubtitle,
		showSignIn = true,
		homeLink = false
	}: {
		/** A portfolio's title, or its address name when its owner set none ([domain]/+layout.svelte) */
		headerTitle: string;
		headerSubtitle?: string;
		/**
		 * false: no Google sign-in for a signed-out visitor (neither the button nor One Tap, so
		 * Google is not loaded): pages that sign in their own way, after a confirmation (the
		 * landing page's age and terms checkbox). The session is still checked and the account
		 * menu still shows once signed in.
		 */
		showSignIn?: boolean;
		/**
		 * true: the logo is a link to the landing page (the site's own pages and the recruiter
		 * space: nothing else on them leads there). A portfolio's header keeps a plain logo.
		 */
		homeLink?: boolean;
	} = $props();

	const home = resolve('/(site)');

	onMount(() => {
		const stopWatchingExpiry = watchSessionExpiry();
		// Reconcile the persisted session with the API before offering Login/Logout (and before
		// any admin-only UI appears: see sessionCheckedStore)
		void isLogged();
		return stopWatchingExpiry;
	});

	let user = $derived(
		$sessionCheckedStore && isSessionValid($authenticationStore)
			? $authenticationStore.user
			: undefined
	);

	// The space chooser: right after a sign-in here, or from the account menu's "Claim a portfolio"
	let chooserOpen = $state(false);
	let chooserStart = $state<'choose' | 'claim'>('choose');

	const openChooser = (start: 'choose' | 'claim') => {
		chooserStart = start;
		chooserOpen = true;
	};

	// The session ended (expired, or a logout in another tab: the session is shared between tabs):
	// the chooser closes for good, so a later sign-in elsewhere does not bring it back here
	let signedIn = $derived(!!user);
	$effect(() => {
		if (!signedIn) chooserOpen = false;
	});

	/** Back to the account menu; once the session ended, to the sign-in that replaced it */
	const chooserFinalFocus = () =>
		document.getElementById(ACCOUNT_MENU_TRIGGER_ID) ?? document.getElementById(SIGN_IN_ID);
</script>

<AppBar class="px-3 py-2 md:p-4">
	<AppBar.Toolbar class="grid-cols-[auto_minmax(0,1fr)_auto] gap-2 md:gap-4">
		<AppBar.Lead>
			<!-- currentColor: the logo follows the text colour, visible in light and dark mode -->
			{#if homeLink}
				<a
					href={home}
					class="logo block size-9 rounded text-surface-950-50 focus-visible:ring-2 focus-visible:ring-primary-500 md:size-[50px]"
					aria-label={m.home}
					aria-current={page.url.pathname === home ? 'page' : undefined}><Logo /></a
				>
			{:else}
				<span class="logo block size-9 text-surface-950-50 md:size-[50px]"><Logo /></span>
			{/if}
		</AppBar.Lead>
		<!-- Small screens: one line, smaller font, so the header stays short -->
		<AppBar.Headline class="min-w-0 text-center">
			<h1 class="truncate text-lg font-bold md:overflow-visible md:text-3xl md:whitespace-normal">
				<span
					class="bg-gradient-to-br from-blue-500 to-cyan-300 bg-clip-text text-transparent box-decoration-clone"
					>{headerTitle}</span
				>
			</h1>
			{#if headerSubtitle}
				<!-- Small screens: up to two balanced lines rather than a cut-off sentence -->
				<p class="line-clamp-2 text-xs text-balance opacity-75 md:line-clamp-none md:text-sm">
					{headerSubtitle}
				</p>
			{/if}
		</AppBar.Headline>
		<AppBar.Trail class="items-center">
			{#if !$sessionCheckedStore}
				<!-- The session is being checked: neither sign-in nor account yet (no flash of either) -->
				<span class="block size-10 animate-pulse rounded-full bg-surface-200-800" aria-hidden="true"
				></span>
			{:else if user}
				<AccountMenu {user} onClaimPortfolio={() => openChooser('claim')} />
			{:else if showSignIn}
				<Login onLogin={() => openChooser('choose')} />
			{/if}
		</AppBar.Trail>
	</AppBar.Toolbar>
</AppBar>

<SpaceChooser
	open={chooserOpen && !!user}
	start={chooserStart}
	onClose={() => (chooserOpen = false)}
	finalFocusEl={chooserFinalFocus}
/>

<!-- The page's one "Send feedback" dialog, opened from the account menu or the footer -->
<FeedbackDialog {signedIn} />

<style>
	.logo :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
</style>
