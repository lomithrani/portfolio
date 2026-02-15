<script lang="ts">
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import ClaimDomainModal from '$components/modals/ClaimDomainModal.svelte';

	let { domainName }: { domainName: string } = $props();

	let showModal = $state(false);
</script>

<div class="h-full flex flex-col items-center justify-center gap-6 p-8">
	<h1 class="text-4xl font-bold">{domainName}</h1>
	<p class="text-lg text-surface-600-400">This domain is not yet claimed.</p>
	<button class="btn preset-filled text-lg" onclick={() => (showModal = true)}>
		Claim this domain
	</button>
</div>

<Dialog open={showModal} onOpenChange={(details) => (showModal = details.open)}>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex justify-center items-center p-4">
			<Dialog.Content
				class="card bg-surface-100-900 w-full max-w-md shadow-xl max-h-[calc(100vh-2rem)] overflow-y-auto"
			>
				{#if showModal}
					<ClaimDomainModal {domainName} onClose={() => (showModal = false)} />
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
