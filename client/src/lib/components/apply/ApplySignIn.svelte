<!--
@component
A "Sign in with Google" button, with no space chooser: the apply panel's signs in to the candidate
space (`mode`, the default: the visitor stays on the job page to apply); the hiring journey's job
step passes null, so the account keeps the space it last chose (it creates its recruiter space next,
if it has none).
`onSignedIn` runs once the session is stored.
Google's sign-in is loaded only once the visitor asks for it: a local "Sign in with Google" button
first (nothing reaches accounts.google.com before), then Google's button and its One Tap prompt.
Google Identity has one credential callback for the whole page: this button takes it when it is
clicked (the header's sign-in takes it back when it is clicked in turn).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { UserMode } from 'portfolio-common';
	import { login } from '#services/authentication.ts';
	import { setupGoogleIdentity } from '#services/googleIdentity.ts';
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
	let status = $state<'idle' | 'loading' | 'ready' | 'unavailable' | 'signing-in'>('idle');
	/** Loads Google's sign-in (set once mounted) */
	let start: () => void = () => {};
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

		/** Renders Google's button */
		const render = (id: typeof google.accounts.id) => {
			if (!buttonContainer) return;
			id.renderButton(buttonContainer, {
				theme: isDark() ? 'filled_black' : 'outline',
				size: 'large',
				type: 'standard',
				text: 'signin_with',
				shape: 'pill',
				logo_alignment: 'left',
				click_listener: () => {
					clickedAt = Date.now();
					// This button's credential comes back here (the page's callback until the
					// header's sign-in is clicked and takes it back)
					void setupGoogleIdentity(onCredential).catch(() => {});
				}
			});
		};

		const show = async () => {
			// Clicked here: this button takes the page's credential callback
			const gsi = await setupGoogleIdentity(onCredential);
			if (destroyed || !buttonContainer) return;
			render(gsi.id);
			status = 'ready';
			gsi.id.prompt();
		};

		start = () => {
			if (status !== 'idle' && status !== 'unavailable') return;
			status = 'loading';
			// Asked for here: the account chosen in One Tap signs in like this button
			clickedAt = Date.now();
			show().catch(() => {
				if (!destroyed) status = 'unavailable';
			});
		};

		return () => {
			destroyed = true;
		};
	});
</script>

<div class="space-y-3">
	<!-- Kept in the page while signing in: Google's popup reports to its button -->
	{#if status === 'idle' || status === 'unavailable'}
		<button
			type="button"
			class="btn preset-outlined-surface-300-700 min-h-11 rounded-full px-5 hover:preset-tonal"
			onclick={() => start()}
		>
			Sign in with Google
		</button>
	{/if}
	<div
		class={[
			'relative min-h-11',
			{ hidden: status === 'signing-in' || status === 'unavailable' || status === 'idle' }
		]}
	>
		<div bind:this={buttonContainer} class="flex min-h-11 items-center"></div>
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
			Google sign-in could not be loaded. Check your connection, then try again.
		</p>
	{/if}
	{#if errorMessage}
		<p class="text-sm text-error-700-300" role="alert">{errorMessage}</p>
	{/if}
</div>
