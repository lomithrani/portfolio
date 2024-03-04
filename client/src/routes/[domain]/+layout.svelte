<script lang="ts">
	import '../../app.postcss';
	import { AppShell, Modal } from '@skeletonlabs/skeleton';
	import Header from '$components/Header.svelte';
	import LeftBar from '$components/LeftBar.svelte';
	import ExperienceModal from '$components/modals/ExperienceModal.svelte';
	import type { LayoutData } from './$types';
	import { initializeStores, type ModalComponent } from '@skeletonlabs/skeleton';

	const modalRegistry: Record<string, ModalComponent> = {
		experienceModal: { ref: ExperienceModal }
	};

	initializeStores();
	export let data: LayoutData;
</script>

<Modal components={modalRegistry} />
<AppShell regionPage="scroll-smooth">
	<svelte:fragment slot="header"><Header /></svelte:fragment>
	<svelte:fragment slot="sidebarLeft"><LeftBar domain={data.domain} /></svelte:fragment>

	<!-- Router Slot -->
	<slot />
	<!-- ---- / ---- -->
</AppShell>
