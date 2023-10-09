<script lang="ts">
	import { authTracker, hasOneOf } from '$services/authentication';
	import Login from '$components/Login.svelte';
	import { AppBar } from '@skeletonlabs/skeleton';
</script>

<AppBar gridColumns="grid-cols-3" slotDefault="place-self-center" slotTrail="place-content-end">
	<svelte:fragment slot="lead">LG</svelte:fragment>
	<h3 class="h3">
		Problem Solver <span class="divider-vertical" /> Engineer
		<span class="divider-vertical" /> Programmer
	</h3>
	<svelte:fragment slot="trail">
		{#if !$authTracker.authenticated}
			<Login />
		{/if}
	</svelte:fragment>
</AppBar>
