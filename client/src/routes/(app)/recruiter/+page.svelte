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
	import JobCard from '#components/jobs/JobCard.svelte';
	import JobImport from '#components/job-import/JobImport.svelte';
	import PageNotice from '#components/job-editor/PageNotice.svelte';
	import ConfirmDialog from '#components/recruiter/ConfirmDialog.svelte';
	import RecruiterLanding from '#components/recruiter/RecruiterLanding.svelte';
	import { portfolioApi } from '#services';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { clearAuthentication, isSessionValid } from '#services/authentication.ts';
	import { errorStatus } from '#services/apiErrors.ts';
	import { switchMode } from '#services/account.ts';
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
		deleteJobText,
		filterJobs,
		formatDay,
		isoDate,
		shownJobsText,
		statusFilters,
		type RecruiterJob,
		type StatusFilter
	} from '#services/recruiter.ts';

	// The recruiter's dashboard: their job descriptions (GET /recruiter/jobs), with the PDF import
	// (GET / POST /jobs/import) and deletion. Signed out: what the space does and a sign-in; signed
	// in without a recruiter space: a button to create it. Rendered in the browser only
	// (recruiter/+layout.ts).

	type ListState =
		| { kind: 'idle' }
		| { kind: 'loading'; userId: string }
		| { kind: 'loaded'; userId: string; jobs: RecruiterJob[] }
		| { kind: 'no-space'; userId: string }
		| { kind: 'error'; userId: string };

	const withCredentials = { fetch: { credentials: 'include' } } as const;
	const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.';
	const SESSION_EXPIRED = 'Your session expired. Sign in again.';

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
				} else {
					listState = { kind: 'error', userId };
				}
				return;
			}
			listState = { kind: 'loaded', userId, jobs: data.jobs };
			pendingImport = loadImportedDraft(userId) ?? null;
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

	async function onImported({ fileName, warnings }: { fileName: string; warnings: string[] }) {
		importOpen = false;
		toaster.success({
			title: 'Job description imported',
			description: importedToastText(fileName, warnings)
		});
		await tick();
		await goto(resolve('/(app)/recruiter/jobs/new?import=1'));
	}

	$effect(() => {
		const userId = user?._id;
		const hasSpace = user?.recruiter;
		if (!userId) {
			// Signed out (or the session ended): the landing shows. Signing in again reloads
			requested = null;
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

	async function createSpace() {
		if (creatingSpace) return;
		creatingSpace = true;
		createError = '';
		const result = await switchMode('recruiter');
		creatingSpace = false;
		if (!result.ok) {
			if (result.reason === 'session-expired') toaster.error({ title: result.message });
			else createError = result.message;
			return;
		}
		toaster.success({
			title: 'Your recruiter space is ready',
			description: 'Write your first job description, or import one from a PDF.'
		});
		focusHeading = true;
		importUserId = result.user._id;
		loadJobs(result.user._id);
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
					toaster.info({ title: 'This job description was already deleted' });
				} else if (code === 401) {
					deleting = null;
					clearAuthentication();
					toaster.error({ title: SESSION_EXPIRED });
				} else {
					deleting = { job, busy: false, error: 'Could not delete it. Try again in a moment.' };
				}
				return;
			}
			removeFromList(job._id, userId);
			deleting = null;
			toaster.success({ title: 'Job description deleted', description: job.title });
		} catch {
			deleting = { job, busy: false, error: NETWORK_ERROR };
		}
	}

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
	<title>Your job descriptions | Recruiter</title>
</svelte:head>

