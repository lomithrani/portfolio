import {
	LEGAL_CONTACT_EMAIL,
	LEGAL_PUBLICATION_DIRECTOR,
	LEGAL_PUBLISHER_ADDRESS,
	LEGAL_PUBLISHER_NAME,
	LEGAL_PUBLISHER_PHONE,
	LEGAL_PUBLISHER_SIREN,
	LEGAL_PUBLISHER_VAT
} from '$app/env/private';
import { legalPublisher } from '#components/legal/legalDocuments.ts';
import type { LayoutServerLoad } from './$types';

// The legal pages are rendered on the server: the publisher's details come from the web
// service's private LEGAL_* variables (src/env.ts). Their language is the page's (getLocale(),
// read by each page), not this load's: a later data request could come with another cookie
export const load: LayoutServerLoad = () => ({
	publisher: legalPublisher({
		name: LEGAL_PUBLISHER_NAME,
		email: LEGAL_CONTACT_EMAIL,
		address: LEGAL_PUBLISHER_ADDRESS,
		phone: LEGAL_PUBLISHER_PHONE,
		siren: LEGAL_PUBLISHER_SIREN,
		vat: LEGAL_PUBLISHER_VAT,
		director: LEGAL_PUBLICATION_DIRECTOR
	})
});
