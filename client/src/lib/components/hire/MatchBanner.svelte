<!--
@component
Above the steps of the Hire page, for the recruiter of a mutual interest (the journey's `match`:
the owner and they are both interested in one of their jobs, matching): the job they met over (as
the owner said yes to it, a link to its page in their recruiter space), since when, whether the job
description was edited since (the owner keeps the version they said yes to), whether this page holds
that job (its job step: no other job meanwhile) or the invitation names it (a journey without one),
what is left before the meeting (mutualInterestNext: the notes still to confirm, or nothing but the
meeting, never one nobody can book), and "End it" (asked first: the page then reads the journey
again, where the job step is to do as for anyone). Shown, the mutual interest is marked seen (the
account menu's mark). Headed "You're both interested", never a bare "match" (decision 11), and no
email promised (decision 10).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { resolve } from '$app/paths';
	import { HandThumbUp, XMark } from 'svelte-heros-v2';
	import {
		markMutualInterestsSeen,
		notificationsStore,
		refreshNotifications
	} from '#services/notifications.ts';
	import { formatDay, isoDate, networkError } from '#services/recruiter.ts';
	import { endRecruiterInterest } from '#services/recruiterMatching.ts';
	import { toaster } from '#services/toaster.ts';
	import {
		jobLine,
		mutualInterestNext,
		type Journey,
		type JourneyMatch
	} from '#services/workflow.ts';
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
		onSignedOut
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
	} = $props();

	const uid = $props.id();
	let line = $derived(jobLine(match.job));
	// Its job step holds the job; without one (taken out since), the invitation names it
	let held = $derived(journey.steps.some((step) => step.type === 'job'));
	let next = $derived(
		mutualInterestNext(journey, {
			booking,
			title: (step) => clientStep(step.type)?.title?.(step)
		})
	);

	onMount(() => {
		// Shown: no longer counted as not seen (unless nothing is counted: no request)
		const { matching, unseen } = get(notificationsStore);
		if (matching !== 'on' || unseen.recruiter > 0) void markMutualInterestsSeen([match._id]);
	});

	let confirming = $state(false);
	let busy = $state(false);
	let error = $state('');

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
			default:
				error = result.failure === 'network' ? networkError() : list.endDialog.failed;
		}
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
	{:else if booking}
		<p class="text-sm">{m.inInvitation}</p>
	{/if}
	{#if match.changed}
		<p class="text-sm" data-match-changed>{m.changed(ownerName)}</p>
	{/if}
	{#each next as text (text)}
		<p class="text-sm font-medium" data-match-next>{text}</p>
	{/each}
	<button
		type="button"
		class="btn preset-tonal-error min-h-11 max-w-full whitespace-normal"
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
	confirmLabel={list.endDialog.confirm}
	busyLabel={list.endDialog.busy}
	{busy}
	{error}
	onConfirm={end}
	onCancel={() => {
		if (!busy) confirming = false;
	}}
/>
