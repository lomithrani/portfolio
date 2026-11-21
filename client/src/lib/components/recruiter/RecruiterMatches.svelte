<!--
@component
The recruiter's mutual interests (matching, Path 2: a candidate and the recruiter both interested
in one of the recruiter's jobs), from GET /matches?side=recruiter: on the dashboard all of them, in
a job's matching panel that job's (`jobId`). The latest first, a page at a time ("Show more"), each
with the candidate's portfolio once revealed and their page for recruiters, which holds the job
(RecruiterInterest.svelte); the ones going on not seen yet are marked seen as they are shown (they
leave the account menu's badge) and said new until read again; ending one is asked first (POST
/matches/:id/end). While matching is off (the route's 404) it shows nothing; signed out, without a
recruiter space or the terms in force, it shows nothing either: the page's own read says why (as
UpcomingMeetings, a read of this list never signs the page out; ending one does, when the session
has ended). No count, no email promised.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { ArrowPath } from 'svelte-heros-v2';
	import { common } from '#lib/i18n/common.messages.ts';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import RecruiterInterest from './RecruiterInterest.svelte';
	import type { RecruiterMutualInterest } from '#services/matching.ts';
	import { markMutualInterestsSeen, refreshNotifications } from '#services/notifications.ts';
	import { appendInterests, unseenInterests } from '#services/opportunities.ts';
	import {
		endRecruiterInterest,
		loadRecruiterInterests,
		type RecruiterInterestFailure
	} from '#services/recruiterMatching.ts';
	import { clearAuthentication } from '#services/authentication.ts';
	import { networkError } from '#services/recruiter.ts';
	import { m as recruiterMessages } from '#services/recruiter.messages.ts';
	import { toaster } from '#services/toaster.ts';
	import { m } from './RecruiterMatches.messages.ts';

	let {
		userId,
		jobId
	}: {
		/** The signed-in account: read again for another one */
		userId: string;
		/** One job's mutual interests (its matching panel); all of them without it (the dashboard) */
		jobId?: string;
	} = $props();

	const uid = $props.id();

	type ListState =
		| { kind: 'loading' }
		| {
				kind: 'ready';
				list: RecruiterMutualInterest[];
				next: string | null;
				more: 'idle' | 'loading' | 'failed';
		  }
		| { kind: 'error'; message: string }
		// Matching off, or what the page says itself
		| { kind: 'hidden' };

	let shown = $state.raw<ListState>({ kind: 'loading' });
	/** Not seen before this showing: marked seen as shown, still said new until read again */
	let fresh = $state.raw<ReadonlySet<string>>(new Set());
	let reads = 0;

	/** The mutual interests shown are seen: they no longer count in the account menu's badge */
	function markShown(list: readonly RecruiterMutualInterest[]) {
		const ids = unseenInterests(list);
		if (ids.length === 0) return;
		fresh = new Set([...fresh, ...ids]);
		void markMutualInterestsSeen(ids);
	}

	function failed(failure: RecruiterInterestFailure) {
		// Signed out, no recruiter space, the terms, matching off, the job gone: nothing of it (the
		// page's own read says why)
		if (failure !== 'network' && failure !== 'error') {
			shown = { kind: 'hidden' };
			return;
		}
		shown = {
			kind: 'error',
			message: failure === 'network' ? networkError() : m.loadFailed
		};
	}

	async function read() {
		const id = ++reads;
		if (shown.kind !== 'ready') shown = { kind: 'loading' };
		const result = await loadRecruiterInterests({ jobId });
		if (id !== reads) return;
		if (!result.ok) return failed(result.failure);
		fresh = new Set();
		shown = { kind: 'ready', list: result.interests, next: result.next, more: 'idle' };
		markShown(result.interests);
	}

	async function showMore() {
		const current = shown;
		if (current.kind !== 'ready' || !current.next || current.more === 'loading') return;
		const id = ++reads;
		shown = { ...current, more: 'loading' };
		const result = await loadRecruiterInterests({ jobId, after: current.next });
		if (id !== reads) return;
		if (result.ok) {
			shown = {
				kind: 'ready',
				list: appendInterests(current.list, result.interests),
				next: result.next,
				more: 'idle'
			};
			markShown(result.interests);
		} else {
			shown = { ...current, more: 'failed' };
		}
	}

	// Read for the account (and the job) shown; again when they change
	$effect(() => {
		void userId;
		void jobId;
		untrack(read);
	});

	// Ending one: asked first; the focus then goes to its heading (its button is gone once ended)
	let ending = $state.raw<RecruiterMutualInterest | null>(null);
	let endingId = '';
	let endBusy = $state(false);
	let endError = $state('');

	async function confirmEnd() {
		const interest = ending;
		if (!interest || endBusy) return;
		endBusy = true;
		endError = '';
		const result = await endRecruiterInterest(interest._id);
		endBusy = false;
		if (result.ok) {
			ending = null;
			const current = shown;
			if (current.kind === 'ready') {
				shown = {
					...current,
					list: current.list.map((each) => (each._id === interest._id ? result.interest : each))
				};
			}
			toaster.success({ title: m.endDialog.done });
			void refreshNotifications();
			return;
		}
		switch (result.failure) {
			case 'signed-out':
				ending = null;
				toaster.error({ title: recruiterMessages.sessionExpired });
				clearAuthentication();
				return;
			case 'gone':
			case 'off':
				ending = null;
				toaster.info({ title: m.endDialog.gone });
				void read();
				return;
			default:
				endError = result.failure === 'network' ? networkError() : m.endDialog.failed;
		}
	}

	let inJob = $derived(!!jobId);
	const placeholderBlock = 'placeholder w-full animate-pulse motion-reduce:animate-none';
