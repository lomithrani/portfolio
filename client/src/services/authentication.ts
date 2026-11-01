import { get } from 'svelte/store';
import { portfolioApi } from '$services';
import { authenticationStore, type AuthenticationData, type AuthUser } from './stores';
import { disableGoogleAutoSelect } from './googleIdentity';
import { errorStatus } from './apiErrors';

const withCredentials = { fetch: { credentials: 'include' } } as const;

// setTimeout delays are signed 32-bit integers; longer delays fire immediately
const MAX_TIMER_DELAY = 2_147_483_647;

/** A session is usable only while the user is known and the JWT has not expired. */
const isSessionValid = (auth: AuthenticationData, now: number = Date.now()): boolean =>
	auth.user?._id != null && auth.expires != null && auth.expires * 1000 > now;

/** Whether the current (unexpired) session belongs to the domain's admin. */
const isDomainAdmin = (
	auth: AuthenticationData,
	// `admin` is the admin user's id as serialized by GET /domain/:name
	domain: { admin?: unknown } | null | undefined,
	now: number = Date.now()
): boolean =>
	isSessionValid(auth, now) &&
	domain?.admin != null &&
	String(auth.user?._id) === String(domain.admin);

const clearAuthentication = () => authenticationStore.set({ user: undefined, expires: undefined });

const readUser = (data: unknown): AuthUser | undefined => {
	if (!data || typeof data !== 'object' || !('user' in data)) return undefined;
	const user = (data as { user?: unknown }).user;
	return user && typeof user === 'object' && '_id' in user ? (user as AuthUser) : undefined;
};

const readExpires = (data: unknown): number | undefined => {
	if (!data || typeof data !== 'object' || !('expires' in data)) return undefined;
	const expires = (data as { expires?: unknown }).expires;
	return typeof expires === 'number' ? expires : undefined;
};

const isLoggedIn = (data: unknown): boolean =>
	!!data && typeof data === 'object' && 'logged' in data && data.logged === true;

/**
 * Reconciles the persisted (localStorage) session with the API's view of the auth cookie.
 * Expired entries are dropped immediately; a 401 or `logged: false` clears the store. When the
 * API cannot be reached the unexpired local session is kept, since nothing proves it wrong.
 */
const isLogged = async (): Promise<boolean> => {
	if (!isSessionValid(get(authenticationStore))) clearAuthentication();

	try {
		const { data, error } = await portfolioApi.isLogged.get(withCredentials);

		if (error) {
			const status = errorStatus(error);
			if (status === 401 || status === 403) {
				clearAuthentication();
				return false;
			}
			return isSessionValid(get(authenticationStore));
		}

		const user = readUser(data);
		const expires = readExpires(data);
		const session = { user, expires };
		if (isLoggedIn(data) && isSessionValid(session)) {
			authenticationStore.set(session);
			return true;
		}
	} catch {
		return isSessionValid(get(authenticationStore));
	}

	clearAuthentication();
	return false;
};

/**
 * Exchanges a Google ID token for the API's auth cookie. Returns false (and leaves the user
 * logged out) when the API rejects the token or when the cookie does not round-trip.
 */
const login = async (googleCredential: string): Promise<boolean> => {
	try {
		const { data, error } = await portfolioApi.login.post(
			{ token: googleCredential },
			withCredentials
		);
		const session = { user: readUser(data), expires: readExpires(data) };
		if (error || !isSessionValid(session)) {
			clearAuthentication();
			return false;
		}

		// The cookie is httpOnly: make sure the browser stored it and sends it back
		const check = await portfolioApi.isLogged.get(withCredentials);
		if (check.error || !isLoggedIn(check.data)) {
			clearAuthentication();
			return false;
		}

		authenticationStore.set(session);
		return true;
	} catch {
		clearAuthentication();
		return false;
	}
};

const logout = async (): Promise<void> => {
	try {
		await portfolioApi.logout.get(withCredentials);
	} catch {
		// The local session ends regardless of whether the API could be reached
	} finally {
		clearAuthentication();
		await disableGoogleAutoSelect();
	}
};

/**
 * Clears the persisted session when its JWT expires while the page is open, so admin-only UI
 * disappears on time. Returns a function that stops watching.
 */
const watchSessionExpiry = (): (() => void) => {
	let timer: ReturnType<typeof setTimeout> | undefined;

	const schedule = (auth: AuthenticationData) => {
		clearTimeout(timer);
		timer = undefined;
		if (auth.expires == null) return;

		const remaining = auth.expires * 1000 - Date.now();
		if (remaining <= 0) {
			// Not synchronously: this runs inside the store's subscriber notification
			queueMicrotask(clearAuthentication);
			return;
		}
		timer = setTimeout(
			() => schedule(get(authenticationStore)),
			Math.min(remaining + 1000, MAX_TIMER_DELAY)
		);
	};

	const unsubscribe = authenticationStore.subscribe(schedule);
	return () => {
		clearTimeout(timer);
		unsubscribe();
	};
};

export {
	clearAuthentication,
	isDomainAdmin,
	isLogged,
	isSessionValid,
	login,
	logout,
	watchSessionExpiry
};
