import { PUBLIC_GOOGLE_CLIENT_ID } from '$app/env/public';

// Google Identity Services (GSI): loaded once per page, initialized once, shared by every
// component that renders a "Sign in with Google" button.

type GoogleId = typeof google.accounts.id;
type CredentialResponse = google.accounts.id.CredentialResponse;
export type CredentialHandler = (response: CredentialResponse) => void;

const GSI_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

let loading: Promise<GoogleId> | undefined;
let initialized = false;
let currentHandler: CredentialHandler | undefined;

const loadedGoogleId = (): GoogleId | undefined =>
	typeof window === 'undefined'
		? undefined
		: (window as Window & { google?: typeof google }).google?.accounts?.id;

export const loadGoogleIdentity = (): Promise<GoogleId> => {
	const loaded = loadedGoogleId();
	if (loaded) return Promise.resolve(loaded);
	if (typeof document === 'undefined') {
		return Promise.reject(new Error('Google Identity Services can only load in the browser'));
	}

	loading ??= new Promise<GoogleId>((resolve, reject) => {
		const script = document.createElement('script');
		script.src = GSI_SCRIPT_URL;
		script.async = true;
		script.onload = () => {
			const id = loadedGoogleId();
			if (id) resolve(id);
			else reject(new Error('Google Identity Services loaded without google.accounts.id'));
		};
		script.onerror = () => {
			// Allow a later retry (e.g. after a transient network failure or a blocker)
			loading = undefined;
			script.remove();
			reject(new Error('Failed to load Google Identity Services'));
		};
		document.head.appendChild(script);
	});
	return loading;
};

/**
 * Initializes the shared GSI instance once, before any other GSI call: GSI warns that
 * "initialize() is called multiple times" when its first initialize() follows another call, such
 * as disableAutoSelect() on sign-out. The callback reads `currentHandler`, so initializing before
 * a handler is registered is safe.
 */
const ensureInitialized = (id: GoogleId) => {
	if (initialized) return;
	id.initialize({
		client_id: PUBLIC_GOOGLE_CLIENT_ID,
		context: 'signin',
		ux_mode: 'popup',
		auto_select: true,
		itp_support: true,
		callback: (response) => currentHandler?.(response)
	});
	initialized = true;
};

/**
 * Loads GSI, initializes it on first use and routes the credential callback to `onCredential`
 * (the most recent caller wins). Call the returned `release` when the caller unmounts.
 */
export const setupGoogleIdentity = async (
	onCredential: CredentialHandler
): Promise<{ id: GoogleId; release: () => void }> => {
	const id = await loadGoogleIdentity();
	currentHandler = onCredential;
	ensureInitialized(id);

	return {
		id,
		release: () => {
			if (currentHandler === onCredential) currentHandler = undefined;
			id.cancel();
		}
	};
};

/**
 * Must be called on sign-out: without it One Tap's auto_select signs the user straight back in.
 * GSI records the choice in its own cookie, so the script is loaded first if needed.
 */
export const disableGoogleAutoSelect = async (): Promise<void> => {
	try {
		const id = await loadGoogleIdentity();
		ensureInitialized(id);
		id.disableAutoSelect();
	} catch {
		// GSI unavailable (blocked, offline, server side): there is no One Tap to disable either
	}
};
