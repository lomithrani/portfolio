<script lang="ts">
	import { isLogged, isSessionValid, watchSessionExpiry } from '#services/authentication.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import Login from '#components/Login.svelte';
	import AccountMenu, { ACCOUNT_MENU_TRIGGER_ID } from '#components/AccountMenu.svelte';
	import SpaceChooser from '#components/SpaceChooser.svelte';
	import { AppBar } from '@skeletonlabs/skeleton-svelte';
	import Logo from '#images/logo.svelte';
	import { onMount } from 'svelte';

	let { headerTitle, headerSubtitle }: { headerTitle?: string; headerSubtitle?: string } = $props();

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
</script>

<AppBar class="px-3 py-2 md:p-4">
	<AppBar.Toolbar class="grid-cols-[auto_minmax(0,1fr)_auto] gap-2 md:gap-4">
		<AppBar.Lead>
			<!-- currentColor: the logo follows the text colour, visible in light and dark mode -->
			<span class="logo block size-9 text-surface-950-50 md:size-[50px]"><Logo /></span>
		</AppBar.Lead>
		<!-- Small screens: one line, smaller font, so the header stays short -->
		<AppBar.Headline class="min-w-0 text-center">
			<h1 class="truncate text-lg font-bold md:overflow-visible md:text-3xl md:whitespace-normal">
				{#if headerTitle}
					<span
						class="bg-gradient-to-br from-blue-500 to-cyan-300 bg-clip-text text-transparent box-decoration-clone"
						>{headerTitle}</span
					>
				{:else}
					<span
						class="bg-gradient-to-br from-blue-500 to-cyan-300 bg-clip-text text-transparent box-decoration-clone"
						>Problem Solver</span
					>

					<span
						class="bg-gradient-to-br from-red-500 to-yellow-500 bg-clip-text text-transparent box-decoration-clone"
						>Engineer</span
					>

					<span
						class="bg-gradient-to-br from-pink-500 to-violet-500 bg-clip-text text-transparent box-decoration-clone"
						>Programmer</span
					>
				{/if}
			</h1>
			{#if headerTitle && headerSubtitle}
				<p class="truncate text-xs opacity-75 md:whitespace-normal md:text-sm">{headerSubtitle}</p>
			{/if}
		</AppBar.Headline>
		<AppBar.Trail class="items-center">
			{#if !$sessionCheckedStore}
				<!-- The session is being checked: neither sign-in nor account yet (no flash of either) -->
				<span class="block size-10 animate-pulse rounded-full bg-surface-200-800" aria-hidden="true"
				></span>
			{:else if user}
				<AccountMenu {user} onClaimPortfolio={() => openChooser('claim')} />
			{:else}
				<Login onLogin={() => openChooser('choose')} />
			{/if}
		</AppBar.Trail>
	</AppBar.Toolbar>
</AppBar>

<SpaceChooser
	open={chooserOpen && !!user}
	start={chooserStart}
	onClose={() => (chooserOpen = false)}
	finalFocusEl={() => document.getElementById(ACCOUNT_MENU_TRIGGER_ID)}
/>

<style>
	.logo :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
</style>
