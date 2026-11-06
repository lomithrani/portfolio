<!--
@component
"How do you want to continue?": the dialog that asks a signed-in account which space to use,
right after a sign-in from the header, or from the account menu (`start: 'claim'` opens it on the
claim form). Candidate goes to the portfolio the account owns (or claims one first: POST
/domain/claim), Recruiter to /recruiter (its space is created the first time). Either choice is
recorded as the account's active mode (PUT /me/mode). The last used space is marked and focused;
closing the dialog keeps the person where they are.
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import {
		ArrowPath,
		ArrowRight,
		Briefcase,
		ChevronLeft,
		ExclamationTriangle,
		UserCircle,
		XMark
	} from 'svelte-heros-v2';
	import { normalizeDomainName, type UserMode } from 'portfolio-common';
	import { authenticationStore } from '#services/stores/index.ts';
	import {
		DOMAIN_NAME_MAX_LENGTH,
		claimPortfolio,
		domainNameProblem,
		refreshAccount,
		suggestDomainName,
		switchMode,
		type AccountFailure
	} from '#services/account.ts';
	import { toaster } from '#services/toaster.ts';

	type Step = 'choose' | 'claim';

	let {
		open,
		start = 'choose',
		onClose,
		finalFocusEl
	}: {
		/** Controlled by the header */
		open: boolean;
		/** 'claim': open on the candidate's claim form (an account without a portfolio) */
		start?: Step;
		/** Called once the dialog may close (dismissed, or a space was chosen) */
		onClose: () => void;
		/** Where the focus goes once the dialog closes without navigating */
		finalFocusEl?: () => HTMLElement | null;
	} = $props();

	const uid = $props.id();

	let user = $derived($authenticationStore.user);
	let lastUsed = $derived(user?.activeMode);

	// Each opening starts afresh, on the step asked for: these are writable deriveds, reset
	// whenever `open` (or `start`) changes
	const freshOn = <T,>(_opening: unknown, value: T): T => value;

	let step = $derived<Step>(open ? start : 'choose');
	/** The request in flight: its choice cannot be made twice, nor the dialog closed */
	let busy = $derived<UserMode | 'claim' | null>(freshOn(open, null));
	/** A failure that is not about the name typed */
	let errorMessage = $derived(freshOn(open, ''));
	let name = $derived(
		freshOn(
			open,
			untrack(() => suggestDomainName(user))
		)
	);
	let submitted = $derived(freshOn(open, false));
	/** The API refused the name (taken, invalid): shown until it is changed */
	let refusedName = $derived<{ name: string; message: string } | null>(freshOn(open, null));
	/**
	 * A refused claim, announced (role=alert) when it is submitted: the visible message under the
	 * field follows the typing and stays quiet. Cleared once the name is edited.
	 */
	let claimAlert = $derived(freshOn([open, name], ''));

	let candidateButton: HTMLButtonElement | undefined = $state();
	let recruiterButton: HTMLButtonElement | undefined = $state();
	let nameInput: HTMLInputElement | undefined = $state();
	let alertElement: HTMLDivElement | undefined = $state();

	let normalizedName = $derived(normalizeDomainName(name));
	let nameError = $derived(
		refusedName && refusedName.name === normalizedName
			? refusedName.message
			: submitted
				? domainNameProblem(name)
				: null
	);
	let host = $derived(page.url.host);

	let statusText = $derived(
		busy === 'recruiter'
			? 'Opening your recruiter space…'
			: busy === 'candidate'
				? 'Opening your portfolio…'
				: busy === 'claim'
					? 'Claiming your portfolio…'
					: ''
	);

	const initialFocus = () => {
		if (step === 'claim') return nameInput ?? null;
		return (lastUsed === 'recruiter' ? recruiterButton : candidateButton) ?? null;
	};

	const requestClose = () => {
		if (!busy) onClose();
	};

	const showError = async (message: string) => {
		errorMessage = message;
		await tick();
		alertElement?.focus();
	};

	/** The session ended: the header now offers to sign in again, and this dialog has no use */
	const sessionExpired = (result: AccountFailure) => {
		onClose();
		toaster.error({ title: result.message, description: 'Your choice was not saved.' });
	};

	/**
	 * Says why the claim was refused, also when it was submitted with Enter from the field (the
	 * focus does not move then), and puts the focus back on the field.
	 */
	const announceClaimError = async (message: string) => {
		claimAlert = '';
		await tick();
		claimAlert = message;
		if (document.activeElement !== nameInput) nameInput?.focus();
	};

	const goToStep = async (next: Step) => {
		step = next;
		errorMessage = '';
		await tick();
		if (next === 'claim') nameInput?.focus();
		else candidateButton?.focus();
	};

	async function chooseCandidate() {
		if (busy) return;
		const domain = user?.domain;
		if (!domain) {
			await goToStep('claim');
			return;
		}
		busy = 'candidate';
		errorMessage = '';
		const result = await switchMode('candidate');
		busy = null;
		if (!result.ok && result.reason === 'session-expired') {
			sessionExpired(result);
			return;
		}
		// Any other failure only leaves the choice unrecorded: the portfolio is public
		onClose();
		await goto(resolve('/[domain]/experiences', { domain }));
	}

	async function chooseRecruiter() {
		if (busy) return;
		busy = 'recruiter';
		errorMessage = '';
		const result = await switchMode('recruiter');
		busy = null;
		if (!result.ok) {
			if (result.reason === 'session-expired') sessionExpired(result);
			else await showError(result.message);
			return;
		}
		onClose();
		await goto(resolve('/(app)/recruiter'));
	}

	async function claim(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		submitted = true;
		errorMessage = '';
		const problem = domainNameProblem(name);
		if (problem) {
			await announceClaimError(problem);
			return;
		}

		busy = 'claim';
		const result = await claimPortfolio(name);
		if (!result.ok) {
			busy = null;
			if (result.reason === 'session-expired') {
				sessionExpired(result);
			} else if (result.cause === 'name') {
				refusedName = { name: normalizedName, message: result.message };
				await announceClaimError(result.message);
			} else if (result.cause === 'owns-domain') {
				// The session was behind: the account's portfolio is known once reloaded
				await refreshAccount();
				step = 'choose';
				await showError(
					user?.domain
						? `${result.message} Choose Candidate to open ${user.domain}.`
						: result.message
				);
			} else {
				await showError(result.message);
			}
			return;
		}

		// Records the choice; the portfolio exists either way
		const switched = await switchMode('candidate');
		busy = null;
		if (!switched.ok && switched.reason === 'session-expired') {
			sessionExpired(switched);
			return;
		}
		toaster.success({
			title: 'Portfolio claimed',
			description: `${result.name} is yours. Add your first experience to it.`
		});
		onClose();
		await goto(resolve('/[domain]/experiences', { domain: result.name }));
	}

	const choiceClass =
		'group flex w-full items-start gap-3 rounded-container border p-4 text-left transition-colors outline-none hover:preset-tonal focus-visible:ring-2 focus-visible:ring-primary-500 aria-disabled:cursor-not-allowed';
