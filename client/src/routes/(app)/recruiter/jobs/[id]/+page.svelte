<script lang="ts">
	import { untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		ArrowLeft,
		Briefcase,
		DocumentDuplicate,
		DocumentMagnifyingGlass,
		ExclamationTriangle,
		LockClosed,
		PencilSquare,
		Trash
	} from 'svelte-heros-v2';
	import {
		JOB_LIMITS,
		highestPayMax,
		isPayRangeTooWide,
		jobTermsLocked,
		locksJobTerms,
		type JobStatus
	} from 'portfolio-common';
	import Rich from '#lib/i18n/Rich.svelte';
	import { common } from '#lib/i18n/common.messages.ts';
	import { SIGN_IN_ID } from '#components/Login.svelte';
	import JobDetails from '#components/jobs/JobDetails.svelte';
	import EditorPlaceholder from '#components/job-editor/EditorPlaceholder.svelte';
	import PageNotice from '#components/job-editor/PageNotice.svelte';
	import TermsAcceptance from '#components/account/TermsAcceptance.svelte';
	import ConfirmDialog from '#components/recruiter/ConfirmDialog.svelte';
	import MatchingPanel from '#components/recruiter/MatchingPanel.svelte';
	import OpenJobDialog from '#components/recruiter/OpenJobDialog.svelte';
	import StatusControl from '#components/recruiter/StatusControl.svelte';
	import { portfolioApi } from '#services';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { clearAuthentication, isSessionValid } from '#services/authentication.ts';
	import { bodyProperty, errorStatus } from '#services/apiErrors.ts';
	import { formatAmount } from '#services/jobPosting.ts';
	import { isConsentProblem } from '#services/account.ts';
	import { clearJobDraft, jobDraftStorageKey } from '#services/jobDrafts.ts';
	import { toaster } from '#services/toaster.ts';
	import {
		duplicateJobHref,
		networkError,
		failureText,
		formatDay,
		isoDate,
		statusChangedText,
		type RecruiterJobDetail
	} from '#services/recruiter.ts';
	import { m as recruiterMessages } from '#services/recruiter.messages.ts';
	import { m } from './page.messages.ts';

	// One of the recruiter's job descriptions (GET /recruiter/jobs/:id): the posting as candidates
	// read it, its status (PUT /jobs/:id/status, confirmed first when it opens the posting: its
	// terms lock, OpenJobDialog), its copy (Duplicate: /recruiter/jobs/new?duplicate=<id>) and its
	// deletion. It is never public: the recruiter shows it to a candidate by picking it on their
	// Hire page, or proposes it to the candidates whose criteria it meets (matching, while the
	// posting carries `matching`: MatchingPanel, under its status). A recruiter who has not
	// accepted the terms in force (422 on `consent`) accepts them first (TermsAcceptance). Rendered
	// in the browser only (recruiter/+layout.ts).

	type LoadState =
		| { kind: 'idle' }
		| { kind: 'loading'; key: string }
		| { kind: 'loaded'; key: string; userId: string; job: RecruiterJobDetail }
		| { kind: 'not-found' }
		| { kind: 'no-space' }
		| { kind: 'terms' }
		| { kind: 'error' };

	const withCredentials = { fetch: { credentials: 'include' } } as const;
	const SESSION_EXPIRED = recruiterMessages.sessionExpired;

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
		loadState = { kind: 'loading', key };
		deleting = null;
		confirmingStatus = null;
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
					// The terms in force are not accepted: the page asks for them first
					loadState = { kind: 'terms' };
				} else if (code === 404 || code === 422) {
					// 422: not a posting id at all
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
			// Signed out (or the session ended): signing in again reloads
			requested = null;
			return;
		}
		if (user?.recruiter === false || !id || requested === `${userId}:${id}`) return;
		untrack(() => load(userId, id));
	});

	const retry = () => {
		if (user?._id) load(user._id, jobId);
	};

	// Only for the account it was loaded for: nothing of it stays on screen once signed out
	let job = $derived(
		loadState.kind === 'loaded' && loadState.userId === user?._id ? loadState.job : null
	);
	let loadedFor = $derived(loadState.kind === 'loaded' ? loadState.userId : '');
	const recruiterHref = resolve('/(app)/recruiter');

	/** Updates the loaded posting (still the same one) */
	function updateJob(change: (job: RecruiterJobDetail) => RecruiterJobDetail) {
		if (loadState.kind !== 'loaded') return;
		loadState = { ...loadState, job: change(loadState.job) };
	}

	/** A request answered 401: the page shows its signed-out state, a toast says why */
	function sessionExpired() {
		toaster.error({ title: SESSION_EXPIRED });
		clearAuthentication();
	}

	// --- Status ----------------------------------------------------------------------------

	let changingStatus = $state(false);
	// The status asked for, until the recruiter confirms it opens the posting (its terms lock)
	let confirmingStatus = $state<JobStatus | null>(null);

	/**
	 * A posting whose range was saved wider than the cap before it cannot be opened (the API answers
	 * 422 on pay.max): the toast says so, with the way to its editor
	 */
	function narrowPayToOpen(id: string, payMin: number) {
		toaster.error({
			title: m.narrowPayToOpen.title,
			description: m.narrowPayToOpen.text(
				formatAmount(highestPayMax(payMin)),
				JOB_LIMITS.pay.maxRangeRatio
			),
			action: {
				label: common.edit,
				onClick: () => goto(resolve('/(app)/recruiter/jobs/[id]/edit', { id }))
			}
		});
	}

	/**
	 * The status control's choice: confirmed first when it opens a posting never opened, unless it
	 * cannot be opened as it is (its range is wider than the cap: nothing to confirm)
	 */
	function chooseStatus(status: JobStatus) {
		if (!job || changingStatus) return;
		if (locksJobTerms(status, job) && isPayRangeTooWide(job.pay)) {
			narrowPayToOpen(job._id, job.pay.min);
			return;
		}
		if (locksJobTerms(status, job)) confirmingStatus = status;
		else changeStatus(status);
	}

	async function changeStatus(status: JobStatus) {
		if (!job || changingStatus) return;
		const id = job._id;
		const payMin = job.pay.min;
		changingStatus = true;
		try {
			const { data, error } = await portfolioApi
				.jobs({ id })
				.status.put({ status }, withCredentials);
			if (error || !data) {
				const code = errorStatus(error);
				if (code === 401) sessionExpired();
				else if (code === 404) loadState = { kind: 'not-found' };
				else if (code === 422 && bodyProperty(error?.value) === 'pay.max') {
					// Its range was saved wider than the cap before it (in another tab since this page
					// loaded): narrowed in the editor first
					narrowPayToOpen(id, payMin);
				} else {
					toaster.error({
						title: failureText(error?.value, m.statusFailed)
					});
				}
				return;
			}
			updateJob((current) => ({ ...current, ...data }));
			toaster.success(statusChangedText(data.status));
		} catch {
			toaster.error({ title: networkError() });
		} finally {
			changingStatus = false;
		}
	}

	// --- Delete the posting ----------------------------------------------------------------

	let deleting = $state<{ busy: boolean; error: string } | null>(null);

	async function confirmDelete() {
		if (!job || !deleting || deleting.busy || loadState.kind !== 'loaded') return;
		const { _id: id, title } = job;
		const userId = loadState.userId;
		deleting = { busy: true, error: '' };
		try {
			const { error } = await portfolioApi.jobs({ id }).delete(undefined, withCredentials);
			const code = errorStatus(error);
			if (error && code !== 404) {
				if (code === 401) {
					deleting = null;
					sessionExpired();
				} else {
					deleting = {
						busy: false,
						error: failureText(error.value, recruiterMessages.deleteJobFailed)
					};
				}
				return;
			}
			// 404: already deleted (in another tab): the same outcome
			clearJobDraft(jobDraftStorageKey(userId, id));
			deleting = null;
			toaster.success({ title: recruiterMessages.jobDeleted, description: title });
			await goto(recruiterHref);
		} catch {
			deleting = { busy: false, error: networkError() };
		}
	}

	/** After a dialog closed on an expired session: the header's sign-in (else the default) */
	const signedOutFocus = () => (user ? null : document.getElementById(SIGN_IN_ID));

	beforeNavigate(() => {
		// Close the dialogs before the page unmounts (their focus trap would read a destroyed page)
		deleting = null;
		confirmingStatus = null;
	});
