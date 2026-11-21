<!--
@component
A deck of matching: one card at a time, answered Interested or Pass (decision 11 of the founder),
for a candidate (the jobs proposed to them) or a recruiter (the anonymous cards proposed for their
job). The page gives the API calls (`load`, `decide`, `undo`, each answering with what the API
gave or why it failed: readCandidateFeed, readRecruiterFeed, readDecisionResult, feedFailure,
decisionFailure of #services/matching.ts; an answer a reader refuses is a `retry` failure) and
draws each card (`card`, with the id its heading takes); the deck holds the state (the reducer of
matching.ts, what it shows: deckView) and:
- buttons first: Pass and Interested, at the bottom of the page while the card scrolls, and Undo
  while the API allows it (the latest answer, the first on that card, within
  MATCHING_LIMITS.undoMinutes);
- keys only while the focus is inside the deck (← Pass, → Interested, Z Undo: deckKeyAction);
- the focus on the next card's heading after an answer (on the moment both are interested, on
  what shows while the next card comes and then on that card, on a failed read's Retry, or on the
  empty state), never left on a control that went, and what happened said in a polite live region
  inside the page (main#page);
- a drag sideways, optional, with a finger or a pen only (dragStarts: never with a mouse, never on
  the description), locked to its direction, a card that does not move under "reduce motion", and
  the page never scrolls sideways (overflow-x: clip);
- one answer at a time, the card leaving at once and coming back on top when its answer failed; a
  429 says from when (its Retry-After), and no answer or read goes until then;
- a recruiter's next card read once the one held is answered, a candidate's next page read early.
What stops it (signed out, not proposed, the job not proposed, the terms, no recruiter space,
matching off) goes to `onStop`: the deck then shows nothing more (no card, no buttons, no empty
state), and the page says why and takes the focus there. To start again (signed in, the terms
accepted), and whenever what it reads changes (another job), the page mounts it again:
`{#key jobId}<MatchDeck … />{/key}` (SvelteKit keeps a page's components across its `[id]`: a deck
kept would send one job's tokens to another's routes). It counts nothing: a recruiter reads
whether more candidates come, never how many.
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
		deckView,
		decisionFailed,
		decisionFailure,
		decisionLabel,
		decisionSaved,
		dragAxis,
		dragDecision,
		dragStarts,
		emptyDeck,
		feedFailure,
		moreAfterTop,
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
		/**
		 * The deck takes no answer anymore and shows nothing more: the page says why, and takes the
		 * focus there
		 */
		onStop?: (failure: DecisionFailure) => void;
	} = $props();

	const uid = $props.id();
	const cardHeading = `${uid}-card`;
	const emptyHeading = `${uid}-empty`;
	const momentHeading = `${uid}-moment`;
	const waitingHeading = `${uid}-waiting`;
	const retryButton = `${uid}-retry`;
	const undoButton = `${uid}-undo`;

	let section = $state<HTMLElement>();
	let deck = $state.raw<Deck<T>>(emptyDeck());
	// The first read came back: before it, a placeholder
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
	// A 429's Retry-After (milliseconds): no answer, and no read, until then
	let blockedUntil = $state(0);
	// The focus goes to what the deck shows next once it is there (the next card, once read)
	let focusPending = false;

	let top = $derived(topCard(deck));
	let busy = $derived(!!deck.sending);
	let blocked = $derived(now < blockedUntil);
	let view = $derived(
		deckView({ deck, side, started, stopped, moment: !!moment, readError: !!readError })
	);
	let answering = $derived(view === 'card');
	let undoing = $derived(deck.sending?.kind === 'undo');
	// Undo stays while its own request is on its way (the focus on it stays too)
	let showUndo = $derived(!stopped && !moment && (undoing || canUndo(deck, now)));
	let waitingText = $derived(
		deck.loading || deck.more
			? side === 'candidate'
				? m.candidate.loading
				: m.recruiter.loading
			: m.sending
	);

	// --- Focus and announcements ---------------------------------------------------------

	async function focusOn(id: string) {
		await tick();
		const element = document.getElementById(id);
		if (!element) return;
		element.focus({ preventScroll: true });
		element.scrollIntoView({ block: 'nearest' });
	}

	/** The focus is on something of the page outside the deck: where the person moved it */
	const focusedElsewhere = () => {
		const active = document.activeElement;
		return !!active && active !== document.body && !!section && !section.contains(active);
	};

	/**
	 * The focus on what the deck shows now: the top card's heading, the moment, what shows while the
	 * next card comes (and that card once it is there), a failed read's Retry, or that there is
	 * nothing to answer. Stopped, it shows nothing: the page takes the focus to why. Never taken
	 * back from where the person moved it, outside the deck
	 */
	async function focusShown() {
		await tick();
		focusPending = view === 'waiting';
		if (focusedElsewhere()) {
			focusPending = false;
			return;
		}
		const target =
			view === 'card'
				? cardHeading
				: view === 'moment'
					? momentHeading
					: view === 'waiting'
						? waitingHeading
						: view === 'error'
							? retryButton
							: view === 'empty'
								? emptyHeading
								: null;
		if (target) await focusOn(target);
	}

	/** What shows changed: the focus follows when it waited for it */
	async function settleFocus() {
		if (focusPending) await focusShown();
	}

	/** The focus was dropped (what had it went): back on what the deck shows */
	async function refocusIfLost() {
		await tick();
		if (!document.activeElement || document.activeElement === document.body) await focusShown();
	}

	async function say(text: string) {
		// Emptied first, so that the same words are said again
		announcement = '';
		await tick();
		announcement = text;
	}

	function stop(failure: DecisionFailure) {
		if (stopped) return;
		stopped = true;
		alert = '';
		readError = '';
		focusPending = false;
		onStop?.(failure);
	}

	/** A 429 with a Retry-After: nothing goes until then (its message says from when) */
	function block(failure: DecisionFailure) {
		if (failure.retryAfter) blockedUntil = Date.now() + failure.retryAfter * 1000;
	}

	const isBlocked = () => Date.now() < blockedUntil;

	// --- Reading the feed ------------------------------------------------------------------

	async function read(fromStart = false) {
		if (deck.loading || stopped) return;
		deck = deckLoading(deck);
		readError = '';
		let result: Read;
		try {
			result = await load(fromStart ? null : deck.next);
		} catch {
			result = { ok: false, failure: feedFailure(undefined, undefined, side) };
		}
		started = true;
		if (stopped) {
			deck = deckLoadFailed(deck);
			return;
		}
		if (result.ok) {
			deck = appendPage(deck, result.page, key, fromStart);
		} else {
			deck = deckLoadFailed(deck);
			if (stopsDeck(result.failure)) {
				stop(result.failure);
				return;
			}
			readError = result.failure.message;
			block(result.failure);
		}
		await settleFocus();
	}

	/** "Check again" (travel times computed meanwhile): the feed from its start */
	async function checkAgain() {
		if (deck.loading || isBlocked()) return;
		await read(true);
		// Its button goes once nothing is pending anymore
		await refocusIfLost();
	}

	function retry() {
		if (!isBlocked()) read();
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
		if (left <= 0) {
			untrack(windowEnded);
			return;
		}
		const timer = setTimeout(windowEnded, left + 100);
		return () => clearTimeout(timer);
	});

	// Answers and reads go again once a 429's Retry-After has passed
	$effect(() => {
		const left = blockedUntil - Date.now();
		if (left <= 0) return;
		const timer = setTimeout(() => (now = Date.now()), Math.min(left + 100, 2 ** 31 - 1));
		return () => clearTimeout(timer);
	});

	/** Undo's window ended: it goes, and the focus it had goes to what the deck shows */
	function windowEnded() {
		const hadFocus = document.activeElement?.id === undoButton;
		now = Date.now();
		if (hadFocus) focusShown();
	}

	// --- Answering -------------------------------------------------------------------------

	async function answer(decision: MatchDecision) {
		if (stopped || moment || isBlocked() || !canDecide(deck)) return;
		const answered = topCard(deck)!;
		deck = startDecision(deck, decision, key, Date.now());
		alert = '';
		// The next card's heading, or what shows while none is there
		await focusShown();
		let result: Answered;
		try {
			result = await decide(answered, decision);
		} catch {
			result = { ok: false, failure: decisionFailure(undefined, undefined, side, 'decide') };
		}
		if (result.ok) {
			deck = decisionSaved(deck, key, !!result.match);
			now = Date.now();
			if (result.match) {
				moment = result.match;
				await focusOn(momentHeading);
				return;
			}
			say(deckAnnouncement(side, decision, title(answered)));
			await settleFocus();
			return;
		}
		const failure = result.failure;
		if (failure.kind === 'gone' || failure.kind === 'mutual') {
			deck = decisionFailed(deck, 'drop');
			say(failure.message);
			await settleFocus();
			return;
		}
		deck = decisionFailed(deck, 'restore');
		if (stopsDeck(failure)) {
			stop(failure);
			return;
		}
		alert = failure.message;
		block(failure);
		// The card back on top: its heading
		await focusShown();
	}

	async function undoLast() {
		const last = deck.last;
		if (stopped || moment || !last || deck.sending || deck.loading || isBlocked()) return;
		if (!canUndo(deck, Date.now())) {
			// Past its window (or answered again): said, never a key or button that does nothing
			say(m.failure.final);
			windowEnded();
			return;
		}
		deck = startUndo(deck, Date.now());
		alert = '';
		let result: Answered;
		try {
			result = await undo(last.card);
		} catch {
			result = { ok: false, failure: decisionFailure(undefined, undefined, side, 'undo') };
		}
		if (result.ok) {
			deck = undoSaved(deck, key);
			say(deckAnnouncement(side, 'undone', title(last.card)));
			await focusOn(cardHeading);
			return;
		}
		const failure = result.failure;
		if (failure.kind === 'retry' || failure.kind === 'limit') {
			// Undo stays, and the focus on it
			deck = undoFailed(deck, 'keep');
			alert = failure.message;
			block(failure);
			return;
		}
		deck = undoFailed(deck, 'final');
		if (stopsDeck(failure)) {
			stop(failure);
			return;
		}
		say(failure.message);
		// Undo is gone: the top card's heading, or what shows
		await focusShown();
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

	function pointerDown(event: PointerEvent) {
		if (busy || stopped || moment || isBlocked() || event.button !== 0 || !event.isPrimary) return;
		// A finger or a pen, never on a control or the description: dragStarts
		if (!dragStarts(event.pointerType, event.target as Element | null)) return;
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

	/** An answer's button: its label wraps rather than run past it on a narrow phone (in French) */
	const answerButton = 'btn min-h-12 w-full max-w-full whitespace-normal text-center leading-5';
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- The shortcuts of the deck: keys pressed on its buttons, its cards' links and headings bubble here -->
<section
	bind:this={section}
	aria-label={label}
	class="relative space-y-3 overflow-x-clip"
	onkeydown={onKeydown}
>
	<!-- Inside the page (main#page): said politely, never moved by the page's scroll -->
	<p class="sr-only" aria-live="polite">{announcement}</p>
	{#if alert && !stopped}
		<p class="card preset-tonal-error flex items-start gap-2 p-3 text-sm" role="alert">
			{alert}
		</p>
	{/if}

	{#if view === 'moment' && moment}
		<MutualInterestPanel interest={moment} headingId={momentHeading} onContinue={keepGoing} />
	{:else if view === 'placeholder'}
		<div class="space-y-3" aria-busy="true">
			<p class="sr-only">{side === 'candidate' ? m.candidate.loading : common.loading}</p>
			<div
				class="placeholder h-72 w-full animate-pulse rounded-container motion-reduce:animate-none"
			></div>
		</div>
	{:else if view === 'card' && top}
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
	{:else if view === 'waiting'}
		<!-- The next card is coming: what says so takes the focus the answered card had -->
		<div class="space-y-3">
			<p
				id={waitingHeading}
				tabindex="-1"
				class="rounded-base text-sm text-surface-700-300 outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
			>
				{waitingText}
			</p>
			<div
				class="placeholder h-72 w-full animate-pulse rounded-container motion-reduce:animate-none"
				aria-hidden="true"
			></div>
		</div>
	{:else if view === 'error'}
		<div class="card preset-tonal-error space-y-3 p-4" role="alert">
			<p class="text-sm">{readError}</p>
			<button
				id={retryButton}
				type="button"
				class={['btn preset-filled-error-500 min-h-11', blocked ? 'opacity-60' : '']}
				aria-disabled={blocked}
				onclick={retry}
			>
				<ArrowPath size="18" aria-hidden="true" />
				{common.retry}
			</button>
		</div>
	{:else if view === 'empty'}
		{@render empty(emptyHeading)}
	{/if}
	<!-- Stopped: nothing more here, the page says why (onStop) -->

	{#if answering && side === 'recruiter'}
		<p class="text-sm text-surface-700-300">{recruiterQueueText(moreAfterTop(deck))}</p>
	{/if}
	{#if deck.pending && side === 'candidate' && started && !stopped && !moment}
		<p class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-surface-700-300">
			<span>{m.candidate.pending}</span>
			<button
				type="button"
				class={['btn btn-sm preset-tonal', deck.loading || blocked ? 'opacity-60' : '']}
				aria-disabled={deck.loading || blocked}
				onclick={checkAgain}
			>
				<ArrowPath size="16" aria-hidden="true" />
				{m.candidate.checkAgain}
			</button>
		</p>
	{/if}

	<!-- The answers: at the bottom of the page while a long card scrolls, safe areas kept -->
	{#if answering || showUndo}
		<div
			class="sticky bottom-0 z-10 -mx-1 space-y-2 bg-surface-50-950/95 px-1 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur"
		>
			{#if answering}
				<div class="grid grid-cols-2 gap-2">
					<button
						type="button"
						class={[answerButton, 'preset-tonal', busy || blocked ? 'opacity-60' : '']}
						aria-disabled={busy || blocked}
						aria-keyshortcuts="ArrowLeft"
						onclick={() => answer('pass')}
					>
						<XMark size="20" class="shrink-0" aria-hidden="true" />
						{decisionLabel('pass')}
					</button>
					<button
						type="button"
						class={[answerButton, 'preset-filled-primary-500', busy || blocked ? 'opacity-60' : '']}
						aria-disabled={busy || blocked}
						aria-keyshortcuts="ArrowRight"
						onclick={() => answer('interested')}
					>
						<HandThumbUp size="20" class="shrink-0" aria-hidden="true" />
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
				{#if showUndo}
					<button
						id={undoButton}
						type="button"
						class={[
							'btn btn-sm preset-tonal ms-auto min-h-9',
							undoing || blocked ? 'opacity-60' : ''
						]}
						aria-disabled={undoing || blocked}
						aria-keyshortcuts="Z"
						onclick={undoLast}
					>
						<ArrowUturnLeft size="16" class="shrink-0" aria-hidden="true" />
						{decisionLabel('undo')}
					</button>
				{/if}
			</div>
		</div>
	{/if}
</section>
