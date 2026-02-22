<script lang="ts">
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import CosmeticSettings from '$components/admin/CosmeticSettings.svelte';
	import WorkflowsTab from '$components/admin/WorkflowsTab.svelte';
	import AppointmentsTab from '$components/admin/AppointmentsTab.svelte';
</script>

<svelte:head>
	<title>Admin Settings</title>
	<meta name="description" content="Admin settings" />
</svelte:head>

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
