import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { get } from 'svelte/store';

// vi.mock factories are hoisted — they cannot reference outer variables
vi.mock('#services', () => ({
	portfolioApi: {
		login: { post: vi.fn() },
		isLogged: { get: vi.fn() },
		logout: { get: vi.fn() }
	}
}));

vi.mock('../stores', async () => {
	const { writable } = await import('svelte/store');
	return {
		authenticationStore: writable({ user: undefined, expires: undefined }),
		sessionCheckedStore: writable(false)
	};
});

vi.mock('../googleIdentity', () => ({
	disableGoogleAutoSelect: vi.fn(() => Promise.resolve())
}));

import {
	isDomainAdmin,
	isLogged,
	isSessionValid,
	login,
	logout,
	watchSessionExpiry
} from '../authentication';
import { authenticationStore, sessionCheckedStore } from '../stores';
import { disableGoogleAutoSelect } from '../googleIdentity';
import { portfolioApi } from '#services';

const mockLoginPost = portfolioApi.login.post as unknown as Mock;
const mockIsLoggedGet = portfolioApi.isLogged.get as unknown as Mock;
const mockLogoutGet = portfolioApi.logout.get as unknown as Mock;

const nowSeconds = () => Math.floor(Date.now() / 1000);
const user = { _id: 'user-123', email: 'test@test.com' };
const validSession = () => ({ user, expires: nowSeconds() + 3600 });
const expiredSession = () => ({ user, expires: nowSeconds() - 3600 });
const loggedOut = { user: undefined, expires: undefined };

const apiError = (status: number) => ({ data: null, error: { status, value: 'error' } });

beforeEach(() => {
	vi.clearAllMocks();
	authenticationStore.set({ ...loggedOut });
	sessionCheckedStore.set(false);
	mockLogoutGet.mockResolvedValue({ data: null, error: null });
});

describe('isSessionValid', () => {
	it('accepts a known user with an unexpired JWT', () => {
		expect(isSessionValid(validSession())).toBe(true);
	});

	it('rejects expired sessions and sessions without a user', () => {
		expect(isSessionValid(expiredSession())).toBe(false);
		expect(isSessionValid({ expires: nowSeconds() + 3600 })).toBe(false);
		expect(isSessionValid(loggedOut)).toBe(false);
	});
});

describe('isDomainAdmin', () => {
	it('is true when the valid session user is the domain admin', () => {
		expect(isDomainAdmin(validSession(), { admin: 'user-123' })).toBe(true);
	});

	it('is false for another user', () => {
		expect(isDomainAdmin(validSession(), { admin: 'admin-456' })).toBe(false);
	});

	it('is false once the session has expired, even for the admin', () => {
		expect(isDomainAdmin(expiredSession(), { admin: 'user-123' })).toBe(false);
	});

	it('is false when nobody is logged in or the domain has no admin', () => {
		expect(isDomainAdmin(loggedOut, { admin: 'user-123' })).toBe(false);
		expect(isDomainAdmin(validSession(), {})).toBe(false);
		expect(isDomainAdmin(validSession(), undefined)).toBe(false);
	});
});

describe('isLogged', () => {
	it('always reconciles with the API, even with a valid local session', async () => {
		const session = validSession();
		authenticationStore.set(session);
		mockIsLoggedGet.mockResolvedValue({ data: { logged: true, ...session }, error: null });

		await expect(isLogged()).resolves.toBe(true);
		expect(mockIsLoggedGet).toHaveBeenCalledWith({ fetch: { credentials: 'include' } });
		expect(get(authenticationStore)).toEqual(session);
	});

	it('stores the session returned by the API when the local store is empty', async () => {
		const session = validSession();
		mockIsLoggedGet.mockResolvedValue({ data: { logged: true, ...session }, error: null });

		await expect(isLogged()).resolves.toBe(true);
		expect(get(authenticationStore)).toEqual(session);
	});

	it('clears a stale local session when the API says logged: false', async () => {
		authenticationStore.set(validSession());
		mockIsLoggedGet.mockResolvedValue({ data: { logged: false, reason: 'Missing jwt' } });

		await expect(isLogged()).resolves.toBe(false);
		expect(get(authenticationStore)).toEqual(loggedOut);
	});

	it('clears the local session when the API answers 401', async () => {
		authenticationStore.set(validSession());
		mockIsLoggedGet.mockResolvedValue(apiError(401));

		await expect(isLogged()).resolves.toBe(false);
		expect(get(authenticationStore)).toEqual(loggedOut);
	});

	it('drops an expired local session even when the API cannot be reached', async () => {
		authenticationStore.set(expiredSession());
		mockIsLoggedGet.mockResolvedValue(apiError(503));

		await expect(isLogged()).resolves.toBe(false);
		expect(get(authenticationStore)).toEqual(loggedOut);
	});

	it('keeps an unexpired local session when the API is unavailable', async () => {
		const session = validSession();
		authenticationStore.set(session);
		mockIsLoggedGet.mockResolvedValue(apiError(503));

		await expect(isLogged()).resolves.toBe(true);
		expect(get(authenticationStore)).toEqual(session);
	});

	it('keeps an unexpired local session when the request throws', async () => {
		const session = validSession();
		authenticationStore.set(session);
		mockIsLoggedGet.mockRejectedValue(new TypeError('Failed to fetch'));

		await expect(isLogged()).resolves.toBe(true);
		expect(get(authenticationStore)).toEqual(session);
	});

	it('rejects an API answer whose expiry is already in the past', async () => {
		mockIsLoggedGet.mockResolvedValue({ data: { logged: true, ...expiredSession() } });

		await expect(isLogged()).resolves.toBe(false);
		expect(get(authenticationStore)).toEqual(loggedOut);
	});

	it('marks the session as checked only once a stale session has been cleared', async () => {
		// Admin-only UI waits for sessionCheckedStore: it must never see the stale session
		authenticationStore.set(validSession());
		mockIsLoggedGet.mockResolvedValue({ data: { logged: false, reason: 'No auth cookie' } });
		const seenWhenChecked: unknown[] = [];
		const unsubscribe = sessionCheckedStore.subscribe((checked) => {
			if (checked) seenWhenChecked.push(get(authenticationStore));
		});

		const pending = isLogged();
		expect(get(sessionCheckedStore)).toBe(false);
		await pending;
		unsubscribe();

		expect(seenWhenChecked).toEqual([loggedOut]);
	});

	it('marks the session as checked even when the API cannot be reached', async () => {
		mockIsLoggedGet.mockRejectedValue(new TypeError('Failed to fetch'));

		await isLogged();
		expect(get(sessionCheckedStore)).toBe(true);
	});
});

