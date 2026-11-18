// Facts the legal documents share in both languages: third parties, authorities and the limits
// the code enforces. Each one is checked against the code or the provider's published terms;
// keep them in step when either changes.

import { LOCALE_COOKIE_MAX_AGE } from 'portfolio-common';

/**
 * Host of the web application, the API and the database (LCEN art. 1-1: host identity). LCEN asks
 * for its phone number too: Railway publishes none, which the legal notice says (`phone: null`);
 * set it here if it ever does.
 */
export const HOST: {
	name: string;
	address: string;
	email: string;
	website: string;
	websiteLabel: string;
	phone: string | null;
} = {
	name: 'Railway Corporation',
	address: '548 Market St PMB 68956, San Francisco, CA 94104, USA',
	email: 'privacy@railway.com',
	website: 'https://railway.com',
	websiteLabel: 'railway.com',
	phone: null
};

/** French data protection authority (GDPR art. 13(2)(d)) */
export const CNIL = {
	name: 'Commission nationale de l’informatique et des libertés (CNIL)',
	address: '3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, France',
	website: 'https://www.cnil.fr',
	complaint: 'https://www.cnil.fr/fr/plaintes'
} as const;

export const LINKS = {
	googlePrivacy: 'https://policies.google.com/privacy',
	googlePermissions: 'https://myaccount.google.com/permissions',
	googleApiPolicy: 'https://developers.google.com/terms/api-services-user-data-policy',
	anthropicPrivacy: 'https://www.anthropic.com/legal/privacy',
	anthropicCommercialTerms: 'https://www.anthropic.com/legal/commercial-terms',
	railwayPrivacy: 'https://railway.com/legal/privacy',
	/**
	 * The content delivery network in front of the web application's pages, not of the API
	 * (production, checked 2026-11-18: the pages answer with `server: cloudflare` and a `cf-ray`,
	 * the API with `server: railway-hikari`). If it ever fronts the API too, the privacy policy
	 * says so (docs/DEPLOYMENT.md, "Legal pages")
	 */
	cloudflarePrivacy: 'https://www.cloudflare.com/privacypolicy/',
	githubPrivacy:
		'https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement',
	/** The French state's map services (geocoding, routes), used for travel times */
	geoplateforme: 'https://geoservices.ign.fr/',
	/** The journey planners public transport times can come from, where offered: one of the two */
	herePrivacy: 'https://legal.here.com/privacy/policy',
	transitous: 'https://transitous.org/',
	dpf: 'https://www.dataprivacyframework.gov',
	scc: 'https://eur-lex.europa.eu/eli/dec_impl/2021/914/oj'
} as const;

/** The Google Calendar scope the portfolio owners grant (client AppointmentsTab.svelte) */
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

/** Session cookie lifetime (server/plugins/auth.ts SESSION_DAYS) */
export const SESSION_DAYS = 7;

/** Lifetime of the cookie that keeps the language a visitor chose (portfolio-common LOCALE_COOKIE) */
export const LANGUAGE_COOKIE_DAYS = LOCALE_COOKIE_MAX_AGE / (24 * 60 * 60);

/** Largest PDF the imports read (client and API: 4 MB) */
export const IMPORT_MAX_MB = 4;
