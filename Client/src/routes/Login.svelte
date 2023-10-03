<script lang="ts">
	import { onMount } from 'svelte';
	import { portfolioApi } from '../services';

	let googleReady = false;
	let mounted = false;

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
		if (!googleReady) {
			return;
		}

		const signIn = async (credentialResponse: google.accounts.id.CredentialResponse) => {
			await portfolioApi.login.post({
				token: credentialResponse.credential,
				$fetch: { credentials: 'include' }
			});
			console.log(document.cookie);
		};

		google.accounts.id.initialize({
			client_id: '1075297079847-nkpqjg6shjj9lbcdofs6tlf21rprqr7q.apps.googleusercontent.com',
			context: 'signin',
			ux_mode: 'popup',
			auto_select: true,
			itp_support: true,
			callback: signIn
		});
		google.accounts.id.renderButton(
			document.getElementById('googleButton')!,
			{
				theme: 'filled_black',
				size: 'small',
				type: 'icon',
				text: 'continue_with',
				shape: 'pill'
			} // customization attributes
		);
		google.accounts.id.prompt(); // also display the One Tap dialog
	};
</script>

<div id="googleButton" />
