<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { login } from '$services/authentication';
	import { portfolioApi } from '$services';

	let { domainName, onClose }: { domainName: string; onClose: () => void } = $props();

	let googleReady = $state(false);
	let mounted = $state(false);
	let errorMessage = $state('');
	let claiming = $state(false);

	onMount(() => {
		const script = document.createElement('script');
		script.src = 'https://accounts.google.com/gsi/client';
		script.async = true;
		script.onload = googleLoaded;
		document.body.appendChild(script);

		mounted = true;
		displaySignInButton();
	});

	const googleLoaded = () => {
		googleReady = true;
		if (mounted) {
			displaySignInButton();
		}
	};

	const displaySignInButton = () => {
		if (!googleReady) return;

		const signIn = async (credentialResponse: google.accounts.id.CredentialResponse) => {
			errorMessage = '';
			claiming = true;

			const loggedIn = await login(credentialResponse.credential);
			if (!loggedIn) {
				errorMessage = 'Login failed. Please try again.';
				claiming = false;
				return;
			}

			const { error } = await portfolioApi.domain.claim.post(
				{ name: domainName },
				{ fetch: { credentials: 'include' } }
			);

			if (error) {
				const message = typeof error.value === 'string' ? error.value : 'Failed to claim domain.';
				if (message.includes('already own')) {
					errorMessage = 'Your Google account already owns a domain.';
				} else if (message.includes('already exists')) {
					errorMessage = 'This domain was just claimed by someone else.';
				} else {
					errorMessage = message;
				}
				claiming = false;
				return;
			}

			await goto(`/${domainName}/experiences`, { invalidateAll: true });
		};

		google.accounts.id.initialize({
			client_id: '1075297079847-nkpqjg6shjj9lbcdofs6tlf21rprqr7q.apps.googleusercontent.com',
			context: 'signin',
			ux_mode: 'popup',
			auto_select: false,
			itp_support: true,
			callback: signIn
		});
		google.accounts.id.renderButton(document.getElementById('claimGoogleButton')!, {
			theme: 'filled_black',
			size: 'large',
			type: 'standard',
			text: 'signin_with',
			shape: 'pill'
		});
	};

	const cBase = 'bg-surface-100-900 p-4 max-w-md w-full shadow-xl space-y-4 rounded-lg';
	const cHeader = 'text-2xl font-bold';
</script>

<div class={cBase}>
	<header class={cHeader}>Claim {domainName}</header>
	<p>
		By signing in with your Google account, you will become the owner of <strong>{domainName}</strong
		>.
	</p>
	<p class="text-sm text-surface-600-400">Each Google account can only own one domain.</p>

	{#if errorMessage}
		<div class="p-3 rounded bg-error-500/10 text-error-500">{errorMessage}</div>
	{/if}

	{#if claiming}
		<p class="text-center">Claiming domain...</p>
	{:else}
		<div class="flex justify-center" id="claimGoogleButton"></div>
	{/if}

	<footer class="flex justify-end">
		<button class="btn preset-tonal" onclick={onClose}>Cancel</button>
	</footer>
</div>
