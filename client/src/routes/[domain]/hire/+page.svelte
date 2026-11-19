<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Check, Eye, LockClosed, Share, XMark } from 'svelte-heros-v2';
	import { DEFAULT_WORKFLOW_STEPS, stepManifest } from 'portfolio-common';
	import { portfolioTextApi } from '#services';
	import { errorStatus } from '#services/apiErrors.ts';
	import { clearAuthentication, isSessionValid } from '#services/authentication.ts';
	import { accountMessages } from '#services/account.messages.ts';
	import { networkError, failureText } from '#services/recruiter.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { toaster } from '#services/toaster.ts';
	import {
		activeStepIndex,
		goalStepIndex,
		isBareJourney,
		journeyDescription,
		journeyEffort,
		journeyIntro,
		stepName,
		stepNote,
		stepStates,
		type Journey,
		type JourneyStep,
		type StepState
	} from '#services/workflow.ts';
	import { portfolioLink } from '#services/candidateSetup.ts';
	import { portfolioName } from '#services/linkPreview.ts';
	import { clientStep, type ClientStep, type SubmitResult } from '#components/hire/steps/index.ts';
	import BeforeYouStart from '#components/hire/BeforeYouStart.svelte';
	import CopyLink from '#components/share/CopyLink.svelte';
	import OpenGraph from '#components/OpenGraph.svelte';
	import { m as datesMessages } from '#services/bookingDates.messages.ts';
	import { common } from '#lib/i18n/common.messages.ts';
	import Rich from '#lib/i18n/Rich.svelte';
	import { m } from './page.messages.ts';
	import type { PageData } from './$types';

	// The Hire page: the portfolio's hiring journey (GET /workflow/domains/:domainName), as the
	// visitor stands in it. A journey that is only the step it leads to is that step alone (the
	// booking page); otherwise each step in turn: a step opens once the ones before it succeeded.
	// What a step shows and does is its type's (components/hire/steps/): the page knows the order,
	// the locks and the journey's routes. The API checks the steps again on each request.
	// Rendered on the server from the journey as anyone signed out stands in it (+page.server.ts),
	// with "Before you start": what the steps ask, what to have at hand, how long they take. The
	// browser then loads it again with the session (the visitor's own progress), and loads it
	// alone when the server could not.

	let { data }: { data: PageData } = $props();

	// The name the portfolio is headed with: its title, or its address name
	let ownerName = $derived(portfolioName(data.domain));

	const withCredentials = { fetch: { credentials: 'include' } } as const;

	// The address the last navigation went to: page.url keeps the last real navigation's (a shallow
	// goto, as the job step's after a pick, does not change it, but still runs afterNavigate).
	// Steps read what it asks of them (?job=, back from writing a job)
	let address = $state.raw(untrack(() => new URL(page.url.href)));

	let user = $derived(
		$sessionCheckedStore && isSessionValid($authenticationStore)
			? $authenticationStore.user
			: undefined
	);

	type JourneyState =
		| { state: 'loading' }
		| { state: 'ready'; journey: Journey }
		| { state: 'error'; message: string };

	let loaded = $state.raw<JourneyState>({ state: 'loading' });
	let journey = $derived(loaded.state === 'ready' ? loaded.journey : null);
	let states = $derived(journey ? stepStates(journey) : []);
	// What the page leads to (said under its title): the step the journey leads to. Until the
	// journey is known, the one every portfolio starts with
	let goal = $derived.by(() => {
		const steps = journey?.steps ?? DEFAULT_WORKFLOW_STEPS;
		const before = goalStepIndex(steps);
		const texts = before === -1 ? undefined : clientStep(steps[before].type)?.goal;
		return texts && { before, ...texts };
	});
	// The page's description: what the journey asks, and about how long it takes
	let description = $derived(
		journeyDescription(
			ownerName,
			journey?.steps,
			journeyEffort(journey?.steps.map((step) => clientStep(step.type)?.effort) ?? []).minutes
		)
	);
	// A journey that is only the step it leads to shows that step alone, without the list
	let bare = $derived(
		journey && isBareJourney(journey) ? clientStep(journey.steps[0].type) : undefined
	);
	/** The step shown unfolded */
	let expanded = $state(0);
	let request = 0;
	const stepHeadings: HTMLElement[] = $state([]);

	/**
	 * The steps a visitor can open: not the locked ones. A step that is not passed shows too: its
	 * type says why (the job match: the score, and what to do about it)
	 */
	const isUsable = (state: StepState) => state !== 'locked';

	/**
	 * A step shows its controls when its type is known and the caller can use it. The owner
	 * previews: a step that asks something of visitors asks nothing of them (they read what it
	 * asks instead, unless its type shows itself to them), only what the journey leads to is
	 * theirs to use
	 */
	const isLive = (own: boolean, step: JourneyStep, state: StepState) =>
		clientStep(step.type) !== undefined &&
		isUsable(state) &&
		(!own || stepManifest(step.type)?.kind === 'access' || !!clientStep(step.type)?.ownerPreview);

	/** The step the address asks for (a done step to come back to), when it can be used; else -1 */
	const stepAskedFor = (next: Journey) => {
		if (next.own) return -1;
		const nextStates = stepStates(next);
		return next.steps.findIndex(
			(step, index) =>
				isUsable(nextStates[index]) && clientStep(step.type)?.wantsOpen?.(step, address)
		);
	};

	/** `follow`: the address can ask for a step (not after a submit, which settles what it asked) */
	function showJourney(next: Journey, { follow = true } = {}) {
		loaded = { state: 'ready', journey: next };
		const asked = follow ? stepAskedFor(next) : -1;
		expanded = asked === -1 ? activeStepIndex(next) : asked;
	}

	// The journey the server rendered, as anyone signed out stands in it: the first paint, until
	// the browser's own load (with the session) answers
	untrack(() => {
		if (data.journey) showJourney(data.journey);
	});

	// Also when the page is already shown: the job editor's toast can lead back here
	afterNavigate((navigation) => {
		if (navigation.type === 'enter' || !navigation.to) return;
		address = navigation.to.url;
		const asked = journey ? stepAskedFor(journey) : -1;
		if (asked !== -1) expanded = asked;
	});

	async function loadJourney() {
		const current = ++request;
		if (loaded.state !== 'ready') loaded = { state: 'loading' };
		try {
			const { data: answer, error } = await portfolioTextApi.workflow
				.domains({ domainName: encodeURIComponent(data.domainName) })
				.get(withCredentials);
			if (current !== request) return;
			if (error || !answer) {
				failed(failureText(error?.value, m.journeyFailed));
				return;
			}
			showJourney(answer);
		} catch {
			if (current === request) failed(networkError());
		}
	}

	/**
	 * The journey could not be loaded: said in place of the steps, or, when some are shown (the
	 * server's render, an earlier load), over them, which stay
	 */
	function failed(message: string) {
		if (loaded.state === 'ready') toaster.error({ title: message });
		else loaded = { state: 'error', message };
	}

	// Loaded at once: the API reads the session cookie itself
	onMount(() => void loadJourney());

	// Then again whenever the account changes once the session is known: a sign-in (from a step,
	// the header, another tab) or a sign-out. The first check only confirms the cookie the
	// journey was loaded with
	let viewer = $derived($sessionCheckedStore ? (user?._id ?? '') : null);
	let journeyViewer: string | undefined;
	$effect(() => {
		const key = viewer;
		if (key === null) return;
		untrack(() => {
			if (journeyViewer !== undefined && journeyViewer !== key) void loadJourney();
			journeyViewer = key;
		});
	});

	async function focusStep(index: number) {
		await tick();
		stepHeadings[index]?.focus();
	}

	/** What the visitor submits on a step: the API answers with the journey as they now stand in it */
	async function submitStep(stepId: string, input: unknown): Promise<SubmitResult> {
		try {
			const { data: next, error } = await portfolioTextApi.workflow
				.domains({ domainName: encodeURIComponent(data.domainName) })
				.steps({ stepId })
				.post({ input }, withCredentials);
			if (error || !next) return { ok: false, status: errorStatus(error), value: error?.value };
			// A load still under way would show the journey as it was before
			request++;
			showJourney(next, { follow: false });
			void focusStep(expanded);
			return { ok: true };
		} catch (cause) {
			return { ok: false, status: undefined, value: cause };
		}
	}

	/** A step succeeded without a submit: the next one opens, without loading the journey again */
	function onStepSucceeded(stepId: string) {
		if (!journey || journey.own) return;
		loaded = {
			state: 'ready',
			journey: {
				...journey,
				steps: journey.steps.map((step) =>
					step.id === stepId ? { ...step, status: 'succeeded' as const } : step
				)
			}
		};
	}

	async function onStepLocked(reason: 'signed-out' | 'locked') {
		if (reason === 'signed-out' && user) {
			// Reloaded below: the account change must not start a second load
			journeyViewer = '';
			clearAuthentication();
			toaster.error({ title: accountMessages.sessionExpired });
		} else {
			// The owner added steps since the page was opened, or an earlier step does not hold anymore
			toaster.warning({
				title: reason === 'signed-out' ? m.locked.signIn : m.locked.stepsFirst,
				description: m.locked.why(ownerName)
			});
		}
		await loadJourney();
		await focusStep(expanded);
	}
