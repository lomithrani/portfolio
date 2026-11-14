import {
	LEGAL_CONTACT_EMAIL,
	LEGAL_PUBLICATION_DIRECTOR,
	LEGAL_PUBLISHER_ADDRESS,
	LEGAL_PUBLISHER_NAME,
	LEGAL_PUBLISHER_PHONE,
	LEGAL_PUBLISHER_SIREN,
	LEGAL_PUBLISHER_VAT
} from '$app/env/private';
import {
	LEGAL_LANGUAGE_PARAM,
	legalLanguage,
	legalPublisher
} from '#components/legal/legalDocuments.ts';
import type { LayoutServerLoad } from './$types';

// The legal pages are rendered on the server: the publisher's details come from the web
// service's private LEGAL_* variables (src/env.ts), the language from `?lang=fr`
export const load: LayoutServerLoad = ({ url }) => ({
	lang: legalLanguage(url.searchParams.get(LEGAL_LANGUAGE_PARAM)),
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
