<!--
@component
The "Terms of use" card: which version of the Terms of use and Privacy policy the account accepted
(portfolio-common LEGAL_VERSION is the one in force), and, when it has not accepted that one, the
age and terms checkbox with a button that records the acceptance (PUT /me/consent, acceptTerms).
An account needs it to create a portfolio and to use its recruiter space; an account that signed
in elsewhere (the header) may not have given it yet, and a portfolio claimed before the terms
existed stays online without it (the text says so to its owner).

- `source`: where it shows: 'account' (the account page, the default) or 'recruiter' (the
  recruiter pages and the job step of a hiring journey, in place of what the API refused with a
  422 on `consent`: its texts are about the recruiter space, and the acceptance is recorded from
  there)
- `required`: the API asked for the terms (a 422 on `consent`): the form shows even when the
  session says they were accepted (then this page is older than the terms in force, and the API
  asks for a reload: legalMessages.staleTerms)
- `onAccepted`: once the acceptance is recorded (the recruiter pages load what was refused)
- `level`: the level of its heading (3 by default, 2 where it stands for the page's content)
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { ArrowPath, CheckCircle, DocumentText, ExclamationTriangle } from 'svelte-heros-v2';
	import { LEGAL_VERSION, getLocale, legalMessages } from 'portfolio-common';
	import AgeTermsConsent from '#components/legal/AgeTermsConsent.svelte';
	import { formatLegalDate } from '#components/legal/legalDocuments.ts';
	import Rich from '#lib/i18n/Rich.svelte';
	import { common } from '#lib/i18n/common.messages.ts';
	import {
		acceptTerms,
		hasAcceptedCurrentTerms,
		type AcceptTermsSource
	} from '#services/account.ts';
	import { accountMessages } from '#services/account.messages.ts';
	import { termsVersionText } from '#services/authentication.ts';
	import type { AuthUser } from '#services/stores/index.ts';
	import { toaster } from '#services/toaster.ts';
	import { m } from './TermsAcceptance.messages.ts';

	let {
		user,
		source = 'account',
		required = false,
		onAccepted,
		level = 3
	}: {
		user: AuthUser;
		source?: Extract<AcceptTermsSource, 'account' | 'recruiter'>;
		required?: boolean;
		onAccepted?: () => void;
		level?: 2 | 3;
	} = $props();

	const uid = $props.id();
	const checkboxId = `${uid}-consent`;

	/** The session says the terms in force were accepted */
	let acceptedInSession = $derived(hasAcceptedCurrentTerms(user));
	/** Accepted from this card (the API asked for them: `required`) */
	let acceptedHere = $state(false);
	let accepted = $derived(acceptedInSession && (!required || acceptedHere));
	let inRecruiterSpace = $derived(source === 'recruiter');
	/** An older version of the terms: they changed since the account accepted them */
	let acceptedVersion = $derived(termsVersionText(user.termsVersion));
	let currentDate = formatLegalDate(LEGAL_VERSION, getLocale());

	let checked = $state(false);
	let busy = $state(false);
	let consentError = $state('');
	let formError = $state('');
	let alertElement: HTMLParagraphElement | undefined = $state();
	/** The status line: it takes the focus once the form it replaces is gone */
	let acceptedElement: HTMLParagraphElement | undefined = $state();

	// Ticked: the reminder has done its job
	let shownConsentError = $derived(checked ? '' : consentError);

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
			consentError = accountMessages.claim.tickTheBox;
			document.getElementById(checkboxId)?.focus();
			return;
		}
		consentError = '';
		busy = true;
		try {
			const result = await acceptTerms(source);
			if (result.ok) {
				checked = false;
				acceptedHere = true;
				// The form (and the focused button) is gone: the status line takes the focus
				await tick();
				acceptedElement?.focus();
				toaster.success({
					title: m.done.title,
					description: m.done.description(currentDate)
				});
				onAccepted?.();
			} else if (result.reason === 'session-expired') {
				// The page now asks to sign in again
				toaster.error({ title: result.message, description: m.notSaved });
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
			<svelte:element this={`h${level}`} id="{uid}-title" class="text-lg font-semibold"
				>{m.title}</svelte:element
			>
			{#if accepted}
				<p
					bind:this={acceptedElement}
					class="flex items-start gap-2 text-sm text-surface-700-300 outline-none"
					data-terms-status="accepted"
					tabindex="-1"
				>
					<CheckCircle size="18" class="mt-0.5 shrink-0 text-success-700-300" aria-hidden="true" />
					<span>
						<Rich text={m.accepted(currentDate)} {terms} {date}>
							{#snippet privacy(text)}<a class="link-text" href={resolve('/(site)/legal/privacy')}
									>{text}</a
								>{/snippet}
						</Rich>
					</span>
				</p>
			{:else if acceptedInSession}
				<!-- The API asks for terms newer than this page's: only a reload shows them -->
				<p class="text-sm text-surface-700-300" data-terms-status="reload">
					{legalMessages.staleTerms}
				</p>
			{:else if acceptedVersion}
				<p class="text-sm text-surface-700-300" data-terms-status="outdated">
					<Rich
						text={(inRecruiterSpace
							? m.recruiter.outdated
							: user.domain
								? m.outdated.withPortfolio
								: m.outdated.withoutPortfolio)(
							formatLegalDate(acceptedVersion, getLocale()),
							currentDate
						)}
						{terms}
						{date}
					/>
				</p>
			{:else if inRecruiterSpace}
				<p class="text-sm text-surface-700-300" data-terms-status="none">
					<Rich text={m.recruiter.notAccepted} {terms} />
				</p>
			{:else if user.domain}
				<!-- A portfolio claimed before the terms existed (or from a sign-in without the box): it stays online -->
				<p class="text-sm text-surface-700-300" data-terms-status="none">
					{m.notAccepted.withPortfolio}
				</p>
			{:else}
				<p class="text-sm text-surface-700-300" data-terms-status="none">
					{m.notAccepted.withoutPortfolio}
				</p>
			{/if}
		</div>
	</div>

	{#if !accepted}
		<form class="space-y-3" novalidate onsubmit={accept} aria-busy={busy}>
			<AgeTermsConsent
				bind:checked
				error={shownConsentError}
				disabled={busy}
				id={checkboxId}
				recruiter={inRecruiterSpace}
			/>
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
					<span>{common.saving}</span>
				{:else}
					<span>{m.accept}</span>
				{/if}
			</button>
		</form>
	{/if}
</section>

{#snippet terms(text: string)}<a class="link-text" href={resolve('/(site)/legal/terms')}>{text}</a
	>{/snippet}

{#snippet date(text: string)}<span class="whitespace-nowrap">{text}</span>{/snippet}
