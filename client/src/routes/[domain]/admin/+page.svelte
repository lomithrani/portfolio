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
		adminTabSearch,
		defaultAdminTab,
		loadReadiness,
		setupProgress,
		type AdminTab,
		type Readiness,
		type ReadinessFailure
	} from '#services/candidateSetup.ts';
	import { networkError } from '#services/recruiter.ts';
	import { cardExperiences, loadDiscovery, type DiscoveryKnown } from '#services/discovery.ts';
	import type { DiscoveryStatus } from '#services/matching.ts';
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
	/** Why the last read failed, null once one succeeded (Share then trusts no readiness) */
	let readinessFailure = $state<ReadinessFailure | null>(null);
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
		readinessFailure = result.ok ? null : result.reason;
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

	// --- Being proposed to recruiters (GET /discovery), for "Get started" and the Perfect job ---
	/**
	 * Where the owner stands in discovery (Path 2): null until a read answered; `off` while matching
	 * is off (a 404: nothing of it shows, and nothing asks again for the page's life). Read once the
	 * owner is known, again each time "Get started" or the Perfect job tab is shown, when the page
	 * comes back in view, and once the steps, the criteria or the calendar change (what discovery
	 * asks); a change made in the Perfect job tab gives its own answer, newer than any read under way
	 */
	let discovery = $state.raw<DiscoveryKnown | null>(null);
	let discoveryRequest: AbortController | undefined;

	async function refreshDiscovery(): Promise<void> {
		if (discovery?.kind === 'off') return;
		discoveryRequest?.abort();
		const request = new AbortController();
		discoveryRequest = request;
		const result = await loadDiscovery(request.signal);
		if (request.signal.aborted) return;
		// A read that failed keeps what was read before: the status, only not up to date, or nothing
		// (matching may be off: nothing of it shows, and the next tab shown or the page back in view
		// asks again)
		if (result.kind === 'failed') return;
		discovery = result;
	}

	/**
	 * The owner is visible to recruiters now: the Hiring journey and Appointments tabs say what
	 * pauses it (the gate's steps, the calendar)
	 */
	let discoveryVisible = $derived(discovery?.kind === 'ready' && discovery.status.state === 'on');

	/** What a change made in the Perfect job tab answered: newer than any read under way */
	function discoveryChanged(status: DiscoveryStatus) {
		discoveryRequest?.abort();
		discovery = { kind: 'ready', status };
	}

	let discoveryAsked = false;
	$effect(() => {
		if (!isAdmin || discoveryAsked) return;
		discoveryAsked = true;
		untrack(refreshDiscovery);
	});

	/** The tabs that show where the owner stands in discovery */
	const READS_DISCOVERY = new Set<AdminTab>(['start', 'perfect-job']);

	// Back in view (another tab of the browser connected the calendar, saved elsewhere): read again
	$effect(() => {
		if (!isAdmin) return;
		const onVisible = () => {
			if (document.visibilityState === 'visible' && tab && READS_DISCOVERY.has(tab)) {
				void refreshDiscovery();
			}
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => document.removeEventListener('visibilitychange', onVisible);
	});

	/** The portfolio's experiences, as the anonymous card's settings list them */
	let experiences = $derived(cardExperiences(data.domain.experiences));

	// --- The tab shown -----------------------------------------------------------------------
	/** The tabs that show what the readiness says */
	const READS_READINESS = new Set<AdminTab>(['start', 'share']);

	/** Shows `next`, and keeps it in the address */
	function show(next: AdminTab) {
		const previous = tab;
		tab = next;
		if (READS_READINESS.has(next) && previous !== null && previous !== next)
			void refreshReadiness();
		if (READS_DISCOVERY.has(next) && previous !== null && previous !== next)
			void refreshDiscovery();
		const search = adminTabSearch(location.search, next);
		if (search === null) return;
		replaceState(
			resolve(`/[domain]/admin?${search}`, { domain: data.domainName }),
			page.state
		).catch(() => {});
	}

	/**
	 * A tab's link to another tab: shows it, at the top of the page, with the focus on its name (the
	 * button pressed is in the tab just hidden). The focus does not scroll: it would stop the page's
	 * smooth scroll to the top before it starts, and the row of tabs follows the tab shown already
	 * (`revealTab`)
	 */
	async function openTab(next: AdminTab) {
		show(next);
		await tick();
		document.getElementById('page')?.scrollTo({ top: 0 });
		tabList
			?.querySelector<HTMLElement>(`[role="tab"][data-value="${next}"]`)
			?.focus({ preventScroll: true });
	}

	/**
	 * The Perfect job tab's "Add the missing steps": the Hiring journey tab, with the steps discovery
	 * asks for added there as changes not saved yet (the focus then goes to the first one added)
	 */
	async function openJourney(add?: 'gate') {
		await openTab('workflows');
		if (add === 'gate') await workflowsTab?.addGateSteps();
	}

	/** "Get started"'s link to discovery: the Perfect job tab, its settings (#discovery) in view */
	async function openDiscovery() {
		show('perfect-job');
		await tick();
		const heading = document.querySelector<HTMLElement>('[data-discovery-title]');
		heading?.scrollIntoView({ block: 'start' });
		heading?.focus({ preventScroll: true });
	}

	// A link to discovery's settings (`?tab=perfect-job#discovery`, from /opportunities): they show
	// once discovery was read, and their heading takes the focus, as from "Get started"
	let discoveryLinked = $state(false);
	afterNavigate(() => {
		if (location.hash === '#discovery') discoveryLinked = true;
	});
	$effect(() => {
		if (!discoveryLinked || tab !== 'perfect-job' || discovery?.kind !== 'ready') return;
		discoveryLinked = false;
		untrack(openDiscovery);
	});

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
		void refreshDiscovery();
		return refreshReadiness();
	}

	let progress = $derived(readiness ? setupProgress(readiness) : null);

	// --- The row of tabs ---------------------------------------------------------------------
	// On a phone the tabs do not all fit: their row scrolls (the page does not), each edge with
	// tabs out of sight beyond it fades, and the row follows the tab shown
	/** Tabs are out of sight before (left) or after (right) the row's visible part */
	let moreBefore = $state(false);
	let moreAfter = $state(false);
	/** How far from an edge the tab shown is kept: clear of that edge's fade (2.5rem) */
	const EDGE = 40;
	/** A tab: Skeleton's button, with less room at its sides */
	const trigger = 'px-2';

	const tabRow = () => tabList?.querySelector<HTMLElement>('[role="tablist"]') ?? null;

	function measureTabs() {
		const list = tabRow();
		moreBefore = !!list && list.scrollLeft > 1;
		moreAfter = !!list && list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
	}

	/** Scrolls the row (never the page) to bring the selected tab in sight, clear of the fades */
	function revealTab(behavior: ScrollBehavior) {
		const list = tabRow();
		const selected = list?.querySelector<HTMLElement>(`[role="tab"][data-value="${tab}"]`);
		if (!list || !selected) return;
		const row = list.getBoundingClientRect();
		const box = selected.getBoundingClientRect();
		let left = list.scrollLeft;
		if (box.left < row.left + EDGE) left += box.left - row.left - EDGE;
		else if (box.right > row.right - EDGE) left += box.right - row.right + EDGE;
		const end = list.scrollWidth - list.clientWidth;
		left = Math.max(0, Math.min(end, Math.round(left)));
		if (left !== list.scrollLeft) list.scrollTo({ left, behavior });
		measureTabs();
	}

	const smoothly = (): ScrollBehavior =>
		matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';

	// The tab shown changed: the row follows it
	$effect(() => {
		void tab;
		if (tabList) untrack(() => revealTab(smoothly()));
	});

	// The row or a tab changed size (the window, the "Get started" badge, a font that loaded):
	// the tabs moved, the tab shown is brought back in sight
	$effect(() => {
		const list = tabList && tabRow();
		if (!list) return;
		const observer = new ResizeObserver(() => revealTab('instant'));
		observer.observe(list);
		for (const tabButton of list.querySelectorAll('[role="tab"]')) observer.observe(tabButton);
		return () => observer.disconnect();
	});

	/** The sticky row's height: what a tab scrolls into view stops under it (`.tab-panels`) */
	let tabsHeight = $state(0);
