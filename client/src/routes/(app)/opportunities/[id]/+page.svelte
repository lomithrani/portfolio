<script lang="ts">
	import { untrack } from 'svelte';
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
	import { portfolioTextApi } from '#services';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { clearAuthentication, isSessionValid } from '#services/authentication.ts';
	import { errorStatus } from '#services/apiErrors.ts';
	import { formatDay, isoDate } from '#services/recruiter.ts';
	import { m as recruiterMessages } from '#services/recruiter.messages.ts';
	import {
		isJobPostingId,
		jobViewFailure,
		jobViewTitle,
		type SharedJob
	} from '#services/jobView.ts';
	import { m } from './page.messages.ts';

	// A job description shared with the signed-in account (GET /opportunities/jobs/:id): the page
	// the meeting invitation of a hiring journey links (the API's job step). Its readers are the
	// portfolio owners on whose journey the recruiter picked it, who read the version the recruiter
	// shared there (dated with when they shared it); its recruiter, who opens the same link, is sent
	// on to their page of it in the recruiter space. Anyone else reads that it is not
	// shared with them (the API answers them as for an unknown id). Private: rendered in the
	// browser only (opportunities/+layout.ts) and not listed by search engines (#lib/robots.ts).

	type LoadState =
		| { kind: 'idle' }
		| { kind: 'loading'; key: string }
		| { kind: 'loaded'; key: string; userId: string; shared: SharedJob }
		| { kind: 'redirecting' }
		| { kind: 'not-shared' }
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
	// What was asked for last (account and posting): an older answer is ignored
	let requested: string | null = null;

	async function load(userId: string, id: string) {
		const key = `${userId}:${id}`;
		requested = key;
		if (!isJobPostingId(id)) {
			// Not a posting's id: shared with nobody
			loadState = { kind: 'not-shared' };
			return;
		}
		loadState = { kind: 'loading', key };
		try {
			const { data, error } = await portfolioTextApi.opportunities
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
				} else {
					loadState = { kind: failure };
				}
				return;
			}
			if (data.access === 'recruiter') {
				// The posting's own recruiter: their page of it, which this one does not stay under in
				// the history (Back leaves both)
				loadState = { kind: 'redirecting' };
				await goto(resolve('/(app)/recruiter/jobs/[id]', { id }), { replaceState: true });
				return;
			}
			loadState = { kind: 'loaded', key, userId, shared: data };
		} catch {
			if (requested === key) loadState = { kind: 'error' };
		}
	}

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

	const retry = () => {
		if (user?._id) load(user._id, jobId);
	};

	// Only for the account it was loaded for: nothing of it stays on screen once signed out
	let job = $derived(
		loadState.kind === 'loaded' && loadState.userId === user?._id ? loadState.shared.job : null
	);
	// The version shared on the owner's journey: when the recruiter shared it (unset: the posting
	// as it is now, a pick from before versions were kept)
	let sharedAt = $derived(
		job && loadState.kind === 'loaded' ? loadState.shared.sharedAt : undefined
	);
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
		{#if job}
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
					<span>{m.private}</span>
				</p>
			</JobDetails>
		{:else if waiting}
			<EditorPlaceholder />
		{:else if !user}
			<PageNotice title={m.signedOut.title} icon={LockClosed}>
				<p>{m.signedOut.text}</p>
				{#snippet actions()}
					<SignInButton />
				{/snippet}
			</PageNotice>
		{:else if loadState.kind === 'not-shared'}
			<PageNotice title={m.notShared.title} icon={DocumentMagnifyingGlass}>
				<p>{m.notShared.text}</p>
				{#if user.email}
					<p>
						<Rich text={m.notShared.signedInAs(user.email)}>
							{#snippet strong(email)}<strong class="wrap-anywhere">{email}</strong>{/snippet}
						</Rich>
					</p>
				{/if}
				{#snippet actions()}
					<a href={resolve('/(site)')} class="btn preset-filled-primary-700-300 min-h-11">
						{m.notShared.home}
					</a>
				{/snippet}
			</PageNotice>
		{:else}
			<PageNotice title={m.loadFailed.title} icon={ExclamationTriangle} tone="error">
				<p>{recruiterMessages.loadFailed}</p>
				{#snippet actions()}
					<button type="button" class="btn preset-filled-primary-700-300 min-h-11" onclick={retry}>
						{common.retry}
					</button>
				{/snippet}
			</PageNotice>
		{/if}
	</div>
</div>
