<script lang="ts">
	import '../../app.postcss';
	import { AppShell, Modal } from '@skeletonlabs/skeleton';
	import Header from '$components/Header.svelte';
	import LeftBar from '$components/LeftBar.svelte';
	import type { LayoutData } from './$types';
	import { initializeStores } from '@skeletonlabs/skeleton';

	initializeStores();
	export let data: LayoutData;
</script>

<Modal />
<AppShell regionPage="scroll-smooth">
	<svelte:fragment slot="header"><Header /></svelte:fragment>
	<svelte:fragment slot="sidebarLeft"><LeftBar domain={data.domain} /></svelte:fragment>

	<!-- Router Slot -->
	<slot />
	<!-- ---- / ---- -->
</AppShell>
