<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { resolve } from '$app/paths';
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
		reconcileReviews,
		scrollBehavior,
		type ReviewFailure,
		type ReviewList,
		type ReviewedJob,
		type ReviewsRead,
		type SavedDecision
	} from '#services/matchingReviews.ts';
	import { m as reviewText } from '#services/matchingReviews.messages.ts';
	import { m } from './page.messages.ts';
	import { m as matchingText } from '#services/matching.messages.ts';

	// The reviewers' page of matching (Path 2, CLAUDE.md "Matching", "Review"): the job descriptions
	// recruiters ask to propose to candidates wait here for one of the operator's reviewers
	// (MATCHING_REVIEWERS), who reads each before it reaches any candidate (GET /matching/reviews:
	// the oldest request first, the posting as candidates would read it, who is behind it by the
	// domain of their email address and a key standing for them, their other jobs with the copies
	// of this one flagged and the terms they differ in), then approves it (asked first) or rejects it
	// with a reason its recruiter reads (PUT /matching/reviews/:id, on the version read: changed
	// since, the list is read again and the page says so where the reviewer acted). Anyone else
	// (403), everyone while MATCHING is off (404), and anyone signed out read only that the page is
	// not available: its title, heading and texts say what it is only once the list is read. No menu
	// leads here (a reviewer keeps its address): nothing in what the API answers to everyone says
	// who reviews. No candidate's data: the API gives none. A session that expires once the list is
	// shown never signs the page out (what a reviewer typed would go): it is said where they acted.
	// Rendered in the browser only (recruiter/+layout.ts), not listed by search engines
	// (#lib/robots.ts), and recorded as no space (spaceToRecord of #services/account.ts).

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
	/** Read again (Check again, after a refusal, the next ones) while a list is shown */
	let checking = $state(false);
	/** What the page last said (a decision saved, the list read again): a polite live region */
	let notice = $state('');
	/**
	 * What the page says to everyone at its top: the live region's words (`focus` false: hidden from
	 * screen readers, who heard them), or a refusal whose job left the list, which takes the focus
	 */
	let banner = $state.raw<{ text: string; focus: boolean } | null>(null);
	/** Why a decision on a job was refused, shown under its title (by job id) until its next one */
	let jobNotices = $state.raw<Record<string, string>>({});

	const headingId = 'reviews-heading';
	const emptyHeadingId = 'reviews-empty';
	const unavailableHeadingId = 'reviews-unavailable';
	const loadFailedHeadingId = 'reviews-load-failed';
	const bannerId = 'reviews-notice';
	const jobHeadingId = (jobId: string) => `review-${jobId}`;

	// The page's clock: each read and each decision saved takes the next tick, so that a read
	// answered after a decision, though the API answered it before, never shows that decision undone
	let clock = 0;
	/** The decisions saved on this page, by job id (reconcileReviews): read, never rendered */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- not state: read when a list comes
	const decided = new Map<string, SavedDecision>();
	/** The reads started, and the latest one shown: an older read answered later is not shown */
	let reads = 0;
	let shownRead = 0;

	/** Moves the focus to `id` once the page shows it, else to the list's heading */
	async function focus(id: string) {
		await tick();
		const element = document.getElementById(id) ?? document.getElementById(headingId);
		element?.focus({ preventScroll: true });
		element?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
	}

	/** Says `text` in the live region, also when it is what it said last; shown at the top too */
	async function say(text: string, { shown = true } = {}) {
		notice = '';
		banner = shown ? { text, focus: false } : null;
		await tick();
		notice = text;
	}

	/** Shows `text` at the top and moves the focus there (read on focus, not in the live region) */
	function show(text: string) {
		notice = '';
		banner = { text, focus: true };
		focusAfter = bannerId;
		void focus(bannerId);
	}

	function clearNotice(jobId: string) {
		if (!(jobId in jobNotices)) return;
		jobNotices = Object.fromEntries(Object.entries(jobNotices).filter(([id]) => id !== jobId));
	}

	/**
	 * Reads the list; `again`: a list is shown, and stays while it is read and if that fails (a
	 * session expired then never signs the page out: the caller says it). Null when another account
	 * signed in meanwhile; a read answered after a later one was shown gives the list shown
	 */
	async function load(userId: string, again = false): Promise<ReviewsRead | null> {
		const read = ++reads;
		const startedAt = ++clock;
		requested = userId;
		const keep = again && loadState.kind === 'loaded' && loadState.userId === userId;
		if (keep) checking = true;
		else loadState = { kind: 'loading', userId };
		const result = await loadReviews();
		if (requested !== userId) return null;
		if (read === reads) checking = false;
		if (read < shownRead) {
			return loadState.kind === 'loaded' && loadState.userId === userId
				? { ok: true, list: loadState.list }
				: result;
		}
		if (result.ok) {
			shownRead = read;
			const list = reconcileReviews(result.list, decided, startedAt);
			loadState = { kind: 'loaded', userId, list };
			return { ok: true, list };
		}
		if (result.failure === 'unavailable') {
			shownRead = read;
			loadState = { kind: 'unavailable', userId };
		} else if (!keep) {
			if (result.failure === 'signed-out') {
				requested = null;
				loadState = { kind: 'idle' };
				clearAuthentication();
			} else {
				loadState = { kind: 'error', userId };
			}
		}
		return result;
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
		const read = await load(user._id, true);
		if (!read) return;
		if (read.ok) void say(m.checked(read.list.jobs.length, read.list.full));
		else if (read.failure === 'signed-out') void say(m.checkSignedOut);
		else if (read.failure === 'unavailable') void focus(unavailableHeadingId);
		else void say(m.checkFailed);
	}

	async function retry() {
		if (!user?._id) return;
		const read = await load(user._id);
		// The focus on what replaces Try again: the list, or the failure again
		if (read?.ok) void focus(headingId);
		else if (read && read.failure === 'retry') void focus(loadFailedHeadingId);
		else if (read?.failure === 'unavailable') void focus(unavailableHeadingId);
	}

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
	 * Reads the next jobs once every job of a read that listed MATCHING_LIMITS.reviewsPerRead is
	 * decided (more wait after them), the focus on the first (else on what says there is none)
	 */
	async function readNext(userId: string) {
		const read = await load(userId, true);
		const first = read?.ok ? read.list.jobs[0] : undefined;
		focusAfter = first ? jobHeadingId(first.job._id) : emptyHeadingId;
		void focus(focusAfter);
	}

	/**
	 * Runs a decision on `entry`: saved, the job leaves the list (the other jobs naming it read its
	 * new review) and the page says so; the job changed since it was read or is gone, the list is
	 * read again and the page says why where the reviewer acted (under the job's title, or at the top
	 * once it left the list). The reason refused, the session expired, Try again, and a refusal whose
	 * list could not be read again are for the form (or the dialog) to say next to its button:
	 * returned
	 */
	async function decide(
		entry: ReviewedJob,
		decision: MatchingReviewDecision,
		reason: string
	): Promise<ReviewFailure | null> {
		const userId = user?._id;
		if (!userId) return null;
		const jobId = entry.job._id;
		clearNotice(jobId);
		const result = await decideReview(jobId, decision, reason, entry.version);
		if (result.ok) {
			const saved: SavedDecision = {
				version: entry.version,
				status: decision === 'approve' ? 'approved' : 'rejected',
				at: ++clock
			};
			decided.set(jobId, saved);
			focusAfter = nextFocus(list?.jobs ?? [], jobId);
			let more = false;
			if (loadState.kind === 'loaded' && loadState.userId === userId) {
				const next = reconcileReviews(loadState.list, new Map([[jobId, saved]]), saved.at - 1);
				loadState = { ...loadState, list: next };
				more = next.full && next.jobs.length === 0;
			}
			void say(
				decision === 'reject'
					? m.rejected(entry.job.title)
					: entry.job.status === 'open'
						? m.approved(entry.job.title)
						: m.approvedOnHold(entry.job.title)
			);
			void focus(focusAfter);
			if (more) void readNext(userId);
			return null;
		}
		const { failure } = result;
		switch (failure.kind) {
			case 'reason':
			case 'retry':
			case 'signed-out':
				return failure;
			case 'unavailable':
				loadState = { kind: 'unavailable', userId };
				focusAfter = unavailableHeadingId;
				void focus(unavailableHeadingId);
				return null;
			case 'changed':
			case 'gone': {
				// Read again: a job changed since comes back as it is now, one gone leaves the list. A
				// read that fails keeps the list shown: the form says both (not saved, not read again)
				const read = await load(userId, true);
				if (!read) return null;
				if (!read.ok) {
					if (read.failure === 'unavailable') {
						focusAfter = unavailableHeadingId;
						void focus(unavailableHeadingId);
						return null;
					}
					const then = read.failure === 'signed-out' ? m.checkSignedOut : m.refused.notRead;
					return { kind: 'retry', message: `${failure.message} ${then}` };
				}
				if (read.list.jobs.some((job) => job.job._id === jobId)) {
					const text = `${reviewText.failure.changed} ${m.refused.shownNow}`;
					jobNotices = { ...jobNotices, [jobId]: text };
					void say(text, { shown: false });
					focusAfter = jobHeadingId(jobId);
					void focus(focusAfter);
				} else {
					show(
						failure.kind === 'gone'
							? failure.message
							: `${reviewText.failure.changed} ${m.refused.left}`
					);
				}
				return null;
			}
		}
	}

	// The approval asks first
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
				? matchingText.unavailable.pageTitle
				: SITE_NAME
	);
	const actionClass = 'btn preset-filled-primary-700-300 min-h-11 max-w-full whitespace-normal';
	/** The way out of "Not available", as on every page of matching not available */
	const homeLink = 'btn preset-filled-primary-700-300 min-h-11 max-w-full whitespace-normal';
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
							{list.full ? m.waitingMore(list.jobs.length) : m.waiting(list.jobs.length)}
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

			{#if banner?.focus}
				<!-- A refusal whose job left the list: it takes the focus, and is read then -->
				<p
					id={bannerId}
					class="card preset-tonal-warning rounded-base p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
					tabindex="-1"
					data-reviews-notice
				>
					{banner.text}
				</p>
			{:else if banner}
				<!-- The live region's words, for everyone (hidden from screen readers, who heard them) -->
				<p class="card preset-tonal p-3 text-sm" aria-hidden="true" data-reviews-notice>
					{banner.text}
				</p>
			{/if}

			{#if list.jobs.length === 0 && list.full}
				<!-- Every job of a read that listed as many as one read lists is decided: more wait -->
				<PageNotice title={m.decidedAll.title} icon={CheckBadge} headingId={emptyHeadingId}>
					<p>{m.decidedAll.text}</p>
					{#snippet actions()}
						<button
							type="button"
							class={actionClass}
							aria-disabled={checking ? 'true' : undefined}
							onclick={checkAgain}>{checking ? m.checking : m.checkAgain}</button
						>
					{/snippet}
				</PageNotice>
			{:else if list.jobs.length === 0}
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
								notice={jobNotices[entry.job._id] ?? ''}
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
			<!-- Signed out: the same words as for anyone else (nothing says signing in would open it) -->
			<PageNotice title={matchingText.unavailable.title} icon={EyeSlash}>
				<p>{matchingText.unavailable.text}</p>
				{#snippet actions()}
					<a href={resolve('/(site)')} class={homeLink}>{matchingText.unavailable.home}</a>
				{/snippet}
			</PageNotice>
		{:else if loadState.kind === 'unavailable'}
			<PageNotice
				title={matchingText.unavailable.title}
				icon={EyeSlash}
				headingId={unavailableHeadingId}
			>
				<p>{matchingText.unavailable.text}</p>
				{#snippet actions()}
					<a href={resolve('/(site)')} class={homeLink}>{matchingText.unavailable.home}</a>
				{/snippet}
			</PageNotice>
		{:else}
			<PageNotice
				title={m.loadFailed.title}
				icon={ExclamationTriangle}
				tone="error"
				headingId={loadFailedHeadingId}
			>
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
	description={approving
		? approving.job.status === 'open'
			? m.approveDialog.description(approving.job.title)
			: m.approveDialog.descriptionOnHold(approving.job.title)
		: ''}
	details={m.approveDialog.details}
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