describe('login', () => {
	it('stores the session once the API set the cookie and it round-trips', async () => {
		const session = validSession();
		mockLoginPost.mockResolvedValue({ data: session, error: null });
		mockIsLoggedGet.mockResolvedValue({ data: { logged: true, ...session }, error: null });

		await expect(login('google-cred-token')).resolves.toBe(true);
		expect(mockLoginPost).toHaveBeenCalledWith(
			{ token: 'google-cred-token' },
			{ fetch: { credentials: 'include' } }
		);
		expect(get(authenticationStore)).toEqual(session);
	});

	it('sends the chosen space and stores the account the API returned', async () => {
		const session = {
			user: { ...user, activeMode: 'recruiter', recruiter: true, domain: 'jane' },
			expires: nowSeconds() + 3600
		};
		mockLoginPost.mockResolvedValue({ data: session, error: null });
		mockIsLoggedGet.mockResolvedValue({ data: { logged: true, ...session }, error: null });

		await expect(login('google-cred-token', 'recruiter')).resolves.toBe(true);
		expect(mockLoginPost).toHaveBeenCalledWith(
			{ token: 'google-cred-token', mode: 'recruiter' },
			{ fetch: { credentials: 'include' } }
		);
		expect(get(authenticationStore)).toEqual(session);
	});

	it('returns false when the API rejects the token (401)', async () => {
		mockLoginPost.mockResolvedValue(apiError(401));

		await expect(login('bad-token')).resolves.toBe(false);
		expect(mockIsLoggedGet).not.toHaveBeenCalled();
		expect(get(authenticationStore)).toEqual(loggedOut);
	});

	it('returns false when the API fails (5xx / unreachable)', async () => {
		mockLoginPost.mockResolvedValue(apiError(503));

		await expect(login('token')).resolves.toBe(false);
		expect(get(authenticationStore)).toEqual(loggedOut);
	});

	it('returns false when the cookie is not sent back (blocked or not stored)', async () => {
		mockLoginPost.mockResolvedValue({ data: validSession(), error: null });
		mockIsLoggedGet.mockResolvedValue({ data: { logged: false, reason: 'No auth cookie' } });

		await expect(login('token')).resolves.toBe(false);
		expect(get(authenticationStore)).toEqual(loggedOut);
	});

	it('returns false when the request throws', async () => {
		mockLoginPost.mockRejectedValue(new TypeError('Failed to fetch'));

		await expect(login('token')).resolves.toBe(false);
	});
});

describe('logout', () => {
	it('clears the store and disables Google One Tap auto-select', async () => {
		authenticationStore.set(validSession());

		await logout();

		expect(mockLogoutGet).toHaveBeenCalledWith({ fetch: { credentials: 'include' } });
		expect(get(authenticationStore)).toEqual(loggedOut);
		expect(disableGoogleAutoSelect).toHaveBeenCalledTimes(1);
	});

	it('still ends the local session when the API call fails', async () => {
		authenticationStore.set(validSession());
		mockLogoutGet.mockRejectedValue(new TypeError('Failed to fetch'));

		await logout();

		expect(get(authenticationStore)).toEqual(loggedOut);
		expect(disableGoogleAutoSelect).toHaveBeenCalledTimes(1);
	});
});

describe('watchSessionExpiry', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('clears the session when its JWT expires', async () => {
		authenticationStore.set({ user, expires: nowSeconds() + 2 });
		const stop = watchSessionExpiry();

		await vi.advanceTimersByTimeAsync(1000);
		expect(get(authenticationStore).user).toEqual(user);

		await vi.advanceTimersByTimeAsync(3000);
		expect(get(authenticationStore)).toEqual(loggedOut);
		stop();
	});

	it('clears an already expired session right away', async () => {
		authenticationStore.set(expiredSession());
		const stop = watchSessionExpiry();

		await vi.advanceTimersByTimeAsync(0);
		expect(get(authenticationStore)).toEqual(loggedOut);
		stop();
	});
});
