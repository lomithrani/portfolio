<script lang="ts">
	import '../app.postcss';
	import { AppShell } from '@skeletonlabs/skeleton';
	import Header from '$components/Header.svelte';
	import LeftBar from '$components/LeftBar.svelte';
</script>

<AppShell regionPage="scroll-smooth">
	<svelte:fragment slot="header"><Header /></svelte:fragment>
	<svelte:fragment slot="sidebarLeft"><LeftBar /></svelte:fragment>

	<!-- Router Slot -->
	<slot />
	<!-- ---- / ---- -->
</AppShell>
