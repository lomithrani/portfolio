import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('$app/env/public', () => ({ PUBLIC_GOOGLE_CLIENT_ID: 'test-client-id' }));

type CredentialResponse = google.accounts.id.CredentialResponse;

/** A stand-in for the GSI script: records the order of the calls made to google.accounts.id. */
const stubGoogleIdentity = () => {
	const calls: string[] = [];
	let callback: ((response: CredentialResponse) => void) | undefined;
	const id = {
		initialize: vi.fn((config: google.accounts.id.IdConfiguration) => {
			calls.push('initialize');
			callback = config.callback;
		}),
		disableAutoSelect: vi.fn(() => calls.push('disableAutoSelect')),
		renderButton: vi.fn(() => calls.push('renderButton')),
		prompt: vi.fn(() => calls.push('prompt')),
		cancel: vi.fn(() => calls.push('cancel'))
	};
	vi.stubGlobal('window', { google: { accounts: { id } } });
	return {
		calls,
		id,
		signIn: (credential: string) => callback?.({ credential } as CredentialResponse)
	};
};

// The module initializes GSI once per page: every test loads a fresh copy
const loadGoogleIdentityModule = async () => {
	vi.resetModules();
	return import('../googleIdentity');
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('googleIdentity', () => {
	it('initializes GSI before disabling auto-select, and only once', async () => {
		const gsi = stubGoogleIdentity();
		const { disableGoogleAutoSelect, setupGoogleIdentity } = await loadGoogleIdentityModule();

		// Logout of an admin who arrived signed in (GSI never set up), which then mounts <Login>
		await disableGoogleAutoSelect();
		await setupGoogleIdentity(() => {});

		expect(gsi.calls).toEqual(['initialize', 'disableAutoSelect']);
		expect(gsi.id.initialize).toHaveBeenCalledWith(
			expect.objectContaining({ client_id: 'test-client-id', auto_select: true })
		);
	});

	it('does not initialize again when auto-select is disabled after setup', async () => {
		const gsi = stubGoogleIdentity();
		const { disableGoogleAutoSelect, setupGoogleIdentity } = await loadGoogleIdentityModule();

		await setupGoogleIdentity(() => {});
		await disableGoogleAutoSelect();
		await setupGoogleIdentity(() => {});

		expect(gsi.calls).toEqual(['initialize', 'disableAutoSelect']);
	});

	it('routes a credential to the latest handler, even when GSI was initialized before it', async () => {
		const gsi = stubGoogleIdentity();
		const { disableGoogleAutoSelect, setupGoogleIdentity } = await loadGoogleIdentityModule();
		const onCredential = vi.fn();

		await disableGoogleAutoSelect();
		const { release } = await setupGoogleIdentity(onCredential);
		gsi.signIn('google-id-token');

		expect(onCredential).toHaveBeenCalledWith({ credential: 'google-id-token' });

		release();
		gsi.signIn('another-token');
		expect(onCredential).toHaveBeenCalledTimes(1);
	});

	describe('requestGoogleAuthorizationCode', () => {
		type CodeClientConfig = google.accounts.oauth2.CodeClientConfig;

		/** GSI with an oauth2 code client whose popup outcome each test decides */
		const stubCodeClient = (outcome: (config: CodeClientConfig) => void) => {
			const requestCode = vi.fn();
			const initCodeClient = vi.fn((config: CodeClientConfig) => ({
				requestCode: () => {
					requestCode();
					outcome(config);
				}
			}));
			vi.stubGlobal('window', { google: { accounts: { id: {}, oauth2: { initCodeClient } } } });
			return { initCodeClient, requestCode };
		};

		it('opens the consent popup for the scope and resolves with the code', async () => {
			const gsi = stubCodeClient((config) =>
				config.callback?.({ code: 'auth-code' } as google.accounts.oauth2.CodeResponse)
			);
			const { requestGoogleAuthorizationCode } = await loadGoogleIdentityModule();

			await expect(requestGoogleAuthorizationCode('calendar-scope')).resolves.toBe('auth-code');
			expect(gsi.initCodeClient).toHaveBeenCalledWith(
				expect.objectContaining({
					client_id: 'test-client-id',
					scope: 'calendar-scope',
					ux_mode: 'popup'
				})
			);
			expect(gsi.requestCode).toHaveBeenCalledTimes(1);
		});

		it('rejects when access is denied', async () => {
			stubCodeClient((config) =>
				config.callback?.({
					error: 'access_denied'
				} as unknown as google.accounts.oauth2.CodeResponse)
			);
			const { requestGoogleAuthorizationCode } = await loadGoogleIdentityModule();

			await expect(requestGoogleAuthorizationCode('calendar-scope')).rejects.toThrow(
				'access_denied'
			);
		});

		it('rejects when the popup is closed', async () => {
			stubCodeClient((config) =>
				config.error_callback?.({ name: 'Error', message: '', type: 'popup_closed' })
			);
			const { requestGoogleAuthorizationCode } = await loadGoogleIdentityModule();

			await expect(requestGoogleAuthorizationCode('calendar-scope')).rejects.toThrow(
				'popup_closed'
			);
		});
	});
});
