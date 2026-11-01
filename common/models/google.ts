// Public OAuth 2.0 client ID of the portfolio's Google Sign-In app. It is not a
// secret (it ships to every browser). The API checks that Google ID tokens were
// issued for this audience; both sides can override it via env
// (GOOGLE_CLIENT_ID on the server, PUBLIC_GOOGLE_CLIENT_ID on the client).
export const DEFAULT_GOOGLE_CLIENT_ID =
	'1075297079847-nkpqjg6shjj9lbcdofs6tlf21rprqr7q.apps.googleusercontent.com';
