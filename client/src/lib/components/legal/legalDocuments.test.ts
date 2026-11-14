import { describe, expect, it } from 'vitest';
import { LEGAL_VERSION } from 'portfolio-common';
import {
	LEGAL_DOCUMENTS,
	LEGAL_DOCUMENT_ORDER,
	SITE_NAME,
	formatLegalDate,
	isPlausibleEmail,
	legalLanguage,
	legalLastUpdated,
	legalPageTitle,
	legalPublisher,
	mailtoHref,
	withLegalLanguage
} from './legalDocuments.ts';

describe('legalLanguage', () => {
	it('reads French from ?lang=fr, in any case and with spaces', () => {
		expect(legalLanguage('fr')).toBe('fr');
		expect(legalLanguage('FR')).toBe('fr');
		expect(legalLanguage(' fr ')).toBe('fr');
	});

	it('falls back to English for anything else', () => {
		expect(legalLanguage(null)).toBe('en');
		expect(legalLanguage(undefined)).toBe('en');
		expect(legalLanguage('')).toBe('en');
		expect(legalLanguage('en')).toBe('en');
		expect(legalLanguage('de')).toBe('en');
		expect(legalLanguage('fr-FR')).toBe('en');
	});
});

describe('withLegalLanguage', () => {
	it('adds ?lang=fr for French only', () => {
		expect(withLegalLanguage('/legal/privacy', 'fr')).toBe('/legal/privacy?lang=fr');
		expect(withLegalLanguage('/legal/privacy', 'en')).toBe('/legal/privacy');
	});
});

describe('formatLegalDate', () => {
	it('writes the date in words in each language, read in UTC', () => {
		expect(formatLegalDate('2026-11-14', 'en')).toBe('14 November 2026');
		expect(formatLegalDate('2026-11-14', 'fr')).toBe('14 novembre 2026');
		expect(formatLegalDate('2026-01-01', 'en')).toBe('1 January 2026');
	});

	it('returns the input when it is not a date', () => {
		expect(formatLegalDate('not-a-date', 'en')).toBe('not-a-date');
	});

	it('dates every document with the version of the terms in force', () => {
		expect(legalLastUpdated('en')).toBe(formatLegalDate(LEGAL_VERSION, 'en'));
		expect(legalLastUpdated('fr')).toBe(formatLegalDate(LEGAL_VERSION, 'fr'));
	});
});

describe('legal documents', () => {
	it('lists the four documents once, legal notice first', () => {
		expect(LEGAL_DOCUMENT_ORDER).toEqual(['notice', 'privacy', 'terms', 'cookies']);
		for (const id of LEGAL_DOCUMENT_ORDER) expect(LEGAL_DOCUMENTS[id].id).toBe(id);
	});

	it("serves each document at its route id's path, under /legal", () => {
		for (const doc of Object.values(LEGAL_DOCUMENTS)) {
			expect(doc.route.replace('/(site)', '')).toBe(doc.path);
			expect(doc.path.startsWith('/legal')).toBe(true);
		}
	});

	it('titles the pages "<document> | <site>" in each language', () => {
		expect(legalPageTitle('privacy', 'en')).toBe(`Privacy policy | ${SITE_NAME}`);
		expect(legalPageTitle('privacy', 'fr')).toBe(`Politique de confidentialité | ${SITE_NAME}`);
		expect(legalPageTitle('notice', 'fr')).toBe(`Mentions légales | ${SITE_NAME}`);
		expect(legalPageTitle('terms', 'fr')).toBe(`Conditions d'utilisation | ${SITE_NAME}`);
		expect(legalPageTitle('cookies', 'fr')).toBe(`Cookies et stockage local | ${SITE_NAME}`);
	});
});

describe('legalPublisher', () => {
	it('is configured once the name and the contact email are set', () => {
		expect(legalPublisher({ name: 'Jane Doe', email: 'jane@example.com' })).toEqual({
			configured: true,
			name: 'Jane Doe',
			email: 'jane@example.com',
			address: undefined,
			phone: undefined,
			siren: undefined,
			vat: undefined,
			director: 'Jane Doe'
		});
	});

	it('is not configured without the name or the email, and invents nothing', () => {
		expect(legalPublisher({})).toEqual({
			configured: false,
			name: undefined,
			email: undefined,
			address: undefined,
			phone: undefined,
			siren: undefined,
			vat: undefined,
			director: undefined
		});
		expect(legalPublisher({ name: 'Jane Doe' }).configured).toBe(false);
		expect(legalPublisher({ email: 'jane@example.com' }).configured).toBe(false);
	});

	it('trims the values and treats blank ones as unset', () => {
		const publisher = legalPublisher({
			name: '  Jane Doe ',
			email: ' jane@example.com',
			address: '   ',
			phone: ' +33 1 23 45 67 89 ',
			director: ' '
		});
		expect(publisher.name).toBe('Jane Doe');
		expect(publisher.email).toBe('jane@example.com');
		expect(publisher.address).toBeUndefined();
		expect(publisher.phone).toBe('+33 1 23 45 67 89');
		expect(publisher.director).toBe('Jane Doe');
	});

	it('keeps a director of publication set apart from the publisher', () => {
		expect(
			legalPublisher({ name: 'Acme SAS', email: 'a@example.com', director: 'Jane Doe' }).director
		).toBe('Jane Doe');
	});
});

describe('isPlausibleEmail', () => {
	it('accepts plain addresses and refuses the rest', () => {
		expect(isPlausibleEmail('jane@example.com')).toBe(true);
		expect(isPlausibleEmail('jane.doe+legal@mail.example.fr')).toBe(true);
		expect(isPlausibleEmail('jane@example')).toBe(false);
		expect(isPlausibleEmail('jane example.com')).toBe(false);
		expect(isPlausibleEmail('<jane@example.com>')).toBe(false);
	});
});

describe('mailtoHref', () => {
	it('links the address, with an encoded subject when given', () => {
		expect(mailtoHref('jane@example.com')).toBe('mailto:jane@example.com');
		expect(mailtoHref('jane@example.com', 'Report')).toBe('mailto:jane@example.com?subject=Report');
		expect(mailtoHref('jane@example.com', 'Signalement & co')).toBe(
			'mailto:jane@example.com?subject=Signalement%20%26%20co'
		);
	});
});
