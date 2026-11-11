<!--
@component
The job step of a portfolio's hiring journey: the recruiter picks one of their open job
descriptions (GET /recruiter/jobs), or writes a new one and comes back here to pick it
(/recruiter/jobs/new?journey=<portfolio>, back on the Hire page with ?job=<id>: the job the
address asks for is the one selected). Before that, a visitor signs in (keeping the space the
account had) and an account without a recruiter space creates it here.
The pick is submitted to the step (`{ jobId }`); the job picked comes back as the step's view.
Not for the portfolio's owner (the API refuses their pick): the page shows them the step's
description instead.
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Briefcase, DocumentArrowUp, PlusCircle } from 'svelte-heros-v2';
	import type { JobStatus } from 'portfolio-common';
	import { portfolioApi } from '#services';
	import { errorStatus } from '#services/apiErrors.ts';
	import { switchMode } from '#services/account.ts';
	import { isSessionValid } from '#services/authentication.ts';
	import { loadImportedDraft, type ImportedJobDraft } from '#services/jobDrafts.ts';
	import {
		importedToastText,
		jobImportAvailability,
		jobImportQuotaText,
		type JobImportStatus
	} from '#services/jobImport.ts';
	import { NETWORK_ERROR, failureText } from '#services/recruiter.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { toaster } from '#services/toaster.ts';
	import {
		JOB_PARAM,
		JOURNEY_PARAM,
		initialJobChoice,
		isPickable,
		pickJobFailure,
		pickedJob,
		requestedJob,
		sortJobChoices
	} from '#services/workflow.ts';
	import ApplySignIn from '#components/apply/ApplySignIn.svelte';
	import JobImport from '#components/job-import/JobImport.svelte';
	import JobStatusBadge from '#components/jobs/JobStatusBadge.svelte';
	import type { StepProps } from './types';

	let { step, domainName, ownerName, address, submit, reload, locked }: StepProps = $props();

	const uid = $props.id();
	const withCredentials = { fetch: { credentials: 'include' } } as const;
	const JOBS_FAILED = 'Could not load your job descriptions.';

	type JobChoice = { _id: string; title: string; company?: string; status: JobStatus };
	type JobsState =
		| { key: string; state: 'loading' }
		| { key: string; state: 'loaded'; jobs: JobChoice[] }
		| { key: string; state: 'no-space' }
		| { key: string; state: 'error'; message: string };

	// The signed-in account, once the session has been checked with the API
	let user = $derived(
		$sessionCheckedStore && isSessionValid($authenticationStore)
			? $authenticationStore.user
			: undefined
	);
	// Jobs are loaded for an account with a recruiter space
	let jobsKey = $derived(user?.recruiter ? user._id : null);
	let jobs = $state.raw<JobsState | null>(null);
	// The jobs of the current account only
	let shown = $derived(jobs && jobs.key === jobsKey ? jobs : null);
	let requested: string | null = null;
	// The job to select first (?job=, back from writing it), and the one the list was loaded for
	let asked = $derived(requestedJob(address));
	let listedFor: string | null = null;

	let selected = $state<string | null>(null);
	let picking = $state(false);
	let pickError = $state('');
	let creatingSpace = $state(false);
	let spaceError = $state('');

	// Messages about an account go with it: a sign-in after an expired session starts clean
	let account = $derived(user?._id ?? null);
	$effect(() => {
		void account;
		untrack(() => {
			pickError = '';
			spaceError = '';
		});
	});

	// The job editor, which brings the recruiter back here once the job is created
	let newJobHref = $derived(
		`${resolve('/(app)/recruiter/jobs/new')}?${JOURNEY_PARAM}=${encodeURIComponent(domainName)}`
	);

	// --- Import from a PDF (when the API has it on, and the plan has imports left) -------------
	// The dialog of the recruiter's dashboard: the draft it reads opens in the same editor, which
	// brings the recruiter back here like a job written by hand
	let importHref = $derived(`${newJobHref}&import=1`);
	let importStatus = $state.raw<JobImportStatus | null>(null);
	let importStatusFor: string | null = null;
	let importOpen = $state(false);
	let importTrigger: HTMLButtonElement | undefined = $state();
	let importDialog: ReturnType<typeof JobImport> | undefined = $state();
	// An import read earlier and not saved as a posting yet: a new one replaces it (the dialog says so)
	let pendingImport = $state.raw<ImportedJobDraft | null>(null);
	let canImport = $derived(
		!!importStatus?.enabled && jobImportAvailability(importStatus) === 'available'
	);

	async function refreshImportStatus() {
		const key = jobsKey;
		try {
			const { data } = await portfolioApi.jobs.import.get(withCredentials);
			if (data && key === jobsKey) importStatus = data;
		} catch {
			// Unknown: the import is not offered, writing the job still is
		}
	}

	$effect(() => {
		const key = jobsKey;
		if (key === importStatusFor) return;
		importStatusFor = key;
		untrack(() => {
			importStatus = null;
			importOpen = false;
			if (key) void refreshImportStatus();
		});
	});

	beforeNavigate((navigation) => {
		// A PDF being read: leaving now would lose an import that counts. The navigation the import
		// itself ends with comes after (the dialog is not busy any more)
		if (importDialog?.isBusy()) {
			navigation.cancel();
			return;
		}
		// Closed before the page unmounts (its focus trap would read a destroyed page)
		importOpen = false;
	});

	function openImport() {
		if (user) pendingImport = loadImportedDraft(user._id) ?? null;
		importOpen = true;
	}

	async function onImported({ fileName, warnings }: { fileName: string; warnings: string[] }) {
		importOpen = false;
		toaster.success({
			title: 'Job description imported',
			description: importedToastText(fileName, warnings)
		});
		await tick();
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve()d, with a query
		await goto(importHref);
	}

	async function loadJobs(key: string) {
		requested = key;
		listedFor = asked;
		jobs = { key, state: 'loading' };
		try {
			const { data, error } = await portfolioApi.recruiter.jobs.get(withCredentials);
			if (requested !== key) return;
			if (error || !data) {
				const status = errorStatus(error);
				if (status === 401) {
					requested = null;
					locked('signed-out');
					return;
				}
				// The session said it had a recruiter space: it has none (yet)
				if (status === 403) {
					jobs = { key, state: 'no-space' };
					return;
				}
				jobs = { key, state: 'error', message: failureText(error?.value, JOBS_FAILED) };
				return;
			}
			const list = sortJobChoices(
				data.jobs.map((job) => ({
					_id: job._id,
					title: job.title,
					company: job.company,
					status: job.status
				}))
			);
			jobs = { key, state: 'loaded', jobs: list };
			selected = initialJobChoice(list, listedFor, pickedJob(step.view)?._id);
		} catch {
			if (requested === key) jobs = { key, state: 'error', message: NETWORK_ERROR };
		}
	}

	// Loaded for the account, and again for each job the address then asks for: the list has the
	// posting just written, which is selected
	$effect(() => {
		const key = jobsKey;
		const job = asked;
		if (!key) {
			requested = null;
			return;
		}
		if (requested === key && (!job || job === listedFor)) return;
		untrack(() => loadJobs(key));
	});

	async function createRecruiterSpace() {
		creatingSpace = true;
		spaceError = '';
		const result = await switchMode('recruiter');
		creatingSpace = false;
		if (!result.ok) {
			spaceError = result.message;
			return;
		}
		// The session now has the space: its jobs load (again, after a 403)
		if (jobsKey) await loadJobs(jobsKey);
	}

	async function pick(event: SubmitEvent) {
		event.preventDefault();
		if (!selected || picking) return;
		picking = true;
		pickError = '';
		const result = await submit({ jobId: selected });
		picking = false;
		if (!result.ok) {
			const failure = pickJobFailure(result.status, result.value);
			pickError = failure.message;
			if (failure.kind === 'signed-out' || failure.kind === 'locked') locked(failure.kind);
			if (failure.kind === 'changed') reload();
			if (failure.kind === 'reload-jobs' && jobsKey) await loadJobs(jobsKey);
			return;
		}
		toaster.success({ title: 'Job picked' });
		// The pick settles what the address asked for: it selects nothing any more. The browser's
		// address: page.url still has ?job= after an earlier shallow goto
		if (new URLSearchParams(location.search).has(JOB_PARAM)) {
			await goto(resolve('/[domain]/hire', { domain: domainName }), {
				replace: true,
				shallow: true
			});
		}
	}
