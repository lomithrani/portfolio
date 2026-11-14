<!--
@component
The apply panel's claim form, for a signed-in account without a portfolio: a portfolio name
(suggested from the account's name), the address it gets, and POST /domain/claim
(claimPortfolio). The visitor stays on the job page: once claimed, the panel offers to apply.
An account that has not accepted the Terms of use in force ticks the age and terms checkbox
(AgeTermsConsent) first: the API refuses the claim otherwise, and records the acceptance with it.
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import { currentConsent, normalizeDomainName } from 'portfolio-common';
	import AgeTermsConsent from '#components/legal/AgeTermsConsent.svelte';
	import {
		DOMAIN_NAME_MAX_LENGTH,
		PORTFOLIO_NAME_PLACEHOLDER,
		claimPortfolio,
		domainNameProblem,
		hasAcceptedCurrentTerms,
		refreshAccount,
		suggestDomainName,
		switchMode
	} from '#services/account.ts';
	import type { AuthUser } from '#services/stores/index.ts';
	import { toaster } from '#services/toaster.ts';

	let {
		user,
		onClaimed,
		onSessionExpired
	}: {
		user: AuthUser;
		/**
		 * The account owns `name` now: claimed here, or (`existing`) found to own it already, the
		 * name typed here then left unclaimed
		 */
		onClaimed: (name: string, existing?: boolean) => void;
		/** The session ended (it is cleared): the panel asks to sign in again */
		onSessionExpired: (message: string) => void;
	} = $props();

	const uid = $props.id();

	let name = $state(untrack(() => suggestDomainName(user)));
	let submitted = $state(false);
	let busy = $state(false);
	/** The API refused this name (taken, invalid): shown until it is changed */
	let refused = $state<{ name: string; message: string } | null>(null);
	let formError = $state('');
	let nameInput: HTMLInputElement | undefined = $state();
	let alertElement: HTMLParagraphElement | undefined = $state();

	/** The age and terms checkbox */
	let consentChecked = $state(false);
	/** The API asked for the confirmation (the session did not know the account lacked it) */
	let consentAsked = $state(false);
	let consentProblem = $state('');
	/** The API refused the version of the terms this page sends: ticking again cannot fix it */
	let consentStale = $state(false);
	/** Shown until the box is ticked (a refused version of the terms stays: the page is outdated) */
	let consentError = $derived(consentChecked && !consentStale ? '' : consentProblem);
	let showConsent = $derived(consentAsked || !hasAcceptedCurrentTerms(user));
	const consentId = `${uid}-consent`;

	let normalizedName = $derived(normalizeDomainName(name));
	let nameError = $derived.by(() => {
		if (refused && refused.name === normalizedName) return refused.message;
		return submitted ? (domainNameProblem(name) ?? '') : '';
	});
	let host = $derived(page.url.host);

	const showError = async (message: string) => {
		formError = message;
		await tick();
		alertElement?.focus();
	};

	async function claim(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		submitted = true;
		formError = '';
		if (domainNameProblem(name)) {
			nameInput?.focus();
			return;
		}
		if (showConsent && !consentChecked) {
			consentProblem = 'Tick the box to confirm your age and accept the terms.';
			document.getElementById(consentId)?.focus();
			return;
		}

		busy = true;
		const claimedName = normalizedName;
		try {
			const result = await claimPortfolio(claimedName, showConsent ? currentConsent() : undefined);
			if (result.ok) {
				// Claiming a portfolio is choosing the candidate space (as everywhere else); the
				// portfolio exists whether or not the choice is recorded
				const switched = await switchMode('candidate');
				if (!switched.ok && switched.reason === 'session-expired') {
					onSessionExpired(switched.message);
					return;
				}
				toaster.success({
					title: 'Portfolio claimed',
					description: `${result.name} is yours. Add your experience so recruiters see it.`
				});
				onClaimed(result.name);
				return;
			}
			if (result.reason === 'session-expired') {
				onSessionExpired(result.message);
			} else if (result.cause === 'consent') {
				// The account has not accepted the terms in force, or this page's version is outdated
				consentAsked = true;
				consentStale = consentChecked;
				consentProblem = result.message;
				// Enabled again (a disabled checkbox takes no focus), and shown
				busy = false;
				await tick();
				document.getElementById(consentId)?.focus();
			} else if (result.cause === 'name') {
				refused = { name: claimedName, message: result.message };
				await tick();
				nameInput?.focus();
			} else if (result.cause === 'owns-domain') {
				// The session was behind (claimed elsewhere meanwhile): the account's portfolio is
				// known once reloaded, and the panel offers to apply with it
				const account = await refreshAccount();
				if (account.ok && account.user.domain) onClaimed(account.user.domain, true);
				else await showError(result.message);
			} else {
				await showError(result.message);
			}
		} finally {
			busy = false;
		}
	}
</script>

<form class="space-y-3" novalidate onsubmit={claim} aria-busy={busy}>
	<div class="space-y-1.5">
		<label class="label" for="{uid}-name">
			<span class="label-text font-medium">Portfolio name</span>
		</label>
		<input
			bind:this={nameInput}
			bind:value={name}
			id="{uid}-name"
			class="input min-h-11"
			type="text"
			name="portfolio-name"
			inputmode="url"
			autocomplete="off"
			autocapitalize="none"
			spellcheck="false"
			maxlength={DOMAIN_NAME_MAX_LENGTH}
			placeholder={PORTFOLIO_NAME_PLACEHOLDER}
			aria-invalid={nameError ? 'true' : undefined}
			aria-describedby="{uid}-hint{nameError ? ` ${uid}-error` : ''}"
			readonly={busy}
		/>
		{#if nameError}
			<p id="{uid}-error" class="text-sm text-error-700-300">{nameError}</p>
		{/if}
		<p id="{uid}-hint" class="text-sm wrap-anywhere text-surface-700-300">
			Lowercase letters, digits, dots and hyphens. Your portfolio will be at
			<span class="font-medium text-surface-950-50"
				>{host}/{normalizedName || PORTFOLIO_NAME_PLACEHOLDER}</span
			>.
		</p>
	</div>
	{#if showConsent}
		<AgeTermsConsent
			bind:checked={consentChecked}
			error={consentError}
			disabled={busy}
			id={consentId}
		/>
	{/if}
	{#if formError}
		<p
			bind:this={alertElement}
			class="rounded-base preset-tonal-error p-3 text-sm"
			role="alert"
			tabindex="-1"
		>
			{formError}
		</p>
	{/if}
	<button type="submit" class="btn preset-filled-primary-700-300 min-h-11 w-full" disabled={busy}>
		{#if busy}
			<span
				class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
				aria-hidden="true"
			></span>
			<span>Claiming…</span>
		{:else}
			<span>Claim this portfolio</span>
		{/if}
	</button>
</form>
