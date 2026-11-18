<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		ArrowPath,
		Briefcase,
		DocumentArrowUp,
		ExclamationTriangle,
		Eye,
		InformationCircle,
		PencilSquare,
		Plus,
		Trash,
		Users
	} from 'svelte-heros-v2';
	import { currentConsent } from 'portfolio-common';
	import Rich from '#lib/i18n/Rich.svelte';
	import { common } from '#lib/i18n/common.messages.ts';
	import { SIGN_IN_ID } from '#components/Login.svelte';
	import TermsAcceptance from '#components/account/TermsAcceptance.svelte';
	import AgeTermsConsent from '#components/legal/AgeTermsConsent.svelte';
	import RecruiterRules from '#components/legal/RecruiterRules.svelte';
	import JobCard from '#components/jobs/JobCard.svelte';
	import JobImport from '#components/job-import/JobImport.svelte';
	import PageNotice from '#components/job-editor/PageNotice.svelte';
	import ConfirmDialog from '#components/recruiter/ConfirmDialog.svelte';
	import RecruiterLanding from '#components/recruiter/RecruiterLanding.svelte';
	import UpcomingMeetings from '#components/recruiter/UpcomingMeetings.svelte';
	import { portfolioApi } from '#services';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { clearAuthentication, isSessionValid } from '#services/authentication.ts';
	import { errorStatus } from '#services/apiErrors.ts';
	import { hasAcceptedCurrentTerms, isConsentProblem, switchMode } from '#services/account.ts';
	import { toaster } from '#services/toaster.ts';
	import {
		clearJobDraft,
		jobDraftStorageKey,
		loadImportedDraft,
		type ImportedJobDraft
	} from '#services/jobDrafts.ts';
	import {
		importedToastText,
		jobImportAllowanceText,
		jobImportAvailability,
		type JobImportStatus
	} from '#services/jobImport.ts';
	import {
		applicantCountText,
		networkError,
		deleteJobText,
		failureText,
		filterJobs,
		formatDay,
		isoDate,
		shownJobsText,
		statusFilters,
		type RecruiterJob,
		type StatusFilter
	} from '#services/recruiter.ts';
	import { m as recruiterMessages } from '#services/recruiter.messages.ts';
	import { m } from './page.messages.ts';

	// The recruiter's dashboard: the meetings they booked on candidates' Hire pages
	// (UpcomingMeetings, GET /appointments/booked), their job descriptions (GET /recruiter/jobs), with the PDF import
	// (GET / POST /jobs/import) and deletion. Signed out: what the space does and a sign-in (the
	// age and terms box first); signed in without a recruiter space: a button to create it, after
	// the age and terms box for an account that has not accepted the terms in force (the one place,
	// with the job step of a hiring journey, where a recruiter space is created); a recruiter who
	// has not accepted the terms in force (the API answers 422 on `consent`): the terms to accept
	// before anything else. Rendered in the browser only (recruiter/+layout.ts).

	type ListState =
		| { kind: 'idle' }
		| { kind: 'loading'; userId: string }
		| { kind: 'loaded'; userId: string; jobs: RecruiterJob[] }
		| { kind: 'no-space'; userId: string }
		| { kind: 'terms'; userId: string }
		| { kind: 'error'; userId: string };

	const withCredentials = { fetch: { credentials: 'include' } } as const;
	const SESSION_EXPIRED = recruiterMessages.sessionExpired;

	// The signed-in account, once the session has been checked with the API
	let user = $derived(
		$sessionCheckedStore && isSessionValid($authenticationStore)
			? $authenticationStore.user
			: undefined
	);

	let listState = $state.raw<ListState>({ kind: 'idle' });
	// The account whose list was asked for last: an older answer is ignored
	let requested: string | null = null;

	let heading: HTMLElement | undefined = $state();
	// Focus the heading once it shows (after a sign-in or the creation of the space)
	let focusHeading = false;

	async function loadJobs(userId: string) {
		requested = userId;
		listState = { kind: 'loading', userId };
		deleting = null;
		// This account's own (kept in this browser): never the one of the account signed in before
		pendingImport = loadImportedDraft(userId) ?? null;
		try {
			const { data, error } = await portfolioApi.recruiter.jobs.get(withCredentials);
			if (requested !== userId) return;
			if (error || !data) {
				const code = errorStatus(error);
				if (code === 401) {
					// The page then offers to sign in; signing in again loads the list
					requested = null;
					listState = { kind: 'idle' };
					clearAuthentication();
				} else if (code === 403) {
					listState = { kind: 'no-space', userId };
				} else if (isConsentProblem(code, error?.value)) {
					// The terms in force are not accepted: the page asks for them first
					listState = { kind: 'terms', userId };
				} else {
					listState = { kind: 'error', userId };
				}
				return;
			}
			listState = { kind: 'loaded', userId, jobs: data.jobs };
			if (focusHeading) {
				focusHeading = false;
				await tick();
				heading?.focus();
			}
		} catch {
			if (requested === userId) listState = { kind: 'error', userId };
		}
	}

	// --- Import (when the API has it on) --------------------------------------------------

	let importStatus = $state<JobImportStatus | null>(null);
	let importOpen = $state(false);
	// The recruiter the dialog was mounted for: it stays after a 401 (its message says so)
	let importUserId = $state<string | null>(null);
	let importTrigger: HTMLButtonElement | undefined = $state();
	let importDialog: ReturnType<typeof JobImport> | undefined = $state();
	// An import read earlier but not saved as a posting yet (kept in this browser)
	let pendingImport = $state.raw<ImportedJobDraft | null>(null);

	let importAvailability = $derived(
		importStatus?.enabled ? jobImportAvailability(importStatus) : null
	);

	async function refreshImportStatus() {
		try {
			const { data } = await portfolioApi.jobs.import.get(withCredentials);
			if (data) importStatus = data;
		} catch {
			// Unknown for now: the button stays as it was
		}
	}

	function openImport() {
		// Read again: it may have been saved as a posting, or replaced, in another tab
		if (user) pendingImport = loadImportedDraft(user._id) ?? null;
		importOpen = true;
	}

	async function onImported({ fileName, warnings }: { fileName: string; warnings: string[] }) {
		importOpen = false;
		toaster.success({
			title: m.imported,
			description: importedToastText(fileName, warnings)
		});
		await tick();
		await goto(resolve('/(app)/recruiter/jobs/new?import=1'));
	}

	$effect(() => {
		const userId = user?._id;
		const hasSpace = user?.recruiter;
		if (!userId) {
			// Signed out (or the session ended): the landing shows. Signing in again (maybe with
			// another account) reloads: nothing of this account is kept meanwhile
			requested = null;
			untrack(() => {
				listState = { kind: 'idle' };
				pendingImport = null;
			});
			return;
		}
		// No recruiter space: the page offers to create it (unknown: the API decides)
		if (hasSpace === false || requested === userId) return;
		untrack(() => {
			importUserId = userId;
			importStatus = null;
			loadJobs(userId);
			refreshImportStatus();
		});
	});

	// --- Recruiter space -------------------------------------------------------------------

	let creatingSpace = $state(false);
	let createError = $state('');
	const consentId = 'recruiter-space-consent';
	/** The age and terms box, ticked to create the space */
	let consent = $state(false);
	let consentError = $state('');
	/** The API asked for the confirmation although the session said the terms were accepted */
	let consentAsked = $state(false);
	// Asked of an account that has not accepted the terms in force: creating the space records them
	let needsConsent = $derived(!!user && (consentAsked || !hasAcceptedCurrentTerms(user)));

	async function createSpace() {
		const userId = user?._id;
		if (creatingSpace || !userId) return;
		createError = '';
		if (needsConsent && !consent) {
			consentError = m.space.tickTheBox;
			document.getElementById(consentId)?.focus();
			return;
		}
		creatingSpace = true;
		// This function loads the list once the space exists: the effect above, run again when
		// switchMode stores the account, leaves it alone (one load, not two)
		const before = requested;
		requested = userId;
		const result = await switchMode('recruiter', needsConsent ? currentConsent() : undefined);
		creatingSpace = false;
		if (!result.ok) {
			// Unless the session ended meanwhile (the effect then forgot the account)
			if (requested === userId) requested = before;
			if (result.reason === 'session-expired') {
				toaster.error({ title: result.message });
			} else if (result.cause === 'consent') {
				// The box shows (again): ticking it is what is missing, unless this page is outdated
				consentAsked = true;
				consent = false;
				consentError = result.message;
				await tick();
				document.getElementById(consentId)?.focus();
			} else {
				createError = result.message;
			}
			return;
		}
		toaster.success({
			title: m.space.ready,
			description: m.space.readyDescription
		});
		// Signed out, or into another account, meanwhile: the effect has taken over
		if (user?._id !== userId || requested !== userId) return;
		focusHeading = true;
		importUserId = userId;
		importStatus = null;
		loadJobs(userId);
		refreshImportStatus();
	}

	// --- The list ---------------------------------------------------------------------------

	let jobs = $derived(listState.kind === 'loaded' ? listState.jobs : []);
	let filters = $derived(statusFilters(jobs));
	let filter = $state<StatusFilter>('all');
	// A filter with nothing left (its last posting deleted) shows them all again
	let activeFilter = $derived(filters.some((option) => option.value === filter) ? filter : 'all');
	let shownJobs = $derived(filterJobs(jobs, activeFilter));
	let filterAnnouncement = $state('');

	function selectFilter(value: StatusFilter) {
		filter = value;
		filterAnnouncement = shownJobsText(filterJobs(jobs, value).length, jobs.length, value);
	}

	const jobHref = (id: string) => resolve('/(app)/recruiter/jobs/[id]', { id });

	// --- Delete ----------------------------------------------------------------------------

	let deleting = $state<{ job: RecruiterJob; busy: boolean; error: string } | null>(null);
	// Where the focus goes once the dialog closes: the next posting, else the heading
	let focusAfterDelete: HTMLElement | null = null;

	function askDelete(job: RecruiterJob) {
		focusAfterDelete = null;
		deleting = { job, busy: false, error: '' };
	}

	/** The posting is gone: off the list, its editor draft forgotten, the focus on a neighbour */
	function removeFromList(id: string, userId: string) {
		if (listState.kind !== 'loaded') return;
		const index = shownJobs.findIndex((job) => job._id === id);
		const neighbour = shownJobs[index + 1] ?? shownJobs[index - 1];
		focusAfterDelete = neighbour
			? document.querySelector<HTMLElement>(`[data-job-card="${neighbour._id}"] h3 a`)
			: (heading ?? null);
		listState = { ...listState, jobs: listState.jobs.filter((job) => job._id !== id) };
		clearJobDraft(jobDraftStorageKey(userId, id));
	}

	async function confirmDelete() {
		const current = deleting;
		const userId = user?._id;
		if (!current || current.busy || !userId) return;
		const { job } = current;
		deleting = { ...current, busy: true, error: '' };
		try {
			const { error } = await portfolioApi.jobs({ id: job._id }).delete(undefined, withCredentials);
			if (error) {
				const code = errorStatus(error);
				if (code === 404) {
					removeFromList(job._id, userId);
					deleting = null;
					toaster.info({ title: m.alreadyDeleted });
				} else if (code === 401) {
					deleting = null;
					clearAuthentication();
					toaster.error({ title: SESSION_EXPIRED });
				} else {
					deleting = {
						job,
						busy: false,
						error: failureText(error.value, recruiterMessages.deleteJobFailed)
					};
				}
				return;
			}
			removeFromList(job._id, userId);
			deleting = null;
			toaster.success({ title: recruiterMessages.jobDeleted, description: job.title });
		} catch {
			deleting = { job, busy: false, error: networkError() };
		}
	}

	/** After a dialog closed on an expired session: the header's sign-in (else the default) */
	const signedOutFocus = () => (user ? null : document.getElementById(SIGN_IN_ID));

	let importAllowance: HTMLElement | undefined = $state();

	/**
	 * Where the focus goes when the import dialog closes: back to "Import from PDF", else (the
	 * import became unavailable meanwhile: the button is disabled or gone) to what says why, else
	 * to the heading; to the header's sign-in once the session ended
	 */
	const importFinalFocus = (): HTMLElement | null => {
		if (importTrigger?.isConnected && !importTrigger.disabled) return importTrigger;
		if (!user) return signedOutFocus();
		if (importAllowance?.isConnected) return importAllowance;
		return heading?.isConnected ? heading : null;
	};

	beforeNavigate((navigation) => {
		// A PDF being read: leaving now would lose an import that counts. Back, a link or a reload
		// waits (the browser asks before a reload or closing the tab)
		if (importDialog?.isBusy()) {
			navigation.cancel();
			return;
		}
		// Close the dialogs before the page unmounts (their focus trap would read a destroyed page)
		importOpen = false;
		deleting = null;
	});