</script>

{#if !$sessionCheckedStore}
	<div
		class="placeholder h-6 w-56 animate-pulse motion-reduce:animate-none"
		aria-hidden="true"
	></div>
{:else if !user}
	<div class="space-y-3">
		<p class="text-sm">
			Sign in to pick the job you are hiring for. Your job descriptions are kept in a free recruiter
			space: you create it next if your account has none.
		</p>
		<!-- No space chosen: an account keeps the one it had (the portfolio's owner, checking their
		     page signed out, must not end up in a recruiter space) -->
		<ApplySignIn mode={null} />
	</div>
{:else if !user.recruiter || shown?.state === 'no-space'}
	<div class="space-y-3">
		<p class="text-sm">
			Your job descriptions live in a recruiter space. Create yours (it is free) to pick one or
			write a new one.
		</p>
		<button
			type="button"
			class="btn preset-filled-primary-700-300 min-h-11"
			disabled={creatingSpace}
			onclick={createRecruiterSpace}
		>
			<Briefcase size="18" aria-hidden="true" />
			{creatingSpace ? 'Creating…' : 'Create my recruiter space'}
		</button>
		{#if spaceError}
			<p class="text-sm text-error-700-300" role="alert">{spaceError}</p>
		{/if}
	</div>
{:else if !shown || shown.state === 'loading'}
	<p class="text-sm opacity-60" role="status">Loading your job descriptions…</p>
{:else if shown.state === 'error'}
	<div class="space-y-2" role="alert">
		<p class="text-sm text-error-700-300">{shown.message}</p>
		<button
			type="button"
			class="btn btn-sm preset-tonal"
			onclick={() => jobsKey && loadJobs(jobsKey)}
		>
			Try again
		</button>
	</div>
{:else if shown.state === 'loaded'}
	<form class="space-y-4" onsubmit={pick}>
		{#if shown.jobs.length === 0}
			<p class="text-sm">
				You have no job description yet. Write the one you are hiring for: you come back here to
				pick it.
			</p>
		{:else}
			<fieldset class="space-y-2">
				<legend class="mb-2 text-sm font-semibold">Your job descriptions</legend>
				{#each shown.jobs as job (job._id)}
					{@const pickable = isPickable(job)}
					<label
						class={[
							'flex items-start gap-3 rounded-container border p-3',
							selected === job._id
								? 'border-primary-500 preset-tonal-primary'
								: 'border-surface-200-800',
							pickable ? 'cursor-pointer hover:preset-tonal' : 'opacity-70'
						]}
					>
						<input
							type="radio"
							class="radio mt-1 shrink-0"
							name="{uid}-job"
							value={job._id}
							bind:group={selected}
							disabled={!pickable}
							aria-describedby={pickable ? undefined : `${uid}-${job._id}-why`}
						/>
						<span class="min-w-0 flex-1 space-y-0.5">
							<span class="block font-semibold break-words">{job.title}</span>
							{#if job.company}
								<span class="block text-sm text-surface-700-300">{job.company}</span>
							{/if}
							{#if !pickable}
								<span class="block text-xs" id="{uid}-{job._id}-why">
									Only an open job description can be picked.
									<a
										class="underline underline-offset-2"
										href={resolve('/(app)/recruiter/jobs/[id]', { id: job._id })}
									>
										Change its status
									</a>
								</span>
							{/if}
						</span>
						<JobStatusBadge status={job.status} class="shrink-0" />
					</label>
				{/each}
			</fieldset>
		{/if}

		<p class="text-sm text-surface-700-300">
			{ownerName} sees the job you pick in the meeting invitation.
		</p>

		<div class="flex flex-wrap gap-2">
			{#if shown.jobs.some(isPickable)}
				<button
					type="submit"
					class="btn preset-filled-primary-700-300 min-h-11"
					disabled={!selected || picking}
				>
					{picking ? 'Saving…' : 'Continue with this job'}
				</button>
			{/if}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() with a query -->
			<a href={newJobHref} class="btn preset-tonal min-h-11">
				<PlusCircle size="18" aria-hidden="true" />
				Write a new job description
			</a>
			{#if canImport && importStatus}
				<button
					type="button"
					class="btn preset-tonal min-h-11"
					bind:this={importTrigger}
					aria-describedby="{uid}-import-quota"
					onclick={openImport}
				>
					<DocumentArrowUp size="18" aria-hidden="true" />
					Import from PDF
				</button>
			{/if}
		</div>
		{#if canImport && importStatus}
			<p class="text-xs text-surface-700-300" id="{uid}-import-quota">
				Import from PDF: Claude reads your job description into the form. {jobImportQuotaText(
					importStatus
				)}.
			</p>
		{/if}
		{#if pickError}
			<p class="text-sm text-error-700-300" role="alert">{pickError}</p>
		{/if}
	</form>
{/if}

{#if user && importStatus?.enabled}
	<JobImport
		bind:this={importDialog}
		open={importOpen}
		status={importStatus}
		userId={user._id}
		onClose={() => (importOpen = false)}
		{onImported}
		onQuota={(quota) => {
			if (importStatus) importStatus = { ...importStatus, ...quota };
		}}
		refreshStatus={refreshImportStatus}
		{pendingImport}
		editorHref={importHref}
		finalFocusEl={() => importTrigger ?? null}
	/>
{/if}
