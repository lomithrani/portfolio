import type { Page, Request, Route } from '@playwright/test';
import { API_URL } from './owner';

// Routes of the API answered in the browser (page.route): what a test must not change for real
// (an account's terms, its spaces), or a state the e2e database does not have.

/** An answer of stubApi; undefined lets the request through to the API */
export type StubAnswer = { status?: number; json: unknown } | undefined;

/**
 * Answers `method path` of the API in the browser with `answer`, with the CORS headers the API
 * would send (the page and the API are on different origins, so a preflight is answered too).
 * When `answer` gives nothing, the request goes on to the API. Returns the requests answered.
 */
export const stubApi = async (
	page: Page,
	method: string,
	path: string,
	answer: (request: Request) => StubAnswer | Promise<StubAnswer>
) => {
	const answered: Request[] = [];
	await page.route(`${API_URL}${path}`, async (route: Route) => {
		const request = route.request();
		const cors = {
			'access-control-allow-origin': request.headers()['origin'] ?? '*',
			'access-control-allow-credentials': 'true'
		};
		if (request.method() === 'OPTIONS') {
			return route.fulfill({
				status: 204,
				headers: {
					...cors,
					'access-control-allow-methods': 'GET, POST, PUT, DELETE',
					'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? ''
				}
			});
		}
		if (request.method() !== method) return route.fallback();
		const reply = await answer(request);
		if (!reply) return route.fallback();
		answered.push(request);
		return route.fulfill({ status: reply.status ?? 200, json: reply.json, headers: cors });
	});
	return answered;
};

/** A session's expiry an hour from now, in seconds (as POST /login and GET /isLogged give it) */
export const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;

/** The API's 422 for an account that has not accepted the terms in force */
export const TERMS_REQUIRED = {
	status: 422,
	json: {
		type: 'validation',
		on: 'body',
		property: 'consent',
		message: 'Accept the terms of use in force to use your recruiter space.'
	}
};
