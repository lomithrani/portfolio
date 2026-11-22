<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { DocumentMagnifyingGlass, ExclamationTriangle, LockClosed } from 'svelte-heros-v2';
	import Rich from '#lib/i18n/Rich.svelte';
	import { common } from '#lib/i18n/common.messages.ts';
	import JobDetails from '#components/jobs/JobDetails.svelte';
	import EditorPlaceholder from '#components/job-editor/EditorPlaceholder.svelte';
	import PageNotice from '#components/job-editor/PageNotice.svelte';
	import SignInButton from '#components/hire/SignInButton.svelte';
	import FeedAnswer from '#components/matching/FeedAnswer.svelte';
	import SharedInterest from '#components/matching/SharedInterest.svelte';
	import { portfolioTextApi } from '#services';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { clearAuthentication, isSessionValid } from '#services/authentication.ts';
	import { errorStatus } from '#services/apiErrors.ts';
	import { formatDay, isoDate } from '#services/recruiter.ts';
	import { m as recruiterMessages } from '#services/recruiter.messages.ts';
	import {
		isJobPostingId,
		jobViewFailure,
		jobViewLimitText,
		jobViewRetryAt,
		jobViewTitle,
		readJobViewAccess,
		type JobViewAccess,
		type SharedJob
	} from '#services/jobView.ts';
	import {
		matchingAvailability,
		notificationsStore,
		refreshNotifications
	} from '#services/notifications.ts';
	import { toaster } from '#services/toaster.ts';
	import { m } from './page.messages.ts';

	// A job description shared with the signed-in account (GET /opportunities/jobs/:id): the page
	// the meeting invitation of a hiring journey links (the API's job step). Its readers are the
	// portfolio owners on whose journey the recruiter picked it, who read the version the recruiter
	// shared there (dated with when they shared it); with matching (Path 2), a candidate it is
	// proposed to, who reads their score of it and answers it there (FeedAnswer: Interested or
	// Pass, undone within its minutes), and the candidate of a mutual interest on it, who reads the
	// version they said yes to, where it stands, and can end it (SharedInterest); its recruiter,
	// who opens the same link, is sent on to their page of it in the recruiter space. Anyone else
	// reads that it is not shared with them (the API answers them as for an unknown id). Who may
	// read it is said with matching's readers only while matching is available (nothing of it shows
	// otherwise). After an answer or an end changed why the account reads it, the page reads it
	// again keeping what it shows until the answer comes, then moves the focus to the heading of
	// what it shows (and says why the job is no longer theirs to answer, when it is not). Private:
	// rendered in the browser only (opportunities/+layout.ts) and not listed by search engines
	// (#lib/robots.ts).

	type LoadState =
		| { kind: 'idle' }
		| { kind: 'loading'; key: string }
		| { kind: 'loaded'; key: string; userId: string; shared: SharedJob; access: JobViewAccess }
		| { kind: 'redirecting' }
		| { kind: 'not-shared' }
		/** A read refused for now (429): from when it can read again (null: not said) */
		| { kind: 'limited'; until: number | null }
		| { kind: 'error' };

	const FEED_HEADING = 'feed-answer-heading';
	const INTEREST_HEADING = 'shared-interest-heading';
	const NOT_SHARED_HEADING = 'job-not-shared-heading';
	const FAILED_HEADING = 'job-failed-heading';

	const withCredentials = { fetch: { credentials: 'include' } } as const;

	let jobId = $derived(page.params.id ?? '');

	// The signed-in account, once the session has been checked with the API
	let user = $derived(
		$sessionCheckedStore && isSessionValid($authenticationStore)
			? $authenticationStore.user
			: undefined
	);

	let loadState = $state.raw<LoadState>({ kind: 'idle' });
	/** Why the job is no longer the account's to answer (an answer refused), said by the page */
	let goneReason = $state('');
	// What was asked for last (account and posting): an older answer is ignored
	let requested: string | null = null;

	/**
	 * Reads the job for the account `userId`. `again`: an answer or an end changed why the account
	 * reads it: what is shown stays until the answer comes (nothing unmounts meanwhile), and the
	 * focus then goes to the heading of what the page shows
	 */
	async function load(userId: string, id: string, again = false) {
		const key = `${userId}:${id}`;
		requested = key;
		if (!again) goneReason = '';
		if (!isJobPostingId(id)) {
			// Not a posting's id: shared with nobody
			loadState = { kind: 'not-shared' };
			return;
		}
		if (!(again && loadState.kind === 'loaded' && loadState.key === key)) {
			loadState = { kind: 'loading', key };
		}
		try {
			const { data, error, response } = await portfolioTextApi.opportunities
				.jobs({ id })
				.get(withCredentials);
			if (requested !== key) return;
			if (error || !data) {
				const failure = jobViewFailure(errorStatus(error), error?.value);
				if (failure === 'signed-out') {
					// The session ended: the page asks to sign in again, and reloads once signed in
					requested = null;
					loadState = { kind: 'idle' };
					clearAuthentication();
					return;
				}
				loadState =
					failure === 'limited'
						? { kind: 'limited', until: jobViewRetryAt(response?.headers) }
						: { kind: failure };
			} else if (data.access === 'recruiter') {
				// The posting's own recruiter: their page of it, which this one does not stay under in
				// the history (Back leaves both)
				loadState = { kind: 'redirecting' };
				await goto(resolve('/(app)/recruiter/jobs/[id]', { id }), { replaceState: true });
				return;
			} else {
				const access = readJobViewAccess(data);
				loadState = access
					? { kind: 'loaded', key, userId, shared: data, access }
					: { kind: 'error' };
			}
		} catch {
			if (requested !== key) return;
			loadState = { kind: 'error' };
		}
		if (again) await settleAfterChange();
	}

	/**
	 * Read again after a change: the focus on the heading of what the page shows now (what had it,
	 * a button or a dialog's, is gone), and why the job is no longer theirs to answer said where the
	 * page shows something else than "not shared"
	 */
	async function settleAfterChange() {
		await tick();
		const state = loadState;
		let target: string | null = null;
		if (state.kind === 'loaded') {
			target =
				state.access.kind === 'match'
					? INTEREST_HEADING
					: state.access.kind === 'feed'
						? FEED_HEADING
						: null;
			if (goneReason) toaster.info({ title: goneReason });
			goneReason = '';
		} else if (state.kind === 'not-shared') {
			target = NOT_SHARED_HEADING;
		} else if (state.kind === 'error' || state.kind === 'limited') {
			target = FAILED_HEADING;
		}
		if (target) document.getElementById(target)?.focus({ preventScroll: true });
	}

	/** An answer or an end changed why the account reads the job: read it again */
	function changed(why: 'mutual' | 'gone' | 'ended' | 'signed-out', reason?: string) {
		if (why === 'signed-out') {
			clearAuthentication();
			return;
		}
		if (why === 'gone') {
			goneReason = reason ?? '';
			// Matching may have been turned off: the account menu follows
			void refreshNotifications();
		}
		if (user?._id) load(user._id, jobId, true);
	}

	// Signed out: whether matching is available decides who the page says may read it
	$effect(() => {
		if ($sessionCheckedStore && !user && $notificationsStore.matching === 'unknown') {
			void matchingAvailability();
		}
	});
	let withMatching = $derived($notificationsStore.matching === 'on');

	$effect(() => {
		const userId = user?._id;
		const id = jobId;
		if (!userId) {
			// Signed out (or the session ended), also while a request was on its way (its answer is
			// dropped): the page asks to sign in, and signing in loads it
			requested = null;
			untrack(() => {
				if (loadState.kind !== 'idle') loadState = { kind: 'idle' };
			});
			return;
		}
		if (requested === `${userId}:${id}`) return;
		untrack(() => load(userId, id));
	});

	// A read refused for now: Retry waits until its Retry-After has passed
	let now = $state(Date.now());
	let limitedUntil = $derived(loadState.kind === 'limited' ? loadState.until : null);
	let retryHeld = $derived(limitedUntil !== null && now < limitedUntil);
	$effect(() => {
		if (limitedUntil === null) return;
		const left = limitedUntil - Date.now();
		if (left <= 0) return;
		const timer = setTimeout(() => (now = Date.now()), Math.min(left + 100, 2 ** 31 - 1));
		return () => clearTimeout(timer);
	});

	const retry = () => {
		if (retryHeld) return;
		if (user?._id) load(user._id, jobId);
	};

	// Only for the account it was loaded for: nothing of it stays on screen once signed out
	let job = $derived(
		loadState.kind === 'loaded' && loadState.userId === user?._id ? loadState.shared.job : null
	);
	let access = $derived(job && loadState.kind === 'loaded' ? loadState.access : null);
	// The version shared on the owner's journey: when the recruiter shared it (unset: the posting
	// as it is now, a pick from before versions were kept)
	let sharedAt = $derived(access?.kind === 'journey' ? access.sharedAt : undefined);
	let waiting = $derived(
		!$sessionCheckedStore ||
			loadState.kind === 'loading' ||
			loadState.kind === 'redirecting' ||
			(!!user && loadState.kind === 'idle')
	);