</script>

<svelte:head>
	<title>{m.pageTitle(job ? job.title : m.jobDescription)}</title>
</svelte:head>

<div class="p-4 md:p-6">
	<div class="mx-auto w-full max-w-6xl space-y-6">
		<a href={recruiterHref} class="btn btn-sm -ms-2 px-2 text-surface-700-300 hover:preset-tonal">
			<ArrowLeft size="16" aria-hidden="true" />
			{m.yourJobs}
		</a>

		{#if job}
			<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start xl:gap-10">
				<JobDetails {job} headingLevel={2}>
					{#snippet actions()}
						<a
							href={resolve('/(app)/recruiter/jobs/[id]/edit', { id: job._id })}
							class="btn preset-tonal min-h-10 max-sm:flex-1"
						>
							<PencilSquare size="18" aria-hidden="true" />
							{common.edit}
						</a>
						<!-- eslint-disable svelte/no-navigation-without-resolve -- resolve()d, with a query -->
						<a
							href={duplicateJobHref(resolve('/(app)/recruiter/jobs/new'), job._id)}
							class="btn preset-tonal min-h-10 max-sm:flex-1"
						>
							<DocumentDuplicate size="18" aria-hidden="true" />
							{m.duplicate}
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
						<button
							type="button"
							class="btn min-h-10 text-error-700-300 hover:preset-tonal-error max-sm:flex-1"
							onclick={() => (deleting = { busy: false, error: '' })}
						>
							<Trash size="18" aria-hidden="true" />
							{common.delete}
						</button>
					{/snippet}
					{#snippet meta()}
						<p class="flex flex-wrap gap-x-4 gap-y-1">
							<span>
								<Rich text={m.updated(formatDay(job.updatedAt))}>
									{#snippet time(day)}<time datetime={isoDate(job.updatedAt)}>{day}</time>{/snippet}
								</Rich>
							</span>
							<span>
								<Rich text={m.created(formatDay(job.createdAt))}>
									{#snippet time(day)}<time datetime={isoDate(job.createdAt)}>{day}</time>{/snippet}
								</Rich>
							</span>
							{#if job.publishedAt}
								<span>
									<Rich text={m.opened(formatDay(job.publishedAt))}>
										{#snippet time(day)}
											<time datetime={isoDate(job.publishedAt)}>{day}</time>
										{/snippet}
									</Rich>
								</span>
							{/if}
						</p>
						{#if jobTermsLocked(job)}
							<p class="mt-1 flex items-start gap-1.5">
								<LockClosed size="16" class="mt-0.5 shrink-0" aria-hidden="true" />
								<span>{m.termsLocked}</span>
							</p>
						{/if}
						<!-- Small screens: the management panel comes after the description -->
						<a href="#manage" class="mt-2 inline-block font-medium underline lg:hidden">
							{m.manageLink}
						</a>
					{/snippet}
				</JobDetails>

				<aside id="manage" class="space-y-4" aria-label={m.manage}>
					<StatusControl status={job.status} busy={changingStatus} onChange={chooseStatus} />
					<MatchingPanel
						{job}
						userId={loadedFor}
						onChange={(updated) => updateJob((current) => ({ ...current, ...updated }))}
						onReload={retry}
						onSessionExpired={sessionExpired}
						onTerms={() => (loadState = { kind: 'terms' })}
						onGone={() => (loadState = { kind: 'not-found' })}
						onNoSpace={() => (loadState = { kind: 'no-space' })}
					/>
				</aside>
			</div>
		{:else if !$sessionCheckedStore || loadState.kind === 'loading' || (user && loadState.kind === 'idle' && user.recruiter !== false)}
			<div class="max-w-3xl"><EditorPlaceholder /></div>
		{:else}
			<div class="mx-auto max-w-3xl">
				{#if !user}
					<PageNotice title={m.signedOut.title} icon={LockClosed}>
						<p>{m.signedOut.text}</p>
						{#snippet actions()}
							<a href={recruiterHref} class="btn preset-filled-primary-700-300 min-h-11">
								{m.signedOut.action}
							</a>
						{/snippet}
					</PageNotice>
				{:else if user.recruiter === false || loadState.kind === 'no-space'}
					<PageNotice title={m.noSpace.title} icon={Briefcase}>
						<p>{m.noSpace.text}</p>
						{#snippet actions()}
							<a href={recruiterHref} class="btn preset-filled-primary-700-300 min-h-11">
								{m.noSpace.action}
							</a>
						{/snippet}
					</PageNotice>
				{:else if loadState.kind === 'terms'}
					<TermsAcceptance {user} source="recruiter" required level={2} onAccepted={retry} />
				{:else if loadState.kind === 'not-found'}
					<PageNotice title={m.notFound.title} icon={DocumentMagnifyingGlass}>
						<p>{m.notFound.text}</p>
						{#snippet actions()}
							<a href={recruiterHref} class="btn preset-filled-primary-700-300 min-h-11">
								{m.backToJobs}
							</a>
						{/snippet}
					</PageNotice>
				{:else}
					<PageNotice title={m.loadFailed} icon={ExclamationTriangle} tone="error">
						<p>{recruiterMessages.loadFailed}</p>
						{#snippet actions()}
							<button
								type="button"
								class="btn preset-filled-primary-700-300 min-h-11"
								onclick={retry}
							>
								{common.retry}
							</button>
							<a href={recruiterHref} class="btn preset-tonal min-h-11">{m.backToJobs}</a>
						{/snippet}
					</PageNotice>
				{/if}
			</div>
		{/if}
	</div>
</div>

<ConfirmDialog
	open={!!deleting && !!job}
	title={job ? recruiterMessages.deleteJobTitle(job.title) : ''}
	description={recruiterMessages.deleteJob}
	confirmLabel={common.delete}
	busy={deleting?.busy ?? false}
	error={deleting?.error ?? ''}
	onConfirm={confirmDelete}
	onCancel={() => (deleting = null)}
	finalFocusEl={signedOutFocus}
/>

<OpenJobDialog
	status={job ? confirmingStatus : null}
	onConfirm={(status) => {
		confirmingStatus = null;
		changeStatus(status);
	}}
	onCancel={() => (confirmingStatus = null)}
	finalFocusEl={signedOutFocus}
/>
