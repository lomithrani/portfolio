<!--
@component
"Suggest a step", under the step types of the owner's hiring journey editor: the owner describes
a step they miss and the API files it as a feature request in the project's GitHub repository
(GET, POST /workflow/step-suggestions; shown only when GET says `enabled`: the server needs a
GitHub token). The form's rules are portfolio-common's parseStepSuggestion, the API's too. The
suggestion is sent without the owner's name, and the form says where it goes. An expired session
is said, not acted on: signing the page out would take the journey editor around this form, and
its unsaved steps, away.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { LightBulb } from 'svelte-heros-v2';
	import {
		STEP_SUGGESTION_LIMITS,
		parseStepSuggestion,
		type StepSuggestionField
	} from 'portfolio-common';
	import { portfolioTextApi } from '#services';
	import { errorStatus } from '#services/apiErrors.ts';
	import { networkError } from '#services/recruiter.ts';
	import {
		emptySuggestion,
		suggestionFailure,
		type SuggestionFailure
	} from '#services/stepSuggestion.ts';
	import { toaster } from '#services/toaster.ts';
	import { common } from '#lib/i18n/common.messages.ts';
	import Rich from '#lib/i18n/Rich.svelte';
	import { m } from './StepSuggestion.messages.ts';

	const uid = $props.id();
	const withCredentials = { fetch: { credentials: 'include' } } as const;

	/** Whether this server takes suggestions: nothing is shown until it says so */
	let enabled = $state(false);
	let open = $state(false);
	let form = $state(emptySuggestion());
	let sending = $state(false);
	/** What is wrong, under its field or (no field) above the buttons */
	let problem = $state<{ message: string; field?: StepSuggestionField } | null>(null);

	let opener: HTMLButtonElement | undefined = $state();
	let panel: HTMLFormElement | undefined = $state();
	let alert: HTMLElement | undefined = $state();

	const field = (name: StepSuggestionField) =>
		panel?.querySelector<HTMLElement>(`[name="${name}"]`);
	const problemOf = (name: StepSuggestionField) => (problem?.field === name ? problem.message : '');

	onMount(async () => {
		try {
			const { data } = await portfolioTextApi.workflow['step-suggestions'].get(withCredentials);
			enabled = data?.enabled === true;
		} catch {
			// Without an answer the journey editor works the same: the form just stays away
		}
	});

	async function show() {
		open = true;
		await tick();
		field('name')?.focus();
	}

	/** Closes the form; what was typed stays until it is sent or the page is left */
	async function close() {
		open = false;
		problem = null;
		await tick();
		opener?.focus();
	}

	async function send(event: SubmitEvent) {
		event.preventDefault();
		if (sending) return;
		const parsed = parseStepSuggestion(form);
		if (!parsed.ok) {
			problem = { message: parsed.message, field: parsed.field };
			field(parsed.field)?.focus();
			return;
		}
		sending = true;
		problem = null;
		try {
			const { error } = await portfolioTextApi.workflow['step-suggestions'].post(
				parsed.suggestion,
				withCredentials
			);
			if (error) {
				await fail(suggestionFailure(errorStatus(error), error.value));
				return;
			}
			form = emptySuggestion();
			toaster.success({ title: m.sent, description: m.sentDetails });
			await close();
		} catch {
			await fail({ message: networkError() });
		} finally {
			sending = false;
		}
	}

	/**
	 * Says what went wrong and puts the focus on it: the field it is about, or the message. The
	 * button that had the focus was disabled while sending, so the focus would otherwise be lost
	 */
	async function fail(failure: SuggestionFailure) {
		problem = failure;
		sending = false;
		await tick();
		(failure.field ? field(failure.field) : alert)?.focus();
	}
</script>