</script>

<svelte:head>
	<title>{jobViewTitle(job?.title)}</title>
</svelte:head>

<div class="p-4 md:p-6">
	<div class="mx-auto w-full max-w-4xl space-y-6">
		{#if job && access}
			{#key loadState}
				{#if access.kind === 'feed'}
					<FeedAnswer
						jobId={job._id}
						score={access.score}
						interested={access.interested}
						decision={access.decision}
						headingId={FEED_HEADING}
						onChange={changed}
					/>
				{:else if access.kind === 'match'}
					<SharedInterest
						interest={access.interest}
						headingId={INTEREST_HEADING}
						onChange={changed}
					/>
				{/if}
			{/key}
			<JobDetails {job} headingLevel={2}>
				{#snippet meta()}
					<p class="flex flex-wrap gap-x-4 gap-y-1">
						{#if job.publishedAt}
							<span>
								<Rich text={m.opened(formatDay(job.publishedAt))}>
									{#snippet time(day)}<time datetime={isoDate(job.publishedAt)}>{day}</time
										>{/snippet}
								</Rich>
							</span>
						{/if}
						<span>
							{#if sharedAt}
								<Rich text={m.shared(formatDay(sharedAt))}>
									{#snippet time(day)}<time datetime={isoDate(sharedAt)}>{day}</time>{/snippet}
								</Rich>
							{:else}
								<Rich text={m.updated(formatDay(job.updatedAt))}>
									{#snippet time(day)}<time datetime={isoDate(job.updatedAt)}>{day}</time>{/snippet}
								</Rich>
							{/if}
						</span>
					</p>
				{/snippet}
				<p
					class="flex items-start gap-2 border-t border-surface-200-800 pt-4 text-sm text-surface-700-300"
				>
					<LockClosed size="16" class="mt-0.5 shrink-0" aria-hidden="true" />
					<span>{withMatching ? m.privateWithMatching : m.private}</span>
				</p>
			</JobDetails>
		{:else if waiting}
			<EditorPlaceholder />
		{:else if !user}
			<PageNotice title={m.signedOut.title} icon={LockClosed}>
				<p>{withMatching ? m.signedOut.textWithMatching : m.signedOut.text}</p>
				{#snippet actions()}
					<SignInButton />
				{/snippet}
			</PageNotice>
		{:else if loadState.kind === 'not-shared'}
			<PageNotice
				title={m.notShared.title}
				icon={DocumentMagnifyingGlass}
				headingId={NOT_SHARED_HEADING}
			>
				{#if goneReason}
					<!-- An answer given here was refused: why, before what the page says of who reads it -->
					<p class="font-medium text-surface-950-50" data-gone-reason>{goneReason}</p>
				{/if}
				<p>{withMatching ? m.notShared.textWithMatching : m.notShared.text}</p>
				{#if user.email}
					<p>
						<Rich text={m.notShared.signedInAs(user.email)}>
							{#snippet strong(email)}<strong class="wrap-anywhere">{email}</strong>{/snippet}
						</Rich>
					</p>
				{/if}
				{#snippet actions()}
					{#if goneReason && withMatching}
						<a
							href={resolve('/(app)/opportunities')}
							class="btn preset-filled-primary-700-300 min-h-11"
						>
							{m.notShared.opportunities}
						</a>
					{:else}
						<a href={resolve('/(site)')} class="btn preset-filled-primary-700-300 min-h-11">
							{m.notShared.home}
						</a>
					{/if}
				{/snippet}
			</PageNotice>
		{:else}
			<PageNotice
				title={m.loadFailed.title}
				icon={ExclamationTriangle}
				tone="error"
				headingId={FAILED_HEADING}
			>
				<p>
					{loadState.kind === 'limited'
						? jobViewLimitText(loadState.until)
						: recruiterMessages.loadFailed}
				</p>
				{#snippet actions()}
					<button
						type="button"
						class={['btn preset-filled-primary-700-300 min-h-11', retryHeld ? 'opacity-60' : '']}
						aria-disabled={retryHeld}
						onclick={retry}
					>
						{common.retry}
					</button>
				{/snippet}
			</PageNotice>
		{/if}
	</div>
</div>
