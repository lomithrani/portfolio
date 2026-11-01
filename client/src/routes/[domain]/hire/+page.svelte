<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let ownerName = $derived(data.domain.headerTitle || data.domainName);
</script>

<svelte:head>
	<title>Hire {ownerName}</title>
	<meta name="description" content={`Hire ${ownerName}.`} />
</svelte:head>

<div class="text-column">
	<h1>Job description</h1>
</div>
