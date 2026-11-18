// The four legal pages (legal notice, privacy policy, terms of use, cookies), each in English
// and French, in the language of the site (docs/I18N.md): their routes, titles and the helpers
// the pages, the footer links and the e2e tests share. The texts themselves are the content
// components next to this file, one per document and language (content/).

import { LEGAL_VERSION, type Locale } from 'portfolio-common';

/** Name of the service, used in page titles, the footer and the Google Limited Use statement */
export const SITE_NAME = 'Portfolio';

/** The language of a legal document: one of the site's */
export type LegalLanguage = Locale;

export type LegalDocumentId = 'notice' | 'privacy' | 'terms' | 'cookies';

/** Route ids of the pages, for resolve() */
export type LegalRouteId =
	'/(site)/legal' | '/(site)/legal/privacy' | '/(site)/legal/terms' | '/(site)/legal/cookies';

export interface LegalDocumentMeta {
	id: LegalDocumentId;
	route: LegalRouteId;
	/** Path of the page (the route id without its group) */
	path: string;
	title: Record<LegalLanguage, string>;
	/** Short label for compact link lists */
	shortTitle: Record<LegalLanguage, string>;
	description: Record<LegalLanguage, string>;
}

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocumentMeta> = {
	notice: {
		id: 'notice',
		route: '/(site)/legal',
		path: '/legal',
		title: { en: 'Legal notice', fr: 'Mentions légales' },
		shortTitle: { en: 'Legal notice', fr: 'Mentions légales' },
		description: {
			en: 'Who publishes and hosts this site, how to contact us and how to report illegal content.',
			fr: 'Qui édite et héberge ce site, comment nous contacter et comment signaler un contenu illicite.'
		}
	},
	privacy: {
		id: 'privacy',
		route: '/(site)/legal/privacy',
		path: '/legal/privacy',
		title: { en: 'Privacy policy', fr: 'Politique de confidentialité' },
		shortTitle: { en: 'Privacy', fr: 'Confidentialité' },
		description: {
			en: 'Which personal data this site processes, why, who receives it, how long it is kept and your rights.',
			fr: 'Quelles données personnelles ce site traite, pourquoi, qui les reçoit, combien de temps elles sont conservées et vos droits.'
		}
	},
	terms: {
		id: 'terms',
		route: '/(site)/legal/terms',
		path: '/legal/terms',
		title: { en: 'Terms of use', fr: "Conditions d'utilisation" },
		shortTitle: { en: 'Terms', fr: 'Conditions' },
		description: {
			en: 'The rules for using this site: who may use it, your content, what is not allowed and moderation.',
			fr: "Les règles d'utilisation de ce site : qui peut l'utiliser, vos contenus, ce qui est interdit et la modération."
		}
	},
	cookies: {
		id: 'cookies',
		route: '/(site)/legal/cookies',
		path: '/legal/cookies',
		title: { en: 'Cookies and local storage', fr: 'Cookies et stockage local' },
		shortTitle: { en: 'Cookies', fr: 'Cookies' },
		description: {
			en: 'The cookies and the browser storage this site uses, what each is for and how long it lasts.',
			fr: 'Les cookies et le stockage du navigateur utilisés par ce site, à quoi ils servent et leur durée.'
		}
	}
};

/** The documents in the order the footers and the pages list them */
export const LEGAL_DOCUMENT_ORDER: readonly LegalDocumentId[] = [
	'notice',
	'privacy',
	'terms',
	'cookies'
];

/** "14 November 2026" / "14 novembre 2026" for a `YYYY-MM-DD` date (read in UTC) */
export const formatLegalDate = (isoDate: string, lang: LegalLanguage): string => {
	const date = new Date(`${isoDate}T00:00:00Z`);
	if (Number.isNaN(date.getTime())) return isoDate;
	return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(date);
};

/** The "last updated" date of every document: the version of the terms in force */
export const legalLastUpdated = (lang: LegalLanguage): string =>
	formatLegalDate(LEGAL_VERSION, lang);

/** `<title>` of a legal page: "Privacy policy | Portfolio" */
export const legalPageTitle = (id: LegalDocumentId, lang: LegalLanguage): string =>
	`${LEGAL_DOCUMENTS[id].title[lang]} | ${SITE_NAME}`;

/** A section of a document, listed in its table of contents (`id` is the heading's anchor) */
export interface LegalSection {
	id: string;
	title: string;
}

/**
 * How long the operator keeps server logs and traces. Not set by the code (Railway and the
 * monitoring provider keep them): the operator confirms it, and changes it here only.
 */
export const LOG_RETENTION: Record<LegalLanguage, string> = {
	en: 'up to 30 days',
	fr: "jusqu'à 30 jours"
};

/**
 * How long Cloudflare, in front of the web pages, keeps the requests it served: the retention of
 * its traffic and security analytics on the Free, Pro and Business plans (31 days; 90 on
 * Enterprise). Not set by the code either: the operator confirms it against the zone's plan and
 * Cloudflare's data processing addendum (docs/DEPLOYMENT.md, "Legal pages")
 */
export const CLOUDFLARE_LOG_RETENTION: Record<LegalLanguage, string> = {
	en: 'up to 31 days',
	fr: "jusqu'à 31 jours"
};

/** The publisher (and data controller) as the web service's LEGAL_* variables describe them */
export interface LegalPublisher {
	/** Whether the name and the contact email are set: without them the notice is incomplete */
	configured: boolean;
	name?: string;
	email?: string;
	address?: string;
	phone?: string;
	/** French company number (SIREN/SIRET): given, the publisher acts professionally */
	siren?: string;
	vat?: string;
	/** Director of publication, the publisher's name unless set */
	director?: string;
}

/** Raw LEGAL_* values (already trimmed, undefined when unset) */
export interface LegalPublisherSettings {
	name?: string;
	email?: string;
	address?: string;
	phone?: string;
	siren?: string;
	vat?: string;
	director?: string;
}

/** What the pages show of the publisher: only what is configured, never a made-up identity */
export const legalPublisher = (settings: LegalPublisherSettings): LegalPublisher => {
	const clean = (value: string | undefined) => value?.trim() || undefined;
	const name = clean(settings.name);
	const email = clean(settings.email);
	return {
		configured: !!name && !!email,
		name,
		email,
		address: clean(settings.address),
		phone: clean(settings.phone),
		siren: clean(settings.siren),
		vat: clean(settings.vat),
		director: clean(settings.director) ?? name
	};
};

/** A plain email address check, for the contact address of the configuration */
export const isPlausibleEmail = (value: string): boolean =>
	/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value);

/** `mailto:` link to the contact address, with a subject (e.g. "Report") */
export const mailtoHref = (email: string, subject?: string): string =>
	`mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
