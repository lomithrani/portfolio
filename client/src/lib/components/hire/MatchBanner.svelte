<!--
@component
Above the steps of the Hire page, for the recruiter of a mutual interest (the journey's `match`:
the owner and they are both interested in one of their jobs, matching): the job they met over (as
the owner said yes to it, a link to its page in their recruiter space), since when, whether the job
description was edited since (the owner keeps the version they said yes to), whether this page holds
that job now (its job step succeeded: no other job meanwhile), or the invitation names it (a journey
without one), what is left before the meeting (mutualInterestNext: what brings back a job the step
does not hold now, the notes still to confirm, or nothing but the meeting, never one nobody can
book), what happens once it is booked (the goal's `next`, as "Before you start" says it), and "End
it" (asked first, saying that a meeting booked stays booked; a refusal for the terms in force asks for
them here: the page then reads the journey again, where the job step is to do as for anyone). Shown,
the mutual interest is marked seen (the account menu's mark: one request each time it shows, whatever
the counts the header read). Headed "You're both interested", never a bare "match" (decision 11), and
no promise of an email from Portfolio (decision 10: the meeting's invitation is the calendar's).
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { HandThumbUp, XMark } from 'svelte-heros-v2';
	import { isSessionValid } from '#services/authentication.ts';
	import { markMutualInterestsSeen, refreshNotifications } from '#services/notifications.ts';
	import { formatDay, isoDate, networkError } from '#services/recruiter.ts';
	import { endRecruiterInterest } from '#services/recruiterMatching.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { toaster } from '#services/toaster.ts';
	import {
		goalStepIndex,
		jobLine,
		mutualInterestJob,
		mutualInterestNext,
		type Journey,
		type JourneyMatch
	} from '#services/workflow.ts';
	import TermsAcceptance from '#components/account/TermsAcceptance.svelte';
	import { clientStep } from '#components/hire/steps/index.ts';
	import { m as cards } from '#components/matching/cards.messages.ts';
	import ConfirmDialog from '#components/recruiter/ConfirmDialog.svelte';
	import { m as list } from '#components/recruiter/RecruiterMatches.messages.ts';
	import Rich from '#lib/i18n/Rich.svelte';
	import { m } from './MatchBanner.messages.ts';

	let {
		match,
		journey,
		ownerName,
		booking,
		onEnded,
		onSignedOut,
		onTermsAccepted
	}: {
		match: JourneyMatch;
		journey: Journey;
		ownerName: string;
		/** The journey leads to a meeting the visitor can book now (not one nobody can book) */
		booking: boolean;
		/** Ended here, or gone meanwhile: the page reads the journey again */
		onEnded: () => void;
		/** The session ended */
		onSignedOut: () => void;
		/** The terms in force were accepted here: the page reads the journey again (the job may hold) */
		onTermsAccepted: () => void;
	} = $props();

	const uid = $props.id();
	let user = $derived(
		$sessionCheckedStore && isSessionValid($authenticationStore)
			? $authenticationStore.user
			: undefined
	);
	let line = $derived(jobLine(match.job));
	// Its job step holds the job now (succeeded); while it does not, `next` says what brings it back.
	// Without a job step (taken out since), the invitation names it
	let held = $derived(mutualInterestJob(journey)?.holds === true);
	let hasJobStep = $derived(journey.steps.some((step) => step.type === 'job'));
	let next = $derived(
		mutualInterestNext(journey, {
			booking,
			title: (step) => clientStep(step.type)?.title?.(step)
		})
	);
	// The step the journey leads to (the meeting): what happens once it is done, as "Before you
	// start" says it, while it is not done yet; and whether a meeting was booked (ending it keeps it)
	let goal = $derived.by(() => {
		const index = goalStepIndex(journey.steps);
		const step = index === -1 ? undefined : journey.steps[index];
		const texts = step && clientStep(step.type)?.goal;
		return step && texts ? { step, texts } : undefined;
	});
	let afterBooking = $derived(
		booking && goal && goal.step.status !== 'succeeded' ? goal.texts.next(ownerName) : undefined
	);
	let booked = $derived(goal?.texts.booking === true && goal.step.status === 'succeeded');

	onMount(() => {
		// Shown: no longer counted as not seen. Whatever the counts the header read (they may be
		// older than this mutual interest): one request each time the banner shows
		void markMutualInterestsSeen([match._id]);
	});

	let confirming = $state(false);
	let busy = $state(false);
	let error = $state('');
	/** Ending it was refused for the terms in force: they are asked here */
	let termsAsked = $state(false);
	let termsNote: HTMLElement | undefined = $state();
	let endButton: HTMLButtonElement | undefined = $state();

	async function end() {
		if (busy) return;
		busy = true;
		error = '';
		const result = await endRecruiterInterest(match._id);
		busy = false;
		if (result.ok) {
			confirming = false;
			toaster.success({ title: list.endDialog.done });
			void refreshNotifications();
			onEnded();
			return;
		}
		switch (result.failure) {
			case 'signed-out':
				confirming = false;
				onSignedOut();
				return;
			case 'gone':
			case 'off':
				// Ended by the other side meanwhile, or matching turned off: the journey says it
				confirming = false;
				toaster.info({ title: list.endDialog.gone });
				onEnded();
				return;
			case 'terms':
				// Never fixed by trying again: the terms are asked in the banner, which takes the focus
				// once the dialog closes
				termsAsked = true;
				await tick();
				confirming = false;
				return;
			default:
				error = result.failure === 'network' ? networkError() : list.endDialog.failed;
		}
	}

	async function termsAccepted() {
		termsAsked = false;
		onTermsAccepted();
		// "End it" again: the form that had the focus went
		await tick();
		endButton?.focus();
	}
