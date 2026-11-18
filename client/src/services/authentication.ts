import { get } from 'svelte/store';
import type { ConsentInput, UserMode } from 'portfolio-common';
import { portfolioApi } from '#services';
import {
	authenticationStore,
	sessionCheckedStore,
	type AuthenticationData,
	type AuthUser
} from './stores';
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

const ISO_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?$/;

/**
 * The version of the terms an account accepted, as the text the API sends ('2026-11-14'), or
 * undefined. Eden Treaty parses date-like strings of the API's JSON into Dates, so the version
 * arrives as a Date (midnight UTC), and a session persisted before it was read back as text keeps
 * that Date's ISO string ('2026-11-14T00:00:00.000Z'): both are read back as the date.
 */
const termsVersionText = (value: unknown): string | undefined => {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
	}
	if (typeof value !== 'string' || !value) return undefined;
	return ISO_DATE_TIME.exec(value)?.[1] ?? value;
};

/**
 * The account in a response of POST /login, GET /isLogged, GET /me, PUT /me/mode or
 * PUT /me/consent (`{ user }`), its termsVersion as text (termsVersionText); undefined without one.
 */
const readUser = (data: unknown): AuthUser | undefined => {
	if (!data || typeof data !== 'object' || !('user' in data)) return undefined;
	const user = (data as { user?: unknown }).user;
	if (!user || typeof user !== 'object' || !('_id' in user)) return undefined;
	const { termsVersion, ...rest } = user as AuthUser & { termsVersion?: unknown };
	const version = termsVersionText(termsVersion);
	return { ...rest, ...(version ? { termsVersion: version } : {}) } as AuthUser;
};

const readExpires = (data: unknown): number | undefined => {
	if (!data || typeof data !== 'object' || !('expires' in data)) return undefined;
	const expires = (data as { expires?: unknown }).expires;
	return typeof expires === 'number' ? expires : undefined;
};

const isLoggedIn = (data: unknown): boolean =>
	!!data && typeof data === 'object' && 'logged' in data && data.logged === true;

const reconcileSession = async (): Promise<boolean> => {
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
 * Reconciles the persisted (localStorage) session with the API's view of the auth cookie.
 * Expired entries are dropped immediately; a 401 or `logged: false` clears the store. When the
 * API cannot be reached the unexpired local session is kept, since nothing proves it wrong.
 * Either way `sessionCheckedStore` is set once it settles.
 */
const isLogged = async (): Promise<boolean> => {
	try {
		return await reconcileSession();
	} finally {
		sessionCheckedStore.set(true);
	}
};

/**
 * Why a sign-in failed: 'stale-terms' (the confirmation was given for an older version of the
 * terms), 'consent' (the API asks for the confirmation: opening the recruiter space without it) or
 * anything else
 */
type SignInFailureReason = 'stale-terms' | 'consent' | 'error';

type SignInResult = { ok: true } | { ok: false; reason: SignInFailureReason };

interface SignInOptions {
	/** The space to make active ('recruiter' creates the recruiter space) */
	mode?: UserMode;
	/** The age and terms checkbox ticked before signing in (portfolio-common currentConsent()) */
	consent?: ConsentInput;
	/**
	 * Where that checkbox was: the landing page (the API's default), a claim form, or the recruiter
	 * space (the API's default with the mode 'recruiter')
	 */
	consentSource?: 'landing' | 'claim' | 'recruiter';
}

/** The field a 422 validation error names (`property`), '' for any other body */
const validationProperty = (value: unknown): string =>
	value && typeof value === 'object' && 'property' in value && typeof value.property === 'string'
		? value.property
		: '';

/**
 * Exchanges a Google ID token for the API's auth cookie, and says why it failed: 'stale-terms'
 * when the API refused the confirmation as given for an older version of the terms (a page loaded
 * before they changed: only a reload helps), 'consent' when it asks for one (the mode 'recruiter'
 * opens the recruiter space, which needs the terms in force), 'error' otherwise (the API rejected
 * the token, or the cookie does not round-trip). The user stays logged out on failure. `mode`
 * makes that space the account's active one (choosing 'recruiter' creates the recruiter space);
 * without it the account keeps the space it last chose. `consent` is recorded by the API, from
 * `consentSource`, before the session is issued.
 */
const signIn = async (
	googleCredential: string,
	{ mode, consent, consentSource }: SignInOptions = {}
): Promise<SignInResult> => {
	try {
		const { data, error } = await portfolioApi.login.post(
			{
				token: googleCredential,
				...(mode ? { mode } : {}),
				...(consent ? { consent } : {}),
				...(consent && consentSource ? { consentSource } : {})
			},
			withCredentials
		);
		const session = { user: readUser(data), expires: readExpires(data) };
		if (error || !isSessionValid(session)) {
			clearAuthentication();
			const property = errorStatus(error) === 422 ? validationProperty(error?.value) : '';
			const reason: SignInFailureReason =
				property === 'consent.termsVersion'
					? 'stale-terms'
					: property === 'consent'
						? 'consent'
						: 'error';
			return { ok: false, reason };
		}

		// The cookie is httpOnly: make sure the browser stored it and sends it back
		const check = await portfolioApi.isLogged.get(withCredentials);
		if (check.error || !isLoggedIn(check.data)) {
			clearAuthentication();
			return { ok: false, reason: 'error' };
		}

		authenticationStore.set(session);
		return { ok: true };
	} catch {
		clearAuthentication();
		return { ok: false, reason: 'error' };
	}
};

/**
 * Exchanges a Google ID token for the API's auth cookie (signIn). Returns false (and leaves the
 * user logged out) when the API rejects the token or when the cookie does not round-trip.
 */
const login = async (
	googleCredential: string,
	mode?: UserMode,
	consent?: ConsentInput
): Promise<boolean> => (await signIn(googleCredential, { mode, consent })).ok;

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
	readUser,
	signIn,
	termsVersionText,
	watchSessionExpiry
};
export type { SignInFailureReason, SignInOptions, SignInResult };
