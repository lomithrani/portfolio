<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		ArrowLeft,
		ArrowPath,
		Briefcase,
		DocumentMagnifyingGlass,
		ExclamationTriangle,
		EyeSlash,
		LockClosed,
		PauseCircle
	} from 'svelte-heros-v2';
	import type { MatchDecision } from 'portfolio-common';
	import { common } from '#lib/i18n/common.messages.ts';
	import EditorPlaceholder from '#components/job-editor/EditorPlaceholder.svelte';
	import PageNotice from '#components/job-editor/PageNotice.svelte';
	import TermsAcceptance from '#components/account/TermsAcceptance.svelte';
	import CandidateCard from '#components/matching/CandidateCard.svelte';
	import MatchDeck from '#components/matching/MatchDeck.svelte';
	import { portfolioApi } from '#services';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { clearAuthentication, isSessionValid } from '#services/authentication.ts';
	import { errorStatus } from '#services/apiErrors.ts';
	import { isConsentProblem } from '#services/account.ts';
	import type { DecisionFailure, RecruiterCard } from '#services/matching.ts';
	import { refreshNotifications } from '#services/notifications.ts';
	import {
		answerCandidate,
		canProposeJob,
		jobMatchingState,
		readCandidates,
		readJobMatching,
		undoCandidateAnswer
	} from '#services/recruiterMatching.ts';
	import type { RecruiterJobDetail } from '#services/recruiter.ts';
	import { m as recruiterMessages } from '#services/recruiter.messages.ts';
	import { toaster } from '#services/toaster.ts';
	import { m as jobPage } from '../page.messages.ts';
	import { m } from './page.messages.ts';
	import { m as matchingText } from '#services/matching.messages.ts';

	// The candidates proposed for one of the recruiter's job descriptions (matching, Path 2,
	// CLAUDE.md "Matching"): their anonymous cards (CandidateCard), one at a time (GET
	// /recruiter/jobs/:id/candidates: the next once the one shown is answered), answered Interested
	// or Pass in a deck (MatchDeck: PUT /recruiter/jobs/:id/candidates/decision, the card's token in
	// the body; Undo, within MATCHING_LIMITS.undoMinutes, the first answer on the card only, with the
	// token kept in memory, never stored). Both interested: the deck says so, with the candidate's
	// portfolio and their page for recruiters. The posting (GET /recruiter/jobs/:id) says why there
	// is no deck: matching off (no `matching`: "not available"), the job not proposed now (off, not
	// open, in review, not accepted with the reviewer's reason, on hold). The deck's stops are said
	// here (the terms to accept first: TermsAcceptance, then the deck starts again; the job no longer
	// proposed, the posting read again, which says why, or, when it still reads as proposed, to save
	// it again in the editor: saved under rules made tighter since). Never a count of
	// candidates, a name, a place, a commute or a score; no email promised. Rendered in the browser
	// only (recruiter/+layout.ts), not listed by search engines (under /recruiter/jobs, #lib/robots.ts).

	type LoadState =
		| { kind: 'idle' }
		| { kind: 'loading'; key: string }
		| { kind: 'loaded'; key: string; userId: string; job: RecruiterJobDetail }
		| { kind: 'not-found' }
		| { kind: 'no-space' }
		| { kind: 'terms' }
		| { kind: 'off' }
		| { kind: 'error' };

	const withCredentials = { fetch: { credentials: 'include' } } as const;

	let jobId = $derived(page.params.id ?? '');

	// The signed-in account, once the session has been checked with the API
	let user = $derived(
		$sessionCheckedStore && isSessionValid($authenticationStore)
			? $authenticationStore.user
			: undefined
	);

	let loadState = $state.raw<LoadState>({ kind: 'idle' });
	let requested: string | null = null;

	async function load(userId: string, id: string) {
		const key = `${userId}:${id}`;
		requested = key;
		loadState = { kind: 'loading', key };
		try {
			const { data, error } = await portfolioApi.recruiter.jobs({ id }).get(withCredentials);
			if (requested !== key) return;
			if (error || !data) {
				const code = errorStatus(error);
				if (code === 401) {
					requested = null;
					loadState = { kind: 'idle' };
					clearAuthentication();
				} else if (code === 403) {
					loadState = { kind: 'no-space' };
				} else if (isConsentProblem(code, error?.value)) {
					loadState = { kind: 'terms' };
				} else if (code === 404 || code === 422) {
					loadState = { kind: 'not-found' };
				} else {
					loadState = { kind: 'error' };
				}
				return;
			}
			loadState = { kind: 'loaded', key, userId, job: data };
		} catch {
			if (requested === key) loadState = { kind: 'error' };
		}
	}

	$effect(() => {
		const userId = user?._id;
		const id = jobId;
		if (!userId) {
			requested = null;
			return;
		}
		if (user?.recruiter === false || !id || requested === `${userId}:${id}`) return;
		untrack(() => load(userId, id));
	});

	const retry = () => {
		if (user?._id) load(user._id, jobId);
	};

	let job = $derived(
		loadState.kind === 'loaded' && loadState.userId === user?._id ? loadState.job : null
	);
	let matching = $derived(job ? readJobMatching(job.matching) : null);
	let standing = $derived(job && matching ? jobMatchingState(job.status, matching) : null);
	const recruiterHref = resolve('/(app)/recruiter');

	// --- The deck ---------------------------------------------------------------------------
	/** Changed to mount the deck again (start again: after a stop, once the terms are accepted) */
	let deckRun = $state(0);
	/** Why the deck stopped, when the page says it apart from the posting's own state */
	let stopped = $state.raw<DecisionFailure | null>(null);
	/**
	 * The feed answered 409 JOB_NOT_PROPOSED and the posting, read again, still reads as proposed:
	 * the API proposes it to nobody (its stored version saved under rules made tighter since). Said
	 * with the way out (the editor), never a Retry that could only meet the same answer
	 */
	let stale = $derived(stopped?.kind === 'job-not-proposed' && standing === 'live');
	const stopHeading = 'candidates-stopped';
	const stateHeading = 'candidates-state';

	async function focusHeading(id: string) {
		await tick();
		const element = document.getElementById(id);
		element?.focus({ preventScroll: true });
		element?.scrollIntoView({ block: 'nearest' });
	}

	async function deckStopped(failure: DecisionFailure) {
		switch (failure.kind) {
			case 'signed-out':
				toaster.error({ title: recruiterMessages.sessionExpired });
				clearAuthentication();
				return;
			case 'terms':
				loadState = { kind: 'terms' };
				return;
			case 'no-space':
				loadState = { kind: 'no-space' };
				return;
			case 'job-gone':
				loadState = { kind: 'not-found' };
				return;
			case 'off':
				loadState = { kind: 'off' };
				return;
			case 'job-not-proposed':
				// No longer proposed (put on hold, taken out of matching, back in review): the posting
				// as it is now says why. Stopped first, so that no deck reads again meanwhile
				stopped = failure;
				if (user?._id) {
					await load(user._id, jobId);
					if (standing !== 'live') {
						await focusHeading(stateHeading);
						return;
					}
				}
				await focusHeading(stopHeading);
				return;
		}
		stopped = failure;
		await focusHeading(stopHeading);
	}

	function startAgain() {
		stopped = null;
		deckRun++;
	}

	const loadCards = () => readCandidates(jobId);

	async function decide(card: RecruiterCard, decision: MatchDecision) {
		const result = await answerCandidate(jobId, card.token, decision);
		// A mutual interest made by the recruiter is seen by them; the badge is read again anyway
		void refreshNotifications();
		return result;
	}

	const undo = (card: RecruiterCard) => undoCandidateAnswer(jobId, card.token);

	const linkClass = 'btn preset-filled-primary-700-300 min-h-11 max-w-full whitespace-normal';