</script>

<svelte:head>
	<title>{m.pageTitle}</title>
</svelte:head>

<div class="p-4 md:p-6">
	<div class="mx-auto w-full max-w-4xl space-y-6">
		{#if !$sessionCheckedStore}
			{@render placeholder()}
		{:else if !user}
			<RecruiterLanding onSignedIn={() => (focusHeading = true)} />
		{:else if user.recruiter === false || listState.kind === 'no-space'}
			<PageNotice title={m.space.title} icon={Briefcase}>
				<p>{m.space.text}</p>
				<div class="pt-2 text-start">
					{#if needsConsent}
						<AgeTermsConsent
							bind:checked={consent}
							error={consent ? undefined : consentError || undefined}
							disabled={creatingSpace}
							id={consentId}
							recruiter
						/>
					{:else}
						<RecruiterRules />
					{/if}
				</div>
				{#if createError}
					<p
						class="flex items-start justify-center gap-2 text-sm font-medium text-error-700-300"
						role="alert"
					>
						<ExclamationTriangle size="18" class="shrink-0" aria-hidden="true" />
						{createError}
					</p>
				{/if}
				{#snippet actions()}
					<button
						type="button"
						class="btn preset-filled-primary-700-300 min-h-11"
						aria-disabled={creatingSpace ? 'true' : undefined}
						onclick={createSpace}
					>
						{#if creatingSpace}
							<ArrowPath
								size="18"
								class="animate-spin motion-reduce:animate-none"
								aria-hidden="true"
							/>
							{m.space.creating}
						{:else}
							<Plus size="18" aria-hidden="true" />
							{m.space.create}
						{/if}
					</button>
				{/snippet}
			</PageNotice>
		{:else if listState.kind === 'terms'}
			<!-- Nothing of the space before the terms in force are accepted (the API refuses it) -->
			<TermsAcceptance
				{user}
				source="recruiter"
				required
				level={2}
				onAccepted={() => {
					if (listState.kind !== 'terms') return;
					focusHeading = true;
					loadJobs(listState.userId);
					refreshImportStatus();
				}}
			/>
		{:else}
			<!-- First: a meeting may be about to start -->
			<UpcomingMeetings userId={user._id} />

			<div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
				<div class="min-w-0 space-y-1">
					<h2 bind:this={heading} tabindex="-1" class="text-2xl font-bold outline-none md:text-3xl">
						{m.title}
					</h2>
					<p class="text-surface-700-300">{m.lead}</p>
				</div>
				{#if jobs.length > 0}
					{@render listActions('sm:items-end')}
				{/if}
			</div>

			{#if pendingImport}
				<div
					class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-container preset-tonal-primary px-4 py-3 text-sm"
				>
					<InformationCircle size="20" class="shrink-0" aria-hidden="true" />
					<p class="min-w-60 flex-1 text-surface-950-50">
						<Rich text={m.pendingImport}>
							{#snippet file(fallback)}
								<span class="font-semibold wrap-anywhere"
									>{pendingImport?.fileName || fallback}</span
								>
							{/snippet}
						</Rich>
					</p>
					<a
						href={resolve('/(app)/recruiter/jobs/new?import=1')}
						class="btn btn-sm preset-filled-primary-700-300 min-h-9"
					>
						{m.continueEditing}
					</a>
				</div>
			{/if}

			{#if listState.kind === 'error'}
				<PageNotice title={m.loadFailed} icon={ExclamationTriangle} tone="error">
					<p>{recruiterMessages.loadFailed}</p>
					{#snippet actions()}
						<button
							type="button"
							class="btn preset-filled-primary-700-300 min-h-11"
							onclick={() => loadJobs(listState.kind === 'error' ? listState.userId : '')}
						>
							{common.retry}
						</button>
					{/snippet}
				</PageNotice>
			{:else if listState.kind !== 'loaded'}
				{@render placeholder()}
			{:else if jobs.length === 0}
				<section
					class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-4 p-6 text-center md:p-10"
					aria-labelledby="empty-jobs-title"
				>
					<div
						class="mx-auto flex size-12 items-center justify-center rounded-full preset-tonal-primary"
					>
						<Briefcase size="24" aria-hidden="true" />
					</div>
					<h3 id="empty-jobs-title" class="text-xl font-bold">{m.empty.title}</h3>
					<p class="mx-auto max-w-md text-surface-700-300">
						{importStatus?.enabled ? m.empty.textWithImport : m.empty.text}
					</p>
					{@render listActions('items-center')}
				</section>
			{:else}
				{#if filters.length > 0}
					<div
						class="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0"
						role="group"
						aria-label={m.filterByStatus}
					>
						<div class="flex w-max gap-1.5">
							{#each filters as option (option.value)}
								<button
									type="button"
									class="btn btn-sm min-h-9 gap-1.5 {option.value === activeFilter
										? 'preset-filled-primary-700-300'
										: 'preset-tonal'}"
									aria-pressed={option.value === activeFilter}
									onclick={() => selectFilter(option.value)}
								>
									{option.label}
									<span
										class="rounded-full px-1.5 text-xs tabular-nums {option.value === activeFilter
											? 'bg-surface-50/25'
											: 'bg-surface-500/15'}"
									>
										{option.count}
									</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}
				<p class="sr-only" aria-live="polite">{filterAnnouncement}</p>

				<ul class="space-y-3" aria-label={m.jobDescriptions}>
					{#each shownJobs as job (job._id)}
						<li data-job-card={job._id}>
							<JobCard {job} href={jobHref(job._id)} showStatus>
								{#snippet meta()}
									<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
										<p class="flex flex-wrap items-center gap-x-4 gap-y-1">
											<a
												href={resolve('/(app)/recruiter/jobs/[id]#applicants', { id: job._id })}
												class="inline-flex items-center gap-1.5 font-medium hover:underline"
											>
												<Users size="16" aria-hidden="true" />
												{applicantCountText(job.applicantCount)}
											</a>
											<span>
												<Rich text={m.updated(formatDay(job.updatedAt))}>
													{#snippet time(day)}
														<time datetime={isoDate(job.updatedAt)}>{day}</time>
													{/snippet}
												</Rich>
											</span>
										</p>
										<div class="flex flex-wrap gap-1">
											<a
												href={resolve('/(app)/recruiter/jobs/[id]', { id: job._id })}
												class="btn btn-sm min-h-9 hover:preset-tonal"
											>
												<Eye size="16" aria-hidden="true" />
												{m.view}<span class="sr-only">{m.ofJob(job.title)}</span>
											</a>
											<a
												href={resolve('/(app)/recruiter/jobs/[id]/edit', { id: job._id })}
												class="btn btn-sm min-h-9 hover:preset-tonal"
											>
												<PencilSquare size="16" aria-hidden="true" />
												{common.edit}<span class="sr-only">{m.ofJob(job.title)}</span>
											</a>
											<button
												type="button"
												class="btn btn-sm min-h-9 text-error-700-300 hover:preset-tonal-error"
												onclick={() => askDelete(job)}
											>
												<Trash size="16" aria-hidden="true" />
												{common.delete}<span class="sr-only">{m.ofJob(job.title)}</span>
											</button>
										</div>
									</div>
								{/snippet}
							</JobCard>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
</div>

{#snippet placeholder()}
	<div class="space-y-4" aria-busy="true">
		<p class="sr-only" role="status">{common.loading}</p>
		{#each [0, 1, 2] as row (row)}
			<div
				class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-3 p-4 sm:p-5"
				aria-hidden="true"
			>
				<div class="placeholder h-5 w-2/3 animate-pulse motion-reduce:animate-none"></div>
				<div class="placeholder h-4 w-1/3 animate-pulse motion-reduce:animate-none"></div>
				<div class="placeholder h-4 w-1/2 animate-pulse motion-reduce:animate-none"></div>
			</div>
		{/each}
	</div>
{/snippet}

{#snippet listActions(align: string)}
	{@const allowance = importStatus?.enabled ? jobImportAllowanceText(importStatus) : ''}
	<div class="flex flex-col gap-1.5 max-sm:w-full {align}">
		<div class="flex flex-wrap justify-center gap-2 max-sm:w-full">
			{#if importStatus?.enabled}
				<button
					bind:this={importTrigger}
					type="button"
					class="btn preset-tonal min-h-11 max-sm:flex-1"
					disabled={importAvailability !== 'available'}
					aria-describedby="import-allowance"
					onclick={openImport}
				>
					<DocumentArrowUp size="18" aria-hidden="true" />
					{m.importFromPdf}
				</button>
			{/if}
			<a
				href={resolve('/(app)/recruiter/jobs/new')}
				class="btn preset-filled-primary-700-300 min-h-11 max-sm:flex-1"
			>
				<Plus size="18" aria-hidden="true" />
				{m.newJob}
			</a>
		</div>
		{#if allowance}
			<!-- Focusable from code: where the focus goes when the import closed on a refusal -->
			<p
				bind:this={importAllowance}
				id="import-allowance"
				tabindex="-1"
				class="max-w-sm rounded-base text-xs outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 focus-visible:outline-solid {importAvailability ===
				'available'
					? 'text-surface-700-300'
					: 'font-medium text-warning-800-200'}"
			>
				{allowance}
			</p>
		{/if}
	</div>
{/snippet}

{#if importUserId}
	<JobImport
		bind:this={importDialog}
		open={importOpen}
		status={importStatus}
		userId={importUserId}
		onClose={() => (importOpen = false)}
		{onImported}
		onQuota={(quota) => {
			if (importStatus) importStatus = { ...importStatus, ...quota };
		}}
		refreshStatus={refreshImportStatus}
		{pendingImport}
		finalFocusEl={importFinalFocus}
	/>
{/if}

<ConfirmDialog
	open={!!deleting && !!user}
	title={deleting ? recruiterMessages.deleteJobTitle(deleting.job.title) : ''}
	description={deleting ? deleteJobText(deleting.job.applicantCount) : ''}
	confirmLabel={common.delete}
	busy={deleting?.busy ?? false}
	error={deleting?.error ?? ''}
	onConfirm={confirmDelete}
	onCancel={() => (deleting = null)}
	finalFocusEl={() => (focusAfterDelete?.isConnected ? focusAfterDelete : signedOutFocus())}
/>
