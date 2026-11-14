<script lang="ts">
	import { resolve } from '$app/paths';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import CosmeticSettings from '#components/admin/CosmeticSettings.svelte';
	import WorkflowsTab from '#components/admin/WorkflowsTab.svelte';
	import PerfectJobTab from '#components/admin/PerfectJobTab.svelte';
	import AppointmentsTab from '#components/admin/AppointmentsTab.svelte';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { isDomainAdmin } from '#services/authentication.ts';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The API enforces authorization; this only avoids showing forms that cannot be saved.
	// Nothing is shown until the session has been checked with the API (in the browser).
	let isAdmin = $derived($sessionCheckedStore && isDomainAdmin($authenticationStore, data.domain));

	/** The tab shown: a tab can lead to another (the perfect job to the journey that uses it) */
	let tab = $state('appearance');
	let tabList: HTMLElement | undefined = $state();

	/** Tabs are out of sight on the right of their row: its edge fades, to say so */
	let moreTabs = $state(false);

	function measureTabs() {
		const list = tabList?.querySelector('[role="tablist"]');
		moreTabs = !!list && list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
	}

	// On a phone the tabs do not all fit: their row scrolls, and follows the tab shown
	$effect(() => {
		const selected = tabList?.querySelector(`[role="tab"][data-value="${tab}"]`);
		selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		measureTabs();
	});
</script>

<svelte:window onresize={measureTabs} />

<svelte:head>
	<title>Admin Settings</title>
	<meta name="description" content="Admin settings" />
</svelte:head>

{#if isAdmin}
	<div class="max-w-4xl mx-auto">
		<Tabs value={tab} onValueChange={(details) => (tab = details.value)}>
			<div
				class="sticky top-0 z-10 bg-surface-50-950"
				bind:this={tabList}
				onscrollcapture={measureTabs}
			>
				<Tabs.List class="overflow-x-auto overflow-y-hidden whitespace-nowrap">
					<Tabs.Trigger value="appearance">Appearance</Tabs.Trigger>
					<Tabs.Trigger value="workflows">Hiring journey</Tabs.Trigger>
					<Tabs.Trigger value="perfect-job">Perfect job</Tabs.Trigger>
					<Tabs.Trigger value="appointments">Appointments</Tabs.Trigger>
					<Tabs.Indicator />
				</Tabs.List>
				{#if moreTabs}
					<div
						class="pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-l from-surface-50 to-transparent dark:from-surface-950"
						aria-hidden="true"
					></div>
				{/if}
			</div>
			<div class="p-8">
				<Tabs.Content value="appearance">
					<CosmeticSettings />
				</Tabs.Content>
				<Tabs.Content value="workflows">
					<WorkflowsTab domainName={data.domainName} />
				</Tabs.Content>
				<Tabs.Content value="perfect-job">
					<PerfectJobTab openJourney={() => (tab = 'workflows')} />
				</Tabs.Content>
				<Tabs.Content value="appointments">
					<AppointmentsTab />
				</Tabs.Content>
			</div>
		</Tabs>
	</div>
{:else if $sessionCheckedStore}
	<div class="flex flex-col items-center justify-center gap-4 p-8">
		<p class="text-lg text-surface-600-400">
			Only the admin of this domain can change its settings. Please log in.
		</p>
		<a
			class="btn preset-tonal"
			href={resolve('/[domain]/experiences', { domain: data.domainName })}
		>
			Back to experiences
		</a>
	</div>
{/if}
