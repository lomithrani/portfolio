<script lang="ts">
	import { onMount } from 'svelte';
	import { login } from '$services/authentication';
	import { setupGoogleIdentity } from '$services/googleIdentity';

	let buttonContainer: HTMLDivElement | undefined = $state();
	let errorMessage = $state('');

	const isDark = () => document.documentElement.classList.contains('dark');

	onMount(() => {
		let release: (() => void) | undefined;
		let destroyed = false;

		setupGoogleIdentity(async ({ credential }) => {
			errorMessage = '';
			if (!(await login(credential))) {
				errorMessage = 'Login failed';
			}
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

<div class="flex items-center gap-2">
	{#if errorMessage}
		<span class="text-xs text-error-500" role="alert">{errorMessage}</span>
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
