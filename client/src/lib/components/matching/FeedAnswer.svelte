<!--
@component
On the private page of a job proposed to the candidate (`access: 'feed'` of GET
/opportunities/jobs/:id): their score of it against their own criteria, their minimum, how it does
on each criterion (the travel times credited), whether its recruiter is interested in them (never
who they are: decision 17), and their answer (decision 11: Interested or Pass), given here or in
the deck of /opportunities and changed by answering again until both are interested. Undo is
offered within MATCHING_LIMITS.undoMinutes only for the first answer on that job given here, on a
page that read none (`undoableHere`: the API undoes no other); one it refuses all the same (an
answer given and undone in the deck before the page read the job) is said, in sight. An answer that
makes a mutual interest, or that finds the job no longer proposed (with why), asks the page to read
the job again (`onChange`): the page keeps this section meanwhile and moves the focus once read.
What happened is said in a polite live region (inside the page, main#page); a failure in an alert.
Both answers stay where they are, the one given pressed (aria-pressed), so that the second click of
a double click lands on the answer just given, which does nothing, never on the other one; a click
counted as a second one (`detail` over 1) answers nothing either.
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { ArrowUturnLeft, Check, HandThumbUp, XMark } from 'svelte-heros-v2';
	import type { MatchDecision } from 'portfolio-common';
	import { m as cards } from './cards.messages.ts';
	import CriterionOutcomes from './CriterionOutcomes.svelte';
	import {
		UNDO_WINDOW_MS,
		decisionLabel,
		type DecisionFailure,
		type OpportunityScore
	} from '#services/matching.ts';
	import {
		answerOpportunity,
		undoableHere,
		undoOpen,
		undoOpportunityAnswer
	} from '#services/opportunities.ts';
	import { refreshNotifications } from '#services/notifications.ts';
	import { m } from './FeedAnswer.messages.ts';

	let {
		jobId,
		score,
		interested,
		decision: initial,
		headingId,
		onChange
	}: {
		jobId: string;
		/** Their score of the job, as their feed gives it; null when it does not read */
		score: OpportunityScore | null;
		/** Its recruiter said they are interested in the candidate */
		interested: boolean;
		/** What they answered so far (null: nothing yet) */
		decision: MatchDecision | null;
		/** Its heading's id: the page moves the focus to it once it read the job again */
		headingId?: string;
		/**
		 * The job is to be read again: `mutual` (both are interested now), `gone` (no longer
		 * proposed, or the answer cannot be given anymore: `reason` says why), `signed-out`
		 */
		onChange: (why: 'mutual' | 'gone' | 'signed-out', reason?: string) => void;
	} = $props();

	const uid = $props.id();
	let titleId = $derived(headingId ?? `${uid}-heading`);
	const undoId = `${uid}-undo`;
	const answerId = `${uid}-answer`;
	// What the page read (the page mounts this again for each read)
	const loaded = untrack(() => initial);
	// Changed here from then on
	let decision = $state<MatchDecision | null>(loaded);
	/** An answer, or an undo, was given here: no later answer is the first on the job */
	let answeredHere = false;
	/** When an answer that can be undone was given here (milliseconds): Undo within its window */
	let answeredAt = $state<number | null>(null);
	let now = $state(Date.now());
	let busy = $state(false);
	/** The page reads the job again (onChange): nothing more is sent from here */
	let handedOff = $state(false);
	let alert = $state('');
	let announcement = $state('');
	let passed = $derived(!!score && score.score >= score.minScore);
	let showUndo = $derived(undoOpen(answeredAt, now));
	let disabled = $derived(busy || handedOff);

	const focusAnswer = () => document.getElementById(answerId)?.focus({ preventScroll: true });

	// Undo goes once its window ends; the focus it had goes to the answer's sentence
	$effect(() => {
		if (answeredAt === null) return;
		const left = answeredAt + UNDO_WINDOW_MS - Date.now();
		const timer = setTimeout(
			() => {
				const hadFocus = document.activeElement?.id === undoId;
				now = Date.now();
				if (hadFocus) void tick().then(focusAnswer);
			},
			Math.max(left + 100, 0)
		);
		return () => clearTimeout(timer);
	});

	async function say(text: string) {
		announcement = '';
		await tick();
		announcement = text;
	}

	/** The page reads the job again: what is shown stays meanwhile, and takes no answer */
	function handOff(why: 'mutual' | 'gone' | 'signed-out', reason?: string) {
		handedOff = true;
		answeredAt = null;
		onChange(why, reason);
	}

	/** What a failure does here: the page reads the job again, or it is said */
	async function failed(failure: DecisionFailure, action: 'decide' | 'undo') {
		switch (failure.kind) {
			case 'signed-out':
				handOff('signed-out');
				return;
			case 'mutual':
				handOff('mutual');
				return;
			case 'gone':
			case 'not-proposed':
			case 'off':
			case 'job-gone':
				handOff('gone', failure.message);
				return;
			case 'final':
				// What the page could not know (an answer undone elsewhere before): said in sight, Undo
				// gone, the focus on the answer's sentence
				answeredAt = null;
				alert = failure.message;
				await tick();
				focusAnswer();
				return;
			default:
				alert = failure.message;
				if (action === 'undo') document.getElementById(undoId)?.focus({ preventScroll: true });
		}
	}

	/** An answer's button pressed: the answer given already, or a second click, does nothing */
	function press(next: MatchDecision, event: MouseEvent) {
		if (event.detail > 1 || decision === next) return;
		void answer(next);
	}

	async function answer(next: MatchDecision) {
		if (disabled) return;
		busy = true;
		alert = '';
		const result = await answerOpportunity(jobId, next);
		busy = false;
		void refreshNotifications();
		if (!result.ok) {
			await failed(result.failure, 'decide');
			return;
		}
		if (result.match) {
			// The page reads the job again and shows the mutual interest, its heading focused
			handOff('mutual');
			return;
		}
		const undoable = undoableHere(loaded, answeredHere);
		answeredHere = true;
		decision = result.decision;
		answeredAt = undoable ? Date.now() : null;
		now = Date.now();
		void say(result.decision === 'interested' ? m.saidInterested : m.saidPass);
		// The answer's sentence takes the focus: it says what is given now
		await tick();
		focusAnswer();
	}

	async function undoAnswer() {
		if (disabled) return;
		if (!undoOpen(answeredAt, Date.now())) {
			now = Date.now();
			return;
		}
		busy = true;
		alert = '';
		const result = await undoOpportunityAnswer(jobId);
		busy = false;
		if (!result.ok) {
			await failed(result.failure, 'undo');
			return;
		}
		decision = result.decision;
		answeredAt = null;
		void say(m.undone);
		await tick();
		focusAnswer();
	}

	/** A button's label wraps rather than run past it on a narrow phone (in French) */
	const button = 'btn min-h-12 max-w-full whitespace-normal text-center leading-5';
	/** The answer given: pressed, ringed, a check in place of its icon */
	const pressed = 'ring-2 ring-primary-500 ring-offset-2 ring-offset-surface-50-950';
</script>

<section
	class="card preset-outlined-surface-200-800 space-y-4 bg-surface-50-950 p-4 sm:p-6"
	aria-labelledby={titleId}
	data-feed-answer={decision ?? 'none'}
>
	<p class="sr-only" aria-live="polite">{announcement}</p>
	<div class="flex flex-wrap items-center gap-2">
		<h2
			id={titleId}
			tabindex="-1"
			class="rounded-base text-lg font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
		>
			{m.heading}
		</h2>
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
			id={answerId}
			tabindex="-1"
			class="rounded-base outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
			data-answer
		>
			{decision === 'interested' ? m.interested : decision === 'pass' ? m.passed : m.ask}
		</p>
		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				class={[
					button,
					'preset-tonal',
					decision === 'pass' ? pressed : '',
					disabled ? 'opacity-60' : ''
				]}
				aria-pressed={decision === 'pass'}
				aria-disabled={disabled}
				onclick={(event) => press('pass', event)}
			>
				{#if decision === 'pass'}
					<Check size="20" class="shrink-0" aria-hidden="true" />
				{:else}
					<XMark size="20" class="shrink-0" aria-hidden="true" />
				{/if}
				{decisionLabel('pass')}
			</button>
			<button
				type="button"
				class={[
					button,
					'preset-filled-primary-500',
					decision === 'interested' ? pressed : '',
					disabled ? 'opacity-60' : ''
				]}
				aria-pressed={decision === 'interested'}
				aria-disabled={disabled}
				onclick={(event) => press('interested', event)}
			>
				{#if decision === 'interested'}
					<Check size="20" class="shrink-0" aria-hidden="true" />
				{:else}
					<HandThumbUp size="20" class="shrink-0" aria-hidden="true" />
				{/if}
				{decisionLabel('interested')}
			</button>
			{#if showUndo}
				<button
					id={undoId}
					type="button"
					class={['btn preset-tonal min-h-11 ms-auto', disabled ? 'opacity-60' : '']}
					aria-disabled={disabled}
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