<div class="p-4 md:p-6">
	<div class="mx-auto w-full max-w-4xl space-y-6">
		{#if !$sessionCheckedStore}
			{@render placeholder()}
		{:else if !user}
			<RecruiterLanding onSignedIn={() => (focusHeading = true)} />
		{:else if user.recruiter === false || listState.kind === 'no-space'}
			<PageNotice title="Create your recruiter space" icon={Briefcase}>
				<p>
					Your account has a candidate space. Add a recruiter space to write job descriptions and
					see the portfolios that apply. You can switch between both from the account menu.
				</p>
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
							Creating your space…
						{:else}
							<Plus size="18" aria-hidden="true" />
							Create my recruiter space
						{/if}
					</button>
				{/snippet}
			</PageNotice>
		{:else}
			<div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
				<div class="min-w-0 space-y-1">
					<h2 bind:this={heading} tabindex="-1" class="text-2xl font-bold outline-none md:text-3xl">
						Your job descriptions
					</h2>
					<p class="text-surface-700-300">Publish them, then see the portfolios that apply.</p>
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
					<p class="min-w-0 flex-1 text-surface-950-50">
						You imported <span class="font-semibold wrap-anywhere"
							>{pendingImport.fileName || 'a job description'}</span
						> but have not created the posting yet.
					</p>
					<a
						href={resolve('/(app)/recruiter/jobs/new?import=1')}
						class="btn btn-sm preset-filled-primary-700-300 min-h-9"
					>
						Continue editing
					</a>
				</div>
			{/if}

			{#if listState.kind === 'error'}
				<PageNotice
					title="Could not load your job descriptions"
					icon={ExclamationTriangle}
					tone="error"
				>
					<p>The server could not be reached, or it failed. Check your connection and try again.</p>
					{#snippet actions()}
						<button
							type="button"
							class="btn preset-filled-primary-700-300 min-h-11"
							onclick={() => loadJobs(listState.kind === 'error' ? listState.userId : '')}
						>
							Try again
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
					<h3 id="empty-jobs-title" class="text-xl font-bold">No job descriptions yet</h3>
					<p class="mx-auto max-w-md text-surface-700-300">
						Write your first one, or import an existing job description from a PDF. It stays a
						draft, visible only to you, until you open it to candidates.
					</p>
					{@render listActions('items-center')}
				</section>
			{:else}
				{#if filters.length > 0}
					<div
						class="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0"
						role="group"
						aria-label="Filter by status"
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

				<ul class="space-y-3" aria-label="Job descriptions">
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
												Updated <time datetime={isoDate(job.updatedAt)}
													>{formatDay(job.updatedAt)}</time
												>
											</span>
										</p>
										<div class="flex flex-wrap gap-1">
											<a
												href={resolve('/(app)/recruiter/jobs/[id]', { id: job._id })}
												class="btn btn-sm min-h-9 hover:preset-tonal"
											>
												<Eye size="16" aria-hidden="true" />
												View<span class="sr-only">: {job.title}</span>
											</a>
											<a
												href={resolve('/(app)/recruiter/jobs/[id]/edit', { id: job._id })}
												class="btn btn-sm min-h-9 hover:preset-tonal"
											>
												<PencilSquare size="16" aria-hidden="true" />
												Edit<span class="sr-only">: {job.title}</span>
											</a>
											<button
												type="button"
												class="btn btn-sm min-h-9 text-error-700-300 hover:preset-tonal-error"
												onclick={() => askDelete(job)}
											>
												<Trash size="16" aria-hidden="true" />
												Delete<span class="sr-only">: {job.title}</span>
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
		<p class="sr-only" role="status">Loading…</p>
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
					onclick={() => (importOpen = true)}
				>
					<DocumentArrowUp size="18" aria-hidden="true" />
					Import from PDF
				</button>
			{/if}
			<a
				href={resolve('/(app)/recruiter/jobs/new')}
				class="btn preset-filled-primary-700-300 min-h-11 max-sm:flex-1"
			>
				<Plus size="18" aria-hidden="true" />
				New job description
			</a>
		</div>
		{#if allowance}
			<p
				id="import-allowance"
				class="max-w-sm text-xs {importAvailability === 'available'
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
		finalFocusEl={() =>
			importTrigger?.isConnected && !importTrigger.disabled ? importTrigger : null}
	/>
{/if}

<ConfirmDialog
	open={!!deleting && !!user}
	title={deleting ? `Delete “${deleting.job.title}”?` : ''}
	description={deleting ? deleteJobText(deleting.job.applicantCount) : ''}
	confirmLabel="Delete"
	busy={deleting?.busy ?? false}
	error={deleting?.error ?? ''}
	onConfirm={confirmDelete}
	onCancel={() => (deleting = null)}
	finalFocusEl={() => (focusAfterDelete?.isConnected ? focusAfterDelete : null)}
/>
