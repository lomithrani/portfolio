<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Check, Eye, LockClosed } from 'svelte-heros-v2';
	import { WORKFLOW_STEPS } from 'portfolio-common';
	import { portfolioApi } from '#services';
	import { clearAuthentication, isSessionValid } from '#services/authentication.ts';
	import { SESSION_EXPIRED_MESSAGE } from '#services/account.ts';
	import { NETWORK_ERROR, failureText } from '#services/recruiter.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { toaster } from '#services/toaster.ts';
	import {
		JOB_PARAM,
		activeStepIndex,
		isBookingOnly,
		journeyIntro,
		requestedJobId,
		stepNote,
		stepStates,
		type Journey
	} from '#services/workflow.ts';
	import MeetingBooking from '#components/hire/MeetingBooking.svelte';
	import JobStep from '#components/hire/JobStep.svelte';
	import type { PageData } from './$types';

	// The Hire page: the portfolio's hiring journey (GET /workflow/domains/:domainName), as the
	// visitor stands in it. A journey that is only the meeting step is the booking page itself;
	// otherwise each step in turn (a step opens once the ones before it are done), the meeting
	// last. The API checks the steps again on each booking request.

	let { data }: { data: PageData } = $props();

	let ownerName = $derived(data.domain.headerTitle || data.domainName);

	const withCredentials = { fetch: { credentials: 'include' } } as const;
	const JOURNEY_FAILED = 'Could not load this hiring journey. Try again in a moment.';

	// The job asked for in the address (?job=, back from writing it on /recruiter/jobs/new?journey=):
	// the job step opens on it until a job is picked. Also followed when the page is already shown
	// (the editor's toast can lead back here)
	let requestedJob = $state(untrack(() => requestedJobId(page.url.searchParams.get(JOB_PARAM))));

	let user = $derived(
		$sessionCheckedStore && isSessionValid($authenticationStore)
			? $authenticationStore.user
			: undefined
	);
	// What the booking form starts with: the session's name and email, when there is one
	let prefill = $derived.by(() => {
		const account = isSessionValid($authenticationStore) ? $authenticationStore.user : undefined;
		const name = [account?.name, account?.surname].filter(Boolean).join(' ');
		return { name, email: account?.email ?? '' };
	});

	type JourneyState =
		| { state: 'loading' }
		| { state: 'ready'; journey: Journey }
		| { state: 'error'; message: string };

	let loaded = $state.raw<JourneyState>({ state: 'loading' });
	let journey = $derived(loaded.state === 'ready' ? loaded.journey : null);
	let states = $derived(journey ? stepStates(journey) : []);
	let hasMeeting = $derived(!journey || journey.steps.some((step) => step.type === 'meeting'));
	/** The step shown unfolded */
	let expanded = $state(0);
	let request = 0;
	const stepHeadings: HTMLElement[] = $state([]);

	/** The job step, when the address asks for a job other than the one picked; else -1 */
	const requestedJobStep = (next: Journey) => {
		if (!requestedJob || next.own || next.job?._id === requestedJob) return -1;
		const index = next.steps.findIndex((step) => step.type === 'job');
		return index !== -1 && stepStates(next)[index] !== 'locked' ? index : -1;
	};

	function showJourney(next: Journey) {
		loaded = { state: 'ready', journey: next };
		const requested = requestedJobStep(next);
		expanded = requested === -1 ? activeStepIndex(next) : requested;
	}

	// The address the navigation went to: page.url keeps the last real navigation's (a shallow goto,
	// as onJobPicked's, does not change it, but still runs afterNavigate)
	afterNavigate((navigation) => {
		if (navigation.type === 'enter') return;
		const id = requestedJobId(navigation.to?.url.searchParams.get(JOB_PARAM));
		if (!id || id === requestedJob) return;
		requestedJob = id;
		if (journey) showJourney(journey);
	});

	async function loadJourney() {
		const current = ++request;
		if (loaded.state !== 'ready') loaded = { state: 'loading' };
		try {
			const { data: answer, error } = await portfolioApi.workflow
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

	// Then again whenever the account changes once the session is known: a sign-in (from the job
	// step, the header, another tab) or a sign-out. The first check only confirms the cookie the
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

	async function onJobPicked(next: Journey) {
		// The pick settles what the address asked for: it selects nothing any more
		requestedJob = null;
		showJourney(next);
		toaster.success({ title: 'Job picked', description: 'Next: pick a time slot.' });
		// The browser's address: page.url still has ?job= after an earlier shallow goto
		if (new URLSearchParams(location.search).has(JOB_PARAM)) {
			await goto(resolve('/[domain]/hire', { domain: data.domainName }), {
				replace: true,
				shallow: true
			});
		}
		await focusStep(expanded);
	}

	function onMeetingBooked() {
		if (!journey || journey.own) return;
		loaded = {
			state: 'ready',
			journey: {
				...journey,
				steps: journey.steps.map((step) =>
					step.type === 'meeting' ? { ...step, done: true } : step
				)
			}
		};
	}

	async function onMeetingLocked(reason: 'signed-out' | 'locked') {
		if (reason === 'signed-out' && user) {
			// Reloaded below: the account change must not start a second load
			journeyViewer = '';
			clearAuthentication();
			toaster.error({ title: SESSION_EXPIRED_MESSAGE });
		} else {
			// The owner added steps since the page was opened
			toaster.warning({
				title: reason === 'signed-out' ? 'Sign in to continue' : 'Complete the steps first',
				description: `${ownerName} asks recruiters to complete a step before booking.`
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

<div class="max-w-3xl mx-auto p-6 space-y-8">
	<section class="space-y-2">
		<h1 class="h2">{hasMeeting ? `Book a meeting with ${ownerName}` : `Hire ${ownerName}`}</h1>
		{#if journey}
			<p class="opacity-75">{journeyIntro(journey, ownerName)}</p>
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
	{:else if journey && isBookingOnly(journey)}
		<MeetingBooking
			domainName={data.domainName}
			{ownerName}
			{prefill}
			onBooked={onMeetingBooked}
			onLocked={onMeetingLocked}
		/>
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
			{#each journey.steps as step, index (step.type)}
				{@const state = states[index]}
				<!-- The owner's preview of the job step is its note: it asks nothing of them -->
				{@const unfolded =
					expanded === index && state !== 'locked' && !(journey.own && step.type === 'job')}
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
										: 'preset-tonal'
							]}
							aria-hidden="true"
						>
							{#if state === 'done'}
								<Check size="16" />
							{:else if state === 'locked'}
								<LockClosed size="14" />
							{:else}
								{index + 1}
							{/if}
						</span>
						<div class="min-w-0 flex-1 space-y-0.5">
							<h2 class="h4 outline-none" tabindex="-1" bind:this={stepHeadings[index]}>
								<span class="sr-only">Step {index + 1}:</span>
								{WORKFLOW_STEPS[step.type].label}
								{#if state === 'done'}<span class="sr-only">(done)</span>{/if}
								{#if state === 'locked'}<span class="sr-only">(locked)</span>{/if}
							</h2>
							<p class="text-sm text-surface-700-300 break-words">
								{stepNote(journey, index, state)}
							</p>
						</div>
						{#if state !== 'locked' && !unfolded && !(journey.own && step.type === 'job')}
							<button
								type="button"
								class="btn btn-sm preset-tonal shrink-0"
								onclick={() => {
									expanded = index;
									void focusStep(index);
								}}
							>
								{step.type === 'job' && state === 'done' ? 'Change' : 'Open'}
								<span class="sr-only">{WORKFLOW_STEPS[step.type].label}</span>
							</button>
						{/if}
					</div>
					{#if unfolded}
						{#if step.type === 'job'}
							<!-- Again for each job the address asks for: its list then has the new posting -->
							{#key requestedJob}
								<JobStep
									domainName={data.domainName}
									{ownerName}
									{journey}
									{requestedJob}
									onPicked={onJobPicked}
									onReloadJourney={() => loadJourney()}
								/>
							{/key}
						{:else if step.type === 'meeting'}
							<MeetingBooking
								domainName={data.domainName}
								{ownerName}
								{prefill}
								onBooked={onMeetingBooked}
								onLocked={onMeetingLocked}
							/>
						{/if}
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</div>
