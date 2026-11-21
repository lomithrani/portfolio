<!--
@component
On the private page of a job the candidate and its recruiter are both interested in (`access:
'match'` of GET /opportunities/jobs/:id: the page shows the version they said yes to): the day
both became interested, where it stands (going on, ended by them, by the recruiter, or the job no
longer open), whether the job description was edited since, how a meeting is booked while it
lasts, and "End it" (asked first). Shown, a mutual interest going on is marked seen (the account
menu's badge). Never a bare "match" (decision 11), no email promised (decision 10).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { HandThumbUp, XMark } from 'svelte-heros-v2';
	import ConfirmDialog from '#components/recruiter/ConfirmDialog.svelte';
	import {
		matchedOnText,
		mutualInterestChangeText,
		mutualInterestStateText
	} from '#services/matching.ts';
	import type { SharedMutualInterest } from '#services/jobView.ts';
	import { markMutualInterestsSeen, notificationsStore } from '#services/notifications.ts';
	import { endMutualInterest } from '#services/opportunities.ts';
	import { networkError } from '#services/recruiter.ts';
	import { toaster } from '#services/toaster.ts';
	import { m as cards } from './cards.messages.ts';
	import { m as list } from './CandidateInterest.messages.ts';

	let {
		interest,
		headingId,
		onChange
	}: {
		interest: SharedMutualInterest;
		/** Its heading's id: the page moves the focus to it once both became interested */
		headingId?: string;
		/** The job is to be read again: ended here, gone, or signed out */
		onChange: (why: 'ended' | 'gone' | 'signed-out') => void;
	} = $props();

	const uid = $props.id();
	let titleId = $derived(headingId ?? `${uid}-title`);
	let going = $derived(!interest.endedAt);
	let change = $derived(mutualInterestChangeText(interest));

	onMount(() => {
		// Shown: no longer counted as not seen (unless nothing is counted: no request)
		const { matching, unseen } = get(notificationsStore);
		if (going && (matching !== 'on' || unseen.candidate > 0)) {
			void markMutualInterestsSeen([interest._id]);
		}
	});

	let confirming = $state(false);
	let busy = $state(false);
	let error = $state('');

	async function end() {
		if (busy) return;
		busy = true;
		error = '';
		const result = await endMutualInterest(interest._id);
		busy = false;
		if (result.ok) {
			confirming = false;
			toaster.success({ title: list.endDialog.done });
			onChange('ended');
			return;
		}
		if (result.failure === 'signed-out') {
			confirming = false;
			onChange('signed-out');
			return;
		}
		if (result.failure === 'gone' || result.failure === 'off') {
			confirming = false;
			onChange('gone');
			return;
		}
		error = result.failure === 'network' ? networkError() : list.endDialog.failed;
	}
</script>

<section
	class="card space-y-3 border border-primary-300-700 preset-tonal-primary p-4 sm:p-6"
	aria-labelledby={titleId}
	data-shared-interest={going ? 'going' : 'ended'}
>
	<h2
		id={titleId}
		tabindex="-1"
		class="flex items-center gap-2 rounded-base text-lg font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
	>
		<HandThumbUp size="20" class="shrink-0" aria-hidden="true" />
		{cards.mutual.heading}
	</h2>
	<p class="flex flex-wrap items-center gap-2 text-sm">
		<span class="badge preset-filled-surface-50-950" data-interest-state>
			{mutualInterestStateText(interest)}
		</span>
		<span>{matchedOnText(interest.matchedAt)}</span>
	</p>
	{#if change}
		<p class="text-sm" data-interest-changed>{change}</p>
	{/if}
	{#if going}
		<p class="text-sm">{list.next}</p>
		<button
			type="button"
			class="btn preset-tonal-error min-h-11 max-w-full whitespace-normal"
			onclick={() => {
				error = '';
				confirming = true;
			}}
		>
			<XMark size="18" class="shrink-0" aria-hidden="true" />
			{list.end}
		</button>
	{/if}
</section>

{#if going}
	<ConfirmDialog
		open={confirming}
		title={list.endDialog.title}
		description={list.endDialog.description}
		confirmLabel={list.endDialog.confirm}
		busyLabel={list.endDialog.busy}
		{busy}
		{error}
		onConfirm={end}
		onCancel={() => {
			if (!busy) confirming = false;
		}}
		finalFocusEl={() => document.getElementById(titleId)}
	/>
{/if}
