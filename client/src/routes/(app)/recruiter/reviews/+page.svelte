<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { ArrowPath, CheckBadge, ExclamationTriangle, EyeSlash } from 'svelte-heros-v2';
	import type { MatchingReviewDecision } from 'portfolio-common';
	import { common } from '#lib/i18n/common.messages.ts';
	import EditorPlaceholder from '#components/job-editor/EditorPlaceholder.svelte';
	import PageNotice from '#components/job-editor/PageNotice.svelte';
	import ConfirmDialog from '#components/recruiter/ConfirmDialog.svelte';
	import JobReview from '#components/matching-review/JobReview.svelte';
	import { SITE_NAME } from '#components/legal/legalDocuments.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { clearAuthentication, isSessionValid } from '#services/authentication.ts';
	import {
		decideReview,
		loadReviews,
		type ReviewFailure,
		type ReviewList,
		type ReviewedJob
	} from '#services/matchingReviews.ts';
	import { m as recruiterMessages } from '#services/recruiter.messages.ts';
	import { toaster } from '#services/toaster.ts';
	import { m } from './page.messages.ts';

	// The reviewers' page of matching (Path 2, CLAUDE.md "Matching", "Review"): the job descriptions
	// recruiters propose to candidates wait here for one of the operator's reviewers
	// (MATCHING_REVIEWERS), who reads each before it reaches any candidate (GET /matching/reviews:
	// the oldest request first, the posting as candidates would read it, who is behind it by the
	// domain of their email address and a key standing for them, their other jobs with the copies
	// of this one flagged and the terms they differ in), then approves it (asked first: it reaches
	// candidates at once) or rejects it with a reason its recruiter reads (PUT
	// /matching/reviews/:id, on the version read: changed since, the list is read again and the
	// page says so). Anyone else (403), and everyone while MATCHING is off (404), reads only that
	// the page is not available: its title, heading and texts say what it is only once the list is
	// read. No menu leads here (a reviewer keeps its address): nothing in what the API answers to
	// everyone says who reviews. No candidate's data: the API gives none. Rendered in the browser
	// only (recruiter/+layout.ts), not listed by search engines (#lib/robots.ts), and recorded as no
	// space (spaceToRecord of #services/account.ts).

	type LoadState =
		| { kind: 'idle' }
		| { kind: 'loading'; userId: string }
		| { kind: 'loaded'; userId: string; list: ReviewList }
		| { kind: 'unavailable'; userId: string }
		| { kind: 'error'; userId: string };

	// The signed-in account, once the session has been checked with the API
	let user = $derived(
		$sessionCheckedStore && isSessionValid($authenticationStore)
			? $authenticationStore.user
			: undefined
	);

	let loadState = $state.raw<LoadState>({ kind: 'idle' });
	let requested: string | null = null;
	/** Read again (Check again, after a refusal) while a list is shown */
	let checking = $state(false);
	/** What the page last said (a decision saved, the list read again): a polite live region */
	let notice = $state('');

	const headingId = 'reviews-heading';
	const emptyHeadingId = 'reviews-empty';
	const unavailableHeadingId = 'reviews-unavailable';
	const jobHeadingId = (jobId: string) => `review-${jobId}`;

	/** Moves the focus to `id` once the page shows it, else to the list's heading */
	async function focus(id: string) {
		await tick();
		const element = document.getElementById(id) ?? document.getElementById(headingId);
		element?.focus({ preventScroll: true });
		element?.scrollIntoView({ block: 'nearest' });
	}

	/** Says `text` in the live region, also when it is what it said last */
	async function say(text: string) {
		notice = '';
		await tick();
		notice = text;
	}

	/** Reads the list; `again`: a list is shown, and stays while it is read (and if that fails) */
	async function load(userId: string, again = false): Promise<ReviewList | null> {
		requested = userId;
		const shown = loadState.kind === 'loaded' && loadState.userId === userId;
		if (again && shown) checking = true;
		else loadState = { kind: 'loading', userId };
		const result = await loadReviews();
		if (requested !== userId) return null;
		checking = false;
		if (result.ok) {
			loadState = { kind: 'loaded', userId, list: result.list };
			return result.list;
		}
		switch (result.failure) {
			case 'signed-out':
				requested = null;
				loadState = { kind: 'idle' };
				clearAuthentication();
				break;
			case 'unavailable':
				loadState = { kind: 'unavailable', userId };
				break;
			default:
				if (again && shown) void say(m.checkFailed);
				else loadState = { kind: 'error', userId };
		}
		return null;
	}

	$effect(() => {
		const userId = user?._id;
		if (!userId) {
			requested = null;
			return;
		}
		if (requested === userId) return;
		untrack(() => load(userId));
	});

	async function checkAgain() {
		if (!user?._id || checking) return;
		const list = await load(user._id, true);
		if (list) void say(m.checked(list.jobs.length));
	}

	const retry = () => {
		if (user?._id) void load(user._id);
	};

	let list = $derived(
		loadState.kind === 'loaded' && loadState.userId === user?._id ? loadState.list : null
	);
	let listed = $derived(new Set(list?.jobs.map((entry) => entry.job._id) ?? []));

	// --- Decisions --------------------------------------------------------------------------
	/** Where the focus goes once a decision took a job off the list: the next one, else the heading */
	function nextFocus(jobs: readonly ReviewedJob[], jobId: string): string {
		const index = jobs.findIndex((entry) => entry.job._id === jobId);
		const next = jobs[index + 1] ?? jobs[index - 1];
		return next ? jobHeadingId(next.job._id) : emptyHeadingId;
	}

	/** Set once a decision moved the focus: the approval's dialog leaves it there */
	let focusAfter: string | null = null;

	/**
	 * Runs a decision on `entry`: saved, the job leaves the list and the page says so; the job
	 * changed since it was read or is gone, the list is read again; the session, not available. The
	 * reason refused and Try again are for the form (or the dialog) to say: returned
	 */
	async function decide(
		entry: ReviewedJob,
		decision: MatchingReviewDecision,
		reason: string
	): Promise<ReviewFailure | null> {
		const userId = user?._id;
		if (!userId) return null;
		const result = await decideReview(entry.job._id, decision, reason, entry.version);
		if (result.ok) {
			const current = list?.jobs ?? [];
			focusAfter = nextFocus(current, entry.job._id);
			if (loadState.kind === 'loaded' && loadState.userId === userId) {
				loadState = {
					...loadState,
					list: {
						...loadState.list,
						jobs: loadState.list.jobs.filter((job) => job.job._id !== entry.job._id)
					}
				};
			}
			void say(decision === 'approve' ? m.approved(entry.job.title) : m.rejected(entry.job.title));
			void focus(focusAfter);
			return null;
		}
		const { failure } = result;
		switch (failure.kind) {
			case 'reason':
			case 'retry':
				return failure;
			case 'signed-out':
				toaster.error({ title: recruiterMessages.sessionExpired });
				clearAuthentication();
				return null;
			case 'unavailable':
				loadState = { kind: 'unavailable', userId };
				focusAfter = unavailableHeadingId;
				void focus(unavailableHeadingId);
				return null;
			case 'changed':
			case 'gone': {
				// Read again: a job changed since comes back as it is now, one gone leaves the list (a
				// read that fails keeps the list shown, and says so)
				const before = list?.jobs ?? [];
				const fresh = await load(userId, true);
				if (!fresh) return null;
				const stillListed = fresh.jobs.some((job) => job.job._id === entry.job._id);
				focusAfter = stillListed ? jobHeadingId(entry.job._id) : nextFocus(before, entry.job._id);
				void say(failure.message);
				void focus(focusAfter);
				return null;
			}
		}
	}

	// The approval asks first: it reaches candidates at once
	let approving = $state.raw<ReviewedJob | null>(null);
	let approveBusy = $state(false);
	let approveError = $state('');
	let approveTrigger: HTMLElement | null = null;

	function askApproval(entry: ReviewedJob, trigger: HTMLElement) {
		approveTrigger = trigger;
		focusAfter = null;
		approveError = '';
		approving = entry;
	}

	async function confirmApproval() {
		const entry = approving;
		if (!entry || approveBusy) return;
		approveBusy = true;
		approveError = '';
		const failure = await decide(entry, 'approve', '');
		approveBusy = false;
		if (failure) approveError = failure.message;
		else approving = null;
	}

	let pageTitle = $derived(
		list
			? m.pageTitle
			: loadState.kind === 'unavailable' || ($sessionCheckedStore && !user)
				? m.unavailableTitle
				: SITE_NAME
	);
	const actionClass = 'btn preset-filled-primary-700-300 min-h-11 max-w-full whitespace-normal';
