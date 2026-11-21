<!--
@component
A deck of matching: one card at a time, answered Interested or Pass (decision 11 of the founder),
for a candidate (the jobs proposed to them) or a recruiter (the anonymous cards proposed for their
job). The page gives the API calls (`load`, `decide`, `undo`, each answering with what the API
gave or why it failed: readCandidateFeed, readRecruiterFeed, readDecisionResult, feedFailure,
decisionFailure of #services/matching.ts) and draws each card (`card`, with the id its heading
takes); the deck holds the state (the reducer of matching.ts) and:
- buttons first: Pass and Interested, at the bottom of the page while the card scrolls, and Undo
  while the API allows it (the latest answer, the first on that card, within
  MATCHING_LIMITS.undoMinutes);
- keys only while the focus is inside the deck (← Pass, → Interested, Z Undo: deckKeyAction);
- the focus on the next card's heading after an answer (on the moment both are interested, or on
  the empty state), and what happened said in a polite live region inside the page (main#page);
- a drag sideways, optional: locked to its direction, a card that does not move under "reduce
  motion", and the page never scrolls sideways (overflow-x: clip);
- one answer at a time, the card leaving at once and coming back on top when its answer failed;
- a recruiter's next card read once the one held is answered, a candidate's next page read early.
What stops it (signed out, not proposed, the job not proposed, the terms, matching off) goes to
`onStop`, for the page to say why. It counts nothing: a recruiter reads whether more candidates
come, never how many.
-->
<script lang="ts" generics="T">
	import { onMount, tick, untrack, type Snippet } from 'svelte';
	import { ArrowPath, ArrowUturnLeft, HandThumbUp, XMark } from 'svelte-heros-v2';
	import type { MatchDecision, MatchSide } from 'portfolio-common';
	import Rich from '#lib/i18n/Rich.svelte';
	import { common } from '#lib/i18n/common.messages.ts';
	import {
		DRAG_LOCK_PX,
		UNDO_WINDOW_MS,
		appendPage,
		canDecide,
		canUndo,
		deckAnnouncement,
		deckKeyAction,
		deckLoadFailed,
		deckLoading,
		decisionFailed,
		decisionLabel,
		decisionSaved,
		dragAxis,
		dragDecision,
		emptyDeck,
		recruiterQueueText,
		shouldLoadMore,
		startDecision,
		startUndo,
		stopsDeck,
		topCard,
		undoFailed,
		undoSaved,
		type Deck,
		type DeckPage,
		type DecisionFailure,
		type MutualInterest
	} from '#services/matching.ts';
	import { m } from '#services/matching.messages.ts';
	import MutualInterestPanel from './MutualInterestPanel.svelte';

	type Read = { ok: true; page: DeckPage<T> } | { ok: false; failure: DecisionFailure };
	type Answered =
		{ ok: true; match: MutualInterest | null } | { ok: false; failure: DecisionFailure };

	let {
		side,
		label,
		key,
		title = () => '',
		load,
		decide,
		undo,
		card,
		empty,
		onStop
	}: {
		side: MatchSide;
		/** The deck's accessible name */
		label: string;
		/** What tells two cards apart: a job's id, a card's token */
		key: (card: T) => string;
		/** The name of a card in what the deck says (a job's title); a recruiter's card has none */
		title?: (card: T) => string;
		/** Reads the feed: from its start (null), or a candidate's next page (the cursor) */
		load: (next: string | null) => Promise<Read>;
		decide: (card: T, decision: MatchDecision) => Promise<Answered>;
		undo: (card: T) => Promise<Answered>;
		/** A card, its heading with the id given (and tabindex -1: it takes the focus) */
		card: Snippet<[T, string]>;
		/** Nothing to answer, its heading with the id given (tabindex -1) */
		empty: Snippet<[string]>;
		/** The deck takes no answer anymore: the page says why */
		onStop?: (failure: DecisionFailure) => void;
	} = $props();

	const uid = $props.id();
	const cardHeading = `${uid}-card`;
	const emptyHeading = `${uid}-empty`;
	const momentHeading = `${uid}-moment`;

	let deck = $state.raw<Deck<T>>(emptyDeck());
	// The first read went through (or failed): before it, a placeholder
	let started = $state(false);
	// Why the last read failed (to read again)
	let readError = $state('');
	// Why the last answer failed (an alert: its card is back on top)
	let alert = $state('');
	// What the polite live region says
	let announcement = $state('');
	// The mutual interest an answer just made, shown until the person goes on
	let moment = $state.raw<MutualInterest | null>(null);
	let stopped = $state(false);
	let now = $state(Date.now());
	// The focus goes to what the deck shows next once it is read (a recruiter's next card)
	let focusPending = false;

	let top = $derived(topCard(deck));
	let busy = $derived(!!deck.sending);
	// No card on top, but one is coming: read now, or once the answer on its way is saved (a
	// recruiter's next card), never the empty state meanwhile
	let waitingForMore = $derived(
		deck.loading || (!!deck.sending && deck.more) || shouldLoadMore(deck, side)
	);
	let undoable = $derived(!stopped && !moment && canUndo(deck, now));

	// --- Focus and announcements ---------------------------------------------------------

	async function focusOn(id: string) {
		await tick();
		const element = document.getElementById(id);
		if (!element) return;
		element.focus({ preventScroll: true });
		element.scrollIntoView({ block: 'nearest' });
	}

	/** The focus on what the deck shows now: its top card, or that there is nothing to answer */
	const focusShown = () => focusOn(topCard(deck) ? cardHeading : emptyHeading);

	async function say(text: string) {
		// Emptied first, so that the same words are said again
		announcement = '';
		await tick();
		announcement = text;
	}

	function stop(failure: DecisionFailure) {
		stopped = true;
		onStop?.(failure);
	}

	// --- Reading the feed ------------------------------------------------------------------

	async function read(fromStart = false) {
		if (deck.loading) return;
		deck = deckLoading(deck);
		readError = '';
		const result = await load(fromStart ? null : deck.next);
		started = true;
		if (!result.ok) {
			deck = deckLoadFailed(deck);
			if (stopsDeck(result.failure)) {
				alert = result.failure.message;
				stop(result.failure);
			} else {
				readError = result.failure.message;
			}
			return;
		}
		deck = appendPage(deck, result.page, key);
		if (focusPending) {
			focusPending = false;
			await focusShown();
		}
	}

	onMount(() => {
		read(true);
	});

	// A recruiter's next card once the one held is answered, a candidate's next page early
	$effect(() => {
		if (started && !stopped && !readError && shouldLoadMore(deck, side)) untrack(() => read());
	});

	// Undo goes once its window ends
	$effect(() => {
		const last = deck.last;
		if (!last) return;
		const left = last.at + UNDO_WINDOW_MS - Date.now();
		if (left < 0) return;
		const timer = setTimeout(() => (now = Date.now()), left + 100);
		return () => clearTimeout(timer);
	});

	// --- Answering -------------------------------------------------------------------------

	async function answer(decision: MatchDecision) {
		if (stopped || moment || !canDecide(deck)) return;
		const answered = topCard(deck)!;
		deck = startDecision(deck, decision, key, Date.now());
		alert = '';
		if (topCard(deck)) await focusOn(cardHeading);
		const result = await decide(answered, decision);
		if (result.ok) {
			deck = decisionSaved(deck, key, !!result.match);
			now = Date.now();
			if (result.match) {
				moment = result.match;
				await focusOn(momentHeading);
				return;
			}
			say(deckAnnouncement(side, decision, title(answered)));
			// Nothing left: the empty state, or the next card once it is read
			if (!topCard(deck)) {
				if (shouldLoadMore(deck, side)) focusPending = true;
				else await focusOn(emptyHeading);
			}
			return;
		}
		const failure = result.failure;
		if (failure.kind === 'gone' || failure.kind === 'mutual') {
			deck = decisionFailed(deck, 'drop');
			say(failure.message);
			if (!topCard(deck)) {
				if (shouldLoadMore(deck, side)) focusPending = true;
				else await focusOn(emptyHeading);
			}
			return;
		}
		deck = decisionFailed(deck, 'restore');
		alert = failure.message;
		if (stopsDeck(failure)) stop(failure);
		await focusOn(cardHeading);
	}

	async function undoLast() {
		const last = deck.last;
		if (stopped || moment || !last || !canUndo(deck, Date.now())) return;
		deck = startUndo(deck, Date.now());
		alert = '';
		const result = await undo(last.card);
		if (result.ok) {
			deck = undoSaved(deck, key);
			say(deckAnnouncement(side, 'undone', title(last.card)));
			await focusOn(cardHeading);
			return;
		}
		const failure = result.failure;
		if (failure.kind === 'retry' || failure.kind === 'limit') {
			deck = undoFailed(deck, 'keep');
			alert = failure.message;
			return;
		}
		deck = undoFailed(deck, 'final');
		if (stopsDeck(failure)) {
			alert = failure.message;
			stop(failure);
			return;
		}
		say(failure.message);
	}

	function keepGoing() {
		moment = null;
		focusShown();
	}

	/** The deck's shortcuts, while the focus is inside it */
	function onKeydown(event: KeyboardEvent) {
		if (stopped || moment) return;
		const action = deckKeyAction(event);
		if (!action) return;
		event.preventDefault();
		if (action === 'undo') undoLast();
		else answer(action);
	}

	// --- Dragging --------------------------------------------------------------------------

	interface Drag {
		pointer: number;
		x: number;
		y: number;
		at: number;
		dx: number;
		dy: number;
		axis: 'x' | 'y' | null;
		width: number;
	}

	let drag = $state<Drag | null>(null);
	// "Reduce motion": the card does not follow the pointer (what it would answer still shows)
	let still = $state(false);

	/** What a drag does not start on: what the card's own controls and text selection need */
	const NOT_DRAGGED =
		'a, button, input, select, textarea, summary, label, [contenteditable="true"]';

	function pointerDown(event: PointerEvent) {
		if (busy || stopped || moment || event.button !== 0 || !event.isPrimary) return;
		if ((event.target as Element | null)?.closest(NOT_DRAGGED)) return;
		if (window.getSelection()?.toString()) return;
		still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		drag = {
			pointer: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			at: event.timeStamp,
			dx: 0,
			dy: 0,
			axis: null,
			width: (event.currentTarget as HTMLElement).offsetWidth
		};
	}

	function pointerMove(event: PointerEvent) {
		if (!drag || event.pointerId !== drag.pointer) return;
		const dx = event.clientX - drag.x;
		const dy = event.clientY - drag.y;
		const axis = drag.axis ?? dragAxis({ dx, dy });
		if (axis === 'y') {
			// Up or down: the page scrolls
			drag = null;
			return;
		}
		if (axis === 'x' && !drag.axis) {
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		}
		drag = { ...drag, dx, dy, axis };
	}

	function pointerUp(event: PointerEvent) {
		if (!drag || event.pointerId !== drag.pointer) return;
		const { dx, dy, width, at, axis } = drag;
		drag = null;
		if (axis !== 'x') return;
		const result = dragDecision({ dx, dy, width, ms: event.timeStamp - at });
		if (result !== 'cancel') answer(result);
	}

	let dragging = $derived(drag?.axis === 'x');
	let dragHint = $derived<MatchDecision | null>(
		dragging && drag && Math.abs(drag.dx) >= DRAG_LOCK_PX
			? drag.dx > 0
				? 'interested'
				: 'pass'
			: null
	);
	let dragTransform = $derived(
		dragging && drag && !still ? `translateX(${drag.dx}px) rotate(${drag.dx / 40}deg)` : undefined
	);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- The shortcuts of the deck: keys pressed on its buttons, its cards' links and headings bubble here -->
<section aria-label={label} class="relative space-y-3 overflow-x-clip" onkeydown={onKeydown}>
	<!-- Inside the page (main#page): said politely, never moved by the page's scroll -->
	<p class="sr-only" aria-live="polite">{announcement}</p>
	{#if alert}
		<p class="card preset-tonal-error flex items-start gap-2 p-3 text-sm" role="alert">
			{alert}
		</p>
	{/if}

	{#if moment}
		<MutualInterestPanel interest={moment} headingId={momentHeading} onContinue={keepGoing} />
	{:else if !started}
		<div class="space-y-3" aria-busy="true">
			<p class="sr-only">{side === 'candidate' ? m.candidate.loading : common.loading}</p>
			<div
				class="placeholder h-72 w-full animate-pulse rounded-container motion-reduce:animate-none"
			></div>
		</div>
	{:else if top}
		{#key key(top)}
			<div
				class={[
					'relative touch-pan-y',
					dragging ? 'cursor-grabbing select-none' : '',
					drag === null && !still
						? 'transition-transform duration-150 motion-reduce:transition-none'
						: ''
				]}
				style:transform={dragTransform}
				onpointerdown={pointerDown}
				onpointermove={pointerMove}
				onpointerup={pointerUp}
				onpointercancel={() => (drag = null)}
				role="presentation"
			>
				{@render card(top, cardHeading)}
				{#if dragHint}
					<span
						class={[
							'pointer-events-none absolute -top-3 badge text-base font-bold shadow-lg',
							// On the edge that stays in sight as the card moves away
							dragHint === 'interested'
								? 'preset-filled-primary-500 start-4'
								: 'preset-filled-surface-950-50 end-4'
						]}
						aria-hidden="true"
					>
						{m.dragHint[dragHint]}
					</span>
				{/if}
			</div>
		{/key}
	{:else if readError}
		<div class="card preset-tonal-error space-y-3 p-4" role="alert">
			<p class="text-sm">{readError}</p>
			<button type="button" class="btn preset-filled-error-500 min-h-11" onclick={() => read()}>
				<ArrowPath size="18" aria-hidden="true" />
				{common.retry}
			</button>
		</div>
	{:else if waitingForMore}
		<div class="space-y-3" aria-busy="true">
			<p class="text-sm text-surface-700-300">
				{side === 'candidate' ? m.candidate.loading : m.recruiter.loading}
			</p>
			<div
				class="placeholder h-72 w-full animate-pulse rounded-container motion-reduce:animate-none"
			></div>
		</div>
	{:else}
		{@render empty(emptyHeading)}
	{/if}

	{#if !moment && started}
		{@const answering = !!top && !stopped}
		{#if top && side === 'recruiter'}
			<p class="text-sm text-surface-700-300">{recruiterQueueText(deck.more)}</p>
		{/if}
		{#if deck.pending && side === 'candidate'}
			<p class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-surface-700-300">
				<span>{m.candidate.pending}</span>
				<button
					type="button"
					class="btn btn-sm preset-tonal"
					disabled={deck.loading}
					onclick={() => read(true)}
				>
					<ArrowPath size="16" aria-hidden="true" />
					{m.candidate.checkAgain}
				</button>
			</p>
		{/if}

		<!-- The answers: at the bottom of the page while a long card scrolls, safe areas kept -->
		{#if answering || undoable}
			<div
				class="sticky bottom-0 z-10 -mx-1 space-y-2 bg-surface-50-950/95 px-1 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur"
			>
				{#if answering}
					<div class="grid grid-cols-2 gap-2">
						<button
							type="button"
							class={['btn preset-tonal min-h-12 w-full', busy ? 'opacity-60' : '']}
							aria-disabled={busy}
							aria-keyshortcuts="ArrowLeft"
							onclick={() => answer('pass')}
						>
							<XMark size="20" aria-hidden="true" />
							{decisionLabel('pass')}
						</button>
						<button
							type="button"
							class={['btn preset-filled-primary-500 min-h-12 w-full', busy ? 'opacity-60' : '']}
							aria-disabled={busy}
							aria-keyshortcuts="ArrowRight"
							onclick={() => answer('interested')}
						>
							<HandThumbUp size="20" aria-hidden="true" />
							{decisionLabel('interested')}
						</button>
					</div>
				{/if}
				<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
					{#if answering}
						<p class="text-xs text-surface-700-300 pointer-coarse:hidden">
							<Rich text={m.shortcuts}>
								{#snippet kbd(text)}<kbd
										class="rounded-base border border-surface-300-700 px-1 font-mono text-[0.7rem]"
										>{text}</kbd
									>{/snippet}
							</Rich>
						</p>
					{/if}
					{#if undoable}
						<button
							type="button"
							class="btn btn-sm preset-tonal ms-auto min-h-9"
							aria-keyshortcuts="Z"
							onclick={undoLast}
						>
							<ArrowUturnLeft size="16" aria-hidden="true" />
							{decisionLabel('undo')}
						</button>
					{/if}
				</div>
			</div>
		{/if}
	{/if}
</section>
