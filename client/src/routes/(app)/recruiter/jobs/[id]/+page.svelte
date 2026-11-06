<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		ArrowLeft,
		ArrowTopRightOnSquare,
		Briefcase,
		Check,
		DocumentMagnifyingGlass,
		ExclamationTriangle,
		Link,
		LockClosed,
		PencilSquare,
		Trash
	} from 'svelte-heros-v2';
	import type { JobStatus } from 'portfolio-common';
	import JobDetails from '#components/jobs/JobDetails.svelte';
	import EditorPlaceholder from '#components/job-editor/EditorPlaceholder.svelte';
	import PageNotice from '#components/job-editor/PageNotice.svelte';
	import AddApplicantForm from '#components/recruiter/AddApplicantForm.svelte';
	import ApplicantList from '#components/recruiter/ApplicantList.svelte';
	import ConfirmDialog from '#components/recruiter/ConfirmDialog.svelte';
	import StatusControl from '#components/recruiter/StatusControl.svelte';
	import { portfolioApi } from '#services';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { clearAuthentication, isSessionValid } from '#services/authentication.ts';
	import { errorStatus } from '#services/apiErrors.ts';
	import { clearJobDraft, jobDraftStorageKey } from '#services/jobDrafts.ts';
	import { toaster } from '#services/toaster.ts';
	import {
		applicantName,
		deleteJobText,
		formatDay,
		hasPublicPage,
		isoDate,
		removeApplicantText,
		statusChangedText,
		type Applicant,
		type RecruiterJobDetail
	} from '#services/recruiter.ts';

	// One of the recruiter's job descriptions (GET /recruiter/jobs/:id): the posting as candidates
	// read it, its status (PUT /jobs/:id/status), its public page, its applicants (added with
	// POST /jobs/:id/applicants, removed with DELETE /jobs/:id/applicants/:applicationId) and its
	// deletion. Rendered in the browser only (recruiter/+layout.ts).

	type LoadState =
		| { kind: 'idle' }
		| { kind: 'loading'; key: string }
		| { kind: 'loaded'; key: string; userId: string; job: RecruiterJobDetail }
		| { kind: 'not-found' }
		| { kind: 'no-space' }
		| { kind: 'error' };

	const withCredentials = { fetch: { credentials: 'include' } } as const;
	const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.';
	const SESSION_EXPIRED = 'Your session expired. Sign in again.';

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

	let applicantsHeading: HTMLElement | undefined = $state();

	async function load(userId: string, id: string) {
		const key = `${userId}:${id}`;
		requested = key;
		loadState = { kind: 'loading', key };
		deleting = null;
		removing = null;
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
				} else if (code === 404 || code === 422) {
					// 422: not a posting id at all
					loadState = { kind: 'not-found' };
				} else {
					loadState = { kind: 'error' };
				}
				return;
			}
			loadState = { kind: 'loaded', key, userId, job: data };
			// Opened from a card's applicant count: the list is the point
			if (page.url.hash === '#applicants') {
				await tick();
				applicantsHeading?.scrollIntoView({ block: 'start' });
				applicantsHeading?.focus({ preventScroll: true });
			}
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

	async function changeStatus(status: JobStatus) {
		if (!job || changingStatus) return;
		const id = job._id;
		changingStatus = true;
		try {
			const { data, error } = await portfolioApi
				.jobs({ id })
				.status.put({ status }, withCredentials);
			if (error || !data) {
				const code = errorStatus(error);
				if (code === 401) sessionExpired();
				else if (code === 404) loadState = { kind: 'not-found' };
				else toaster.error({ title: 'Could not change the status. Try again in a moment.' });
				return;
			}
			// The answer has no applicants: they stay as listed
			updateJob((current) => ({ ...current, ...data, applicants: current.applicants }));
			toaster.success(statusChangedText(data.status));
		} catch {
			toaster.error({ title: NETWORK_ERROR });
		} finally {
			changingStatus = false;
		}
	}

	// --- Public page -----------------------------------------------------------------------

	let publicUrl = $derived(
		job ? new URL(resolve('/(app)/jobs/[id]', { id: job._id }), page.url.origin).href : ''
	);
	let copied = $state(false);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => () => clearTimeout(copiedTimer));

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(publicUrl);
			copied = true;
			clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => (copied = false), 2500);
		} catch {
			toaster.error({
				title: 'Could not copy the link',
				description: 'Select the address and copy it.'
			});
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
					deleting = { busy: false, error: 'Could not delete it. Try again in a moment.' };
				}
				return;
			}
			// 404: already deleted (in another tab): the same outcome
			clearJobDraft(jobDraftStorageKey(userId, id));
			deleting = null;
			toaster.success({ title: 'Job description deleted', description: title });
			await goto(recruiterHref);
		} catch {
			deleting = { busy: false, error: NETWORK_ERROR };
		}
	}

	// --- Applicants ------------------------------------------------------------------------

	let removing = $state<{ applicant: Applicant; busy: boolean; error: string } | null>(null);
	// Where the focus goes once the dialog closes after a removal: the next Remove button
	let focusAfterRemove: HTMLElement | null = null;

	function onAdded(applicant: Applicant) {
		updateJob((current) =>
			current.applicants.some((listed) => listed._id === applicant._id)
				? current
				: { ...current, applicants: [...current.applicants, applicant] }
		);
		toaster.success({ title: `${applicantName(applicant)} added to the applicants` });
	}

	function askRemove(applicant: Applicant) {
		focusAfterRemove = null;
		removing = { applicant, busy: false, error: '' };
	}

	function dropApplicant(applicationId: string) {
		const applicants = job?.applicants ?? [];
		const index = applicants.findIndex((applicant) => applicant._id === applicationId);
		const neighbour = applicants[index + 1] ?? applicants[index - 1];
		focusAfterRemove = neighbour
			? document.querySelector<HTMLElement>(`[data-remove-applicant="${neighbour._id}"]`)
			: (applicantsHeading ?? null);
		updateJob((current) => ({
			...current,
			applicants: current.applicants.filter((applicant) => applicant._id !== applicationId)
		}));
	}

	async function confirmRemove() {
		const current = removing;
		if (!job || !current || current.busy) return;
		const { applicant } = current;
		removing = { ...current, busy: true, error: '' };
		try {
			const { error } = await portfolioApi
				.jobs({ id: job._id })
				.applicants({ applicationId: applicant._id })
				.delete(undefined, withCredentials);
			const code = errorStatus(error);
			if (error && code !== 404) {
				if (code === 401) {
					removing = null;
					sessionExpired();
				} else {
					removing = {
						applicant,
						busy: false,
						error: 'Could not remove this applicant. Try again in a moment.'
					};
				}
				return;
			}
			// 404: already removed (or the candidate withdrew): the same outcome
			dropApplicant(applicant._id);
			removing = null;
			toaster.success({ title: `${applicantName(applicant)} removed from the applicants` });
		} catch {
			removing = { applicant, busy: false, error: NETWORK_ERROR };
		}
	}

	beforeNavigate(() => {
		// Close the dialogs before the page unmounts (their focus trap would read a destroyed page)
		deleting = null;
		removing = null;
	});