</script>

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>

<div class="p-4 md:p-6">
	<div class="mx-auto w-full max-w-4xl space-y-6">
		<!-- What the page said last (a decision saved, the list read again): inside main#page -->
		<p class="sr-only" aria-live="polite" data-reviews-said>{notice}</p>

		{#if list}
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div class="min-w-0 flex-1 space-y-2">
					<h2
						id={headingId}
						tabindex="-1"
						class="rounded-base text-2xl font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary-500 md:text-3xl"
					>
						{m.heading}
					</h2>
					<p class="text-surface-700-300">{m.intro}</p>
					{#if list.jobs.length > 0}
						<p class="font-medium" data-reviews-count>
							{m.waiting(list.jobs.length)}
							{#if list.full}{m.full}{/if}
						</p>
					{/if}
				</div>
				<button
					type="button"
					class="btn preset-tonal min-h-11 max-sm:w-full"
					aria-disabled={checking ? 'true' : undefined}
					onclick={checkAgain}
				>
					<ArrowPath size="18" aria-hidden="true" />
					{checking ? m.checking : m.checkAgain}
				</button>
			</div>

			{#if notice}
				<!-- The same words, for everyone (the live region above is read by screen readers) -->
				<p class="card preset-tonal p-3 text-sm" aria-hidden="true" data-reviews-notice>
					{notice}
				</p>
			{/if}

			{#if list.jobs.length === 0}
				<PageNotice title={m.empty.title} icon={CheckBadge} headingId={emptyHeadingId}>
					<p>{m.empty.text}</p>
				</PageNotice>
			{:else}
				<ol class="space-y-8" aria-labelledby={headingId}>
					{#each list.jobs as entry (entry.job._id)}
						<li>
							<JobReview
								{entry}
								headingId={jobHeadingId(entry.job._id)}
								{listed}
								anchorOf={jobHeadingId}
								busy={approving?.job._id === entry.job._id && approveBusy}
								onApprove={(trigger) => askApproval(entry, trigger)}
								onReject={(reason) => decide(entry, 'reject', reason)}
							/>
						</li>
					{/each}
				</ol>
			{/if}
		{:else if !$sessionCheckedStore || loadState.kind === 'loading' || (user && loadState.kind === 'idle')}
			<EditorPlaceholder />
		{:else if !user}
			<PageNotice title={m.unavailable.title} icon={EyeSlash}>
				<p>{m.unavailable.signedOut}</p>
			</PageNotice>
		{:else if loadState.kind === 'unavailable'}
			<PageNotice title={m.unavailable.title} icon={EyeSlash} headingId={unavailableHeadingId}>
				<p>{m.unavailable.text}</p>
			</PageNotice>
		{:else}
			<PageNotice title={m.loadFailed.title} icon={ExclamationTriangle} tone="error">
				<p>{m.loadFailed.text}</p>
				{#snippet actions()}
					<button type="button" class={actionClass} onclick={retry}>{common.retry}</button>
				{/snippet}
			</PageNotice>
		{/if}
	</div>
</div>

<ConfirmDialog
	open={approving !== null}
	tone="primary"
	title={m.approveDialog.title}
	description={approving ? m.approveDialog.description(approving.job.title) : ''}
	confirmLabel={m.approveDialog.confirm}
	busyLabel={m.approveDialog.busy}
	busy={approveBusy}
	error={approveError}
	finalFocusEl={() => (focusAfter ? document.getElementById(focusAfter) : approveTrigger)}
	onConfirm={confirmApproval}
	onCancel={() => {
		if (!approveBusy) approving = null;
	}}
/>
