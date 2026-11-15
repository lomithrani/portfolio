// The address search of the forms that take an address (the commute of the perfect job, the
// office of a job posting): GET /addresses/search answers what is typed with the addresses the
// map service knows, so the address kept is one it can find again.

/** What an address found is: a numbered address, a street, a named place, a town */
export const ADDRESS_KINDS = ['housenumber', 'street', 'locality', 'municipality'] as const;
export type AddressKind = (typeof ADDRESS_KINDS)[number];

/** An address the map service knows, offered for what was typed */
export interface AddressSuggestion {
	/** The whole address as the map service writes it: '12 Rue de la République 69002 Lyon' */
	label: string;
	kind: AddressKind;
	/** The street, with its number when it has one: '12 Rue de la République'. None for a town */
	street?: string;
	postalCode?: string;
	city?: string;
}

/** The rules of the search: the text it takes, and how many addresses it answers with */
export const ADDRESS_SEARCH = {
	/** Under this nothing is looked up: the map service refuses a text that short */
	minLength: 3,
	maxLength: 200,
	suggestions: 5
} as const;

/** What was typed, as it is looked up: trimmed, its runs of spaces as one, cut to the length taken */
export const addressSearchText = (raw: string): string =>
	raw.replace(/\s+/g, ' ').trim().slice(0, ADDRESS_SEARCH.maxLength);

/** Whether `text` (as addressSearchText left it) is enough to look up */
export const canSearchAddress = (text: string): boolean => text.length >= ADDRESS_SEARCH.minLength;

/**
 * Where travel times to a job's office are counted from, as the API found it on the map:
 * its street, its town when the street is not found (or not given), nowhere (`none`), or not
 * known right now (`unknown`: the map service did not answer)
 */
export interface OfficePlace {
	found: 'street' | 'town' | 'none' | 'unknown';
	/** The address found, as the map service writes it */
	label?: string;
}
