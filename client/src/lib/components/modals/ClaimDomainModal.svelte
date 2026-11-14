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
	import { STALE_TERMS_MESSAGE, currentConsent } from 'portfolio-common';
	import AgeTermsConsent from '#components/legal/AgeTermsConsent.svelte';
	import { signIn } from '#services/authentication.ts';
	import { claimPortfolio } from '#services/account.ts';
	import { setupGoogleIdentity } from '#services/googleIdentity.ts';
	import { toaster } from '#services/toaster.ts';

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
		if (result.reason === 'session-expired') return 'Sign-in failed. Please try again.';
		if (result.cause === 'owns-domain') return 'Your Google account already owns a portfolio.';
		if (result.cause === 'name') return 'This name is no longer available.';
		return result.message;
	};

	const claim = async ({ credential }: google.accounts.id.CredentialResponse) => {
		errorMessage = '';
		// Google's button may still be on screen after the box was unticked
		if (!checked) {
			consentProblem = 'Tick the box to confirm your age and accept the terms.';
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
					signedIn.reason === 'stale-terms'
						? STALE_TERMS_MESSAGE
						: 'Sign-in failed. Please try again.';
				return;
			}

			const result = await claimPortfolio(domainName, consent);
			if (!result.ok) {
				errorMessage = claimError(result);
				return;
			}

			toaster.success({
				title: 'Portfolio claimed',
				description: `${result.name} is yours. Add your first experience to it.`
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
						shape: 'pill'
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
	<header class={cHeader}>Claim {domainName}</header>
	<p>
		By signing in with your Google account, you will become the owner of <strong
			>{domainName}</strong
		>.
	</p>
	<p class="text-sm text-surface-600-400">Each Google account can only own one domain.</p>

	<AgeTermsConsent bind:checked error={consentError} disabled={claiming} id={consentId} />

	{#if errorMessage}
		<div class="p-3 rounded bg-error-500/10 text-error-500" role="alert">{errorMessage}</div>
	{/if}

	{#if claiming}
		<p class="text-center" role="status">Claiming domain...</p>
	{/if}
	{#if !checked}
		<p class="text-center text-sm text-surface-600-400">
			Tick the box to show the Google sign-in button.
		</p>
	{:else if gsiState === 'loading'}
		<div class="flex justify-center" aria-hidden="true">
			<div
				class="placeholder h-10 w-56 animate-pulse rounded-full motion-reduce:animate-none"
			></div>
		</div>
	{:else if gsiState === 'unavailable'}
		<div class="space-y-2 text-center text-sm" role="alert">
			<p>
				Google sign-in could not load. Check your connection (or allow accounts.google.com) and try
				again.
			</p>
			<button type="button" class="btn btn-sm preset-tonal" onclick={() => (gsiState = 'idle')}>
				Try again
			</button>
		</div>
	{/if}
	<div
		class={['flex justify-center', { hidden: claiming || !checked }]}
		bind:this={buttonContainer}
	></div>

	<footer class="flex justify-end">
		<button class="btn preset-tonal" onclick={onClose}>Cancel</button>
	</footer>
</div>
