<!--
@component
"Send feedback" in a page's footer (LegalFooter, the footers of the (app) and [domain] layouts):
a button that looks like the footer's links and opens the page's feedback dialog
(FeedbackDialog, mounted by Header.svelte). Shown only to a signed-in account, once the server
says it takes feedback (GET /feedback): the server renders nothing, the button appears in the
browser.

- `class`: extra classes of the button
-->
<script lang="ts">
	import { ChatBubbleLeftEllipsis } from 'svelte-heros-v2';
	import { isSessionValid } from '#services/authentication.ts';
	import { feedbackAvailability, openFeedback } from '#services/feedback.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { m } from './FeedbackButton.messages.ts';

	let { class: className = '' }: { class?: string } = $props();

	let signedIn = $derived($sessionCheckedStore && isSessionValid($authenticationStore));
	let enabled = $state(false);

	$effect(() => {
		if (!signedIn) return;
		let current = true;
		void feedbackAvailability().then((answer) => {
			if (current) enabled = answer.enabled;
		});
		return () => {
			current = false;
		};
	});

	let button: HTMLButtonElement | undefined = $state();
</script>

{#if signedIn && enabled}
	<button
		type="button"
		bind:this={button}
		class={[
			'inline-flex items-center gap-1.5 text-surface-700-300 underline-offset-4 hover:text-surface-950-50 hover:underline focus-visible:underline',
			className
		]}
		aria-haspopup="dialog"
		data-feedback-button
		onclick={() => openFeedback(() => button ?? null)}
	>
		<ChatBubbleLeftEllipsis size="16" class="shrink-0" aria-hidden="true" />
		{m.label}
	</button>
{/if}
