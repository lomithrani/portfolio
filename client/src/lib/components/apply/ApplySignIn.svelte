<!--
@component
The apply panel's sign-in: a "Sign in with Google" button that signs in to the candidate space
(login(credential, 'candidate'): no space chooser, the visitor stays on the job page to apply).
`onSignedIn` runs once the session is stored.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { login } from '#services/authentication.ts';
	import { setupGoogleIdentity } from '#services/googleIdentity.ts';

	let { onSignedIn }: { onSignedIn?: () => void } = $props();

	let buttonContainer: HTMLDivElement | undefined = $state();
	let status = $state<'loading' | 'ready' | 'unavailable' | 'signing-in'>('loading');
	let errorMessage = $state('');

	const isDark = () => document.documentElement.classList.contains('dark');

	/** A click on this button is followed by its credential within this delay (Google's popup) */
	const CLICK_WINDOW_MS = 10 * 60_000;

	onMount(() => {
		let destroyed = false;
		let clickedAt = 0;

		// Google Identity has one credential callback for the whole page, shared with the header's
		// button and its One Tap: the latest registered gets every credential
		const onCredential = async ({ credential }: google.accounts.id.CredentialResponse) => {
			if (destroyed || Date.now() - clickedAt > CLICK_WINDOW_MS) {
				// The header's button or One Tap: signed in like the header does, in the space the
				// account last chose
				await login(credential);
				return;
			}
			clickedAt = 0;
			errorMessage = '';
			status = 'signing-in';
			const notify = onSignedIn;
			const signedIn = await login(credential, 'candidate');
			if (destroyed) return;
			status = 'ready';
			if (signedIn) notify?.();
			else errorMessage = 'Sign-in failed. Try again.';
		};

		setupGoogleIdentity(onCredential)
			.then((gsi) => {
				// Never released: releasing clears the page's only credential callback, and the
				// header's button would then do nothing (onCredential signs in for it instead)
				if (destroyed || !buttonContainer) return;
				gsi.id.renderButton(buttonContainer, {
					theme: isDark() ? 'filled_black' : 'outline',
					size: 'large',
					type: 'standard',
					text: 'signin_with',
					shape: 'pill',
					logo_alignment: 'left',
					click_listener: () => {
						clickedAt = Date.now();
						// This button's credential comes back here, whoever registered last
						void setupGoogleIdentity(onCredential).catch(() => {});
					}
				});
				status = 'ready';
			})
			.catch(() => {
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
