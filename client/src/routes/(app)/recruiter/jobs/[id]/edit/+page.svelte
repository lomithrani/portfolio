<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		ArrowLeft,
		Briefcase,
		DocumentMagnifyingGlass,
		ExclamationTriangle,
		LockClosed
	} from 'svelte-heros-v2';
	import JobEditor from '#components/job-editor/JobEditor.svelte';
	import EditorPlaceholder from '#components/job-editor/EditorPlaceholder.svelte';
	import PageNotice from '#components/job-editor/PageNotice.svelte';
	import { portfolioApi } from '#services';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { clearAuthentication, isSessionValid } from '#services/authentication.ts';
	import { errorStatus } from '#services/apiErrors.ts';
	import { toaster } from '#services/toaster.ts';

	// Edits one of the recruiter's job postings (GET /recruiter/jobs/:id, then PUT /jobs/:id).
	// Rendered in the browser only (recruiter/+layout.ts).

	type LoadedJob = NonNullable<
		Awaited<ReturnType<ReturnType<(typeof portfolioApi)['recruiter']['jobs']>['get']>>['data']
	>;

	type LoadState =
		| { kind: 'idle' }
		| { kind: 'loading'; key: string }
		| { kind: 'loaded'; key: string; userId: string; job: LoadedJob }
		| { kind: 'not-found' }
		| { kind: 'no-space' }
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
	// The editor's own save found the session expired: the editor stays (its form, and its
	// message to sign in again) until the next sign-in. Any other end of the session (Log out)
	// closes it: the page asks to sign in, and the changes wait in this browser.
	let expiredWhileSaving = $state(false);

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
					// The page then asks to sign in; signing in again loads the posting
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
		} catch {
			if (requested === key) loadState = { kind: 'error' };
		}
	}

	$effect(() => {
		const userId = user?._id;
		const id = jobId;
		if (!userId) {
			// Signed out: the private posting goes, and signing in loads it again (unless the
			// editor's save found the session expired: it stays until the next sign-in)
			untrack(() => {
				if (expiredWhileSaving || requested === null) return;
				requested = null;
				loadState = { kind: 'idle' };
			});
			return;
		}
		expiredWhileSaving = false;
		if (user?.recruiter === false || !id) return;
		if (requested === `${userId}:${id}`) return;
		untrack(() => load(userId, id));
	});

	const retry = () => {
		if (user?._id) load(user._id, jobId);
	};

	let job = $derived(loadState.kind === 'loaded' ? loadState.job : null);
	const recruiterHref = resolve('/(app)/recruiter');

	const onSaved = async (saved: { _id: string }, _mode: string, { left }: { left: boolean }) => {
		const open = () => goto(resolve('/(app)/recruiter/jobs/[id]', { id: saved._id }));
		toaster.success({
			title: 'Changes saved',
			// Saved after the recruiter went elsewhere: they stay there, the toast leads to it
			action: left ? { label: 'Open the job posting', onClick: open } : undefined
		});
		if (!left) await open();
	};
</script>

<svelte:head>
	<title>{job ? `Edit ${job.title}` : 'Edit job posting'} | Recruiter</title>
</svelte:head>

<div class="p-4 md:p-6">
	<div class="mx-auto w-full max-w-3xl space-y-6">
		{#if loadState.kind === 'loaded' && (user?._id === loadState.userId || (!user && expiredWhileSaving))}
			<a
				href={resolve('/(app)/recruiter/jobs/[id]', { id: loadState.job._id })}
				class="btn btn-sm -ms-2 max-w-full px-2 text-surface-700-300 hover:preset-tonal"
			>
				<ArrowLeft size="16" class="shrink-0" aria-hidden="true" />
				<span class="truncate">{loadState.job.title}</span>
			</a>
			<div class="space-y-1">
				<h2 class="text-2xl font-bold md:text-3xl">Edit job posting</h2>
				<p class="text-surface-700-300">Changes show on the job page as soon as you save them.</p>
			</div>
			{#key loadState.key}
				<JobEditor
					userId={loadState.userId}
					job={loadState.job}
					cancelHref={resolve('/(app)/recruiter/jobs/[id]', { id: loadState.job._id })}
					{recruiterHref}
					{onSaved}
					onSessionExpired={() => (expiredWhileSaving = true)}
				/>
			{/key}
		{:else}
			<a href={recruiterHref} class="btn btn-sm -ms-2 px-2 text-surface-700-300 hover:preset-tonal">
				<ArrowLeft size="16" aria-hidden="true" />
				Job postings
			</a>
			{#if !$sessionCheckedStore || loadState.kind === 'loading' || (user && loadState.kind === 'loaded') || (user && loadState.kind === 'idle' && user.recruiter !== false)}
				<EditorPlaceholder />
			{:else if !user}
				<PageNotice title="Sign in as a recruiter" icon={LockClosed}>
					<p>Sign in to edit your job postings.</p>
					{#snippet actions()}
						<a href={recruiterHref} class="btn preset-filled-primary-700-300 min-h-11">
							Sign in as a recruiter
						</a>
					{/snippet}
				</PageNotice>
			{:else if user.recruiter === false || loadState.kind === 'no-space'}
				<PageNotice title="Create your recruiter space first" icon={Briefcase}>
					<p>Your account has no recruiter space yet. Create it to write job postings.</p>
					{#snippet actions()}
						<a href={recruiterHref} class="btn preset-filled-primary-700-300 min-h-11">
							Open the recruiter space
						</a>
					{/snippet}
				</PageNotice>
			{:else if loadState.kind === 'not-found'}
				<PageNotice title="Job posting not found" icon={DocumentMagnifyingGlass}>
					<p>
						It may have been deleted, or it belongs to another recruiter account. Your job postings
						are listed in your recruiter space.
					</p>
					{#snippet actions()}
						<a href={recruiterHref} class="btn preset-filled-primary-700-300 min-h-11">
							Back to your job postings
						</a>
					{/snippet}
				</PageNotice>
			{:else}
				<PageNotice title="Could not load this job posting" icon={ExclamationTriangle} tone="error">
					<p>The server could not be reached, or it failed. Check your connection and try again.</p>
					{#snippet actions()}
						<button
							type="button"
							class="btn preset-filled-primary-700-300 min-h-11"
							onclick={retry}
						>
							Try again
						</button>
						<a href={recruiterHref} class="btn preset-tonal min-h-11">Back to your job postings</a>
					{/snippet}
				</PageNotice>
			{/if}
		{/if}
	</div>
</div>
