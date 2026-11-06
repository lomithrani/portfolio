<!--
@component
Applying to a job posting with a portfolio, on the public job page. What it shows depends on the
posting and the viewer (applyView of `#services/applications.ts`): a posting that takes no
applications, the posting's own recruiter (a link to manage it), a visitor to sign in, an account
without a portfolio (claim one here), or "Apply with <portfolio>" / "You applied on <date>" with
Withdraw (GET, POST, DELETE /jobs/:id/application, which also tells the posting's own recruiter
that it is theirs). Whatever depends on the session waits for it, and for that answer, to be
checked with the API. Give it a new instance per posting ({#key job._id}). `onActionChange` tells
the page what its link next to the title offers (jobPageAction).
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		Briefcase,
		CheckBadge,
		CheckCircle,
		LockClosed,
		NoSymbol,
		PaperAirplane,
		PauseCircle,
		UserCircle
	} from 'svelte-heros-v2';
	import type { JobStatus } from 'portfolio-common';
	import { portfolioApi } from '#services';
	import { errorStatus } from '#services/apiErrors.ts';
	import { refreshAccount } from '#services/account.ts';
	import { clearAuthentication, isSessionValid } from '#services/authentication.ts';
	import {
		APPLICATION_NETWORK_MESSAGE,
		applicationFailure,
		applicationSummary,
		applyView,
		closedNotice,
		jobPageAction,
		leaveAction,
		leaveCopy,
		needsApplicationStatus,
		readApplicationStatus,
		type ApplicationFailure,
		type ApplicationStatus,
		type JobPageAction
	} from '#services/applications.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { toaster } from '#services/toaster.ts';
	import ApplySignIn from './ApplySignIn.svelte';
	import ClaimPortfolioForm from './ClaimPortfolioForm.svelte';

	let {
		job,
		id = 'apply',
		onActionChange
	}: {
		job: { _id: string; status: JobStatus };
		/** The panel's id: the page's "Apply" link points to it */
		id?: string;
		/** What the page's link next to the title offers, as far as the panel knows */
		onActionChange?: (action: JobPageAction) => void;
	} = $props();

	const uid = $props.id();
	const withCredentials = { fetch: { credentials: 'include' } } as const;

	type LoadedApplication =
		| { key: string; state: 'loading' }
		| { key: string; state: 'loaded'; status: ApplicationStatus }
		| { key: string; state: 'error'; message: string };

	// The signed-in account, once the session has been checked with the API
	let user = $derived(
		$sessionCheckedStore && isSessionValid($authenticationStore)
			? $authenticationStore.user
			: undefined
	);
	let domain = $derived(user?.domain ?? '');

	// --- Where the viewer stands: applied, or the posting's recruiter --------------------------
	let statusKey = $derived(
		user && needsApplicationStatus(user, $sessionCheckedStore) ? `${user._id}:${job._id}` : null
	);
	let application = $state.raw<LoadedApplication | null>(null);
	// The application of the current viewer only (another account's never shows)
	let current = $derived(application && application.key === statusKey ? application : null);
	// undefined while it loads, null when it could not be loaded
	let viewerStatus = $derived(
		current?.state === 'loaded' ? current.status : current?.state === 'error' ? null : undefined
	);
	let view = $derived(
		applyView({ job, user, sessionChecked: $sessionCheckedStore, status: viewerStatus })
	);
	let ownPosting = $derived(viewerStatus?.own === true);
	let hasApplied = $derived(viewerStatus?.applied === true);
	// Told to the page (its link next to the title: Apply, Your application, Manage it)
	$effect(() => {
		onActionChange?.(jobPageAction(view, viewerStatus));
	});
	// What was asked for last: an older answer is ignored
	let requested: string | null = null;

	let busy = $state<'apply' | 'withdraw' | null>(null);
	// Reset for each viewer (writable deriveds, back to their start when statusKey changes)
	const freshOn = <T,>(_key: unknown, value: T): T => value;
	let confirmingWithdraw = $derived(freshOn(statusKey, false));
	/** A failed apply or withdraw, next to its button */
	let actionError = $derived(freshOn(statusKey, ''));
	/**
	 * Why the panel changed on its own (session expired, no portfolio any more), for the viewer it
	 * is about: undefined once signed out. It goes once someone else is shown, so a sign-in from
	 * the header, One Tap or another tab never leaves "Your session expired" on screen.
	 */
	let notice = $state.raw<{ message: string; viewer: string | undefined } | null>(null);
	let noticeText = $derived(notice && notice.viewer === user?._id ? notice.message : '');
	/** The portfolio claimed here (empty: the panel says so), or found to be owned already */
	let claimed = $state.raw<{ name: string; existing: boolean } | null>(null);
	let claimedNote = $derived(claimed && claimed.name === domain ? claimed : null);
	/** How the viewer leaves the applicant list: withdraw an application or remove a listing */
	let leave = $derived(leaveCopy(current?.state === 'loaded' ? current.status.source : undefined));
	/** Read by screen readers (the visible text changes with it) */
	let announcement = $state('');

	let headingElement: HTMLHeadingElement | undefined = $state();
	let summaryElement: HTMLParagraphElement | undefined = $state();
	let applyButton: HTMLButtonElement | undefined = $state();
	let withdrawButton: HTMLButtonElement | undefined = $state();
	let keepButton: HTMLButtonElement | undefined = $state();

	const focusAfterUpdate = async (element: () => HTMLElement | undefined) => {
		await tick();
		(element() ?? headingElement)?.focus();
	};

	const expireSession = async (message: string) => {
		clearAuthentication();
		notice = { message, viewer: undefined };
		confirmingWithdraw = false;
		toaster.error({ title: message });
		await focusAfterUpdate(() => headingElement);
	};

	async function loadStatus(key: string, jobId: string) {
		requested = key;
		application = { key, state: 'loading' };
		try {
			const { data, error } = await portfolioApi
				.jobs({ id: jobId })
				.application.get(withCredentials);
			if (requested !== key) return;
			if (error) {
				const failure = applicationFailure('status', errorStatus(error), error.value);
				if (failure.kind === 'session-expired') {
					requested = null;
					await expireSession(failure.message);
					return;
				}
				application = { key, state: 'error', message: failure.message };
				return;
			}
			const status = readApplicationStatus(data);
			application = status
				? { key, state: 'loaded', status }
				: { key, state: 'error', message: applicationFailure('status', 500).message };
		} catch {
			if (requested === key) {
				application = { key, state: 'error', message: APPLICATION_NETWORK_MESSAGE };
			}
		}
	}

	$effect(() => {
		const key = statusKey;
		const jobId = job._id;
		if (!key) {
			// Signed out (or another account): asked afresh next time
			requested = null;
			return;
		}
		if (requested === key) return;
		untrack(() => loadStatus(key, jobId));
	});

	const retryStatus = () => {
		if (statusKey) loadStatus(statusKey, job._id);
	};

	// --- Apply and withdraw --------------------------------------------------------------------
	async function handleFailure(failure: ApplicationFailure, key: string) {
		switch (failure.kind) {
			case 'session-expired':
				await expireSession(failure.message);
				return;
			case 'already-applied':
				toaster.info({ title: failure.message });
				await loadStatus(key, job._id);
				await focusAfterUpdate(() => summaryElement);
				return;
			case 'not-applied':
				application = { key, state: 'loaded', status: { applied: false } };
				confirmingWithdraw = false;
				// Announced by the toast alone
				toaster.info({ title: failure.message });
				await focusAfterUpdate(() => applyButton);
				return;
			case 'not-open':
				// The posting changed meanwhile: reloaded, the panel says why it takes no applications
				toaster.info({ title: failure.message });
				await invalidateAll();
				await focusAfterUpdate(() => headingElement);
				return;
			case 'no-portfolio': {
				// The session thought the account had a portfolio: reloaded, the panel offers to claim one
				const account = await refreshAccount();
				if (account.ok && !account.user.domain) {
					notice = { message: failure.message, viewer: account.user._id };
					await focusAfterUpdate(() => headingElement);
				} else {
					actionError = failure.message;
				}
				return;
			}
			default:
				actionError = failure.message;
		}
	}

	async function apply() {
		if (busy || !statusKey) return;
		const key = statusKey;
		const portfolio = domain;
		busy = 'apply';
		actionError = '';
		notice = null;
		try {
			const { data, error } = await portfolioApi
				.jobs({ id: job._id })
				.application.post({}, withCredentials);
			if (error) {
				await handleFailure(applicationFailure('apply', errorStatus(error), error.value), key);
				return;
			}
			const status: ApplicationStatus = readApplicationStatus(data) ?? {
				applied: true,
				appliedAt: new Date(),
				source: 'applied'
			};
			application = { key, state: 'loaded', status };
			// Said once: the toast (a polite live region) announces it, and focus moves to the
			// summary ("You applied on…"), which the panel's heading now says too
			toaster.success({
				title: 'Application sent',
				description: `The recruiter can now see your portfolio, ${portfolio}.`
			});
			await focusAfterUpdate(() => summaryElement);
		} catch {
			await handleFailure(applicationFailure('apply', undefined), key);
		} finally {
			busy = null;
		}
	}

	const askWithdraw = async () => {
		actionError = '';
		confirmingWithdraw = true;
		await focusAfterUpdate(() => keepButton);
	};

	const cancelWithdraw = async () => {
		confirmingWithdraw = false;
		await focusAfterUpdate(() => withdrawButton);
	};

	async function withdraw() {
		if (busy || !statusKey) return;
		const key = statusKey;
		const source = current?.state === 'loaded' ? current.status.source : undefined;
		const action = leaveAction(source);
		const copy = leaveCopy(source);
		busy = 'withdraw';
		actionError = '';
		try {
			const { error } = await portfolioApi
				.jobs({ id: job._id })
				.application.delete(undefined, withCredentials);
			if (error) {
				const failure = applicationFailure(action, errorStatus(error), error.value);
				await handleFailure(failure, key);
				if (failure.kind !== 'session-expired' && failure.kind !== 'not-applied') {
					confirmingWithdraw = false;
					await focusAfterUpdate(() => withdrawButton);
				}
				return;
			}
			application = { key, state: 'loaded', status: { applied: false } };
			confirmingWithdraw = false;
			// Announced by the toast alone
			toaster.success({ title: copy.done, description: copy.doneDescription });
			await focusAfterUpdate(() => applyButton);
		} catch {
			await handleFailure(applicationFailure(action, undefined), key);
			confirmingWithdraw = false;
			await focusAfterUpdate(() => withdrawButton);
		} finally {
			busy = null;
		}
	}

	const onConfirmKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape' && busy !== 'withdraw') {
			event.stopPropagation();
			cancelWithdraw();
		}
	};

	// --- Sign-in and claim ---------------------------------------------------------------------
	const onSignedIn = () => {
		notice = null;
		focusAfterUpdate(() => headingElement);
	};

	/** `existing`: nothing was claimed, the account turned out to own `name` already */
	const onClaimed = (name: string, existing = false) => {
		notice = null;
		claimed = { name, existing };
		// A new portfolio is announced by the claim form's toast alone
		announcement = existing
			? `Your account already owns the portfolio ${name}: no other portfolio was claimed. You can apply with ${name}.`
			: '';
		focusAfterUpdate(() => headingElement);
	};

	// --- Display -------------------------------------------------------------------------------
	let closed = $derived(closedNotice(job.status));

	let title = $derived.by(() => {
		switch (view) {
			case 'not-open':
				return closed.title;
			case 'own-posting':
				return 'This is your job description';
			case 'signed-out':
				return 'Sign in to apply with your portfolio';
			case 'can-apply':
				if (current?.state === 'loaded' && current.status.applied) {
					return current.status.source === 'added_by_recruiter'
						? 'On the applicant list'
						: 'Application sent';
				}
				return 'Apply with your portfolio';
			case 'no-portfolio':
				return 'Apply with your portfolio';
			default:
				return 'Apply';
		}
	});

	let Icon = $derived.by(() => {
		if (view === 'not-open') {
			return job.status === 'on_hold'
				? PauseCircle
				: job.status === 'filled'
					? CheckBadge
					: NoSymbol;
		}
		if (view === 'own-posting') return Briefcase;
		if (view === 'signed-out') return LockClosed;
		if (view === 'no-portfolio') return UserCircle;
		return hasApplied ? CheckCircle : PaperAirplane;
	});

	let iconTone = $derived(
		view === 'not-open'
			? 'preset-tonal'
			: hasApplied
				? 'preset-tonal-success'
				: 'preset-tonal-primary'
	);

	// A long portfolio name wraps only where it would overflow, never mid-word otherwise
	const linkClass =
		'font-medium text-primary-700-300 underline underline-offset-2 wrap-anywhere hover:decoration-2';
