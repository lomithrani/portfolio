<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Check, Eye, LockClosed, XMark } from 'svelte-heros-v2';
	import { DEFAULT_WORKFLOW_STEPS, stepManifest } from 'portfolio-common';
	import { portfolioTextApi } from '#services';
	import { errorStatus } from '#services/apiErrors.ts';
	import { clearAuthentication, isSessionValid } from '#services/authentication.ts';
	import { SESSION_EXPIRED_MESSAGE } from '#services/account.ts';
	import { NETWORK_ERROR, failureText } from '#services/recruiter.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { toaster } from '#services/toaster.ts';
	import {
		activeStepIndex,
		goalStepIndex,
		isBareJourney,
		journeyIntro,
		stepName,
		stepNote,
		stepStates,
		type Journey,
		type JourneyStep,
		type StepState
	} from '#services/workflow.ts';
	import { clientStep, type ClientStep, type SubmitResult } from '#components/hire/steps/index.ts';
	import type { PageData } from './$types';

	// The Hire page: the portfolio's hiring journey (GET /workflow/domains/:domainName), as the
	// visitor stands in it. A journey that is only the step it leads to is that step alone (the
	// booking page); otherwise each step in turn: a step opens once the ones before it succeeded.
	// What a step shows and does is its type's (components/hire/steps/): the page knows the order,
	// the locks and the journey's routes. The API checks the steps again on each request.

	let { data }: { data: PageData } = $props();

	let ownerName = $derived(data.domain.headerTitle || data.domainName);

	const withCredentials = { fetch: { credentials: 'include' } } as const;
	const JOURNEY_FAILED = 'Could not load this hiring journey. Try again in a moment.';

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
	// What the page is about: the step the journey leads to. Until the journey is known, the one
	// every portfolio starts with
	let goal = $derived.by(() => {
		const steps = journey?.steps ?? DEFAULT_WORKFLOW_STEPS;
		const before = goalStepIndex(steps);
		const texts = before === -1 ? undefined : clientStep(steps[before].type)?.goal;
		return texts && { before, ...texts };
	});
	// A journey that is only the step it leads to shows that step alone, without the list
	let bare = $derived(
		journey && isBareJourney(journey) ? clientStep(journey.steps[0].type) : undefined
	);
	/** The step shown unfolded */
	let expanded = $state(0);
	let request = 0;
	const stepHeadings: HTMLElement[] = $state([]);

	/** The steps a visitor can act on: not the ones locked or not passed */
	const isUsable = (state: StepState) => state === 'open' || state === 'done';

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
				loaded = { state: 'error', message: failureText(error?.value, JOURNEY_FAILED) };
				return;
			}
			showJourney(answer);
		} catch {
			if (current === request) loaded = { state: 'error', message: NETWORK_ERROR };
		}
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
			toaster.error({ title: SESSION_EXPIRED_MESSAGE });
		} else {
			// The owner added steps since the page was opened, or an earlier step does not hold anymore
			toaster.warning({
				title: reason === 'signed-out' ? 'Sign in to continue' : 'Complete the steps first',
				description: `${ownerName} asks recruiters to complete the earlier steps first.`
			});
		}
		await loadJourney();
		await focusStep(expanded);
	}
</script>

<svelte:head>
	<title>Hire {ownerName}</title>
	<meta name="description" content={`Book a meeting with ${ownerName}.`} />
</svelte:head>

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

<div class="max-w-3xl mx-auto p-6 space-y-8">
	<section class="space-y-2">
		<h1 class="h2">{goal ? goal.heading(ownerName) : `Hire ${ownerName}`}</h1>
		{#if journey}
			<p class="opacity-75">{journeyIntro(ownerName, goal)}</p>
		{/if}
	</section>

	{#if loaded.state === 'loading'}
		<p class="text-sm opacity-50" role="status">Loading availability...</p>
	{:else if loaded.state === 'error'}
		<div class="card preset-tonal-error space-y-3 p-4" role="alert">
			<p class="text-sm">{loaded.message}</p>
			<button type="button" class="btn btn-sm preset-tonal" onclick={() => loadJourney()}>
				Try again
			</button>
		</div>
	{:else if journey && journey.steps.length === 0}
		<section class="card p-6">
			<p class="opacity-75">
				Online booking is not available right now. Please reach out directly.
			</p>
		</section>
	{:else if journey && bare}
		{@render visitor(bare, journey.steps[0], journey)}
	{:else if journey}
		{#if journey.own}
			<div class="card preset-tonal flex items-start gap-3 p-4 text-sm" role="note">
				<Eye size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
				<p>
					This is your hiring journey, as recruiters see it. Its steps never stop you.
					<a
						class="underline underline-offset-2"
						href={resolve('/[domain]/admin', { domain: data.domainName })}
					>
						Change the steps
					</a>
				</p>
			</div>
		{/if}
		<ol class="space-y-4" aria-label="Hiring journey">
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
					aria-current={!journey.own && state === 'open' ? 'step' : undefined}
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
								<span class="sr-only">Step {index + 1}:</span>
								{name}
								{#if state === 'done'}<span class="sr-only">(done)</span>{/if}
								{#if state === 'locked'}<span class="sr-only">(locked)</span>{/if}
								{#if state === 'failed'}<span class="sr-only">(not passed)</span>{/if}
							</h2>
							<p class="text-sm text-surface-700-300 break-words">
								{stepNote(journey, index, state, entry?.note)}
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
								{(state === 'done' && entry?.reopenLabel) || 'Open'}
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