</script>

<Dialog
	{open}
	onOpenChange={(details) => {
		if (!details.open) requestClose();
	}}
	closeOnEscape={!busy}
	closeOnInteractOutside={!busy}
	initialFocusEl={initialFocus}
	{finalFocusEl}
>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-950/60" />
		<Dialog.Positioner
			class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
		>
			<Dialog.Content
				class="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-container border-t border-surface-200-800 bg-surface-50-950 text-surface-950-50 shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:max-w-2xl sm:rounded-container sm:border"
				data-space-chooser
			>
				{#if open}
					<div class="flex items-start gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
						<div class="min-w-0 flex-1">
							<Dialog.Title>
								{#snippet element(attributes)}
									<h2 {...attributes} class="text-lg font-semibold sm:text-xl">
										{step === 'claim' ? 'Claim your portfolio' : 'How do you want to continue?'}
									</h2>
								{/snippet}
							</Dialog.Title>
							<Dialog.Description>
								{#snippet element(attributes)}
									<p {...attributes} class="mt-1 text-sm text-surface-700-300">
										{step === 'claim'
											? 'Choose the address of your portfolio. Each account owns one.'
											: 'You can switch spaces at any time from your account menu.'}
									</p>
								{/snippet}
							</Dialog.Description>
						</div>
						<button
							type="button"
							class="btn-icon size-10 shrink-0 hover:preset-tonal"
							aria-label="Close"
							aria-disabled={busy ? 'true' : undefined}
							onclick={requestClose}
						>
							<XMark size="20" aria-hidden="true" />
						</button>
					</div>

					<div
						class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6"
					>
						{#if errorMessage}
							<div
								bind:this={alertElement}
								tabindex="-1"
								class="flex items-start gap-2 rounded-base border border-error-500/60 preset-tonal-error p-3 text-sm text-surface-950-50 outline-none focus-visible:ring-2 focus-visible:ring-error-500"
								role="alert"
							>
								<ExclamationTriangle
									size="18"
									class="mt-0.5 shrink-0 text-error-700-300"
									aria-hidden="true"
								/>
								<p>{errorMessage}</p>
							</div>
						{/if}

						{#if step === 'choose'}
							<div class="grid gap-3 sm:grid-cols-2">
								{@render choice({
									mode: 'candidate',
									title: 'Candidate',
									description: user?.domain
										? `Go to your portfolio ${user.domain}.`
										: 'Claim a portfolio to show your experience and apply to job descriptions.',
									onclick: chooseCandidate
								})}
								{@render choice({
									mode: 'recruiter',
									title: 'Recruiter',
									description: 'Post job descriptions and review the portfolios that apply.',
									onclick: chooseRecruiter
								})}
							</div>
						{:else}
							<form id="{uid}-claim" class="space-y-2" novalidate onsubmit={claim}>
								<label class="label" for="{uid}-name">
									<span class="label-text font-medium">Portfolio name</span>
								</label>
								<input
									bind:this={nameInput}
									bind:value={name}
									id="{uid}-name"
									class="input"
									type="text"
									name="portfolio-name"
									inputmode="url"
									autocomplete="off"
									autocapitalize="none"
									spellcheck="false"
									maxlength={DOMAIN_NAME_MAX_LENGTH}
									placeholder="jane.doe"
									aria-invalid={nameError ? 'true' : undefined}
									aria-describedby="{uid}-name-hint{nameError ? ` ${uid}-name-error` : ''}"
									readonly={busy === 'claim'}
								/>
								{#if nameError}
									<p id="{uid}-name-error" class="text-sm text-error-700-300">{nameError}</p>
								{/if}
								<p id="{uid}-name-hint" class="text-sm text-surface-700-300 wrap-anywhere">
									Lowercase letters, digits, dots and hyphens. Your portfolio will be at
									<span class="font-medium text-surface-950-50"
										>{host}/{normalizedName || 'your-name'}</span
									>.
								</p>
								<p class="sr-only" role="alert">{claimAlert}</p>
							</form>
						{/if}

						<p class="sr-only" role="status" aria-live="polite">{statusText}</p>
					</div>

					<div
						class="flex flex-wrap items-center justify-end gap-2 border-t border-surface-200-800 px-4 py-3 sm:px-6"
					>
						{#if step === 'claim'}
							<button
								type="button"
								class="btn hover:preset-tonal me-auto"
								aria-disabled={busy ? 'true' : undefined}
								onclick={() => !busy && goToStep('choose')}
							>
								<ChevronLeft size="16" aria-hidden="true" />
								<span>Back</span>
							</button>
							<button
								type="submit"
								form="{uid}-claim"
								class="btn preset-filled-primary-500"
								aria-disabled={busy ? 'true' : undefined}
							>
								{#if busy === 'claim'}
									<ArrowPath size="16" class="animate-spin" aria-hidden="true" />
									<span>Claiming…</span>
								{:else}
									<span>Claim portfolio</span>
								{/if}
							</button>
						{:else}
							<button
								type="button"
								class="btn preset-tonal"
								aria-disabled={busy ? 'true' : undefined}
								onclick={requestClose}
							>
								Not now
							</button>
						{/if}
					</div>
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>

{#snippet choice({
	mode,
	title,
	description,
	onclick
}: {
	mode: UserMode;
	title: string;
	description: string;
	onclick: () => void;
})}
	{@const isLastUsed = lastUsed === mode}
	{@const isBusy = busy === mode}
	<button
		type="button"
		class="{choiceClass} {isLastUsed
			? 'border-primary-500 bg-primary-500/5'
			: 'border-surface-200-800 bg-surface-100-900'}"
		aria-labelledby="{uid}-{mode}-title"
		aria-describedby={`${uid}-${mode}-description${isLastUsed ? ` ${uid}-${mode}-last` : ''}`}
		aria-disabled={busy ? 'true' : undefined}
		aria-busy={isBusy ? 'true' : undefined}
		data-space={mode}
		bind:this={
			() => (mode === 'recruiter' ? recruiterButton : candidateButton),
			(element) => {
				if (mode === 'recruiter') recruiterButton = element;
				else candidateButton = element;
			}
		}
		{onclick}
	>
		<span
			class="grid size-11 shrink-0 place-items-center rounded-full {mode === 'recruiter'
				? 'preset-tonal-secondary'
				: 'preset-tonal-primary'}"
			aria-hidden="true"
		>
			{#if isBusy}
				<ArrowPath size="22" class="animate-spin" />
			{:else if mode === 'recruiter'}
				<Briefcase size="22" />
			{:else}
				<UserCircle size="22" />
			{/if}
		</span>
		<span class="min-w-0 flex-1 space-y-1">
			<span class="flex flex-wrap items-center gap-2">
				<span id="{uid}-{mode}-title" class="text-base font-semibold">{title}</span>
				{#if isLastUsed}
					<span id="{uid}-{mode}-last" class="badge preset-filled-primary-500 text-xs"
						>Last used</span
					>
				{/if}
			</span>
			<span id="{uid}-{mode}-description" class="block text-sm text-surface-700-300 wrap-anywhere">
				{description}
			</span>
		</span>
		<ArrowRight
			size="18"
			class="mt-1 shrink-0 text-surface-600-400 transition-transform group-hover:translate-x-0.5"
			aria-hidden="true"
		/>
	</button>
{/snippet}
