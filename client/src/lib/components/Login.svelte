<!--
@component
The header's Google sign-in: the round "Sign in with Google" button and the One Tap prompt.
`onLogin` runs once a sign-in succeeded (the session is stored), with the signed-in account: the
header then asks which space to use (SpaceChooser).
-->
<script module lang="ts">
	/** The sign-in's id: where the focus goes when a dialog closes because the session ended */
	export const SIGN_IN_ID = 'header-sign-in';
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { login } from '#services/authentication.ts';
	import { setupGoogleIdentity } from '#services/googleIdentity.ts';
	import { authenticationStore, type AuthUser } from '#services/stores/index.ts';

	let { onLogin }: { onLogin?: (user: AuthUser) => void } = $props();

	let buttonContainer: HTMLDivElement | undefined = $state();
	let errorMessage = $state('');

	const isDark = () => document.documentElement.classList.contains('dark');

	onMount(() => {
		let release: (() => void) | undefined;
		let destroyed = false;

		setupGoogleIdentity(async ({ credential }) => {
			errorMessage = '';
			// Read before signing in: this component unmounts as soon as the session is stored
			const notify = onLogin;
			if (!(await login(credential))) {
				errorMessage = 'Sign-in failed. Try again.';
				return;
			}
			const user = get(authenticationStore).user;
			if (user) notify?.(user);
		})
			.then((gsi) => {
				if (destroyed) {
					gsi.release();
					return;
				}
				release = gsi.release;
				if (buttonContainer) {
					gsi.id.renderButton(buttonContainer, {
						theme: isDark() ? 'filled_black' : 'outline',
						size: 'medium',
						type: 'icon',
						shape: 'circle'
					});
				}
				gsi.id.prompt();
			})
			.catch(() => {
				// Google Sign-In blocked or offline: the page stays usable without the button
			});

		return () => {
			destroyed = true;
			release?.();
		};
	});
</script>

<!-- Focusable from code only (tabindex -1): the Google button inside is an iframe -->
<div
	id={SIGN_IN_ID}
	class="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
	role="group"
	aria-label="Sign in"
	tabindex="-1"
>
	{#if errorMessage}
		<span class="text-xs text-error-700-300" role="alert">{errorMessage}</span>
	{/if}
	<div bind:this={buttonContainer} class="google-btn"></div>
</div>

<style>
	.google-btn :global(div),
	.google-btn :global(iframe) {
		background: transparent !important;
		border-radius: 50%;
		color-scheme: auto;
	}
</style>
