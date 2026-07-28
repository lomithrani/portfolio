<script lang="ts">
	import '../app.css';
	import ClaimDomain from '$components/ClaimDomain.svelte';
	import { page } from '$app/stores';
</script>

{#if $page.status === 404 && $page.error?.domainName}
	<ClaimDomain domainName={$page.error.domainName} />
{:else}
	<div class="h-full flex flex-col items-center justify-center gap-4 p-8">
		<h1 class="text-4xl font-bold">{$page.status}</h1>
		<p class="text-lg text-surface-600-400">{$page.error?.message ?? 'Something went wrong'}</p>
	</div>
{/if}
