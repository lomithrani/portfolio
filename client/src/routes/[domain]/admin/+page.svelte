<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import CosmeticSettings from '$components/admin/CosmeticSettings.svelte';
	import WorkflowsTab from '$components/admin/WorkflowsTab.svelte';
	import AppointmentsTab from '$components/admin/AppointmentsTab.svelte';
	import { authenticationStore } from '$services/stores';
	import { isDomainAdmin } from '$services/authentication';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The API enforces authorization; this only avoids showing forms that cannot be saved
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});

	let isAdmin = $derived(mounted && isDomainAdmin($authenticationStore, data.domain));
</script>

<svelte:head>
	<title>Admin Settings</title>
	<meta name="description" content="Admin settings" />
</svelte:head>

{#if isAdmin}
	<div class="max-w-4xl mx-auto">
		<Tabs defaultValue="appearance">
			<div class="sticky top-0 z-10 bg-surface-50-950">
				<Tabs.List>
					<Tabs.Trigger value="appearance">Appearance</Tabs.Trigger>
					<Tabs.Trigger value="workflows">Workflows</Tabs.Trigger>
					<Tabs.Trigger value="appointments">Appointments</Tabs.Trigger>
					<Tabs.Indicator />
				</Tabs.List>
			</div>
			<div class="p-8">
				<Tabs.Content value="appearance">
					<CosmeticSettings />
				</Tabs.Content>
				<Tabs.Content value="workflows">
					<WorkflowsTab />
				</Tabs.Content>
				<Tabs.Content value="appointments">
					<AppointmentsTab />
				</Tabs.Content>
			</div>
		</Tabs>
	</div>
{:else if mounted}
	<div class="flex flex-col items-center justify-center gap-4 p-8">
		<p class="text-lg text-surface-600-400">
			Only the admin of this domain can change its settings. Please log in.
		</p>
		<a class="btn preset-tonal" href={resolve('/[domain]/experiences', { domain: data.domainName })}>
			Back to experiences
		</a>
	</div>
{/if}