</script>

<svelte:head>
	<title>{m.title(ownerName)}</title>
	<meta name="description" content={description} />
</svelte:head>
<!-- A shared link's preview: the page's title, its description (the steps, from the journey the
     server rendered), over the generic picture of a page for recruiters -->
<OpenGraph title={m.title(ownerName)} {description} image="hire" />

{#snippet visitor(entry: ClientStep, step: JourneyStep, shown: Journey)}
	<entry.Visitor
		{step}
		journey={shown}
		domainName={data.domainName}
		{ownerName}
		{address}
		submit={(input) => submitStep(step.id, input)}
		reload={() => void loadJourney()}
		locked={onStepLocked}
		succeeded={() => onStepSucceeded(step.id)}
	/>
{/snippet}

<!-- The owner's preview: what it is, where the steps are changed, and their link to share -->
{#snippet ownerNote()}
	<div class="card preset-tonal flex items-start gap-3 p-4 text-sm" role="note" data-owner-note>
		<Eye size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
		<div class="min-w-0 flex-1 space-y-3">
			<p>
				<Rich text={m.own}>
					{#snippet admin(text)}<a
							class="underline underline-offset-2"
							href={resolve('/[domain]/admin?tab=workflows', { domain: data.domainName })}>{text}</a
						>{/snippet}
				</Rich>
			</p>
			<CopyLink link={portfolioLink(page.url.origin, data.domainName)} tone="tonal" />
			<a
				class="btn btn-sm preset-tonal"
				href={resolve('/[domain]/admin?tab=share', { domain: data.domainName })}
			>
				<Share size="16" aria-hidden="true" />
				{m.moreWays}
			</a>
		</div>
	</div>
{/snippet}

<div class="max-w-3xl mx-auto p-6 space-y-8">
	<section class="space-y-2">
		<h1 class="h2">{m.title(ownerName)}</h1>
		{#if journey}
			<p class="opacity-75">{journeyIntro(ownerName, goal)}</p>
		{/if}
	</section>

	{#if loaded.state === 'loading'}
		<!-- The server could not render the journey: loaded in the browser -->
		<div class="space-y-3" role="status">
			<span class="sr-only">{m.loading}</span>
			<div
				class="placeholder h-40 w-full animate-pulse motion-reduce:animate-none"
				aria-hidden="true"
			></div>
		</div>
	{:else if loaded.state === 'error'}
		<div class="card preset-tonal-error space-y-3 p-4" role="alert">
			<p class="text-sm">{loaded.message}</p>
			<button type="button" class="btn btn-sm preset-tonal" onclick={() => loadJourney()}>
				{common.retry}
			</button>
		</div>
	{:else if journey && journey.steps.length === 0}
		{#if journey.own}{@render ownerNote()}{/if}
		<section class="card p-6">
			<p class="opacity-75">{datesMessages.bookingUnavailable}</p>
		</section>
	{:else if journey}
		{#if journey.own}{@render ownerNote()}{/if}
		<BeforeYouStart {journey} {ownerName} />
		<!-- What the server rendered is the whole page without JavaScript: it says what each step
		     asks, but going through them needs the browser. Its own bottom margin: a <noscript> is
		     inline, the page's spacing does not reach the steps under it -->
		<noscript>
			<p class="card preset-tonal-warning mb-8 p-4 text-sm">{m.noScript}</p>
		</noscript>
	{/if}

	{#if journey && bare}
		{@render visitor(bare, journey.steps[0], journey)}
	{:else if journey && journey.steps.length > 0}
		<ol class="space-y-4" aria-label={m.journey}>
			{#each journey.steps as step, index (step.id)}
				{@const state = states[index]}
				{@const entry = clientStep(step.type)}
				{@const name = stepName(step, entry?.title?.(step))}
				{@const live = isLive(journey.own === true, step, state)}
				{@const unfolded = expanded === index && live}
				<li
					class={[
						'card border p-4 sm:p-6 space-y-4',
						unfolded ? 'border-primary-500/60' : 'border-surface-200-800'
					]}
					aria-current={!journey.own && (state === 'open' || state === 'failed')
						? 'step'
						: undefined}
				>
					<div class="flex items-start gap-3">
						<span
							class={[
								'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
								state === 'done'
									? 'preset-filled-success-500'
									: state === 'open'
										? 'preset-filled-primary-500'
										: state === 'failed'
											? 'preset-filled-error-500'
											: 'preset-tonal'
							]}
							aria-hidden="true"
						>
							{#if state === 'done'}
								<Check size="16" />
							{:else if state === 'locked'}
								<LockClosed size="14" />
							{:else if state === 'failed'}
								<XMark size="16" />
							{:else}
								{index + 1}
							{/if}
						</span>
						<div class="min-w-0 flex-1 space-y-0.5">
							<h2 class="h4 outline-none break-words" tabindex="-1" bind:this={stepHeadings[index]}>
								<span class="sr-only">{m.step(index + 1)}</span>
								{name}
								{#if state === 'done'}<span class="sr-only">{m.state.done}</span>{/if}
								{#if state === 'locked'}<span class="sr-only">{m.state.locked}</span>{/if}
								{#if state === 'failed'}<span class="sr-only">{m.state.failed}</span>{/if}
							</h2>
							<p class="text-sm text-surface-700-300 break-words">
								{stepNote(journey, index, state, entry?.note, entry?.failedNote)}
							</p>
						</div>
						{#if live && !unfolded}
							<button
								type="button"
								class="btn btn-sm preset-tonal shrink-0"
								onclick={() => {
									expanded = index;
									void focusStep(index);
								}}
							>
								{(state === 'done' && entry?.reopenLabel) || m.open}
								<span class="sr-only">{name}</span>
							</button>
						{/if}
					</div>
					{#if unfolded && entry}
						{@render visitor(entry, step, journey)}
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</div>
