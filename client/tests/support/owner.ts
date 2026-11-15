import { expect, request as playwrightRequest, type Page } from '@playwright/test';

// Signing in as the owner of an e2e domain, or as the e2e recruiter (both seeded by
// `bun run --cwd server seed:e2e`), without Google: a session JWT signed with the API's
// JWT_SECRET (the claims POST /login issues), set as the API's auth cookie, plus the persisted
// session of the client.

/** Same API as the web server under test (see playwright.config.ts) */
export const API_URL = process.env.PUBLIC_PORTFOLIO_API_URL ?? 'http://localhost:3000';
export const JWT_SECRET = process.env.JWT_SECRET;

const base64url = (bytes: Uint8Array) =>
	btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

/** An HS256 session JWT ({ sub, exp }), as POST /login issues it */
export const signSession = async (userId: string, exp: number, secret = JWT_SECRET ?? '') => {
	const encoder = new TextEncoder();
	const encode = (value: unknown) => base64url(encoder.encode(JSON.stringify(value)));
	const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, exp })}`;
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(unsigned));
	return `${unsigned}.${base64url(new Uint8Array(signature))}`;
};

export type OwnerSession = { ownerId: string; token: string; exp: number };

/** The domain owner's id (GET /domain/:name) and a session for them, valid for an hour */
export const ownerSession = async (domain: string): Promise<OwnerSession> => {
	const anonymous = await playwrightRequest.newContext();
	const response = await anonymous.get(`${API_URL}/domain/${domain}`);
	expect(response.ok(), `GET /domain/${domain}: run \`bun run --cwd server seed:e2e\``).toBe(true);
	const ownerId = String((await response.json()).admin);
	await anonymous.dispose();
	const exp = Math.floor(Date.now() / 1000) + 3600;
	return { ownerId, token: await signSession(ownerId, exp), exp };
};

/**
 * The e2e recruiter ('e2e.recruiter@example.com', seeded by `seed:e2e` with a recruiter space and
 * no domain): its id is fixed, since no domain leads to it (server/tests/seedE2e.ts)
 */
export const E2E_RECRUITER_ID = '65e2e0000000000000000001';

/** A session for the e2e recruiter, valid for an hour (signIn takes it like an owner's) */
export const recruiterSession = async (): Promise<OwnerSession> => {
	const exp = Math.floor(Date.now() / 1000) + 3600;
	return { ownerId: E2E_RECRUITER_ID, token: await signSession(E2E_RECRUITER_ID, exp), exp };
};

/** An API client that sends the session's auth cookie (to set up and clean up through the API) */
export const apiAs = ({ token }: OwnerSession) =>
	playwrightRequest.newContext({ extraHTTPHeaders: { cookie: `auth=${token}` } });

/** The owner's session in a page: the auth cookie of the API and the persisted session of the client */
export const signIn = async (page: Page, { ownerId, token, exp }: OwnerSession) => {
	await page.context().addCookies([
		{
			name: 'auth',
			value: token,
			url: API_URL,
			httpOnly: true,
			sameSite: 'Strict',
			expires: exp
		}
	]);
	await page.addInitScript(
		(value) => localStorage.setItem('authenticationStore', value),
		JSON.stringify({ user: { _id: ownerId }, expires: exp })
	);
};

/** Navigates and waits until the page has hydrated and the session was checked with the API */
export const gotoHydrated = async (page: Page, path: string) => {
	const isLogged = page.waitForResponse((response) => response.url().endsWith('/isLogged'));
	const response = await page.goto(path);
	await isLogged;
	return response;
};

/** The toasts of the page (their region), to tell a toast from the same words on the page */
export const toasts = (page: Page) => page.getByRole('region', { name: /^Notifications/ });

/** Google (Sign-In script, fonts) is never reached */
export const blockGoogle = (page: Page) =>
	page
		.context()
		.route(/^https?:\/\/([^/]*\.)?(google|gstatic|googleapis|googleusercontent)\.com\//, (route) =>
			route.abort()
		);
