<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { ArrowLeft, Briefcase, InformationCircle, LockClosed } from 'svelte-heros-v2';
	import JobEditor from '#components/job-editor/JobEditor.svelte';
	import EditorPlaceholder from '#components/job-editor/EditorPlaceholder.svelte';
	import PageNotice from '#components/job-editor/PageNotice.svelte';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { isSessionValid } from '#services/authentication.ts';
	import { loadImportedDraft, type ImportedJobDraft } from '#services/jobDrafts.ts';
	import { toaster } from '#services/toaster.ts';
	import { JOB_PARAM, JOURNEY_PARAM, journeyReturnDomain } from '#services/workflow.ts';

	// A new job posting, blank or (?import=1) from the job description import the import dialog
	// kept in this browser. Rendered in the browser only (recruiter/+layout.ts). Opened from a
	// portfolio's hiring journey (?journey=<portfolio>), it goes back there once the posting is
	// created, to pick it.

	// Read once: the import is taken when the editor opens, and the parameter goes once discarded
	const importRequested = untrack(() => page.url.searchParams.get('import') === '1');
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
	let imported: ImportedJobDraft | null = $state.raw(null);
	let importMissing = $state(false);
	// Starts the editor over (a discarded import)
	let editorRun = $state(0);

	$effect(() => {
		const id = user?._id;
		if (id) expiredWhileSaving = false;
		// No recruiter space: the page says how to create one (unknown: the API decides on save)
		if (!id || user?.recruiter === false || id === editorUser) return;
		untrack(() => {
			editorUser = id;
			imported = importRequested ? (loadImportedDraft(id) ?? null) : null;
			importMissing = importRequested && !imported;
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
		toaster.success({
			title: 'Job description created',
			description:
				saved.status === 'draft'
					? 'It is a draft: only you can see it until you set its status to Open.'
					: 'It is public on its job page.',
			// Created after the recruiter went elsewhere: they stay there, the toast leads to it
			action: left ? { label: 'Open it', onClick: open } : undefined
		});
		if (!left) await open();
	};

	/** Created from a hiring journey: back to it, with the posting selected */
	const backToJourney = async (saved: { _id: string; status: string }, left: boolean) => {
		const back = () =>
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve()d, with a query
			goto(`${journeyHref}?${JOB_PARAM}=${encodeURIComponent(saved._id)}`);
		toaster.success({
			title: 'Job description created',
			description:
				saved.status === 'open'
					? 'Pick it to continue the hiring journey.'
					: 'It is not open yet: set its status to Open to pick it in the hiring journey.',
			action: left ? { label: 'Back to the journey', onClick: back } : undefined
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
		toaster.info({ title: 'Import discarded', description: 'You are starting from a blank form.' });
		// The banner that had the focus is gone: back to the top of the form
		await tick();
		heading?.focus();
	};
</script>

<svelte:head>
	<title>New job description | Recruiter</title>
</svelte:head>

<div class="p-4 md:p-6">
	<div class="mx-auto w-full max-w-3xl space-y-6">
		<!-- eslint-disable svelte/no-navigation-without-resolve -- both resolve()d above -->
		<a
			href={journeyHref ?? recruiterHref}
			class="btn btn-sm -ms-2 px-2 text-surface-700-300 hover:preset-tonal"
		>
			<ArrowLeft size="16" aria-hidden="true" />
			{journeyHref ? 'Back to the hiring journey' : 'Job descriptions'}
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->

		{#if showEditor && editorUser}
			<div class="space-y-1">
				<h2 bind:this={heading} tabindex="-1" class="text-2xl font-bold outline-none md:text-3xl">
					New job description
				</h2>
				<p class="text-surface-700-300">
					{imported
						? 'Read from your PDF. Complete it, then create the posting.'
						: 'Describe the job: candidates see it once its status is Open.'}
				</p>
			</div>
			{#if journeyDomain}
				<div
					class="flex items-start gap-2 rounded-container preset-tonal-primary px-4 py-3 text-sm"
					role="note"
				>
					<InformationCircle size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
					<p>
						Once it is created, you go back to the hiring journey of
						<strong>{journeyDomain}</strong> to pick it. Set its status to
						<strong>Open</strong>: only an open job description can be picked.
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
						The imported job description is no longer in this browser: it was saved or discarded.
						Start from this blank form, or import the PDF again from
						<a href={recruiterHref} class="underline underline-offset-2">your job descriptions</a>.
					</p>
				</div>
			{/if}
			{#key `${editorUser}:${editorRun}`}
				<JobEditor
					userId={editorUser}
					{imported}
					cancelHref={journeyHref ?? recruiterHref}
					{recruiterHref}
					{onSaved}
					{onImportDiscarded}
					onSessionExpired={() => (expiredWhileSaving = true)}
				/>
			{/key}
		{:else if !$sessionCheckedStore}
			<EditorPlaceholder />
		{:else if !user}
			<PageNotice title="Sign in as a recruiter" icon={LockClosed}>
				<p>Sign in to write job descriptions and see the portfolios that apply.</p>
				{#snippet actions()}
					<a href={recruiterHref} class="btn preset-filled-primary-700-300 min-h-11">
						Sign in as a recruiter
					</a>
				{/snippet}
			</PageNotice>
		{:else}
			<PageNotice title="Create your recruiter space first" icon={Briefcase}>
				<p>Your account has no recruiter space yet. Create it to write job descriptions.</p>
				{#snippet actions()}
					<a href={recruiterHref} class="btn preset-filled-primary-700-300 min-h-11">
						Open the recruiter space
					</a>
				{/snippet}
			</PageNotice>
		{/if}
	</div>
</div>
