import type { Page, Request } from '@playwright/test';
import type { AddressSuggestion, OfficePlace } from 'portfolio-common';
import { API_URL } from './owner';

// The address search answered in the browser (GET /addresses/search, GET /addresses/office): the
// API under test computes no travel times, and no map service is ever called.

const cors = (request: Request) => ({
	'access-control-allow-origin': request.headers()['origin'] ?? '*',
	'access-control-allow-credentials': 'true'
});

export interface AddressStub {
	/** The addresses found for a search, given its query (`q`, `postalCode`, `city`) */
	search: (query: URLSearchParams) => AddressSuggestion[];
	/** Where an office is found, given its query (`address`, `postalCode`, `city`) */
	office?: (query: URLSearchParams) => OfficePlace;
}

/** Answers the address search of `page`; returns the queries it was asked, in order */
export const stubAddressSearch = async (page: Page, { search, office }: AddressStub) => {
	const asked = { search: [] as URLSearchParams[], office: [] as URLSearchParams[] };
	await page.route(`${API_URL}/addresses/*`, (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (request.method() === 'OPTIONS') {
			return route.fulfill({
				status: 204,
				headers: {
					...cors(request),
					'access-control-allow-methods': 'GET',
					'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? ''
				}
			});
		}
		if (url.pathname === '/addresses/search') {
			asked.search.push(url.searchParams);
			return route.fulfill({
				json: { enabled: true, suggestions: search(url.searchParams) },
				headers: cors(request)
			});
		}
		asked.office.push(url.searchParams);
		return route.fulfill({
			json: { enabled: true, ...(office?.(url.searchParams) ?? { found: 'unknown' }) },
			headers: cors(request)
		});
	});
	return asked;
};
