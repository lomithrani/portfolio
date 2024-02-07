<script lang="ts">
	import { isLogged, logout } from '$services/authentication';
	import { authenticationStore } from '$services/stores';
	import Login from '$components/Login.svelte';
	import { AppBar } from '@skeletonlabs/skeleton';
	import Logo from '$images/logo.svelte';
</script>

<AppBar
	gridColumns="grid-cols-[auto,1fr,auto]"
	slotDefault="place-self-center"
	slotTrail="place-content-end"
>
	<svelte:fragment slot="lead"><Logo height="50" width="50" /></svelte:fragment>
	<h1 class="h1">
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
	<svelte:fragment slot="trail">
		{#await isLogged()}
			...
		{:then logged}
			{#if $authenticationStore.expires ?? 0 > Date.now()}
				<button type="button" on:click={logout} aria-label="Logout">Logout</button>
			{:else}
				<Login />
			{/if}
		{/await}
	</svelte:fragment>
</AppBar>
