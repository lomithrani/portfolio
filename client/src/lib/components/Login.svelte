<!--
@component
The header's Google sign-in: a "Sign in" button that loads Google's sign-in when clicked (nothing
reaches accounts.google.com before, and One Tap never shows on its own), then Google's round
button and its One Tap prompt.
`onLogin` runs once a sign-in succeeded (the session is stored), with the signed-in account: the
header then asks which space to use (SpaceChooser).
-->
<script module lang="ts">
	/** The sign-in's id: where the focus goes when a dialog closes because the session ended */
	export const SIGN_IN_ID = 'header-sign-in';
</script>

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { get } from 'svelte/store';
	import { login } from '#services/authentication.ts';
	import { setupGoogleIdentity } from '#services/googleIdentity.ts';
	import { ArrowPath, ArrowRightOnRectangle } from 'svelte-heros-v2';
	import { authenticationStore, type AuthUser } from '#services/stores/index.ts';

	let { onLogin }: { onLogin?: (user: AuthUser) => void } = $props();

	let buttonContainer: HTMLDivElement | undefined = $state();
	let errorMessage = $state('');
	/**
	 * Google's sign-in is loaded only once the visitor asks for it (this button): until then the
	 * page asks nothing from accounts.google.com, and no One Tap prompt shows on its own
	 */
	let gsiState = $state<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');

	const isDark = () => document.documentElement.classList.contains('dark');

	let release: (() => void) | undefined;
	let destroyed = false;

	async function start() {
		if (gsiState === 'loading' || gsiState === 'ready') return;
		gsiState = 'loading';
		errorMessage = '';
		try {
			const gsi = await setupGoogleIdentity(async ({ credential }) => {
				errorMessage = '';
				// Read before signing in: this component unmounts as soon as the session is stored
				const notify = onLogin;
				if (!(await login(credential))) {
					errorMessage = 'Sign-in failed. Try again.';
					return;
				}
				const user = get(authenticationStore).user;
				if (user) notify?.(user);
			});
			if (destroyed) {
				gsi.release();
				return;
			}
			release = gsi.release;
			gsiState = 'ready';
			await tick();
			if (buttonContainer) {
				gsi.id.renderButton(buttonContainer, {
					theme: isDark() ? 'filled_black' : 'outline',
					size: 'medium',
					type: 'icon',
					shape: 'circle'
				});
			}
			// The clicked button is gone: the focus stays in the sign-in
			document.getElementById(SIGN_IN_ID)?.focus();
			// Asked for: Google's account chooser right away, its button as a fallback
			gsi.id.prompt();
		} catch {
			// Google Sign-In blocked or offline: the page stays usable without it
			if (!destroyed) gsiState = 'unavailable';
		}
	}

	onMount(() => () => {
		destroyed = true;
		release?.();
	});
</script>

<!-- Focusable from code only (tabindex -1): the button inside takes the focus with Tab -->
<div
	id={SIGN_IN_ID}
	class="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
	role="group"
	aria-label="Sign in"
	tabindex="-1"
>
	{#if errorMessage}
		<span class="text-xs text-error-700-300" role="alert">{errorMessage}</span>
	{:else if gsiState === 'unavailable'}
		<span class="text-xs text-error-700-300" role="alert">Google sign-in could not load.</span>
	{/if}
	{#if gsiState === 'ready'}
		<div bind:this={buttonContainer} class="google-btn"></div>
	{:else}
		<!-- Small screens: an icon the size of Google's round button, so the title keeps its room;
		the label stays the accessible name ("Sign in") at every width -->
		<button
			type="button"
			class="btn btn-sm preset-outlined-surface-300-700 min-h-9 rounded-full hover:preset-tonal max-sm:size-10 max-sm:p-0"
			aria-busy={gsiState === 'loading' ? 'true' : undefined}
			onclick={start}
			data-testid="header-sign-in"
		>
			{#if gsiState === 'loading'}
				<ArrowPath size="18" class="animate-spin sm:hidden" aria-hidden="true" />
			{:else}
				<ArrowRightOnRectangle size="18" class="sm:hidden" aria-hidden="true" />
			{/if}
			<span class="sr-only sm:not-sr-only">{gsiState === 'loading' ? 'Loading…' : 'Sign in'}</span>
		</button>
	{/if}
</div>

<style>
	.google-btn :global(div),
	.google-btn :global(iframe) {
		background: transparent !important;
		border-radius: 50%;
	}
</style>
