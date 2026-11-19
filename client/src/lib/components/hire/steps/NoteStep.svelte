<!--
@component
The note step of a portfolio's hiring journey: a note of the owner's (Markdown, shown without raw
HTML: anyone can publish one) that the visitor reads and confirms. Once confirmed it stays
readable. Confirming needs a session: a visitor signs in first. The owner sees the note as
visitors do, without anything to confirm.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { isSessionValid } from '#services/authentication.ts';
	import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
	import { noteContent, submitFailure } from '#services/workflow.ts';
	import SignInButton from '#components/hire/SignInButton.svelte';
	import Markdown from '#components/Markdown.svelte';
	import { common } from '#lib/i18n/common.messages.ts';
	import { m } from './steps.messages';
	import type { StepProps } from './types';

	let { step, journey, submit, reload, locked }: StepProps = $props();

	let note = $derived(noteContent(step.config));
	let signedIn = $derived($sessionCheckedStore && isSessionValid($authenticationStore));
	let confirming = $state(false);
	let error = $state('');

	// A message about an account goes with it: a sign-in after an expired session starts clean
	let account = $derived(signedIn ? $authenticationStore.user?._id : undefined);
	$effect(() => {
		void account;
		untrack(() => (error = ''));
	});

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

	<!-- Once confirmed, the note is only there to read again; so it is for its owner, who previews it -->
	{#if step.status !== 'succeeded' && !journey.own}
		{#if !$sessionCheckedStore}
			<!-- Until the session is known; never on a page without scripts, which never checks it
			     (its <noscript> line says why the note cannot be confirmed) -->
			<div
				class="placeholder h-11 w-40 animate-pulse motion-reduce:animate-none noscript:hidden"
				aria-hidden="true"
			></div>
		{:else if !signedIn}
			<div class="space-y-3">
				<p class="text-sm">{m.note.signIn}</p>
				<!-- No space chosen: an account keeps the one it had -->
				<SignInButton />
			</div>
		{:else}
			<button
				type="button"
				class="btn preset-filled-primary-700-300 min-h-11"
				disabled={confirming}
				onclick={confirm}
			>
				{confirming ? common.saving : m.note.confirm}
			</button>
		{/if}
	{/if}
	{#if error}
		<p class="text-sm text-error-700-300" role="alert">{error}</p>
	{/if}
</div>
