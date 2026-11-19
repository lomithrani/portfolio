<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { afterNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import CosmeticSettings from '#components/admin/CosmeticSettings.svelte';
	import StartTab from '#components/admin/StartTab.svelte';
	import WorkflowsTab from '#components/admin/WorkflowsTab.svelte';
	import PerfectJobTab from '#components/admin/PerfectJobTab.svelte';
	import AppointmentsTab from '#components/admin/AppointmentsTab.svelte';
	import ShareTab from '#components/admin/ShareTab.svelte';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { clearAuthentication, isDomainAdmin } from '#services/authentication.ts';
	import { accountMessages } from '#services/account.messages.ts';
	import {
		adminTab,
		defaultAdminTab,
		loadReadiness,
		setupProgress,
		type AdminTab,
		type Readiness
	} from '#services/candidateSetup.ts';
	import { networkError } from '#services/recruiter.ts';
	import type { PageData } from './$types';
	import { m } from './page.messages.ts';

	let { data }: { data: PageData } = $props();

	// The API enforces authorization; this only avoids showing forms that cannot be saved.
	// Nothing is shown until the session has been checked with the API (in the browser).
	let isAdmin = $derived($sessionCheckedStore && isDomainAdmin($authenticationStore, data.domain));

	/**
	 * The tab shown. A link opens one (`?tab=`: the landing page's onboarding links to "Get
	 * started"), and the address follows the tab shown (replaceState), so a reload or a shared link
	 * opens on it. Without one the page opens on "Get started" while the checklist is not complete
	 * (null until that is known), else on the appearance. A tab can lead to another (the perfect
	 * job to the journey that uses it, "Get started" to each item's tab, Share to "Get started")
	 */
	let tab = $state<AdminTab | null>(adminTab(page.url.searchParams.get('tab')) ?? null);
	let tabList: HTMLElement | undefined = $state();

	// --- What the owner set up (GET /me/readiness), for "Get started" -----------------------
	let readiness = $state.raw<Readiness | null>(null);
	let readinessStatus = $state<'loading' | 'ready' | 'error'>('loading');
	let readinessError = $state('');
	let readinessRequest: AbortController | undefined;

	/**
	 * Reads the checklist (again). An expired session signs the page out only on the first read,
	 * before any tab can hold what the owner typed: later (the tab shown again, the steps saved),
	 * signing out would unmount every tab, and what is not saved in them would be lost without a
	 * word (no navigation, so their guards never ask). The checklist read before then stays, said
	 * to be out of date, with "Try again"
	 */
	async function refreshReadiness(): Promise<void> {
		readinessRequest?.abort();
		const request = new AbortController();
		readinessRequest = request;
		const first = !readiness;
		if (first) readinessStatus = 'loading';
		const result = await loadReadiness(request.signal);
		if (request.signal.aborted) return;
		if (result.ok) {
			readiness = result.readiness;
			readinessStatus = 'ready';
			readinessError = '';
		} else if (first) {
			if (result.reason === 'session-expired') clearAuthentication();
			readinessError =
				result.reason === 'session-expired'
					? accountMessages.sessionExpired
					: result.reason === 'network'
						? networkError()
						: m.readinessFailed;
			readinessStatus = 'error';
		} else {
			// The checklist read before stays: it is only not up to date
			readinessError = m.readinessStale[result.reason];
		}
		if (tab === null) tab = defaultAdminTab(readiness);
	}

	// Read once the owner is known; again each time "Get started" or Share is shown (what the
	// other tabs saved changes it: Share says what the journey asks of recruiters)
	let readinessAsked = false;
	$effect(() => {
		if (!isAdmin || readinessAsked) return;
		readinessAsked = true;
		untrack(refreshReadiness);
	});

	// --- The tab shown -----------------------------------------------------------------------
	/** The tabs that show what the readiness says */
	const READS_READINESS = new Set<AdminTab>(['start', 'share']);

	/** Shows `next`, and keeps it in the address */
	function show(next: AdminTab) {
		const previous = tab;
		tab = next;
		if (READS_READINESS.has(next) && previous !== null && previous !== next)
			void refreshReadiness();
		const current = [...new URLSearchParams(location.search)];
		if (current.some(([key, value]) => key === 'tab' && value === next)) return;
		const search = new URLSearchParams([
			...current.filter(([key]) => key !== 'tab'),
			['tab', next]
		]).toString();
		replaceState(
			resolve(`/[domain]/admin?${search}`, { domain: data.domainName }),
			page.state
		).catch(() => {});
	}

	/**
	 * A tab's link to another tab: shows it, at the top of the page, with the focus on its name (the
	 * button pressed is in the tab just hidden)
	 */
	async function openTab(next: AdminTab) {
		show(next);
		await tick();
		document.getElementById('page')?.scrollTo({ top: 0 });
		tabList?.querySelector<HTMLElement>(`[role="tab"][data-value="${next}"]`)?.focus();
	}

	// A link to this page naming another tab (the page stays: follow its address)
	afterNavigate(({ type }) => {
		if (type === 'enter') return;
		const asked = adminTab(page.url.searchParams.get('tab'));
		if (asked && asked !== tab) show(asked);
	});

	// --- The journey editor ------------------------------------------------------------------
	let workflowsTab: ReturnType<typeof WorkflowsTab> | undefined = $state();
	/** Changed when "Get started" saved the steps: the editor starts again from them */
	let journeyRevision = $state(0);

	function journeySaved(): Promise<void> {
		journeyRevision++;
		return refreshReadiness();
	}

	let progress = $derived(readiness ? setupProgress(readiness) : null);

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
	<title>{m.title}</title>
	<meta name="description" content={m.description} />
</svelte:head>

{#if isAdmin && tab}
	<div class="max-w-4xl mx-auto">
		<Tabs value={tab} onValueChange={(details) => show(adminTab(details.value) ?? 'start')}>
			<div
				class="sticky top-0 z-10 bg-surface-50-950"
				bind:this={tabList}
				onscrollcapture={measureTabs}
			>
				<Tabs.List class="overflow-x-auto overflow-y-hidden whitespace-nowrap">
					<Tabs.Trigger value="start">
						{m.tabs.start}
						{#if progress && !progress.complete}
							<span class="badge preset-tonal-primary ms-1.5 text-xs" data-start-progress>
								<span aria-hidden="true">{m.progressBadge(progress.done, progress.total)}</span>
								<span class="sr-only">{m.progressLabel(progress.done, progress.total)}</span>
							</span>
						{/if}
					</Tabs.Trigger>
					<Tabs.Trigger value="appearance">{m.tabs.appearance}</Tabs.Trigger>
					<Tabs.Trigger value="workflows">{m.tabs.workflows}</Tabs.Trigger>
					<Tabs.Trigger value="perfect-job">{m.tabs.perfectJob}</Tabs.Trigger>
					<Tabs.Trigger value="appointments">{m.tabs.appointments}</Tabs.Trigger>
					<Tabs.Trigger value="share">{m.tabs.share}</Tabs.Trigger>
					<Tabs.Indicator />
				</Tabs.List>
				{#if moreTabs}
					<div
						class="pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-l from-surface-50 to-transparent dark:from-surface-950"
						aria-hidden="true"
					></div>
				{/if}
			</div>
			<div class="px-4 py-6 sm:p-8">
				<Tabs.Content value="start">
					<StartTab
						domainName={data.domainName}
						{readiness}
						status={readinessStatus}
						loadError={readinessError}
						reload={refreshReadiness}
						{openTab}
						journeyChanged={() => workflowsTab?.hasChanges() ?? false}
						journeySaved={() => workflowsTab?.hasSavedJourney()}
						onJourneySaved={journeySaved}
					/>
				</Tabs.Content>
				<Tabs.Content value="appearance">
					<CosmeticSettings />
				</Tabs.Content>
				<Tabs.Content value="workflows">
					{#key journeyRevision}
						<WorkflowsTab domainName={data.domainName} bind:this={workflowsTab} />
					{/key}
				</Tabs.Content>
				<Tabs.Content value="perfect-job">
					<PerfectJobTab openJourney={() => openTab('workflows')} />
				</Tabs.Content>
				<Tabs.Content value="appointments">
					<AppointmentsTab />
				</Tabs.Content>
				<Tabs.Content value="share">
					<ShareTab domainName={data.domainName} {readiness} {openTab} />
				</Tabs.Content>
			</div>
		</Tabs>
	</div>
{:else if isAdmin}
	<p class="p-8 text-sm opacity-50" role="status">{m.loading}</p>
{:else if $sessionCheckedStore}
	<div class="flex flex-col items-center justify-center gap-4 p-8">
		<p class="text-lg text-surface-600-400">
			{m.adminOnly}
		</p>
		<a
			class="btn preset-tonal"
			href={resolve('/[domain]/experiences', { domain: data.domainName })}
		>
			{m.backToExperiences}
		</a>
	</div>
{/if}