</script>

<svelte:head>
	<title>{m.pageTitle(job ? job.title : m.jobDescription)}</title>
</svelte:head>

<div class="p-4 md:p-6">
	<div class="mx-auto w-full max-w-3xl space-y-6">
		<a
			href={resolve('/(app)/recruiter/jobs/[id]', { id: jobId })}
			class="btn btn-sm -ms-2 px-2 text-surface-700-300 hover:preset-tonal"
		>
			<ArrowLeft size="16" aria-hidden="true" />
			{m.backToJob}
		</a>

		{#if job && !matching}
			<PageNotice title={matchingText.unavailable.title} icon={EyeSlash}>
				<p>{m.unavailable.text}</p>
				{#snippet actions()}
					<a href={resolve('/(app)/recruiter/jobs/[id]', { id: jobId })} class={linkClass}
						>{m.backToJob}</a
					>
				{/snippet}
			</PageNotice>
		{:else if job && matching && standing}
			<div class="space-y-1">
				<h2 class="text-2xl font-bold break-words md:text-3xl">{m.heading}</h2>
				<p class="font-medium break-words">{job.title}</p>
				<p class="text-sm text-surface-700-300">{m.intro}</p>
			</div>

			{#if standing !== 'live'}
				<PageNotice
					title={m.notProposed.title}
					icon={standing === 'paused' ? PauseCircle : EyeSlash}
					headingId={stateHeading}
				>
					{#if standing === 'off'}
						<p>{canProposeJob(job.status) ? m.notProposed.off : m.notProposed.notOpen}</p>
					{:else if standing === 'rejected'}
						<p>{m.notProposed.rejected}</p>
						<blockquote
							class="border-s-4 border-error-500 ps-3 text-start break-words whitespace-pre-line"
							data-review-reason
						>
							{matching.review?.reason ?? ''}
						</blockquote>
					{:else}
						<p>{m.notProposed[standing]}</p>
					{/if}
					{#snippet actions()}
						<a href={resolve('/(app)/recruiter/jobs/[id]', { id: jobId })} class={linkClass}
							>{m.backToJob}</a
						>
					{/snippet}
				</PageNotice>
			{:else if stale}
				<PageNotice title={m.notProposed.title} icon={EyeSlash} headingId={stopHeading}>
					<p>{m.notProposed.stale}</p>
					{#snippet actions()}
						<a href={resolve('/(app)/recruiter/jobs/[id]/edit', { id: jobId })} class={linkClass}
							>{m.notProposed.edit}</a
						>
						<a
							href={resolve('/(app)/recruiter/jobs/[id]', { id: jobId })}
							class="btn preset-tonal min-h-11">{m.backToJob}</a
						>
					{/snippet}
				</PageNotice>
			{:else if stopped}
				<PageNotice
					title={m.stopped}
					icon={ExclamationTriangle}
					tone="error"
					headingId={stopHeading}
				>
					<p>{stopped.message}</p>
					{#snippet actions()}
						<button type="button" class={linkClass} onclick={startAgain}>
							<ArrowPath size="18" aria-hidden="true" />
							{common.retry}
						</button>
					{/snippet}
				</PageNotice>
			{:else}
				{#key `${jobId}:${deckRun}`}
					<MatchDeck
						side="recruiter"
						label={m.deck}
						key={(card: RecruiterCard) => card.token}
						load={loadCards}
						{decide}
						{undo}
						onStop={deckStopped}
					>
						{#snippet card(entry, headingId)}
							<CandidateCard
								card={entry.card}
								outcomes={entry.outcomes}
								interested={entry.interested}
								{headingId}
								headingLevel={3}
							/>
						{/snippet}
						{#snippet empty(headingId)}
							<section
								class="card preset-outlined-surface-200-800 space-y-3 bg-surface-50-950 p-6 text-center"
								aria-labelledby={headingId}
								data-deck-empty
							>
								<h3
									id={headingId}
									tabindex="-1"
									class="rounded-base text-xl font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
								>
									{m.empty.title}
								</h3>
								<p class="mx-auto max-w-md text-surface-700-300">{m.empty.text}</p>
								<a
									href={resolve('/(app)/recruiter/jobs/[id]', { id: jobId })}
									class="btn preset-tonal min-h-11">{m.backToJob}</a
								>
							</section>
						{/snippet}
					</MatchDeck>
				{/key}
			{/if}
		{:else if !$sessionCheckedStore || loadState.kind === 'loading' || (user && loadState.kind === 'idle' && user.recruiter !== false)}
			<EditorPlaceholder />
		{:else if !user}
			<PageNotice title={jobPage.signedOut.title} icon={LockClosed}>
				<p>{jobPage.signedOut.text}</p>
				{#snippet actions()}
					<a href={recruiterHref} class={linkClass}>{jobPage.signedOut.action}</a>
				{/snippet}
			</PageNotice>
		{:else if user.recruiter === false || loadState.kind === 'no-space'}
			<PageNotice title={jobPage.noSpace.title} icon={Briefcase}>
				<p>{jobPage.noSpace.text}</p>
				{#snippet actions()}
					<a href={recruiterHref} class={linkClass}>{jobPage.noSpace.action}</a>
				{/snippet}
			</PageNotice>
		{:else if loadState.kind === 'terms'}
			<TermsAcceptance
				{user}
				source="recruiter"
				required
				level={2}
				onAccepted={() => {
					stopped = null;
					deckRun++;
					retry();
				}}
			/>
		{:else if loadState.kind === 'off'}
			<PageNotice title={matchingText.unavailable.title} icon={EyeSlash}>
				<p>{m.unavailable.text}</p>
				{#snippet actions()}
					<a href={resolve('/(app)/recruiter/jobs/[id]', { id: jobId })} class={linkClass}
						>{m.backToJob}</a
					>
				{/snippet}
			</PageNotice>
		{:else if loadState.kind === 'not-found'}
			<PageNotice title={jobPage.notFound.title} icon={DocumentMagnifyingGlass}>
				<p>{jobPage.notFound.text}</p>
				{#snippet actions()}
					<a href={recruiterHref} class={linkClass}>{jobPage.backToJobs}</a>
				{/snippet}
			</PageNotice>
		{:else}
			<PageNotice title={jobPage.loadFailed} icon={ExclamationTriangle} tone="error">
				<p>{recruiterMessages.loadFailed}</p>
				{#snippet actions()}
					<button type="button" class={linkClass} onclick={retry}>{common.retry}</button>
					<a href={recruiterHref} class="btn preset-tonal min-h-11">{jobPage.backToJobs}</a>
				{/snippet}
			</PageNotice>
		{/if}
	</div>
</div>