{#if enabled}
	<section
		class="space-y-3 card border border-surface-200-800 p-4 sm:p-5"
		aria-labelledby="{uid}-title"
	>
		<div class="flex flex-col items-start gap-x-4 gap-y-2 sm:flex-row sm:items-center">
			<div class="min-w-0 flex-1 space-y-1">
				<h3 class="font-semibold" id="{uid}-title">{m.title}</h3>
				<p class="text-sm text-surface-700-300">{m.intro}</p>
			</div>
			{#if !open}
				<button
					type="button"
					class="btn preset-tonal shrink-0"
					aria-expanded="false"
					bind:this={opener}
					onclick={show}
				>
					<LightBulb size="18" aria-hidden="true" />
					{m.suggest}
				</button>
			{/if}
		</div>

		{#if open}
			<form class="space-y-3" novalidate onsubmit={send} bind:this={panel}>
				<div class="space-y-1">
					<label class="label-text" for="{uid}-name">{m.name}</label>
					<input
						id="{uid}-name"
						name="name"
						class="input"
						type="text"
						maxlength={STEP_SUGGESTION_LIMITS.name}
						placeholder={m.namePlaceholder}
						autocomplete="off"
						bind:value={form.name}
						disabled={sending}
						aria-required="true"
						aria-invalid={problemOf('name') ? true : undefined}
						aria-describedby={problemOf('name') ? `${uid}-name-problem` : undefined}
					/>
					{#if problemOf('name')}
						<p class="text-xs text-error-700-300" id="{uid}-name-problem">{problemOf('name')}</p>
					{/if}
				</div>
				<div class="space-y-1">
					<label class="label-text" for="{uid}-description">{m.description}</label>
					<textarea
						id="{uid}-description"
						name="description"
						class="textarea"
						rows="4"
						maxlength={STEP_SUGGESTION_LIMITS.description}
						placeholder={m.descriptionPlaceholder}
						bind:value={form.description}
						disabled={sending}
						aria-required="true"
						aria-invalid={problemOf('description') ? true : undefined}
						aria-describedby="{uid}-description-help"></textarea>
					<p class="flex flex-wrap justify-between gap-x-4 text-xs" id="{uid}-description-help">
						<span class={problemOf('description') ? 'text-error-700-300' : 'text-surface-700-300'}>
							{problemOf('description') || m.descriptionHelp}
						</span>
						<span class="text-surface-700-300">
							{form.description.length}/{STEP_SUGGESTION_LIMITS.description}
						</span>
					</p>
				</div>
				<div class="space-y-1">
					<label class="label-text" for="{uid}-reason">
						<Rich text={m.reason}>
							{#snippet note(text)}<span class="font-normal opacity-75">{text}</span>{/snippet}
						</Rich>
					</label>
					<textarea
						id="{uid}-reason"
						name="reason"
						class="textarea"
						rows="3"
						maxlength={STEP_SUGGESTION_LIMITS.reason}
						bind:value={form.reason}
						disabled={sending}
						aria-invalid={problemOf('reason') ? true : undefined}
						aria-describedby="{uid}-reason-help"></textarea>
					<p class="flex flex-wrap justify-between gap-x-4 text-xs" id="{uid}-reason-help">
						<span class={problemOf('reason') ? 'text-error-700-300' : 'text-surface-700-300'}>
							{problemOf('reason') || m.reasonHelp}
						</span>
						<span class="text-surface-700-300">
							{form.reason.length}/{STEP_SUGGESTION_LIMITS.reason}
						</span>
					</p>
				</div>
				<p class="text-xs text-surface-700-300">{m.publicNotice}</p>
				{#if problem && !problem.field}
					<p
						class="text-sm text-error-700-300 outline-none"
						role="alert"
						tabindex="-1"
						bind:this={alert}
					>
						{problem.message}
					</p>
				{/if}
				<div class="flex flex-wrap gap-3">
					<button type="submit" class="btn preset-filled-primary-700-300" disabled={sending}>
						{sending ? m.sending : m.send}
					</button>
					<button type="button" class="btn preset-tonal" disabled={sending} onclick={close}>
						{common.cancel}
					</button>
				</div>
			</form>
		{/if}
	</section>
{/if}
