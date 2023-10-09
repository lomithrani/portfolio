<script lang="ts">
	import Experiences from './Experiences.svelte';
	import type { PageData } from './$types';
	import Filters from './Filters.svelte';
	export let data: PageData;
</script>

<svelte:head>
	<title>Experiences</title>
	<meta name="description" content="My experiences" />
</svelte:head>

<div class="text-column">
	{#if !data?.experiences}
		Loading
	{/if}
	{#if data?.experiences}
		<Filters experiences={data.experiences} />
		<Experiences experiences={data.experiences} />
	{/if}
</div>