</script>

<svelte:head>
	<title>{job ? job.title : 'Job description'} | Recruiter</title>
</svelte:head>

<div class="p-4 md:p-6">
	<div class="mx-auto w-full max-w-6xl space-y-6">
		<a href={recruiterHref} class="btn btn-sm -ms-2 px-2 text-surface-700-300 hover:preset-tonal">
			<ArrowLeft size="16" aria-hidden="true" />
			Your job descriptions
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
							Edit
						</a>
						<button
							type="button"
							class="btn min-h-10 text-error-700-300 hover:preset-tonal-error max-sm:flex-1"
							onclick={() => (deleting = { busy: false, error: '' })}
						>
							<Trash size="18" aria-hidden="true" />
							Delete
						</button>
					{/snippet}
					{#snippet meta()}
						<p class="flex flex-wrap gap-x-4 gap-y-1">
							<span>
								Updated <time datetime={isoDate(job.updatedAt)}>{formatDay(job.updatedAt)}</time>
							</span>
							<span>
								Created <time datetime={isoDate(job.createdAt)}>{formatDay(job.createdAt)}</time>
							</span>
							{#if job.publishedAt}
								<span>
									Published
									<time datetime={isoDate(job.publishedAt)}>{formatDay(job.publishedAt)}</time>
								</span>
							{/if}
						</p>
						<!-- Small screens: the management panel comes after the description -->
						<a href="#manage" class="mt-2 inline-block font-medium underline lg:hidden">
							Status, public page and applicants ({job.applicants.length})
						</a>
					{/snippet}
				</JobDetails>

				<aside id="manage" class="space-y-4" aria-label="Manage this job description">
					<StatusControl status={job.status} busy={changingStatus} onChange={changeStatus} />

					<section
						class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-3 p-4"
						aria-labelledby="public-page-title"
					>
						<h3 id="public-page-title" class="font-semibold">Public page</h3>
						{#if hasPublicPage(job.status)}
							<p class="text-sm text-surface-700-300">
								{job.status === 'open'
									? 'Share this address: candidates read the job description there and apply with their portfolio.'
									: 'Anyone with this address can read the job description, but cannot apply.'}
							</p>
							<input
								type="text"
								readonly
								value={publicUrl}
								class="input text-sm"
								aria-label="Address of the public page"
								onfocus={(event) => event.currentTarget.select()}
							/>
							<div class="flex flex-wrap gap-2">
								<button
									type="button"
									class="btn btn-sm preset-tonal min-h-9 flex-1"
									onclick={copyLink}
								>
									{#if copied}
										<Check size="16" aria-hidden="true" />
										Copied
									{:else}
										<Link size="16" aria-hidden="true" />
										Copy link
									{/if}
								</button>
								<a
									href={resolve('/(app)/jobs/[id]', { id: job._id })}
									target="_blank"
									rel="noopener noreferrer"
									class="btn btn-sm preset-tonal min-h-9 flex-1"
								>
									<ArrowTopRightOnSquare size="16" aria-hidden="true" />
									Open<span class="sr-only">the public page (new tab)</span>
								</a>
							</div>
							<p class="sr-only" aria-live="polite">{copied ? 'Link copied.' : ''}</p>
						{:else}
							<p class="text-sm text-surface-700-300">
								Drafts have no public page. Change the status to Open to publish it and take
								applications.
							</p>
						{/if}
					</section>

					<section
						id="applicants"
						class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-4 p-4"
						aria-labelledby="applicants-title"
					>
						<div class="flex items-center justify-between gap-2">
							<h3
								bind:this={applicantsHeading}
								id="applicants-title"
								tabindex="-1"
								class="font-semibold outline-none"
							>
								Applicants
							</h3>
							<span class="badge preset-tonal text-xs tabular-nums">
								<span class="sr-only">Count:</span>
								{job.applicants.length}
							</span>
						</div>
						{#if job.applicants.length === 0}
							<p class="text-sm text-surface-700-300">
								{job.status === 'open'
									? 'No applicants yet. Candidates apply from the public page with their portfolio.'
									: 'No applicants yet. Candidates can apply once the job description is Open.'}
								You can also add a portfolio you found.
							</p>
						{:else}
							<ApplicantList
								applicants={job.applicants}
								removingId={removing?.busy ? removing.applicant._id : null}
								onRemove={askRemove}
							/>
						{/if}
						<div class="border-t border-surface-200-800 pt-4">
							<AddApplicantForm jobId={job._id} {onAdded} />
						</div>
					</section>
				</aside>
			</div>
		{:else if !$sessionCheckedStore || loadState.kind === 'loading' || (user && loadState.kind === 'idle' && user.recruiter !== false)}
			<div class="max-w-3xl"><EditorPlaceholder /></div>
		{:else}
			<div class="mx-auto max-w-3xl">
				{#if !user}
					<PageNotice title="Sign in as a recruiter" icon={LockClosed}>
						<p>Sign in to see this job description and its applicants.</p>
						{#snippet actions()}
							<a href={recruiterHref} class="btn preset-filled-primary-700-300 min-h-11">
								Sign in as a recruiter
							</a>
						{/snippet}
					</PageNotice>
				{:else if user.recruiter === false || loadState.kind === 'no-space'}
					<PageNotice title="Create your recruiter space first" icon={Briefcase}>
						<p>Your account has no recruiter space yet. Create it to write job descriptions.</p>
						{#snippet actions()}
							<a href={recruiterHref} class="btn preset-filled-primary-700-300 min-h-11">
								Open the recruiter space
							</a>
						{/snippet}
					</PageNotice>
				{:else if loadState.kind === 'not-found'}
					<PageNotice title="Job description not found" icon={DocumentMagnifyingGlass}>
						<p>
							It may have been deleted, or it belongs to another recruiter account. Your job
							descriptions are listed in your recruiter space.
						</p>
						{#snippet actions()}
							<a href={recruiterHref} class="btn preset-filled-primary-700-300 min-h-11">
								Back to your job descriptions
							</a>
						{/snippet}
					</PageNotice>
				{:else}
					<PageNotice
						title="Could not load this job description"
						icon={ExclamationTriangle}
						tone="error"
					>
						<p>
							The server could not be reached, or it failed. Check your connection and try again.
						</p>
						{#snippet actions()}
							<button
								type="button"
								class="btn preset-filled-primary-700-300 min-h-11"
								onclick={retry}
							>
								Try again
							</button>
							<a href={recruiterHref} class="btn preset-tonal min-h-11"
								>Back to your job descriptions</a
							>
						{/snippet}
					</PageNotice>
				{/if}
			</div>
		{/if}
	</div>
</div>

<ConfirmDialog
	open={!!deleting && !!job}
	title={job ? `Delete “${job.title}”?` : ''}
	description={job ? deleteJobText(job.applicants.length) : ''}
	confirmLabel="Delete"
	busy={deleting?.busy ?? false}
	error={deleting?.error ?? ''}
	onConfirm={confirmDelete}
	onCancel={() => (deleting = null)}
/>

<ConfirmDialog
	open={!!removing && !!job}
	title={removing ? `Remove ${applicantName(removing.applicant)}?` : ''}
	description={removing ? removeApplicantText(removing.applicant) : ''}
	confirmLabel="Remove"
	busyLabel="Removing…"
	busy={removing?.busy ?? false}
	error={removing?.error ?? ''}
	onConfirm={confirmRemove}
	onCancel={() => (removing = null)}
	finalFocusEl={() => (focusAfterRemove?.isConnected ? focusAfterRemove : null)}
/>
