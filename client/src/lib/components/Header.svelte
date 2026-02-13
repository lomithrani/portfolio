<script lang="ts">
	import { isLogged, logout } from '$services/authentication';
	import { authenticationStore } from '$services/stores';
	import Login from '$components/Login.svelte';
	import { AppBar } from '@skeletonlabs/skeleton-svelte';
	import Logo from '$images/logo.svelte';
</script>

<AppBar>
	<AppBar.Toolbar>
		<AppBar.Lead><Logo height="50" width="50" /></AppBar.Lead>
		<AppBar.Headline>
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
		</AppBar.Headline>
		<AppBar.Trail>
			{#await isLogged()}
				...
			{:then logged}
				{#if $authenticationStore.expires ?? 0 > Date.now()}
					<button type="button" onclick={logout} aria-label="Logout">Logout</button>
				{:else}
					<Login />
				{/if}
			{/await}
		</AppBar.Trail>
	</AppBar.Toolbar>
</AppBar>
