<!--
@component
"Send feedback": the page's one feedback dialog (Header.svelte mounts it for a signed-in account),
opened from the account menu or the footer (openFeedback of #services/feedback.ts). The person
writes one message; the API classifies it and files it as a public GitHub issue without their
name (POST /feedback). The dialog says what is sent with it (the kind of page, never its
address, the browser, the screen, the theme and the language), that it is public, and that
Claude reads it when the server classifies feedback. Once filed, it says what it was filed as,
with a link to the issue.

What was typed stays while the page lives (closing without sending keeps it) and is cleared once
sent; nothing is kept in the browser's storage. An expired session is said, not acted on: the
text stays, to be copied. The dialog cannot be closed while it sends, and it closes itself before
a navigation, or when the session ends.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import {
		ArrowPath,
		ArrowTopRightOnSquare,
		ChatBubbleLeftEllipsis,
		CheckCircle,
		ExclamationTriangle,
		PaperAirplane,
		XMark
	} from 'svelte-heros-v2';
	import { FEEDBACK_LIMITS, parseFeedback, type FeedbackKind } from 'portfolio-common';
	import Rich from '#lib/i18n/Rich.svelte';
	import { common } from '#lib/i18n/common.messages.ts';
	import {
		closeFeedback,
		feedbackAvailability,
		feedbackContext,
		feedbackDialog,
		sendFeedback
	} from '#services/feedback.ts';
	import { m } from './FeedbackDialog.messages.ts';

	let { signedIn }: { signedIn: boolean } = $props();

	const uid = $props.id();

	let open = $derived($feedbackDialog.open && signedIn);

	let message = $state('');
	let busy = $state(false);
	/** What is wrong: under the message (`field`), or above the buttons */
	let problem = $state<{ message: string; field?: 'message' } | null>(null);
	/** Once filed: what it was filed as, and the issue */
	let sent = $state<{ kind: FeedbackKind; issueUrl?: string } | null>(null);
	/** Whether Claude reads feedback on this server: said in the dialog */
	let classifies = $state(false);

	let textarea: HTMLTextAreaElement | undefined = $state();
	let alertElement: HTMLElement | undefined = $state();
	let sentHeading: HTMLElement | undefined = $state();

	let fieldProblem = $derived(problem?.field === 'message' ? problem.message : '');

	$effect(() => {
		if (!open) return;
		void feedbackAvailability().then((answer) => (classifies = answer.classifies));
	});

	// The session ended while the dialog was open (expired, signed out in another tab)
	$effect(() => {
		if ($feedbackDialog.open && !signedIn && !busy) closeFeedback();
	});

	beforeNavigate(() => {
		// An open Dialog's focus trap would read state of the page that goes away
		if (open) close(true);
	});

	/** Closes the dialog: a filed feedback makes room for the next one, an unsent text stays */
	function close(force = false) {
		if (busy && !force) return;
		closeFeedback();
		problem = null;
		if (sent) {
			sent = null;
			message = '';
		}
	}

	async function send(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		const parsed = parseFeedback({ message });
		if (!parsed.ok) {
			problem = { message: parsed.message, field: parsed.field };
			textarea?.focus();
			return;
		}
		busy = true;
		problem = null;
		const result = await sendFeedback(parsed.feedback.message, feedbackContext(page.route.id));
		busy = false;
		if (!result.ok) {
			problem = { message: result.message, ...(result.field ? { field: result.field } : {}) };
			await tick();
			(result.field ? textarea : alertElement)?.focus();
			return;
		}
		sent = { kind: result.kind, ...(result.issueUrl ? { issueUrl: result.issueUrl } : {}) };
		message = '';
		await tick();
		sentHeading?.focus();
	}

	const linkClass = 'link-text';
</script>

<Dialog
	{open}
	onOpenChange={(details) => {
		if (!details.open) close();
	}}
	closeOnEscape={!busy}
	closeOnInteractOutside={!busy}
	initialFocusEl={() => textarea ?? null}
	finalFocusEl={() => $feedbackDialog.returnFocus?.() ?? null}
>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-950/60" />
		<Dialog.Positioner
			class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
		>
			<Dialog.Content
				class="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-container border-t border-surface-200-800 bg-surface-50-950 text-surface-950-50 shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-container sm:border"
				data-feedback-dialog
			>
				{#if open}
					<div class="flex items-start gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
						<span
							class="grid size-10 shrink-0 place-items-center rounded-full preset-tonal-primary"
							aria-hidden="true"
						>
							<ChatBubbleLeftEllipsis size="20" />
						</span>
						<div class="min-w-0 flex-1">
							<Dialog.Title>
								{#snippet element(attributes)}
									<h2 {...attributes} class="text-lg font-semibold sm:text-xl">{m.title}</h2>
								{/snippet}
							</Dialog.Title>
							<Dialog.Description>
								{#snippet element(attributes)}
									<p {...attributes} class="mt-1 text-sm text-surface-700-300">{m.intro}</p>
								{/snippet}
							</Dialog.Description>
						</div>
						<button
							type="button"
							class="btn-icon size-10 shrink-0 hover:preset-tonal"
							aria-label={common.close}
							aria-disabled={busy ? 'true' : undefined}
							onclick={() => close()}
						>
							<XMark size="20" aria-hidden="true" />
						</button>
					</div>

					{#if sent}
						<div class="space-y-3 px-4 py-6 sm:px-6" data-feedback-sent>
							<div class="flex items-center gap-2">
								<CheckCircle size="22" class="shrink-0 text-success-700-300" aria-hidden="true" />
								<h3 class="font-semibold outline-none" tabindex="-1" bind:this={sentHeading}>
									{m.sent.title}
								</h3>
							</div>
							<p class="text-sm">{m.sent[sent.kind]}</p>
							{#if sent.issueUrl}
								<p class="text-sm">
									<!-- eslint-disable svelte/no-navigation-without-resolve -- the issue on GitHub, another site -->
									<a
										class="{linkClass} inline-flex items-center gap-1"
										href={sent.issueUrl}
										target="_blank"
										rel="noopener noreferrer"
										>{m.sent.issue}<ArrowTopRightOnSquare size="14" aria-hidden="true" /><span
											class="sr-only">{` ${m.newTab}`}</span
										></a
									>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
								</p>
							{/if}
						</div>
						<div class="flex justify-end border-t border-surface-200-800 px-4 py-3 sm:px-6">
							<button
								type="button"
								class="btn preset-filled-primary-700-300 min-h-11"
								onclick={() => close()}
							>
								{common.close}
							</button>
						</div>
					{:else}
						<form
							id="{uid}-form"
							class="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6"
							novalidate
							onsubmit={send}
						>
							<div class="space-y-1.5">
								<label class="label-text font-medium" for="{uid}-message">{m.label}</label>
								<textarea
									bind:this={textarea}
									bind:value={message}
									id="{uid}-message"
									name="message"
									class="textarea min-h-32"
									rows="5"
									maxlength={FEEDBACK_LIMITS.message}
									placeholder={m.placeholder}
									readonly={busy}
									aria-required="true"
									aria-invalid={fieldProblem ? 'true' : undefined}
									aria-describedby="{uid}-help"></textarea>
								<p class="flex flex-wrap justify-between gap-x-4 text-xs" id="{uid}-help">
									<span class={fieldProblem ? 'text-error-700-300' : 'text-surface-700-300'}>
										{fieldProblem || m.help}
									</span>
									<span class="text-surface-700-300">
										{message.length}/{FEEDBACK_LIMITS.message}
									</span>
								</p>
							</div>
							<ul class="space-y-1 text-xs text-surface-700-300" data-feedback-notices>
								<li>{m.context}</li>
								<li>{m.public}</li>
								{#if classifies}
									<li>{m.classifies}</li>
								{/if}
								<li>
									<Rich text={m.privacy}>
										{#snippet privacy(text: string)}<a
												class={linkClass}
												href="{resolve('/(site)/legal/privacy')}#data-feedback"
												target="_blank"
												rel="noopener noreferrer"
												>{text}<span class="sr-only">{` ${m.newTab}`}</span></a
											>{/snippet}
									</Rich>
								</li>
							</ul>
							{#if problem && !problem.field}
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
									<p>{problem.message}</p>
								</div>
							{/if}
							<p class="sr-only" role="status" aria-live="polite">
								{busy ? m.sendingStatus : ''}
							</p>
						</form>
						<div
							class="flex flex-wrap items-center justify-end gap-2 border-t border-surface-200-800 px-4 py-3 sm:px-6"
						>
							<button
								type="button"
								class="btn preset-tonal min-h-11"
								aria-disabled={busy ? 'true' : undefined}
								onclick={() => close()}
							>
								{common.cancel}
							</button>
							<button
								type="submit"
								form="{uid}-form"
								class="btn preset-filled-primary-700-300 min-h-11"
								aria-disabled={busy ? 'true' : undefined}
								aria-busy={busy ? 'true' : undefined}
							>
								{#if busy}
									<ArrowPath
										size="16"
										class="animate-spin motion-reduce:animate-none"
										aria-hidden="true"
									/>
									<span>{m.sending}</span>
								{:else}
									<PaperAirplane size="16" aria-hidden="true" />
									<span>{m.send}</span>
								{/if}
							</button>
						</div>
					{/if}
				{/if}
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