</script>

<svelte:head>
	<title>{m.title}</title>
	<meta name="description" content={m.description} />
</svelte:head>

{#if isAdmin && tab}
	<div class="max-w-4xl mx-auto">
		<Tabs value={tab} onValueChange={(details) => show(adminTab(details.value) ?? 'start')}>
			<!-- On the page's own background, without the margin Skeleton puts under a tab list: no
			     band of another colour under the tabs. The tabs are compact enough for the six of
			     them, the badge included, to fit the page's width in French from 1024 px -->
			<div
				class="tabs-row sticky top-0 z-10"
				data-admin-tabs
				bind:this={tabList}
				bind:offsetHeight={tabsHeight}
				onscrollcapture={measureTabs}
			>
				<Tabs.List class="mb-0 gap-0.5 overflow-x-auto overflow-y-hidden whitespace-nowrap">
					<Tabs.Trigger value="start" class={trigger}>
						{m.tabs.start}
						{#if progress && !progress.complete}
							<span class="badge preset-tonal-primary ms-1 text-xs" data-start-progress>
								<span aria-hidden="true">{m.progressBadge(progress.done, progress.total)}</span>
								<span class="sr-only">{m.progressLabel(progress.done, progress.total)}</span>
							</span>
						{/if}
					</Tabs.Trigger>
					<Tabs.Trigger value="appearance" class={trigger}>{m.tabs.appearance}</Tabs.Trigger>
					<Tabs.Trigger value="workflows" class={trigger}>{m.tabs.workflows}</Tabs.Trigger>
					<Tabs.Trigger value="perfect-job" class={trigger}>{m.tabs.perfectJob}</Tabs.Trigger>
					<Tabs.Trigger value="appointments" class={trigger}>{m.tabs.appointments}</Tabs.Trigger>
					<Tabs.Trigger value="share" class={trigger}>{m.tabs.share}</Tabs.Trigger>
					<Tabs.Indicator />
				</Tabs.List>
				{#if moreBefore}
					<div class="tabs-more start" data-tabs-more="before" aria-hidden="true"></div>
				{/if}
				{#if moreAfter}
					<div class="tabs-more end" data-tabs-more="after" aria-hidden="true"></div>
				{/if}
			</div>
			<div class="tab-panels px-4 py-6 sm:p-8" style:--tabs-clearance="{tabsHeight + 16}px">
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
						discovery={discovery?.kind === 'ready' ? discovery.status : null}
						{openDiscovery}
					/>
				</Tabs.Content>
				<Tabs.Content value="appearance">
					<CosmeticSettings />
				</Tabs.Content>
				<Tabs.Content value="workflows">
					{#key journeyRevision}
						<WorkflowsTab
							domainName={data.domainName}
							bind:this={workflowsTab}
							visible={discoveryVisible}
							onSaved={refreshDiscovery}
						/>
					{/key}
				</Tabs.Content>
				<Tabs.Content value="perfect-job">
					<PerfectJobTab
						{openJourney}
						{openTab}
						active={tab === 'perfect-job'}
						{discovery}
						onDiscovery={discoveryChanged}
						reloadDiscovery={refreshDiscovery}
						{experiences}
					/>
				</Tabs.Content>
				<Tabs.Content value="appointments">
					<AppointmentsTab visible={discoveryVisible} onCalendarChanged={refreshDiscovery} />
				</Tabs.Content>
				<Tabs.Content value="share">
					<ShareTab
						domainName={data.domainName}
						{readiness}
						failure={readinessFailure}
						reload={refreshReadiness}
						shown={tab === 'share'}
						{openTab}
					/>
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

<style>
	/* What a tab scrolls into view (a field focused, a heading) stops under the sticky row of tabs,
		not behind it. A margin on what is scrolled to, not a padding on the page's scroller: the
		row itself, sticky, would then be scrolled to as if it were under that padding, and the page
		would jump to its top when a tab is pressed */
	.tab-panels :global(*) {
		scroll-margin-top: var(--tabs-clearance);
	}

	/* The page's own background (the html element's, in Skeleton's globals) */
	.tabs-row {
		--tabs-background: light-dark(var(--color-root-bg-light), var(--color-root-bg-dark));
		background-color: var(--tabs-background);
	}

	/* The edge of the row beyond which tabs are out of sight fades into that background */
	.tabs-more {
		position: absolute;
		inset-block: 0;
		width: 2.5rem;
		pointer-events: none;
	}
	.tabs-more.start {
		left: 0;
		background: linear-gradient(to right, var(--tabs-background), transparent);
	}
	.tabs-more.end {
		right: 0;
		background: linear-gradient(to left, var(--tabs-background), transparent);
	}
</style>
