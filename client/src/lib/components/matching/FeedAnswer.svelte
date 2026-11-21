<!--
@component
On the private page of a job proposed to the candidate (`access: 'feed'` of GET
/opportunities/jobs/:id): their score of it against their own criteria, their minimum, how it does
on each criterion (the travel times credited), whether its recruiter is interested in them (never
who they are: decision 17), and their answer (decision 11: Interested or Pass), given here or in
the deck of /opportunities and changed by answering again until both are interested; an answer
given here can be undone within MATCHING_LIMITS.undoMinutes (the API says when it no longer can:
the latest answer, the first on that job). An answer that makes a mutual interest, or that finds
the job no longer proposed, asks the page to read the job again (`onChange`). What happened is said
in a polite live region (inside the page, main#page); a failure in an alert.
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { ArrowUturnLeft, HandThumbUp, XMark } from 'svelte-heros-v2';
	import type { MatchDecision } from 'portfolio-common';
	import { m as cards } from './cards.messages.ts';
	import CriterionOutcomes from './CriterionOutcomes.svelte';
	import {
		UNDO_WINDOW_MS,
		decisionLabel,
		type DecisionFailure,
		type OpportunityScore
	} from '#services/matching.ts';
	import { answerOpportunity, undoOpen, undoOpportunityAnswer } from '#services/opportunities.ts';
	import { refreshNotifications } from '#services/notifications.ts';
	import { m } from './FeedAnswer.messages.ts';

	let {
		jobId,
		score,
		interested,
		decision: initial,
		onChange
	}: {
		jobId: string;
		/** Their score of the job, as their feed gives it; null when it does not read */
		score: OpportunityScore | null;
		/** Its recruiter said they are interested in the candidate */
		interested: boolean;
		/** What they answered so far (null: nothing yet) */
		decision: MatchDecision | null;
		/**
		 * The job is to be read again: `mutual` (both are interested now), `gone` (no longer
		 * proposed, or the answer cannot be given anymore), `signed-out`
		 */
		onChange: (why: 'mutual' | 'gone' | 'signed-out') => void;
	} = $props();

	const uid = $props.id();
	const undoId = `${uid}-undo`;
	// What the page read, changed here from then on (the page mounts it again for each read)
	let decision = $state<MatchDecision | null>(untrack(() => initial));
	/** When an answer was given here (milliseconds): Undo is offered within its window */
	let answeredAt = $state<number | null>(null);
	let now = $state(Date.now());
	let busy = $state(false);
	let alert = $state('');
	let announcement = $state('');
	let passed = $derived(!!score && score.score >= score.minScore);
	let showUndo = $derived(undoOpen(answeredAt, now));

	// Undo goes once its window ends
	$effect(() => {
		if (answeredAt === null) return;
		const left = answeredAt + UNDO_WINDOW_MS - Date.now();
		const timer = setTimeout(() => (now = Date.now()), Math.max(left + 100, 0));
		return () => clearTimeout(timer);
	});

	async function say(text: string) {
		announcement = '';
		await tick();
		announcement = text;
	}

	/** What a failure does here: the page reads the job again, or it is said */
	function failed(failure: DecisionFailure, action: 'decide' | 'undo') {
		switch (failure.kind) {
			case 'signed-out':
				onChange('signed-out');
				return;
			case 'mutual':
				onChange('mutual');
				return;
			case 'gone':
			case 'not-proposed':
			case 'off':
			case 'job-gone':
				onChange('gone');
				return;
			case 'final':
				answeredAt = null;
				void say(failure.message);
				document.getElementById(`${uid}-answer`)?.focus({ preventScroll: true });
				return;
			default:
				alert = failure.message;
				if (action === 'undo') document.getElementById(undoId)?.focus({ preventScroll: true });
		}
	}

	async function answer(next: MatchDecision) {
		if (busy) return;
		busy = true;
		alert = '';
		const result = await answerOpportunity(jobId, next);
		busy = false;
		void refreshNotifications();
		if (!result.ok) {
			failed(result.failure, 'decide');
			return;
		}
		if (result.match) {
			void say(m.mutual);
			onChange('mutual');
			return;
		}
		decision = result.decision;
		answeredAt = Date.now();
		now = answeredAt;
		void say(result.decision === 'interested' ? m.saidInterested : m.saidPass);
		// The button pressed is gone: the answer's sentence takes the focus
		await tick();
		document.getElementById(`${uid}-answer`)?.focus({ preventScroll: true });
	}

	async function undoAnswer() {
		if (busy) return;
		if (!undoOpen(answeredAt, Date.now())) {
			now = Date.now();
			return;
		}
		busy = true;
		alert = '';
		const result = await undoOpportunityAnswer(jobId);
		busy = false;
		if (!result.ok) {
			failed(result.failure, 'undo');
			return;
		}
		decision = result.decision;
		answeredAt = null;
		void say(m.undone);
		await tick();
		document.getElementById(`${uid}-answer`)?.focus({ preventScroll: true });
	}

	/** A button's label wraps rather than run past it on a narrow phone (in French) */
	const button = 'btn min-h-12 max-w-full whitespace-normal text-center leading-5';
</script>

<section
	class="card preset-outlined-surface-200-800 space-y-4 bg-surface-50-950 p-4 sm:p-6"
	aria-labelledby="{uid}-heading"
	data-feed-answer={decision ?? 'none'}
>
	<p class="sr-only" aria-live="polite">{announcement}</p>
	<div class="flex flex-wrap items-center gap-2">
		<h2 id="{uid}-heading" class="text-lg font-bold">{m.heading}</h2>
		{#if interested}
			<span class="badge preset-filled-primary-500 gap-1.5">
				<HandThumbUp size="14" aria-hidden="true" />
				{cards.opportunity.interested}
			</span>
		{/if}
	</div>

	{#if score}
		<div class="flex flex-wrap items-center gap-x-5 gap-y-3">
			<p
				class={[
					'flex shrink-0 items-baseline gap-1 rounded-container px-4 py-2',
					passed ? 'preset-tonal-success' : 'preset-tonal-error'
				]}
			>
				<span class="sr-only">{cards.opportunity.score}</span>
				<span class="text-3xl font-bold tabular-nums">{score.score}</span>
				<span class="text-sm" aria-hidden="true">/ 100</span>
				<span class="sr-only">{cards.opportunity.outOf100}</span>
			</p>
			<div class="min-w-0 flex-1 basis-40 space-y-0.5">
				<p class="font-semibold">{cards.opportunity.scoredAgainst}</p>
				<p class="text-sm text-surface-700-300">{cards.opportunity.minimum(score.minScore)}</p>
			</div>
		</div>
		{#if score.criteria.length > 0}
			<div class="space-y-2">
				<h3 class="text-sm font-semibold">{cards.opportunity.outcomes}</h3>
				<CriterionOutcomes criteria={score.criteria} audience="candidate" transit={score.transit} />
			</div>
		{/if}
	{/if}

	<div class="space-y-3 border-t border-surface-200-800 pt-4">
		{#if alert}
			<p class="card preset-tonal-error p-3 text-sm" role="alert">{alert}</p>
		{/if}
		<p
			id="{uid}-answer"
			tabindex="-1"
			class="rounded-base outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
			data-answer
		>
			{decision === 'interested' ? m.interested : decision === 'pass' ? m.passed : m.ask}
		</p>
		<div class="flex flex-wrap items-center gap-2">
			{#if decision !== 'pass'}
				<button
					type="button"
					class={[button, 'preset-tonal', busy ? 'opacity-60' : '']}
					aria-disabled={busy}
					onclick={() => answer('pass')}
				>
					<XMark size="20" class="shrink-0" aria-hidden="true" />
					{decisionLabel('pass')}
				</button>
			{/if}
			{#if decision !== 'interested'}
				<button
					type="button"
					class={[button, 'preset-filled-primary-500', busy ? 'opacity-60' : '']}
					aria-disabled={busy}
					onclick={() => answer('interested')}
				>
					<HandThumbUp size="20" class="shrink-0" aria-hidden="true" />
					{decisionLabel('interested')}
				</button>
			{/if}
			{#if showUndo}
				<button
					id={undoId}
					type="button"
					class={['btn preset-tonal min-h-11 ms-auto', busy ? 'opacity-60' : '']}
					aria-disabled={busy}
					onclick={undoAnswer}
				>
					<ArrowUturnLeft size="16" class="shrink-0" aria-hidden="true" />
					{decisionLabel('undo')}
				</button>
			{/if}
		</div>
		{#if busy}
			<p class="text-sm text-surface-700-300" role="status">{m.sending}</p>
		{/if}
	</div>
</section>
