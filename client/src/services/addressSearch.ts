import {
	addressSearchText,
	canSearchAddress,
	type AddressSuggestion,
	type OfficePlace
} from 'portfolio-common';
import { textApi } from './portfolio.ts';

// The address search of the forms that take an address (GET /addresses/search, GET
// /addresses/office): what is typed goes to this site's API, which asks the map service; the
// browser never calls the map service itself.

const withCredentials = { credentials: 'include' } as const;

/**
 * What a search answered: the addresses found (none: the map service knows no such address),
 * `off` on a site that looks no address up, `unavailable` when it could not be searched right
 * now (too many searches, the map service away, no session, or the request was aborted)
 */
export type AddressSearchOutcome =
	{ status: 'found'; suggestions: AddressSuggestion[] } | { status: 'off' | 'unavailable' };

export interface AddressSearchQuery {
	/** What was typed so far */
	text: string;
	/** A postal code and a town typed in their own fields: they narrow the search */
	postalCode?: string;
	city?: string;
}

/** The 5 digits of a French postal code, or nothing: one still being typed narrows nothing */
const wholePostalCode = (raw: string | undefined): string | undefined => {
	const code = raw?.trim() ?? '';
	return /^\d{5}$/.test(code) ? code : undefined;
};

/** What `searchAddresses` sends for `query`; null when there is too little to look up */
export const addressSearchParams = (
	query: AddressSearchQuery
): { q: string; postalCode?: string; city?: string } | null => {
	const q = addressSearchText(query.text);
	if (!canSearchAddress(q)) return null;
	const postalCode = wholePostalCode(query.postalCode);
	const city = addressSearchText(query.city ?? '');
	return { q, ...(postalCode ? { postalCode } : {}), ...(city ? { city } : {}) };
};

/** The addresses that what was typed could be; none, without a request, for a text too short */
export const searchAddresses = async (
	query: AddressSearchQuery,
	signal?: AbortSignal
): Promise<AddressSearchOutcome> => {
	const params = addressSearchParams(query);
	if (!params) return { status: 'found', suggestions: [] };
	try {
		// A POST: what is typed travels in the body, never in a URL (server/plugins/addresses.ts)
		const { data, error } = await textApi.addresses.search.post(params, {
			fetch: { ...withCredentials, signal }
		});
		if (error || !data) return { status: 'unavailable' };
		return data.enabled ? { status: 'found', suggestions: data.suggestions } : { status: 'off' };
	} catch {
		return { status: 'unavailable' };
	}
};

/** Where an office is, as a job posting says it */
export interface OfficeAddress {
	address: string;
	postalCode: string;
	city: string;
}

/** An office as it is looked up: what tells two of them apart */
export const officeKey = ({ address, postalCode, city }: OfficeAddress): string =>
	[address, postalCode, city].map((part) => addressSearchText(part).toLowerCase()).join('|');

/**
 * Where travel times to an office are counted from (its street, its town, nowhere); null when
 * this site does not say: it looks no address up, or could not right now
 */
export const lookUpOffice = async (
	office: OfficeAddress,
	signal?: AbortSignal
): Promise<OfficePlace | null> => {
	const asked = Object.fromEntries(
		Object.entries(office)
			.map(([key, value]) => [key, addressSearchText(value)])
			.filter(([, value]) => value)
	);
	try {
		const { data, error } = await textApi.addresses.office.post(asked, {
			fetch: { ...withCredentials, signal }
		});
		if (error || !data || !data.enabled || data.found === 'unknown') return null;
		return { found: data.found, ...(data.label ? { label: data.label } : {}) };
	} catch {
		return null;
	}
};

/** The words of a text as they are compared: no accents, no capitals, no punctuation */
const words = (text: string): string[] =>
	addressSearchText(text)
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);

/**
 * Whether `typed` is only what was typed to find `town`: every word of it starts a word of the
 * town's name or its postal code ("Villeurb", "paris 15" for Paris 15e Arrondissement)
 */
const isTownSearch = (typed: string, town: AddressSuggestion): boolean => {
	const typedWords = words(typed);
	const townWords = words([town.city, town.label, town.postalCode].filter(Boolean).join(' '));
	return (
		typedWords.length > 0 &&
		typedWords.every((word) => townWords.some((townWord) => townWord.startsWith(word)))
	);
};

/**
 * What picking `suggestion` puts in the fields of a job posting's office: the street in the
 * address, and the postal code and the town it is in. A town has no street: what was typed in
 * the address to find it is not kept as one; anything else typed there (a street the map does
 * not know, a building's name) stays
 */
export const officeFromSuggestion = (
	suggestion: AddressSuggestion,
	current: OfficeAddress
): OfficeAddress => ({
	address:
		suggestion.kind === 'municipality'
			? isTownSearch(current.address, suggestion)
				? ''
				: current.address
			: (suggestion.street ?? ''),
	postalCode: suggestion.postalCode ?? current.postalCode,
	city: suggestion.city ?? current.city
});