</script>

{#snippet portfolioLink(name: string)}
	<a href={resolve('/[domain]/experiences', { domain: name })} class={linkClass}>{name}</a>
{/snippet}

{#snippet applicationState()}
	{#if current?.state === 'loading'}
		<div class="space-y-3" aria-hidden="true">
			<div class="placeholder h-4 w-full animate-pulse motion-reduce:animate-none"></div>
			<div class="placeholder h-4 w-2/3 animate-pulse motion-reduce:animate-none"></div>
			{#if view === 'can-apply'}
				<div
					class="placeholder h-11 w-full animate-pulse rounded-base motion-reduce:animate-none"
				></div>
			{/if}
		</div>
		<p class="sr-only">Checking whether you applied…</p>
	{:else if current?.state === 'error'}
		<div class="space-y-3 rounded-base preset-tonal-error p-3 text-sm" role="alert">
			<p>{current.message}</p>
			<button
				type="button"
				class="btn btn-sm preset-filled-error-700-300 min-h-11"
				onclick={retryStatus}
			>
				Try again
			</button>
		</div>
	{:else if current?.state === 'loaded' && current.status.applied}
		<div class="space-y-3">
			<p
				bind:this={summaryElement}
				class="flex items-start gap-2 font-medium text-surface-950-50 focus:outline-none"
				tabindex="-1"
			>
				<CheckCircle size="20" class="mt-0.5 shrink-0 text-success-700-300" aria-hidden="true" />
				<span>{applicationSummary(current.status)}.</span>
			</p>
			<p class="text-sm text-surface-700-300">
				{#if current.status.source === 'added_by_recruiter'}
					They see your portfolio, {@render portfolioLink(domain)}. You can remove yourself from the
					list.
				{:else}
					The recruiter sees your name and your portfolio, {@render portfolioLink(domain)}. Keep it
					up to date.
				{/if}
			</p>
			{#if confirmingWithdraw}
				<div
					class="space-y-3 rounded-base border border-error-500/40 p-3"
					role="group"
					aria-labelledby="{uid}-confirm"
				>
					<p id="{uid}-confirm" class="text-sm font-medium">{leave.question}</p>
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							class="btn preset-filled-error-700-300 min-h-11 flex-1"
							disabled={busy === 'withdraw'}
							onclick={withdraw}
							onkeydown={onConfirmKeydown}
						>
							{#if busy === 'withdraw'}
								<span
									class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
									aria-hidden="true"
								></span>
								<span>{leave.busy}</span>
							{:else}
								<span>{leave.confirm}</span>
							{/if}
						</button>
						<button
							bind:this={keepButton}
							type="button"
							class="btn preset-tonal min-h-11 flex-1"
							disabled={busy === 'withdraw'}
							onclick={cancelWithdraw}
							onkeydown={onConfirmKeydown}
						>
							Keep it
						</button>
					</div>
				</div>
			{:else}
				<button
					bind:this={withdrawButton}
					type="button"
					class="btn preset-outlined-surface-300-700 min-h-11 w-full hover:preset-tonal-error"
					onclick={askWithdraw}
				>
					{leave.button}
				</button>
			{/if}
		</div>
	{/if}
{/snippet}

<section
	{id}
	class="card preset-outlined-surface-200-800 bg-surface-50-950 scroll-mt-4 space-y-4 p-5"
	aria-labelledby="{uid}-title"
	aria-busy={view === 'checking' || current?.state === 'loading'}
>
	<div class="flex items-center gap-3">
		<span
			class="flex size-10 shrink-0 items-center justify-center rounded-full {iconTone}"
			aria-hidden="true"
		>
			<Icon size="20" />
		</span>
		<h2
			bind:this={headingElement}
			id="{uid}-title"
			class="min-w-0 text-lg leading-snug font-semibold focus:outline-none"
			tabindex="-1"
		>
			{title}
		</h2>
	</div>

	{#if view === 'not-open'}
		<p class="text-surface-700-300">{closed.text}</p>
		{#if noticeText}
			<p class="rounded-base preset-tonal-warning p-3 text-sm" role="alert">{noticeText}</p>
		{/if}
		{#if !user && noticeText}
			<!-- The session expired while withdrawing: signed in again, the application shows again -->
			<ApplySignIn {onSignedIn} />
		{:else if ownPosting}
			<div class="space-y-3 border-t border-surface-200-800 pt-4">
				<p class="text-sm text-surface-700-300">
					This is your job description. Reopen it from your recruiter space to take applications
					again.
				</p>
				<a
					href={resolve('/(app)/recruiter/jobs/[id]', { id: job._id })}
					class="btn preset-filled-primary-700-300 min-h-11 w-full">Manage it</a
				>
			</div>
		{:else if user?.domain && current && (current.state !== 'loaded' || current.status.applied)}
			<div class="border-t border-surface-200-800 pt-4">{@render applicationState()}</div>
		{/if}
	{:else if view === 'checking'}
		<div class="space-y-3" aria-hidden="true">
			<div class="placeholder h-4 w-full animate-pulse motion-reduce:animate-none"></div>
			<div class="placeholder h-4 w-3/4 animate-pulse motion-reduce:animate-none"></div>
			<div
				class="placeholder h-11 w-full animate-pulse rounded-base motion-reduce:animate-none"
			></div>
		</div>
		<p class="sr-only">Loading…</p>
	{:else if view === 'own-posting'}
		<p class="text-surface-700-300">
			Candidates apply to it from this page. You see who applied, and change the posting, in your
			recruiter space.
		</p>
		<a
			href={resolve('/(app)/recruiter/jobs/[id]', { id: job._id })}
			class="btn preset-filled-primary-700-300 min-h-11 w-full">Manage it</a
		>
	{:else if view === 'signed-out'}
		{#if noticeText}
			<p class="rounded-base preset-tonal-warning p-3 text-sm" role="alert">{noticeText}</p>
		{/if}
		<p class="text-surface-700-300">
			The recruiter sees your name and your portfolio: your experience, skills and projects. Never
			your email. No portfolio yet? You can claim one once signed in.
		</p>
		<ApplySignIn {onSignedIn} />
	{:else if view === 'no-portfolio' && user}
		{#if noticeText}
			<p class="rounded-base preset-tonal-warning p-3 text-sm" role="alert">{noticeText}</p>
		{/if}
		<p class="text-surface-700-300">
			Claim one first: it is free, and it is what the recruiter sees when you apply.
		</p>
		<ClaimPortfolioForm {user} {onClaimed} onSessionExpired={(message) => expireSession(message)} />
	{:else if view === 'can-apply'}
		{#if current?.state === 'loaded' && !current.status.applied}
			<div class="space-y-3">
				{#if claimedNote?.existing}
					<p class="rounded-base preset-tonal-primary p-3 text-sm">
						Your account already owns {@render portfolioLink(domain)}, so no other portfolio was
						claimed: an account has one portfolio. Apply with this one.
					</p>
				{:else if claimedNote}
					<p class="rounded-base preset-tonal-primary p-3 text-sm">
						Your new portfolio is empty for now.
						<a href={resolve('/[domain]/experiences', { domain })} class={linkClass}
							>Add your experience</a
						>
						first, so the recruiter sees more than your name.
					</p>
				{/if}
				<p class="text-surface-700-300">
					The recruiter will see your name and your portfolio, {@render portfolioLink(domain)}.
					Never your email.
				</p>
				<button
					bind:this={applyButton}
					type="button"
					class="btn preset-filled-primary-700-300 min-h-11 w-full"
					disabled={busy === 'apply'}
					onclick={apply}
				>
					{#if busy === 'apply'}
						<span
							class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
							aria-hidden="true"
						></span>
						<span>Sending your application…</span>
					{:else}
						<PaperAirplane size="18" class="shrink-0" aria-hidden="true" />
						<span class="min-w-0 truncate">Apply with {domain}</span>
					{/if}
				</button>
			</div>
		{:else}
			{@render applicationState()}
		{/if}
	{/if}

	{#if actionError}
		<p class="rounded-base preset-tonal-error p-3 text-sm" role="alert">{actionError}</p>
	{/if}

	<p class="sr-only" role="status" aria-live="polite">{announcement}</p>
</section>
