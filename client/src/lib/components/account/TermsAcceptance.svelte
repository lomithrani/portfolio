<!--
@component
The account page's "Terms of use" card: which version of the Terms of use and Privacy policy the
account accepted (portfolio-common LEGAL_VERSION is the one in force), and, when it has not
accepted that one, the age and terms checkbox with a button that records the acceptance
(PUT /me/consent with the source 'account', acceptTerms). An account needs it to create a
portfolio; an account that signed in elsewhere (the header, the recruiter space) may not have
given it yet, and a portfolio claimed before the terms existed stays online without it (the text
says so to its owner).
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { ArrowPath, CheckCircle, DocumentText, ExclamationTriangle } from 'svelte-heros-v2';
	import { LEGAL_VERSION } from 'portfolio-common';
	import AgeTermsConsent from '#components/legal/AgeTermsConsent.svelte';
	import { formatLegalDate } from '#components/legal/legalDocuments.ts';
	import { acceptTerms, hasAcceptedCurrentTerms } from '#services/account.ts';
	import { termsVersionText } from '#services/authentication.ts';
	import type { AuthUser } from '#services/stores/index.ts';
	import { toaster } from '#services/toaster.ts';

	let { user }: { user: AuthUser } = $props();

	const uid = $props.id();
	const checkboxId = `${uid}-consent`;

	let accepted = $derived(hasAcceptedCurrentTerms(user));
	/** An older version of the terms: they changed since the account accepted them */
	let acceptedVersion = $derived(termsVersionText(user.termsVersion));
	let currentDate = formatLegalDate(LEGAL_VERSION, 'en');

	let checked = $state(false);
	let busy = $state(false);
	let consentError = $state('');
	let formError = $state('');
	let alertElement: HTMLParagraphElement | undefined = $state();
	/** The status line: it takes the focus once the form it replaces is gone */
	let acceptedElement: HTMLParagraphElement | undefined = $state();

	// Ticked: the reminder has done its job
	let shownConsentError = $derived(checked ? '' : consentError);

	const TICK_THE_BOX = 'Tick the box to confirm your age and accept the terms.';

	const showError = async (message: string) => {
		formError = message;
		await tick();
		alertElement?.focus();
	};

	async function accept(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		formError = '';
		if (!checked) {
			consentError = TICK_THE_BOX;
			document.getElementById(checkboxId)?.focus();
			return;
		}
		consentError = '';
		busy = true;
		try {
			const result = await acceptTerms('account');
			if (result.ok) {
				checked = false;
				// The form (and the focused button) is gone: the status line takes the focus
				await tick();
				acceptedElement?.focus();
				toaster.success({
					title: 'Terms accepted',
					description: `You accepted the Terms of use of ${currentDate}.`
				});
			} else if (result.reason === 'session-expired') {
				// The page now asks to sign in again
				toaster.error({ title: result.message, description: 'Your acceptance was not saved.' });
			} else {
				await showError(result.message);
			}
		} finally {
			busy = false;
		}
	}
</script>

<section
	class="card preset-outlined-surface-200-800 bg-surface-50-950 space-y-4 p-4 md:p-6"
	aria-labelledby="{uid}-title"
	data-terms-acceptance
>
	<div class="flex items-start gap-3">
		<span
			class="grid size-10 shrink-0 place-items-center rounded-full preset-tonal-primary"
			aria-hidden="true"
		>
			<DocumentText size="20" />
		</span>
		<div class="min-w-0 flex-1 space-y-1">
			<h3 id="{uid}-title" class="text-lg font-semibold">Terms of use</h3>
			{#if accepted}
				<p
					bind:this={acceptedElement}
					class="flex items-start gap-2 text-sm text-surface-700-300 outline-none"
					data-terms-status="accepted"
					tabindex="-1"
				>
					<CheckCircle size="18" class="mt-0.5 shrink-0 text-success-700-300" aria-hidden="true" />
					<span>
						You accepted the
						<a class="link-text" href={resolve('/(site)/legal/terms')}>Terms of use</a>
						and the
						<a class="link-text" href={resolve('/(site)/legal/privacy')}>Privacy policy</a>
						of <span class="whitespace-nowrap">{currentDate}</span>, the version in force, and
						confirmed your age.
					</span>
				</p>
			{:else if acceptedVersion}
				<p class="text-sm text-surface-700-300" data-terms-status="outdated">
					You accepted the version of
					<span class="whitespace-nowrap">{formatLegalDate(acceptedVersion, 'en')}</span>. The terms
					changed on <span class="whitespace-nowrap">{currentDate}</span>: read the
					<a class="link-text" href={resolve('/(site)/legal/terms')}>Terms of use</a>
					{#if user.domain}
						and accept them: this records your confirmation for your portfolio.
					{:else}
						and accept them to create a portfolio.
					{/if}
				</p>
			{:else if user.domain}
				<!-- A portfolio claimed before the terms existed (or from a sign-in without the box): it stays online -->
				<p class="text-sm text-surface-700-300" data-terms-status="none">
					You have not accepted the current Terms of use yet. Accepting them records your
					confirmation for your portfolio.
				</p>
			{:else}
				<p class="text-sm text-surface-700-300" data-terms-status="none">
					You have not accepted the Terms of use yet. You need to before you create a portfolio.
				</p>
			{/if}
		</div>
	</div>

	{#if !accepted}
		<form class="space-y-3" novalidate onsubmit={accept} aria-busy={busy}>
			<AgeTermsConsent bind:checked error={shownConsentError} disabled={busy} id={checkboxId} />
			{#if formError}
				<p
					bind:this={alertElement}
					class="flex items-start gap-2 rounded-base border border-error-500/60 preset-tonal-error p-3 text-sm text-surface-950-50 outline-none"
					role="alert"
					tabindex="-1"
				>
					<ExclamationTriangle
						size="18"
						class="mt-0.5 shrink-0 text-error-700-300"
						aria-hidden="true"
					/>
					<span>{formError}</span>
				</p>
			{/if}
			<button
				type="submit"
				class="btn preset-filled-primary-700-300 min-h-11 w-full sm:w-auto"
				aria-disabled={busy ? 'true' : undefined}
			>
				{#if busy}
					<ArrowPath size="16" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
					<span>Saving…</span>
				{:else}
					<span>Accept the terms</span>
				{/if}
			</button>
		</form>
	{/if}
</section>
