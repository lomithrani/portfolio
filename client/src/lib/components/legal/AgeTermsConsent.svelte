<!--
@component
The age and terms confirmation of the sign-in and claim forms: an unticked, required checkbox
labelled with portfolio-common's legalMessages.ageConfirmation (the exact wording the API records with
the acceptance, AGE_CONFIRMATION_KEY), and under it the notice linking the Terms of use and the
Privacy policy (opened in a new tab, so the form keeps what was typed). Once ticked, the form
sends portfolio-common's currentConsent() with its request.

- `checked`: bindable, false until the person ticks it
- `error`: shown under the box, which is then marked invalid (aria-invalid)
- `disabled`: while the form is busy
- `id`: id of the checkbox (generated when not given), e.g. to focus it
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { legalMessages } from 'portfolio-common';
	import Rich from '#lib/i18n/Rich.svelte';
	import { m } from './legal.messages.ts';

	let {
		checked = $bindable(false),
		error,
		disabled = false,
		id
	}: {
		checked?: boolean;
		error?: string;
		disabled?: boolean;
		id?: string;
	} = $props();

	const uid = $props.id();

	let inputId = $derived(id ?? `${uid}-age-terms`);
	let noticeId = $derived(`${inputId}-notice`);
	let errorId = $derived(`${inputId}-error`);
</script>

<div class="space-y-2">
	<label
		for={inputId}
		class={['flex items-start gap-3 text-sm', disabled ? 'cursor-not-allowed' : 'cursor-pointer']}
	>
		<input
			id={inputId}
			type="checkbox"
			class="checkbox mt-0.5 shrink-0"
			bind:checked
			{disabled}
			required
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? `${noticeId} ${errorId}` : noticeId}
		/>
		<span class="text-surface-950-50">{legalMessages.ageConfirmation}</span>
	</label>
	<p id={noticeId} class="ps-7 text-xs text-surface-700-300">
		<Rich text={m.consent.notice}>
			{#snippet terms(text: string)}<a
					class="link-text"
					href={resolve('/(site)/legal/terms')}
					target="_blank"
					rel="noopener noreferrer">{text}<span class="sr-only"> {m.consent.newTab}</span></a
				>{/snippet}
			{#snippet privacy(text: string)}<a
					class="link-text"
					href={resolve('/(site)/legal/privacy')}
					target="_blank"
					rel="noopener noreferrer">{text}<span class="sr-only"> {m.consent.newTab}</span></a
				>{/snippet}
		</Rich>
	</p>
	{#if error}
		<p id={errorId} class="ps-7 text-sm text-error-700-300">{error}</p>
	{/if}
</div>
