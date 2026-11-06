<!--
@component
"Add a portfolio": lists a portfolio among a job description's applicants by its name (or its
address, pasted from the browser): POST /jobs/:id/applicants. Problems with the name (no such
portfolio, already listed, your own) show under the field; the others (expired session, deleted
posting, full list) as an alert. `onAdded` gets the new applicant.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { ArrowPath, ExclamationTriangle, UserPlus } from 'svelte-heros-v2';
	import { portfolioApi } from '#services';
	import { errorStatus } from '#services/apiErrors.ts';
	import { clearAuthentication } from '#services/authentication.ts';
	import { toaster } from '#services/toaster.ts';
	import {
		addApplicantError,
		applicantDomainProblem,
		applicantName,
		domainFromInput,
		type Applicant
	} from '#services/recruiter.ts';

	let { jobId, onAdded }: { jobId: string; onAdded: (applicant: Applicant) => void } = $props();

	const uid = $props.id();
	let value = $state('');
	let busy = $state(false);
	let submitted = $state(false);
	/** The API refused this name: shown until it is changed */
	let refused = $state<{ name: string; message: string } | null>(null);
	/** A failure that is not about the name */
	let alertMessage = $state('');
	let announcement = $state('');

	let input: HTMLInputElement | undefined = $state();
	let alertElement: HTMLElement | undefined = $state();

	let name = $derived(domainFromInput(value));
	let fieldError = $derived(
		refused && refused.name === name
			? refused.message
			: submitted
				? applicantDomainProblem(value)
				: null
	);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		submitted = true;
		alertMessage = '';
		announcement = '';
		const problem = applicantDomainProblem(value);
		if (problem) {
			// Described by the field; announced too when it already had the focus (Enter)
			announcement = problem;
			input?.focus();
			return;
		}
		const domain = name;
		busy = true;
		try {
			const { data, error } = await portfolioApi
				.jobs({ id: jobId })
				.applicants.post({ domain }, { fetch: { credentials: 'include' } });
			if (error || !data) {
				const status = errorStatus(error);
				const problem = addApplicantError(status, error?.value, domain);
				if (status === 401) {
					// The page goes back to its signed-out state (this form with it): a toast says why
					toaster.error({ title: problem.message });
					clearAuthentication();
					return;
				}
				if (problem.field) {
					refused = { name: domain, message: problem.message };
					announcement = problem.message;
					input?.focus();
				} else {
					alertMessage = problem.message;
					await tick();
					alertElement?.focus();
				}
				return;
			}
			value = '';
			submitted = false;
			refused = null;
			announcement = `${applicantName(data)} added to the applicants.`;
			onAdded(data);
			input?.focus();
		} catch {
			alertMessage = 'Could not reach the server. Check your connection and try again.';
			await tick();
			alertElement?.focus();
		} finally {
			busy = false;
		}
	}
</script>

<form class="space-y-2" onsubmit={submit} novalidate aria-busy={busy ? 'true' : undefined}>
	<label for="{uid}-domain" class="block text-sm font-semibold">Add a portfolio</label>
	<p id="{uid}-hint" class="text-xs text-surface-700-300">
		A portfolio name, e.g. louis.gentil, or its address.
	</p>
	<div class="flex gap-2">
		<input
			bind:this={input}
			bind:value
			id="{uid}-domain"
			type="text"
			class="input min-w-0 flex-1 {fieldError ? 'border-error-500' : ''}"
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			enterkeyhint="done"
			maxlength="300"
			aria-invalid={fieldError ? 'true' : undefined}
			aria-describedby="{uid}-hint{fieldError ? ` ${uid}-error` : ''}"
		/>
		<button
			type="submit"
			class="btn preset-filled-primary-700-300 min-h-10 shrink-0"
			aria-disabled={busy ? 'true' : undefined}
		>
			{#if busy}
				<ArrowPath size="18" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
				Adding…
			{:else}
				<UserPlus size="18" aria-hidden="true" />
				Add
			{/if}
		</button>
	</div>
	{#if fieldError}
		<p id="{uid}-error" class="flex items-start gap-1.5 text-sm text-error-700-300">
			<ExclamationTriangle size="16" class="mt-0.5 shrink-0" aria-hidden="true" />
			<span>{fieldError}</span>
		</p>
	{/if}
	{#if alertMessage}
		<div
			bind:this={alertElement}
			tabindex="-1"
			role="alert"
			class="flex items-start gap-2 rounded-base border border-error-500/60 preset-tonal-error p-3 text-sm text-surface-950-50 outline-none focus-visible:ring-2 focus-visible:ring-error-500"
		>
			<ExclamationTriangle
				size="18"
				class="mt-0.5 shrink-0 text-error-700-300"
				aria-hidden="true"
			/>
			<p class="font-medium">{alertMessage}</p>
		</div>
	{/if}
	<p class="sr-only" aria-live="polite">{announcement}</p>
</form>
