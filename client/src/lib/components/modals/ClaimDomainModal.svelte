<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { login } from '#services/authentication.ts';
	import { portfolioApi } from '#services';
	import { setupGoogleIdentity } from '#services/googleIdentity.ts';
	import { errorStatus } from '#services/apiErrors.ts';

	let { domainName, onClose }: { domainName: string; onClose: () => void } = $props();

	let buttonContainer: HTMLDivElement | undefined = $state();
	let errorMessage = $state('');
	let claiming = $state(false);

	const errorText = (value: unknown): string => {
		if (typeof value === 'string') return value;
		if (value && typeof value === 'object' && 'message' in value) {
			return typeof value.message === 'string' ? value.message : '';
		}
		return '';
	};

	const claim = async ({ credential }: google.accounts.id.CredentialResponse) => {
		errorMessage = '';
		claiming = true;

		try {
			if (!(await login(credential))) {
				errorMessage = 'Login failed. Please try again.';
				return;
			}

			const { error } = await portfolioApi.domain.claim.post(
				{ name: domainName },
				{ fetch: { credentials: 'include' } }
			);

			if (error) {
				const message = errorText(error.value);
				if (/already own/i.test(message)) {
					errorMessage = 'Your Google account already owns a domain.';
				} else if (/already exists/i.test(message)) {
					errorMessage = 'This domain was just claimed by someone else.';
				} else if (errorStatus(error) === 401) {
					errorMessage = 'Login failed. Please try again.';
				} else {
					errorMessage = message || 'Failed to claim domain.';
				}
				return;
			}

			await goto(resolve('/[domain]/experiences', { domain: domainName }), { invalidateAll: true });
		} finally {
			claiming = false;
		}
	};

	onMount(() => {
		let release: (() => void) | undefined;
		let destroyed = false;

		setupGoogleIdentity(claim)
			.then((gsi) => {
				if (destroyed) {
					gsi.release();
					return;
				}
				release = gsi.release;
				// The container is never destroyed (only hidden while claiming), so the button
				// stays available for a retry after a failed claim.
				if (buttonContainer) {
					gsi.id.renderButton(buttonContainer, {
						theme: 'filled_black',
						size: 'large',
						type: 'standard',
						text: 'signin_with',
						shape: 'pill'
					});
				}
			})
			.catch(() => {
				errorMessage = 'Google Sign-In could not be loaded. Please check your connection.';
			});

		return () => {
			destroyed = true;
			release?.();
		};
	});

	const cBase = 'bg-surface-100-900 p-4 max-w-md w-full shadow-xl space-y-4 rounded-lg';
	const cHeader = 'text-2xl font-bold';
</script>

<div class={cBase}>
	<header class={cHeader}>Claim {domainName}</header>
	<p>
		By signing in with your Google account, you will become the owner of <strong
			>{domainName}</strong
		>.
	</p>
	<p class="text-sm text-surface-600-400">Each Google account can only own one domain.</p>

	{#if errorMessage}
		<div class="p-3 rounded bg-error-500/10 text-error-500" role="alert">{errorMessage}</div>
	{/if}

	{#if claiming}
		<p class="text-center" role="status">Claiming domain...</p>
	{/if}
	<div class="flex justify-center" class:hidden={claiming} bind:this={buttonContainer}></div>

	<footer class="flex justify-end">
		<button class="btn preset-tonal" onclick={onClose}>Cancel</button>
	</footer>
</div>
