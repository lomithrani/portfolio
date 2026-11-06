import { persisted } from 'svelte-persisted-store';
import { writable, type Writable } from 'svelte/store';
import type { UserMode } from 'portfolio-common';

// Public profile of the logged-in user, as returned (JSON) by POST /login, GET /isLogged, GET /me
// and PUT /me/mode (UserDto of server/services/users.ts).
export type AuthUser = {
	_id: string;
	email?: string;
	name?: string;
	surname?: string;
	/** The space the account last chose (portfolio-common USER_MODES); absent until it chooses */
	activeMode?: UserMode;
	/** Whether the account has a recruiter space (created the first time it chooses 'recruiter') */
	recruiter?: boolean;
	/** Name of the domain (portfolio) the account owns, if any */
	domain?: string;
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
