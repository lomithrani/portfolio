<script lang="ts">
	import {
		isLogged,
		isSessionValid,
		logout,
		watchSessionExpiry
	} from '#services/authentication.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import Login from '#components/Login.svelte';
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
				...
			{:else if isSessionValid($authenticationStore)}
				<button type="button" class="btn btn-sm preset-tonal" onclick={() => logout()}>
					Logout
				</button>
			{:else}
				<Login />
			{/if}
		</AppBar.Trail>
	</AppBar.Toolbar>
</AppBar>

<style>
	.logo :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
</style>
