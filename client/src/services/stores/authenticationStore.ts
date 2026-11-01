import { persisted } from 'svelte-persisted-store';
import { writable, type Writable } from 'svelte/store';

// Public profile of the logged-in user, as returned (JSON) by POST /login and GET /isLogged.
export type AuthUser = {
	_id: string;
	email?: string;
	name?: string;
	surname?: string;
};

// Client-side mirror of the httpOnly auth cookie. It is only a hint for the UI: the API
// remains the source of truth and `isLogged()` reconciles it on every page load.
export type AuthenticationData = {
	user?: AuthUser;
	// JWT expiry, in seconds since the epoch
	expires?: number;
};

const initialAuth: AuthenticationData = {
	user: undefined,
	expires: undefined
};

export const authenticationStore: Writable<AuthenticationData> = persisted(
	'authenticationStore',
	initialAuth
);

// Whether `isLogged()` has reconciled the persisted session with the API during this page load.
// Admin-only UI waits for it, so a stale local session (cookie missing, secret rotated, ...)
// never shows admin controls. It is only set in the browser, so SSR markup never depends on it.
export const sessionCheckedStore: Writable<boolean> = writable(false);
