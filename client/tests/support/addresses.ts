import type { Page, Request } from '@playwright/test';
import type { AddressSuggestion, OfficePlace } from 'portfolio-common';
import { API_URL } from './owner';

// The address search answered in the browser (POST /addresses/search, POST /addresses/office):
// the API under test computes no travel times, and no map service is ever called.

const cors = (request: Request) => ({
	'access-control-allow-origin': request.headers()['origin'] ?? '*',
	'access-control-allow-credentials': 'true'
});

export interface AddressStub {
	/** The addresses found for a search, given what it sent (`q`, `postalCode`, `city`) */
	search: (asked: Record<string, string>) => AddressSuggestion[];
	/** Where an office is found, given what it sent (`address`, `postalCode`, `city`) */
	office?: (asked: Record<string, string>) => OfficePlace;
}

/** Answers the address search of `page`; returns what it was asked, in order */
export const stubAddressSearch = async (page: Page, { search, office }: AddressStub) => {
	const asked = { search: [] as Record<string, string>[], office: [] as Record<string, string>[] };
	await page.route(`${API_URL}/addresses/*`, (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (request.method() === 'OPTIONS') {
			return route.fulfill({
				status: 204,
				headers: {
					...cors(request),
					'access-control-allow-methods': 'POST',
					'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? ''
				}
			});
		}
		// What is typed travels in the body: a URL holding it would be a leak
		if (url.search) throw new Error(`The address search was sent in a URL: ${url.pathname}?…`);
		const body = (request.postDataJSON() ?? {}) as Record<string, string>;
		if (url.pathname === '/addresses/search') {
			asked.search.push(body);
			return route.fulfill({
				json: { enabled: true, suggestions: search(body) },
				headers: cors(request)
			});
		}
		asked.office.push(body);
		return route.fulfill({
			json: { enabled: true, ...(office?.(body) ?? { found: 'unknown' }) },
			headers: cors(request)
		});
	});
	return asked;
};
