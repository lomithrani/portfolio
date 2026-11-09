<!--
@component
A "Sign in with Google" button, with no space chooser: the apply panel's signs in to the candidate
space (`mode`, the default: the visitor stays on the job page to apply); the hiring journey's job
step passes null, so the account keeps the space it last chose (it creates its recruiter space next,
if it has none).
`onSignedIn` runs once the session is stored.
Google Identity has one credential callback for the whole page. The header's sign-in (shown
whenever this one is: both are for signed-out visitors) keeps it, with its space chooser and its
own errors; this button takes it only when it is clicked.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { UserMode } from 'portfolio-common';
	import { login } from '#services/authentication.ts';
	import { loadGoogleIdentity, setupGoogleIdentity } from '#services/googleIdentity.ts';
	import { toaster } from '#services/toaster.ts';

	let {
		onSignedIn,
		mode = 'candidate'
	}: {
		onSignedIn?: () => void;
		/** The space to sign in to; null keeps the one the account last chose */
		mode?: UserMode | null;
	} = $props();

	let buttonContainer: HTMLDivElement | undefined = $state();
	let status = $state<'loading' | 'ready' | 'unavailable' | 'signing-in'>('loading');
	let errorMessage = $state('');

	const isDark = () => document.documentElement.classList.contains('dark');

	/** A click on this button is followed by its credential within this delay (Google's popup) */
	const CLICK_WINDOW_MS = 10 * 60_000;
	const FAILED_MESSAGE = 'Sign-in failed. Try again.';

	onMount(() => {
		let destroyed = false;
		let clickedAt = 0;

		const onCredential = async ({ credential }: google.accounts.id.CredentialResponse) => {
			if (destroyed || Date.now() - clickedAt > CLICK_WINDOW_MS) {
				// Not this button's: the header's button or One Tap, after a click here that did not
				// sign in (this callback is still the page's). Signed in like the header does, in the
				// space the account last chose, and a failure is said wherever the visitor is
				if (!(await login(credential))) toaster.error({ title: FAILED_MESSAGE });
				return;
			}
			clickedAt = 0;
			errorMessage = '';
			status = 'signing-in';
			// Read before signing in: once the session is stored, the panel replaces this component
			// (destroyed by the time login() returns), and still has to hear about it
			const notify = onSignedIn;
			const signedIn = await login(credential, mode ?? undefined);
			if (!destroyed) {
				status = 'ready';
				if (!signedIn) errorMessage = FAILED_MESSAGE;
			}
			if (signedIn) notify?.();
		};

		/** Renders the button; false when Google Identity is not set up yet (nothing rendered) */
		const render = (id: typeof google.accounts.id): boolean => {
			if (!buttonContainer) return false;
			id.renderButton(buttonContainer, {
				theme: isDark() ? 'filled_black' : 'outline',
				size: 'large',
				type: 'standard',
				text: 'signin_with',
				shape: 'pill',
				logo_alignment: 'left',
				click_listener: () => {
					clickedAt = Date.now();
					// This button's credential comes back here (the page's callback until a sign-in
					// from the header takes it back: it does whenever it shows again)
					void setupGoogleIdentity(onCredential).catch(() => {});
				}
			});
			return buttonContainer.childElementCount > 0;
		};

		const show = async () => {
			// Loaded without taking the callback. The header's sign-in sets Google Identity up as the
			// same script loads: rendered a task later, once it did
			const id = await loadGoogleIdentity();
			await new Promise((resolve) => setTimeout(resolve));
			if (destroyed || !buttonContainer) return;
			if (!render(id)) {
				// Nothing set it up (no header sign-in on this page): set up here
				const gsi = await setupGoogleIdentity(onCredential);
				if (destroyed) return;
				render(gsi.id);
			}
			status = 'ready';
		};

		show().catch(() => {
			if (!destroyed) status = 'unavailable';
		});

		return () => {
			destroyed = true;
		};
	});
</script>

<div class="space-y-3">
	<!-- Kept in the page while signing in: Google's popup reports to its button -->
	<div
		class={['relative min-h-11', { hidden: status === 'signing-in' || status === 'unavailable' }]}
	>
		<div bind:this={buttonContainer} class="google-button flex min-h-11 items-center"></div>
		{#if status === 'loading'}
			<div
				class="placeholder absolute inset-y-0 left-0 w-56 animate-pulse rounded-full motion-reduce:animate-none"
				aria-hidden="true"
			></div>
		{/if}
	</div>
	{#if status === 'signing-in'}
		<p class="flex min-h-11 items-center gap-2 text-sm" role="status">
			<span
				class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
				aria-hidden="true"
			></span>
			Signing in…
		</p>
	{:else if status === 'unavailable'}
		<p class="text-sm text-surface-700-300" role="alert">
			Google sign-in could not be loaded. Check your connection, then reload the page.
		</p>
	{/if}
	{#if errorMessage}
		<p class="text-sm text-error-700-300" role="alert">{errorMessage}</p>
	{/if}
</div>

<style>
	.google-button :global(iframe) {
		color-scheme: auto;
	}
</style>
