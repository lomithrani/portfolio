<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		ArrowLeft,
		Briefcase,
		DocumentMagnifyingGlass,
		ExclamationTriangle,
		InformationCircle,
		LockClosed
	} from 'svelte-heros-v2';
	import { JOB_STATUS_LABELS } from 'portfolio-common';
	import JobEditor from '#components/job-editor/JobEditor.svelte';
	import EditorPlaceholder from '#components/job-editor/EditorPlaceholder.svelte';
	import PageNotice from '#components/job-editor/PageNotice.svelte';
	import TermsAcceptance from '#components/account/TermsAcceptance.svelte';
	import { editorPages } from '#components/job-editor/editorPages.messages.ts';
	import Rich from '#lib/i18n/Rich.svelte';
	import { common } from '#lib/i18n/common.messages.ts';
	import { portfolioApi } from '#services';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { clearAuthentication, isSessionValid } from '#services/authentication.ts';
	import { errorStatus } from '#services/apiErrors.ts';
	import { hasAcceptedCurrentTerms, isConsentProblem } from '#services/account.ts';
	import {
		DUPLICATE_PARAM,
		duplicateSourceId,
		type RecruiterJobDetail
	} from '#services/recruiter.ts';
	import {
		duplicateDraftStorageKey,
		loadImportedDraft,
		loadJobDraft,
		type ImportedJobDraft
	} from '#services/jobDrafts.ts';
	import { notificationsStore } from '#services/notifications.ts';
	import { readJobMatching } from '#services/recruiterMatching.ts';
	import { toaster } from '#services/toaster.ts';
	import { JOB_PARAM, JOURNEY_PARAM, journeyReturnDomain } from '#services/workflow.ts';
	import { m } from './page.messages.ts';

	// A new job posting, blank, (?import=1) from the job description import the import dialog
	// kept in this browser, or (?duplicate=<id>) from a copy of one of the recruiter's postings
	// (GET /recruiter/jobs/:id), as a draft: an opened posting's terms are locked, a new version
	// of them is a new posting (a parameter that names no posting of theirs says so; a posting
	// deleted since its copy was started leaves that copy, kept in this browser, to finish from a
	// blank form). Nothing is saved until the recruiter creates it. Rendered in the
	// browser only (recruiter/+layout.ts). Opened from a portfolio's hiring journey
	// (?journey=<portfolio>), it goes back there once the posting is created, to pick it. A
	// recruiter whose session says they have not accepted the terms in force accepts them first
	// (TermsAcceptance), as the other recruiter pages ask once the API refused them: the form opens
	// once they have (the API would refuse to save it). While matching is on (notificationsStore), a
	// job created open can be proposed to candidates at once: ticked to start with, unless the job is
	// written from a candidate's hiring journey (?journey=: it is shared with that candidate) or is a
	// copy (?duplicate=: copies of a job that differ in one term are what reviewers refuse, since they
	// would tell candidates' floors apart).

	// Read once: the import is taken when the editor opens, and the parameter goes once discarded
	const importRequested = untrack(() => page.url.searchParams.get('import') === '1');
	// The posting to copy (an import comes first); a parameter that is not a posting id names none
	const duplicateParam = untrack(() =>
		importRequested ? null : page.url.searchParams.get(DUPLICATE_PARAM)
	);
	const duplicateId = duplicateSourceId(duplicateParam);
	const journeyDomain = untrack(() =>
		journeyReturnDomain(page.url.searchParams.get(JOURNEY_PARAM))
	);
	const journeyHref = journeyDomain ? resolve('/[domain]/hire', { domain: journeyDomain }) : null;

	// The signed-in account, once the session has been checked with the API
	let user = $derived(
		$sessionCheckedStore && isSessionValid($authenticationStore)
			? $authenticationStore.user
			: undefined
	);

	// The account the editor was opened for
	let editorUser: string | null = $state(null);
	// The editor's own save found the session expired: the editor stays (its form, and its
	// message to sign in again) until the next sign-in. Any other end of the session (Log out)
	// closes it: the page asks to sign in, and the changes wait in this browser.
	let expiredWhileSaving = $state(false);
	let showEditor = $derived(
		!!editorUser && (user?._id === editorUser || (!user && expiredWhileSaving))
	);
	// The terms in force come first (POST /jobs answers 422 on `consent` without them)
	let termsFirst = $derived(!!user?.recruiter && !hasAcceptedCurrentTerms(user));
	let imported: ImportedJobDraft | null = $state.raw(null);
	let importMissing = $state(false);
	// Starts the editor over (a discarded import)
	let editorRun = $state(0);

	// The posting to copy (?duplicate=), for the account it was loaded for
	type SourceState =
		| { kind: 'idle' }
		| { kind: 'loading' }
		| { kind: 'loaded'; userId: string; job: RecruiterJobDetail }
		// Not found, but a copy of it was started and is kept in this browser: it goes on, from a
		// blank form
		| { kind: 'orphan'; userId: string; id: string }
		| { kind: 'not-found' }
		| { kind: 'terms' }
		| { kind: 'error' };
	let source = $state.raw<SourceState>(
		duplicateParam !== null && !duplicateId ? { kind: 'not-found' } : { kind: 'idle' }
	);
	let sourceRequested: string | null = null;
	let duplicateSource = $derived(
		source.kind === 'loaded' && source.userId === editorUser
			? source.job
			: source.kind === 'orphan' && source.userId === editorUser
				? { _id: source.id }
				: null
	);

	async function loadSource(userId: string, id: string) {
		const key = `${userId}:${id}`;
		sourceRequested = key;
		source = { kind: 'loading' };
		try {
			const { data, error } = await portfolioApi.recruiter
				.jobs({ id })
				.get({ fetch: { credentials: 'include' } });
			if (sourceRequested !== key) return;
			if (error || !data) {
				const code = errorStatus(error);
				if (code === 401) {
					sourceRequested = null;
					source = { kind: 'idle' };
					clearAuthentication();
				} else if (isConsentProblem(code, error?.value)) {
					source = { kind: 'terms' };
				} else if (code === 404 || code === 422) {
					source = loadJobDraft(duplicateDraftStorageKey(userId, id))
						? { kind: 'orphan', userId, id }
						: { kind: 'not-found' };
				} else {
					// 403 (no recruiter space) too: the session said it had one
					source = { kind: 'error' };
				}
				return;
			}
			source = { kind: 'loaded', userId, job: data };
		} catch {
			if (sourceRequested === key) source = { kind: 'error' };
		}
	}

	const retrySource = () => {
		if (editorUser && duplicateId) loadSource(editorUser, duplicateId);
	};

	$effect(() => {
		const id = user?._id;
		if (id) expiredWhileSaving = false;
		// No recruiter space: the page says how to create one (unknown: the API decides on save)
		if (!id || user?.recruiter === false || id === editorUser) return;
		untrack(() => {
			editorUser = id;
			imported = importRequested ? (loadImportedDraft(id) ?? null) : null;
			importMissing = importRequested && !imported;
			if (duplicateId && !termsFirst) loadSource(id, duplicateId);
		});
	});

	const recruiterHref = resolve('/(app)/recruiter');

	const onSaved = async (
		saved: { _id: string; status: string },
		_mode: string,
		{ left }: { left: boolean }
	) => {
		if (journeyHref) return backToJourney(saved, left);
		const open = () => goto(resolve('/(app)/recruiter/jobs/[id]', { id: saved._id }));
		const inMatching = !!readJobMatching((saved as { matching?: unknown }).matching)?.enabledAt;
		toaster.success({
			title: m.created,
			description: inMatching
				? m.createdInMatching
				: saved.status === 'draft'
					? m.createdDraft(JOB_STATUS_LABELS.open)
					: m.createdNotDraft,
			// Created after the recruiter went elsewhere: they stay there, the toast leads to it
			action: left ? { label: m.openIt, onClick: open } : undefined
		});
		if (!left) await open();
	};

	/** Created from a hiring journey: back to it, with the posting selected */
	const backToJourney = async (saved: { _id: string; status: string }, left: boolean) => {
		const back = () =>
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve()d, with a query
			goto(`${journeyHref}?${JOB_PARAM}=${encodeURIComponent(saved._id)}`);
		toaster.success({
			title: m.created,
			description: saved.status === 'open' ? m.pickIt : m.notOpenYet(JOB_STATUS_LABELS.open),
			action: left ? { label: m.backToTheJourney, onClick: back } : undefined
		});
		if (!left) await back();
	};

	let heading: HTMLElement | undefined = $state();

	const onImportDiscarded = async () => {
		// The URL loses ?import=1 first (a reload starts from a blank form too), with the import's
		// editor still there, finished: then the blank form's. It keeps its way back to a journey
		const blank = resolve('/(app)/recruiter/jobs/new');
		const withoutImport = journeyDomain
			? `${blank}?${JOURNEY_PARAM}=${encodeURIComponent(journeyDomain)}`
			: blank;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve()d, with a query
		await goto(withoutImport, { shallow: true, replace: true });
		imported = null;
		importMissing = false;
		editorRun += 1;
		toaster.info({ title: m.importDiscarded, description: m.blankForm });
		// The banner that had the focus is gone: back to the top of the form
		await tick();
		heading?.focus();
	};
