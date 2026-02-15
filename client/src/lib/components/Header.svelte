<script lang="ts">
	import { isLogged, logout } from '$services/authentication';
	import { authenticationStore } from '$services/stores';
	import Login from '$components/Login.svelte';
	import { AppBar } from '@skeletonlabs/skeleton-svelte';
	import Logo from '$images/logo.svelte';
	import { onMount } from 'svelte';

	let { headerTitle, headerSubtitle }: { headerTitle?: string; headerSubtitle?: string } =
		$props();

	let ready = $state(false);

	onMount(async () => {
		await isLogged();
		ready = true;
	});
</script>

<AppBar>
	<AppBar.Toolbar class="grid-cols-[auto_1fr_auto]">
		<AppBar.Lead><Logo height="50" width="50" /></AppBar.Lead>
		<AppBar.Headline class="text-center">
			{#if headerTitle}
				<h1 class="text-3xl font-bold">
					<span
						class="bg-gradient-to-br from-blue-500 to-cyan-300 bg-clip-text text-transparent box-decoration-clone"
						>{headerTitle}</span
					>
				</h1>
				{#if headerSubtitle}
					<p class="text-sm opacity-75">{headerSubtitle}</p>
				{/if}
			{:else}
				<h1 class="text-3xl font-bold">
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
				</h1>
			{/if}
		</AppBar.Headline>
		<AppBar.Trail>
			{#if !ready}
				...
			{:else if ($authenticationStore.expires ?? 0) * 1000 > Date.now()}
				<button type="button" class="btn btn-sm preset-tonal" onclick={logout} aria-label="Logout">Logout</button>
			{:else}
				<Login />
			{/if}
		</AppBar.Trail>
	</AppBar.Toolbar>
</AppBar>