</script>

<section
	class="card space-y-3 border border-primary-300-700 preset-tonal-primary p-4 sm:p-6"
	aria-labelledby="{uid}-title"
	data-match-banner={match._id}
>
	<h2 id="{uid}-title" class="flex items-center gap-2 text-lg font-bold">
		<HandThumbUp size="20" class="shrink-0" aria-hidden="true" />
		{cards.mutual.heading}
	</h2>
	<p class="text-sm break-words">
		<Rich text={m.together}>
			{#snippet owner()}{ownerName}{/snippet}
			{#snippet job()}<a
					class="font-semibold underline underline-offset-2"
					href={resolve('/(app)/recruiter/jobs/[id]', { id: match.job._id })}>{line}</a
				>{/snippet}
			{#snippet time()}<time datetime={isoDate(match.matchedAt)}>{formatDay(match.matchedAt)}</time
				>{/snippet}
		</Rich>
	</p>
	{#if held}
		<p class="text-sm">{m.holds}</p>
	{:else if !hasJobStep && booking}
		<p class="text-sm">{m.inInvitation}</p>
	{/if}
	{#if match.changed}
		<p class="text-sm" data-match-changed>{m.changed(ownerName)}</p>
	{/if}
	{#each next as text (text)}
		<p class="text-sm font-medium" data-match-next>{text}</p>
	{/each}
	{#if afterBooking}
		<p class="text-sm" data-match-after-booking>{afterBooking}</p>
	{/if}
	{#if termsAsked && user}
		<div class="space-y-3" data-match-end-terms>
			<p class="text-sm font-medium outline-none" tabindex="-1" bind:this={termsNote}>
				{m.endTerms}
			</p>
			<TermsAcceptance {user} source="recruiter" required onAccepted={termsAccepted} />
		</div>
	{/if}
	<button
		type="button"
		class="btn preset-tonal-error min-h-11 max-w-full whitespace-normal"
		bind:this={endButton}
		onclick={() => {
			error = '';
			confirming = true;
		}}
	>
		<XMark size="18" class="shrink-0" aria-hidden="true" />
		{m.end}
	</button>
</section>

<ConfirmDialog
	open={confirming}
	title={list.endDialog.title}
	description={m.endDialog.description}
	details={booked ? m.endDialog.booked : ''}
	confirmLabel={list.endDialog.confirm}
	busyLabel={list.endDialog.busy}
	{busy}
	{error}
	onConfirm={end}
	onCancel={() => {
		if (!busy) confirming = false;
	}}
	finalFocusEl={() => (termsAsked ? (termsNote ?? null) : null)}
/>
