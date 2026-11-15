<!--
@component
The 404 page's claim of an unclaimed portfolio name (ClaimDomain): signing in with Google claims
`domainName` for the account (POST /login with the candidate space, then POST /domain/claim).
The age and terms checkbox (AgeTermsConsent) comes first: Google's sign-in script is loaded, and
its button shown, only once it is ticked (nothing reaches accounts.google.com before), and its
confirmation (portfolio-common currentConsent()) is sent with the sign-in and with the claim.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { legalMessages, currentConsent, getLocale } from 'portfolio-common';
	import AgeTermsConsent from '#components/legal/AgeTermsConsent.svelte';
	import Rich from '#lib/i18n/Rich.svelte';
	import { common } from '#lib/i18n/common.messages.ts';
	import { signIn } from '#services/authentication.ts';
	import { claimPortfolio } from '#services/account.ts';
	import { accountMessages } from '#services/account.messages.ts';
	import { setupGoogleIdentity } from '#services/googleIdentity.ts';
	import { toaster } from '#services/toaster.ts';
	import { m } from './ClaimDomainModal.messages.ts';

	let { domainName, onClose }: { domainName: string; onClose: () => void } = $props();

	const uid = $props.id();
	const consentId = `${uid}-consent`;

	let buttonContainer: HTMLDivElement | undefined = $state();
	let errorMessage = $state('');
	let claiming = $state(false);
	/** The age and terms checkbox: Google's button shows once it is ticked */
	let checked = $state(false);
	let consentProblem = $state('');
	let consentError = $derived(checked ? '' : consentProblem);
	/** Google's sign-in: not loaded until the box is ticked */
	let gsiState = $state<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');

	let destroyed = false;
	let release: (() => void) | undefined;

	const claimError = (result: Awaited<ReturnType<typeof claimPortfolio>>): string => {
		if (result.ok) return '';
		if (result.reason === 'session-expired') return m.signInFailed;
		if (result.cause === 'owns-domain') return m.ownsPortfolio;
		if (result.cause === 'name') return m.nameGone;
		return result.message;
	};

	const claim = async ({ credential }: google.accounts.id.CredentialResponse) => {
		errorMessage = '';
		// Google's button may still be on screen after the box was unticked
		if (!checked) {
			consentProblem = accountMessages.claim.tickTheBox;
			document.getElementById(consentId)?.focus();
			return;
		}
		claiming = true;

		try {
			const consent = currentConsent();
			// Claiming a portfolio is choosing the candidate space: no space chooser here. The box was
			// ticked in this claim form: recorded as such
			const signedIn = await signIn(credential, {
				mode: 'candidate',
				consent,
				consentSource: 'claim'
			});
			if (!signedIn.ok) {
				// Terms changed since the page loaded: retrying sends the same version, only a reload helps
				errorMessage =
					signedIn.reason === 'stale-terms' ? legalMessages.staleTerms : m.signInFailed;
				return;
			}

			const result = await claimPortfolio(domainName, consent);
			if (!result.ok) {
				errorMessage = claimError(result);
				return;
			}

			toaster.success({
				title: accountMessages.claim.claimed,
				description: accountMessages.claim.claimedFirstExperience(result.name)
			});
			await goto(resolve('/[domain]/experiences', { domain: result.name }), {
				invalidateAll: true
			});
		} finally {
			claiming = false;
		}
	};

	function loadGoogle() {
		gsiState = 'loading';
		setupGoogleIdentity(claim)
			.then((gsi) => {
				if (destroyed) {
					gsi.release();
					return;
				}
				release = gsi.release;
				// The container is never destroyed (only hidden while claiming or unticked), so the
				// button stays available for a retry after a failed claim
				if (buttonContainer) {
					gsi.id.renderButton(buttonContainer, {
						theme: 'filled_black',
						size: 'large',
						type: 'standard',
						text: 'signin_with',
						shape: 'pill',
						locale: getLocale()
					});
				}
				gsiState = 'ready';
			})
			.catch(() => {
				if (!destroyed) gsiState = 'unavailable';
			});
	}

	$effect(() => {
		// Ticked for the first time (or again after Google could not load): load Google's sign-in
		if (checked && gsiState === 'idle') untrack(loadGoogle);
	});

	onMount(() => () => {
		destroyed = true;
		release?.();
	});

	const cBase = 'bg-surface-100-900 p-4 max-w-md w-full shadow-xl space-y-4 rounded-lg';
	const cHeader = 'text-2xl font-bold';
</script>

<div class={cBase}>
	<header class={cHeader}>{m.title(domainName)}</header>
	<p>
		<Rich text={m.intro}>
			{#snippet name()}<strong>{domainName}</strong>{/snippet}
		</Rich>
	</p>
	<p class="text-sm text-surface-600-400">{m.onePerAccount}</p>

	<AgeTermsConsent bind:checked error={consentError} disabled={claiming} id={consentId} />

	{#if errorMessage}
		<div class="p-3 rounded bg-error-500/10 text-error-500" role="alert">{errorMessage}</div>
	{/if}

	{#if claiming}
		<p class="text-center" role="status">{m.claiming}</p>
	{/if}
	{#if !checked}
		<p class="text-center text-sm text-surface-600-400">
			{m.tickToShow}
		</p>
	{:else if gsiState === 'loading'}
		<div class="flex justify-center" aria-hidden="true">
			<div
				class="placeholder h-10 w-56 animate-pulse rounded-full motion-reduce:animate-none"
			></div>
		</div>
	{:else if gsiState === 'unavailable'}
		<div class="space-y-2 text-center text-sm" role="alert">
			<p>{m.googleUnavailable}</p>
			<button type="button" class="btn btn-sm preset-tonal" onclick={() => (gsiState = 'idle')}>
				{common.retry}
			</button>
		</div>
	{/if}
	<div
		class={['flex justify-center', { hidden: claiming || !checked }]}
		bind:this={buttonContainer}
	></div>

	<footer class="flex justify-end">
		<button class="btn preset-tonal" onclick={onClose}>{common.cancel}</button>
	</footer>
</div>