</script>

{#if shown.kind !== 'hidden'}
	<section
		class={inJob ? 'space-y-3 border-t border-surface-200-800 pt-4' : 'space-y-3'}
		aria-labelledby="{uid}-title"
		data-recruiter-matches={jobId ?? 'all'}
	>
		{#if inJob}
			<h4 id="{uid}-title" class="text-sm font-semibold">{m.jobTitle}</h4>
		{:else}
			<div class="space-y-1">
				<h2 id="{uid}-title" class="text-xl font-bold">{m.title}</h2>
				<p class="text-sm text-surface-700-300">{m.intro}</p>
			</div>
		{/if}

		{#if shown.kind === 'ready' && shown.list.length > 0}
			<ul class="space-y-3">
				{#each shown.list as interest (interest._id)}
					<li>
						<RecruiterInterest
							{interest}
							fresh={fresh.has(interest._id)}
							showJob={!inJob}
							headingLevel={inJob ? 5 : 3}
							onEnd={(chosen) => {
								endError = '';
								endingId = chosen._id;
								ending = chosen;
							}}
						/>
					</li>
				{/each}
			</ul>
			{#if shown.next}
				<div class="flex flex-wrap items-center gap-3">
					<button
						type="button"
						class={['btn preset-tonal min-h-11', shown.more === 'loading' ? 'opacity-60' : '']}
						aria-disabled={shown.more === 'loading'}
						onclick={showMore}
					>
						{m.more}
					</button>
					{#if shown.more === 'failed'}
						<p class="text-sm text-error-700-300" role="alert">{m.loadFailed}</p>
					{/if}
				</div>
			{/if}
		{:else if shown.kind === 'ready'}
			<p class="text-sm text-surface-700-300" data-recruiter-matches-empty>
				{inJob ? m.jobEmpty : m.empty}
			</p>
		{:else if shown.kind === 'error'}
			<div
				class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-container preset-tonal-error px-4 py-3 text-sm"
				role="alert"
			>
				<p class="min-w-48 flex-1">{shown.message}</p>
				<button type="button" class="btn btn-sm preset-tonal min-h-9" onclick={read}>
					<ArrowPath size="16" aria-hidden="true" />
					{common.retry}
				</button>
			</div>
		{:else}
			<div aria-busy="true">
				<p class="sr-only" role="status">{m.loading}</p>
				<div class="{placeholderBlock} h-24 rounded-container" aria-hidden="true"></div>
			</div>
		{/if}
	</section>
{/if}

<ConfirmDialog
	open={ending !== null}
	finalFocusEl={() =>
		document.querySelector<HTMLElement>(`[data-recruiter-interest="${endingId}"] [tabindex="-1"]`)}
	title={m.endDialog.title}
	description={m.endDialog.description}
	confirmLabel={m.endDialog.confirm}
	busyLabel={m.endDialog.busy}
	busy={endBusy}
	error={endError}
	onConfirm={confirmEnd}
	onCancel={() => {
		if (!endBusy) ending = null;
	}}
/>