</script>

<svelte:head>
	<title>{m.pageTitle}</title>
</svelte:head>

<div class="p-4 md:p-6">
	<div class="mx-auto w-full max-w-3xl space-y-6">
		<!-- eslint-disable svelte/no-navigation-without-resolve -- both resolve()d above -->
		<a
			href={journeyHref ?? recruiterHref}
			class="btn btn-sm -ms-2 px-2 text-surface-700-300 hover:preset-tonal"
		>
			<ArrowLeft size="16" aria-hidden="true" />
			{journeyHref ? m.backToJourney : editorPages.jobDescriptions}
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->

		{#if (termsFirst || source.kind === 'terms') && user}
			<!-- Accepted: the form takes its place, and its heading the focus -->
			<TermsAcceptance
				{user}
				source="recruiter"
				level={2}
				required={source.kind === 'terms'}
				onAccepted={async () => {
					if (duplicateId && editorUser && !duplicateSource)
						await loadSource(editorUser, duplicateId);
					await tick();
					heading?.focus();
				}}
			/>
		{:else if showEditor && editorUser && duplicateParam !== null && !duplicateSource}
			{#if source.kind === 'not-found'}
				<PageNotice title={m.duplicateNotFound.title} icon={DocumentMagnifyingGlass}>
					<p>{m.duplicateNotFound.text}</p>
					{#snippet actions()}
						<a href={recruiterHref} class="btn preset-filled-primary-700-300 min-h-11">
							{editorPages.jobDescriptions}
						</a>
					{/snippet}
				</PageNotice>
			{:else if source.kind === 'error'}
				<PageNotice title={m.duplicateFailed} icon={ExclamationTriangle} tone="error">
					<p>{m.duplicateFailedText}</p>
					{#snippet actions()}
						<button
							type="button"
							class="btn preset-filled-primary-700-300 min-h-11"
							onclick={retrySource}
						>
							{common.retry}
						</button>
						<a href={recruiterHref} class="btn preset-tonal min-h-11">
							{editorPages.jobDescriptions}
						</a>
					{/snippet}
				</PageNotice>
			{:else}
				<EditorPlaceholder />
			{/if}
		{:else if showEditor && editorUser}
			<div class="space-y-1">
				<h2 bind:this={heading} tabindex="-1" class="text-2xl font-bold outline-none md:text-3xl">
					{m.heading}
				</h2>
				<p class="text-surface-700-300">
					{imported
						? m.introImported
						: source.kind === 'loaded' && duplicateSource
							? m.introDuplicate(source.job.title)
							: source.kind === 'orphan' && duplicateSource
								? m.introOrphanCopy
								: m.intro(JOB_STATUS_LABELS.open)}
				</p>
			</div>
			{#if journeyDomain}
				<div
					class="flex items-start gap-2 rounded-container preset-tonal-primary px-4 py-3 text-sm"
					role="note"
				>
					<InformationCircle size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
					<p>
						<Rich text={m.journeyNote}>
							{#snippet portfolio()}<strong>{journeyDomain}</strong>{/snippet}
							{#snippet status()}<strong>{JOB_STATUS_LABELS.open}</strong>{/snippet}
						</Rich>
					</p>
				</div>
			{/if}
			{#if importMissing}
				<div
					class="flex items-start gap-2 rounded-container preset-tonal px-4 py-3 text-sm"
					role="status"
				>
					<InformationCircle size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
					<p>
						<Rich text={m.importMissing}>
							{#snippet jobs(text: string)}<a
									href={recruiterHref}
									class="underline underline-offset-2">{text}</a
								>{/snippet}
						</Rich>
					</p>
				</div>
			{/if}
			{#key `${editorUser}:${editorRun}`}
				<JobEditor
					userId={editorUser}
					{imported}
					duplicate={duplicateSource}
					cancelHref={journeyHref ?? recruiterHref}
					{recruiterHref}
					matchingDefault={!journeyDomain && !duplicateId}
					matchingOffered={$notificationsStore.matching === 'on'}
					{onSaved}
					{onImportDiscarded}
					onSessionExpired={() => (expiredWhileSaving = true)}
				/>
			{/key}
		{:else if !$sessionCheckedStore}
			<EditorPlaceholder />
		{:else if !user}
			<PageNotice title={editorPages.signInTitle} icon={LockClosed}>
				<p>{m.signInText}</p>
				{#snippet actions()}
					<a href={recruiterHref} class="btn preset-filled-primary-700-300 min-h-11">
						{editorPages.signIn}
					</a>
				{/snippet}
			</PageNotice>
		{:else}
			<PageNotice title={editorPages.noSpaceTitle} icon={Briefcase}>
				<p>{editorPages.noSpace}</p>
				{#snippet actions()}
					<a href={recruiterHref} class="btn preset-filled-primary-700-300 min-h-11">
						{editorPages.openRecruiterSpace}
					</a>
				{/snippet}
			</PageNotice>
		{/if}
	</div>
</div>
