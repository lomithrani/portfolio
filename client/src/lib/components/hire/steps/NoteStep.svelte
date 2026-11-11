<!--
@component
The note step of a portfolio's hiring journey: a note of the owner's (Markdown, shown without raw
HTML: anyone can publish one) that the visitor reads and confirms. Once confirmed it stays
readable. Confirming needs a session: a visitor signs in first.
-->
<script lang="ts">
	import { isSessionValid } from '#services/authentication.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { noteContent, submitFailure } from '#services/workflow.ts';
	import ApplySignIn from '#components/apply/ApplySignIn.svelte';
	import Markdown from '#components/Markdown.svelte';
	import type { StepProps } from './types';

	let { step, submit, reload, locked }: StepProps = $props();

	let note = $derived(noteContent(step.config));
	let signedIn = $derived($sessionCheckedStore && isSessionValid($authenticationStore));
	let confirming = $state(false);
	let error = $state('');

	async function confirm() {
		if (confirming) return;
		confirming = true;
		error = '';
		const result = await submit({ acknowledged: true });
		confirming = false;
		if (result.ok) return;
		const failure = submitFailure(result.status, result.value);
		error = failure.message;
		if (failure.kind === 'signed-out' || failure.kind === 'locked') locked(failure.kind);
		if (failure.kind === 'changed') reload();
	}
</script>

<div class="space-y-4">
	<!-- The step's name is an h2: the note's headings rank below it -->
	<Markdown content={note.text} html={false} topHeadingLevel={3} compact />

	<!-- Once confirmed, the note is only there to read again -->
	{#if step.status !== 'succeeded'}
		{#if !$sessionCheckedStore}
			<div
				class="placeholder h-11 w-40 animate-pulse motion-reduce:animate-none"
				aria-hidden="true"
			></div>
		{:else if !signedIn}
			<div class="space-y-3">
				<p class="text-sm">Sign in to confirm that you have read this.</p>
				<!-- No space chosen: an account keeps the one it had -->
				<ApplySignIn mode={null} />
			</div>
		{:else}
			<button
				type="button"
				class="btn preset-filled-primary-700-300 min-h-11"
				disabled={confirming}
				onclick={confirm}
			>
				{confirming ? 'Saving…' : 'I have read this'}
			</button>
		{/if}
	{/if}
	{#if error}
		<p class="text-sm text-error-700-300" role="alert">{error}</p>
	{/if}
</div>
