<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { afterNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import {
		ArrowPath,
		ExclamationTriangle,
		EyeSlash,
		Inbox,
		LockClosed,
		PauseCircle,
		UserCircle
	} from 'svelte-heros-v2';
	import { discoveryRequirementMessage, type MatchDecision } from 'portfolio-common';
	import { common } from '#lib/i18n/common.messages.ts';
	import Rich from '#lib/i18n/Rich.svelte';
	import { SITE_NAME } from '#components/legal/legalDocuments.ts';
	import PageNotice from '#components/job-editor/PageNotice.svelte';
	import SignInButton from '#components/hire/SignInButton.svelte';
	import MatchDeck from '#components/matching/MatchDeck.svelte';
	import OpportunityCard from '#components/matching/OpportunityCard.svelte';
	import CandidateInterest from '#components/matching/CandidateInterest.svelte';
	import { m as interestTexts } from '#components/matching/CandidateInterest.messages.ts';
	import ConfirmDialog from '#components/recruiter/ConfirmDialog.svelte';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { clearAuthentication, isSessionValid } from '#services/authentication.ts';
	import { loadDiscovery, type DiscoveryLoad } from '#services/discovery.ts';
	import {
		markMutualInterestsSeen,
		matchingAvailability,
		notificationsStore,
		refreshNotifications,
		unseenLabel
	} from '#services/notifications.ts';
	import {
		answerOpportunity,
		appendInterests,
		consentEndsSoon,
		endMutualInterest,
		loadMutualInterests,
		opportunitiesView,
		opportunitiesViewSearch,
		readOpportunities,
		reviewState,
		undoOpportunityAnswer,
		unseenInterests,
		type OpportunitiesView
	} from '#services/opportunities.ts';
	import type {
		CandidateMutualInterest,
		DecisionFailure,
		Opportunity
	} from '#services/matching.ts';
	import { formatDay, networkError } from '#services/recruiter.ts';
	import { toaster } from '#services/toaster.ts';
	import { m } from './page.messages.ts';
	import { m as matchingText } from '#services/matching.messages.ts';

	const endTexts = interestTexts.endDialog;

	// The candidate's inbox of matching (Path 2, CLAUDE.md "Matching"): the open jobs proposed to
	// them, answered one at a time in a deck ("To review": GET /opportunities, PUT and DELETE
	// /opportunities/jobs/:id/decision), and their mutual interests (GET /matches?side=candidate,
	// marked seen as they are shown, POST /matches/:id/end). The view shown is in the address
	// (`?view=interests`; the jobs to review leave no parameter), so a reload or a link opens on it.
	// Where the candidate stands in discovery (GET /discovery) decides what "To review" shows: the
	// deck, or why there is none (no portfolio, off, paused, consent ended), each leading to the
	// settings at the end of the admin's Perfect job tab. While matching is off (the API's routes
	// answer 404) the page says only that it is not available. Private: rendered in the browser
	// only (opportunities/+layout.ts), not listed by search engines (#lib/robots.ts), recorded in
	// the candidate space (spaceToRecord). No count of anything but the account's own mutual
	// interests not seen yet, nothing of a recruiter before both are interested, no email promised.

	// The signed-in account, once the session has been checked with the API
	let user = $derived(
		$sessionCheckedStore && isSessionValid($authenticationStore)
			? $authenticationStore.user
			: undefined
	);

	// --- Where the candidate stands ---------------------------------------------------------
	/** GET /discovery for the account it was read for (null until it was) */
	let discovery = $state.raw<{ userId: string; load: DiscoveryLoad } | null>(null);
	let requested: string | null = null;

	async function readDiscovery(userId: string): Promise<void> {
		requested = userId;
		const result = await loadDiscovery();
		if (requested !== userId) return;
		if (result.kind === 'failed' && result.reason === 'session-expired') {
			// The page asks to sign in again (and reads again once signed in)
			requested = null;
			discovery = null;
			toaster.error({ title: m.sessionExpired });
			clearAuthentication();
			return;
		}
		discovery = { userId, load: result };
	}

	$effect(() => {
		const userId = user?._id;
		if (!userId) {
			requested = null;
			untrack(() => {
				discovery = null;
				interests = { kind: 'idle' };
			});
			return;
		}
		if (requested === userId) return;
		untrack(() => readDiscovery(userId));
	});

	// Signed out: whether matching is available decides between signing in and "not available"
	let probe = $state<'idle' | 'asking' | 'done'>('idle');
	$effect(() => {
		if (!$sessionCheckedStore || user || probe !== 'idle') return;
		probe = 'asking';
		void matchingAvailability().finally(() => (probe = 'done'));
	});

	let load = $derived(discovery && discovery.userId === user?._id ? discovery.load : null);
	let status = $derived(load?.kind === 'ready' ? load.status : null);
	let review = $derived(status ? reviewState(status, !!user?.domain) : null);
	// Its consent ends soon (no email says it): when, above the deck
	let consentEnds = $derived(status ? consentEndsSoon(status) : null);

	/** Matching was found off while the page was open: the account menu follows (no item, no badge) */
	function matchingTurnedOff(userId: string) {
		discovery = { userId, load: { kind: 'off' } };
		void refreshNotifications();
		void focusHeading(unavailableHeading);
	}

	/** "Try again" after GET /discovery failed: the focus on what shows in its place once read */
	async function retryDiscovery() {
		const userId = user?._id;
		if (!userId) return;
		await readDiscovery(userId);
		if (requested !== userId || load?.kind === 'failed') return;
		if (load?.kind === 'off') {
			await focusHeading(unavailableHeading);
		} else if (view === 'interests') {
			// Read as the view shows: its first item takes the focus once there
			focusInterestsOnRead = true;
		} else if (review === 'on') {
			// The deck mounts: what it shows first takes the focus
			focusDeck = true;
		} else {
			await focusHeading(stateHeading);
		}
	}

	// --- The view shown ---------------------------------------------------------------------
	let view = $state<OpportunitiesView>(opportunitiesView(page.url.searchParams.get('view')));
	// A link to this page naming another view (the page stays: follow its address)
	afterNavigate(({ type }) => {
		if (type === 'enter') return;
		view = opportunitiesView(page.url.searchParams.get('view'));
	});

	function show(next: OpportunitiesView) {
		view = next;
		const search = opportunitiesViewSearch(location.search, next);
		if (search === null) return;
		replaceState(
			search ? resolve(`/(app)/opportunities?${search}`) : resolve('/(app)/opportunities'),
			page.state
		).catch(() => {});
	}

	/** The deck reads once its view was shown (a page opened on the mutual interests reads none) */
	let reviewShown = $derived(view === 'review');
	let deckWanted = $state(false);
	$effect(() => {
		if (reviewShown) deckWanted = true;
	});

	// --- The deck ---------------------------------------------------------------------------
	/** Changed to mount the deck again (start again: after a stop, once discovery changed) */
	let deckRun = $state(0);
	/** Why the deck stopped, when the page says it apart from where the candidate stands */
	let stopped = $state.raw<DecisionFailure | null>(null);
	const stopHeading = 'opportunities-stopped';
	const stateHeading = 'opportunities-state';
	const unavailableHeading = 'opportunities-unavailable';
	/** The deck mounts in place of the Retry pressed: what it shows first takes the focus */
	let focusDeck = $state(false);

	async function focusHeading(id: string) {
		await tick();
		document.getElementById(id)?.focus({ preventScroll: true });
		document.getElementById(id)?.scrollIntoView({ block: 'nearest' });
	}

	async function deckStopped(failure: DecisionFailure) {
		const userId = user?._id;
		if (failure.kind === 'signed-out' || !userId) {
			toaster.error({ title: m.sessionExpired });
			clearAuthentication();
			return;
		}
		if (failure.kind === 'off') {
			matchingTurnedOff(userId);
			return;
		}
		if (failure.kind === 'not-proposed') {
			// No longer proposed to recruiters: where they stand now says why (paused, off, lapsed)
			await readDiscovery(userId);
			if (review !== 'on') {
				await focusHeading(stateHeading);
				return;
			}
		}
		stopped = failure;
		await focusHeading(stopHeading);
	}

	function startAgain() {
		stopped = null;
		// The Retry pressed is gone: the deck's first card (or what shows) takes the focus
		focusDeck = true;
		deckRun++;
	}

	const loadJobs = (next: string | null) => readOpportunities(next);

	async function decide(card: Opportunity, decision: MatchDecision) {
		const result = await answerOpportunity(card.job._id, decision);
		void refreshNotifications();
		return result.ok ? { ok: true as const, match: result.match } : result;
	}

	async function undo(card: Opportunity) {
		const result = await undoOpportunityAnswer(card.job._id);
		return result.ok ? { ok: true as const, match: null } : result;
	}

	// --- Mutual interests -------------------------------------------------------------------
	type InterestsState =
		| { kind: 'idle' }
		| { kind: 'loading' }
		| {
				kind: 'ready';
				list: CandidateMutualInterest[];
				next: string | null;
				more: 'idle' | 'loading' | 'failed';
		  }
		| { kind: 'error'; message: string };

	let interests = $state.raw<InterestsState>({ kind: 'idle' });
	/** Not seen before this showing: marked seen as shown, still said new until read again */
	let fresh = $state.raw<ReadonlySet<string>>(new Set());
	let interestsRead = 0;
	/** The next read's result takes the focus (it replaces the Retry pressed) */
	let focusInterestsOnRead = false;
	const interestsRetry = 'opportunities-interests-retry';

	/** The focus on an interest's heading */
	const focusInterest = (id: string) =>
		document
			.querySelector<HTMLElement>(`[data-interest="${id}"] h3`)
			?.focus({ preventScroll: true });

	/** The focus on what the view of mutual interests shows: its first item, its empty state, Retry */
	async function focusInterests() {
		await tick();
		const target =
			document.querySelector<HTMLElement>('[data-interest] h3') ??
			document.querySelector<HTMLElement>('[data-interests-empty] h3') ??
			document.getElementById(interestsRetry);
		target?.focus({ preventScroll: true });
	}

	/** The mutual interests shown are seen: they no longer count in the account menu's badge */
	function markShown(list: readonly CandidateMutualInterest[]) {
		const ids = unseenInterests(list);
		if (ids.length === 0) return;
		fresh = new Set([...fresh, ...ids]);
		void markMutualInterestsSeen(ids);
	}

	async function readInterests(focusAfter = false) {
		const read = ++interestsRead;
		const focus = focusAfter || focusInterestsOnRead;
		focusInterestsOnRead = false;
		if (interests.kind !== 'ready') interests = { kind: 'loading' };
		const result = await loadMutualInterests(null);
		if (read !== interestsRead) return;
		if (result.ok) {
			fresh = new Set();
			interests = { kind: 'ready', list: result.interests, next: result.next, more: 'idle' };
			markShown(result.interests);
		} else if (result.failure === 'signed-out') {
			toaster.error({ title: m.sessionExpired });
			clearAuthentication();
			return;
		} else if (result.failure === 'off' && user) {
			matchingTurnedOff(user._id);
			return;
		} else {
			interests = {
				kind: 'error',
				message: result.failure === 'network' ? networkError() : m.interests.loadFailed
			};
		}
		if (focus) await focusInterests();
	}

	async function showMore() {
		const current = interests;
		if (current.kind !== 'ready' || !current.next || current.more === 'loading') return;
		const read = ++interestsRead;
		interests = { ...current, more: 'loading' };
		const result = await loadMutualInterests(current.next);
		if (read !== interestsRead) return;
		// The list as it stands now (one ended meanwhile stays ended), not as it was asked
		const latest = interests;
		if (latest.kind !== 'ready') return;
		if (!result.ok) {
			interests = { ...latest, more: 'failed' };
			return;
		}
		const shown = new Set(latest.list.map(({ _id }) => _id));
		const list = appendInterests(latest.list, result.interests);
		interests = { ...latest, list, next: result.next, more: 'idle' };
		markShown(result.interests);
		// The first one added takes the focus ("Show more" goes once the last page is read)
		const added = list.find(({ _id }) => !shown.has(_id));
		await tick();
		if (added) focusInterest(added._id);
		else if (!result.next && list.length > 0) focusInterest(list[list.length - 1]._id);
	}

	// Read each time the view is shown (a mutual interest made meanwhile shows), once discovery
	// answered (matching on)
	let interestsShown = $derived(view === 'interests' && !!status);
	$effect(() => {
		if (interestsShown) untrack(() => readInterests());
	});

	// Ending one: asked first; the focus then goes to its heading (its button is gone once ended)
	let ending = $state.raw<CandidateMutualInterest | null>(null);
	let endingId = '';
	let endBusy = $state(false);
	let endError = $state('');

	async function confirmEnd() {
		const interest = ending;
		if (!interest || endBusy) return;
		endBusy = true;
		endError = '';
		const result = await endMutualInterest(interest._id);
		endBusy = false;
		if (result.ok) {
			ending = null;
			const current = interests;
			if (current.kind === 'ready') {
				interests = {
					...current,
					list: current.list.map((shown) => (shown._id === interest._id ? result.interest : shown))
				};
			}
			toaster.success({ title: endTexts.done });
			void refreshNotifications();
			return;
		}
		switch (result.failure) {
			case 'signed-out':
				ending = null;
				toaster.error({ title: m.sessionExpired });
				clearAuthentication();
				return;
			case 'gone':
			case 'off':
				ending = null;
				toaster.info({ title: endTexts.gone });
				void readInterests();
				return;
			default:
				endError = result.failure === 'network' ? networkError() : endTexts.failed;
		}
	}

	// --- What the page shows ----------------------------------------------------------------
	let waiting = $derived(
		!$sessionCheckedStore ||
			(!user && $notificationsStore.matching === 'unknown' && probe !== 'done') ||
			(!!user && !load)
	);
	let unseen = $derived(
		$notificationsStore.matching === 'on' ? $notificationsStore.unseen.candidate : 0
	);
	// The tab's title names the page only while matching answers (nothing of it shows otherwise)
	let unavailable = $derived(
		load?.kind === 'off' || (!user && $notificationsStore.matching === 'off')
	);
	let pageTitle = $derived(
		unavailable
			? matchingText.unavailable.pageTitle
			: $notificationsStore.matching === 'on'
				? m.pageTitle
				: SITE_NAME
	);

	const linkClass = 'btn preset-filled-primary-700-300 min-h-11 max-w-full whitespace-normal';
	/** A view's tab: compact on a phone, so both fit one row */
	const tabTrigger = 'shrink-0 px-2 text-sm whitespace-nowrap sm:px-4 sm:text-base';
	const placeholderBlock = 'placeholder w-full animate-pulse motion-reduce:animate-none';
</script>

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>

{#snippet settingsAction()}
	{#if user?.domain}
		<a
			href="{resolve('/[domain]/admin?tab=perfect-job', { domain: user.domain })}#discovery"
			class={linkClass}
		>
			{m.review.settings}
		</a>
	{/if}
{/snippet}

<div class="p-4 md:p-6">
	<div class="mx-auto w-full max-w-3xl space-y-6">
		{#if waiting}
			<div class="space-y-4" aria-busy="true">
				<p class="sr-only" role="status">{common.loading}</p>
				<div class="{placeholderBlock} h-10 rounded-base" aria-hidden="true"></div>
				<div class="{placeholderBlock} h-72 rounded-container" aria-hidden="true"></div>
			</div>
		{:else if !user}
			{#if $notificationsStore.matching === 'off'}
				<PageNotice
					title={matchingText.unavailable.title}
					icon={Inbox}
					headingId={unavailableHeading}
				>
					<p>{matchingText.unavailable.text}</p>
					{#snippet actions()}
						<a href={resolve('/(site)')} class={linkClass}>{matchingText.unavailable.home}</a>
					{/snippet}
				</PageNotice>
			{:else}
				<PageNotice title={m.signedOut.title} icon={LockClosed}>
					<p>{m.signedOut.text}</p>
					{#snippet actions()}
						<SignInButton />
					{/snippet}
				</PageNotice>
			{/if}
		{:else if load?.kind === 'off'}
			<PageNotice
				title={matchingText.unavailable.title}
				icon={Inbox}
				headingId={unavailableHeading}
			>
				<p>{matchingText.unavailable.text}</p>
				{#snippet actions()}
					<a href={resolve('/(site)')} class={linkClass}>{matchingText.unavailable.home}</a>
				{/snippet}
			</PageNotice>
		{:else if load?.kind === 'failed'}
			<PageNotice title={m.loadFailed.title} icon={ExclamationTriangle} tone="error">
				<p>{load.reason === 'network' ? networkError() : m.loadFailed.text}</p>
				{#snippet actions()}
					<button type="button" class={linkClass} onclick={retryDiscovery}>
						<ArrowPath size="18" aria-hidden="true" />
						{common.retry}
					</button>
				{/snippet}
			</PageNotice>
		{:else if status && review}
			<Tabs value={view} onValueChange={(details) => show(opportunitiesView(details.value))}>
				<!-- Both views on one row down to a 320 px phone in French: compact triggers, the badge
				     a count (said in full to screen readers); a row that would not fit scrolls itself,
				     never the page -->
				<Tabs.List class="mb-4 overflow-x-auto overflow-y-hidden" aria-label={m.views}>
					<Tabs.Trigger value="review" class={tabTrigger}>{m.tabs.review}</Tabs.Trigger>
					<Tabs.Trigger value="interests" class={tabTrigger}>
						{m.tabs.interests}
						{#if unseen > 0}
							<span
								class="badge preset-filled-error-500 ms-1 min-w-5 px-1.5 text-xs tabular-nums"
								data-unseen
							>
								<span aria-hidden="true">{unseen}</span>
								<span class="sr-only">{unseenLabel(unseen)}</span>
							</span>
						{/if}
					</Tabs.Trigger>
					<Tabs.Indicator />
				</Tabs.List>

				<Tabs.Content value="review">
					<div class="space-y-4" data-review={review}>
						{#if review === 'on'}
							<p class="text-sm text-surface-700-300">
								{status.minScore !== null
									? m.review.intro(status.minScore)
									: m.review.introNoMinimum}
							</p>
							{#if consentEnds && user?.domain}
								<p class="card preset-tonal-warning p-3 text-sm" data-consent-ends>
									<Rich text={m.review.consentEnds(formatDay(consentEnds))}>
										{#snippet settings(text)}<a
												class="anchor font-medium"
												href="{resolve('/[domain]/admin?tab=perfect-job', {
													domain: user?.domain ?? ''
												})}#discovery">{text}</a
											>{/snippet}
									</Rich>
								</p>
							{/if}
							{#if stopped}
								<PageNotice
									title={m.review.stopped}
									icon={ExclamationTriangle}
									tone="error"
									headingId={stopHeading}
								>
									<p>{stopped.message}</p>
									{#snippet actions()}
										<button type="button" class={linkClass} onclick={startAgain}>
											<ArrowPath size="18" aria-hidden="true" />
											{common.retry}
										</button>
									{/snippet}
								</PageNotice>
							{:else if deckWanted}
								{#key deckRun}
									<MatchDeck
										side="candidate"
										label={m.review.deck}
										focusFirst={focusDeck}
										key={(card: Opportunity) => card.job._id}
										title={(card: Opportunity) => card.job.title}
										load={loadJobs}
										{decide}
										{undo}
										onStop={deckStopped}
									>
										{#snippet card(opportunity, headingId)}
											<OpportunityCard {opportunity} {headingId} />
										{/snippet}
										{#snippet empty(headingId)}
											<section
												class="card preset-outlined-surface-200-800 space-y-3 bg-surface-50-950 p-6 text-center"
												aria-labelledby={headingId}
												data-deck-empty
											>
												<h2
													id={headingId}
													tabindex="-1"
													class="rounded-base text-xl font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
												>
													{m.review.empty.title}
												</h2>
												<p class="mx-auto max-w-md text-surface-700-300">
													{m.review.empty.text}
												</p>
												{#if user?.domain}
													<a
														href={resolve('/[domain]/admin?tab=perfect-job', {
															domain: user.domain
														})}
														class="btn preset-tonal min-h-11"
													>
														{m.review.criteria}
													</a>
												{/if}
											</section>
										{/snippet}
									</MatchDeck>
								{/key}
							{/if}
						{:else if review === 'no-portfolio'}
							<PageNotice
								title={m.review.noPortfolio.title}
								icon={UserCircle}
								headingId={stateHeading}
							>
								<p>{m.review.noPortfolio.text}</p>
								{#snippet actions()}
									<a href="{resolve('/(site)')}#create" class={linkClass}>
										{m.review.noPortfolio.create}
									</a>
								{/snippet}
							</PageNotice>
						{:else if review === 'off'}
							<PageNotice title={m.review.off.title} icon={EyeSlash} headingId={stateHeading}>
								<p>{m.review.off.text}</p>
								{#snippet actions()}
									{@render settingsAction()}
								{/snippet}
							</PageNotice>
						{:else if review === 'paused'}
							<PageNotice title={m.review.paused.title} icon={PauseCircle} headingId={stateHeading}>
								<p>{m.review.paused.text(status.missing.length)}</p>
								<ul class="list-disc space-y-1 ps-5 text-start" data-missing>
									{#each status.missing as requirement (requirement)}
										<li>{discoveryRequirementMessage(requirement)}</li>
									{/each}
								</ul>
								{#snippet actions()}
									{@render settingsAction()}
								{/snippet}
							</PageNotice>
						{:else}
							<PageNotice title={m.review.lapsed.title} icon={PauseCircle} headingId={stateHeading}>
								<p>{m.review.lapsed.text}</p>
								{#snippet actions()}
									{@render settingsAction()}
								{/snippet}
							</PageNotice>
						{/if}
					</div>
				</Tabs.Content>

				<Tabs.Content value="interests">
					<section class="space-y-4" aria-labelledby="opportunities-interests">
						<h2 id="opportunities-interests" class="sr-only">{m.tabs.interests}</h2>
						<p class="text-sm text-surface-700-300">{m.interests.intro}</p>
						{#if interests.kind === 'ready' && interests.list.length > 0}
							<ul class="space-y-3" data-interests>
								{#each interests.list as interest (interest._id)}
									<li>
										<CandidateInterest
											{interest}
											fresh={fresh.has(interest._id)}
											onEnd={(chosen) => {
												endError = '';
												endingId = chosen._id;
												ending = chosen;
											}}
										/>
									</li>
								{/each}
							</ul>
							{#if interests.next}
								<div class="flex flex-wrap items-center gap-3">
									<p class="sr-only" role="status">
										{interests.more === 'loading' ? m.interests.loading : ''}
									</p>
									<button
										type="button"
										class={[
											'btn preset-tonal min-h-11',
											interests.more === 'loading' ? 'opacity-60' : ''
										]}
										aria-disabled={interests.more === 'loading'}
										onclick={showMore}
									>
										{m.interests.more}
									</button>
									{#if interests.more === 'failed'}
										<p class="text-sm text-error-700-300" role="alert">{m.interests.loadFailed}</p>
									{/if}
								</div>
							{/if}
						{:else if interests.kind === 'ready'}
							<div
								class="card preset-outlined-surface-200-800 space-y-2 bg-surface-50-950 p-6 text-center"
								data-interests-empty
							>
								<h3
									tabindex="-1"
									class="rounded-base text-lg font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
								>
									{m.interests.empty.title}
								</h3>
								<p class="mx-auto max-w-md text-surface-700-300">{m.interests.empty.text}</p>
							</div>
						{:else if interests.kind === 'error'}
							<div class="card preset-tonal-error space-y-3 p-4" role="alert">
								<p class="text-sm">{interests.message}</p>
								<button
									id={interestsRetry}
									type="button"
									class="btn preset-filled-error-500 min-h-11"
									onclick={() => readInterests(true)}
								>
									<ArrowPath size="18" aria-hidden="true" />
									{common.retry}
								</button>
							</div>
						{:else}
							<div class="space-y-3" aria-busy="true">
								<p class="sr-only">{m.interests.loading}</p>
								<div class="{placeholderBlock} h-40 rounded-container" aria-hidden="true"></div>
							</div>
						{/if}
					</section>
				</Tabs.Content>
			</Tabs>
		{/if}
	</div>
</div>

<ConfirmDialog
	open={ending !== null}
	finalFocusEl={() => document.querySelector<HTMLElement>(`[data-interest="${endingId}"] h3`)}
	title={endTexts.title}
	description={endTexts.description}
	confirmLabel={endTexts.confirm}
	busyLabel={endTexts.busy}
	busy={endBusy}
	error={endError}
	onConfirm={confirmEnd}
	onCancel={() => {
		if (!endBusy) ending = null;
	}}
/>
