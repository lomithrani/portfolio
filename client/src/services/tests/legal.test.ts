import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	AGE_CONFIRMATION_KEY,
	legalMessages,
	CONSENT_SOURCES,
	LEGAL_VERSION,
	MINIMUM_AGE,
	RESERVED_DOMAIN_NAMES,
	TERMS_VERSION_MAX_LENGTH,
	consentProblem,
	currentConsent,
	isCurrentTermsVersion,
	isValidDomainName,
	parseConsent
} from 'portfolio-common';

// portfolio-common's legal constants and the consent rules both the API and the client apply

describe('legal constants', () => {
	it('dates the terms in force and states the age floor in the wording', () => {
		expect(LEGAL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(LEGAL_VERSION.length).toBeLessThanOrEqual(TERMS_VERSION_MAX_LENGTH);
		expect(MINIMUM_AGE).toBe(16);
		expect(legalMessages.ageConfirmation).toContain(`at least ${MINIMUM_AGE} years old`);
		expect(legalMessages.ageConfirmation).toContain('minimum legal working age in my country');
		expect(AGE_CONFIRMATION_KEY).toBe('age-16-working-age-v1');
		expect(CONSENT_SOURCES).toEqual(['landing', 'claim', 'account', 'recruiter']);
	});
});

describe('parseConsent and consentProblem', () => {
	it('accepts the confirmation of the terms in force, keeping only its two fields', () => {
		expect(parseConsent({ termsVersion: LEGAL_VERSION, ageConfirmed: true, extra: 'x' })).toEqual({
			ok: true,
			consent: { termsVersion: LEGAL_VERSION, ageConfirmed: true }
		});
		expect(parseConsent(currentConsent())).toEqual({ ok: true, consent: currentConsent() });
		expect(consentProblem(currentConsent())).toBeNull();
	});

	it('refuses a missing confirmation, or one that is not an object', () => {
		for (const input of [undefined, null, true, 'yes', 1, [currentConsent()]]) {
			expect(parseConsent(input)).toEqual({
				ok: false,
				property: 'consent',
				message: legalMessages.consentRequired
			});
		}
	});

	it('refuses an age confirmation that is not exactly true', () => {
		for (const ageConfirmed of [false, 'true', 1, undefined]) {
			expect(parseConsent({ termsVersion: LEGAL_VERSION, ageConfirmed })).toEqual({
				ok: false,
				property: 'consent.ageConfirmed',
				message: legalMessages.consentRequired
			});
		}
	});

	it('refuses any other version of the terms as outdated', () => {
		for (const termsVersion of ['2025-01-01', '', undefined, LEGAL_VERSION + ' ']) {
			expect(parseConsent({ termsVersion, ageConfirmed: true })).toEqual({
				ok: false,
				property: 'consent.termsVersion',
				message: legalMessages.staleTerms
			});
		}
		expect(consentProblem({ termsVersion: '2025-01-01', ageConfirmed: true })).toBe(
			legalMessages.staleTerms
		);
	});

	it('tells the version in force', () => {
		expect(isCurrentTermsVersion(LEGAL_VERSION)).toBe(true);
		expect(isCurrentTermsVersion('2025-01-01')).toBe(false);
		expect(isCurrentTermsVersion(undefined)).toBe(false);
	});

	it('gives a fresh object each time', () => {
		const first = currentConsent();
		expect(currentConsent()).not.toBe(first);
		expect(currentConsent()).toEqual(first);
	});
});

describe('reserved domain names', () => {
	it.each([
		'legal',
		'privacy',
		'terms',
		'cookies',
		'about',
		'start',
		'signup',
		'contact',
		'report',
		'help',
		'account',
		'opportunities'
	])('reserves %s for a page of the site', (name) => {
		expect(RESERVED_DOMAIN_NAMES.has(name)).toBe(true);
		expect(isValidDomainName(name)).toBe(false);
		expect(isValidDomainName(name.toUpperCase())).toBe(false);
	});

	it('still accepts names that only start like one', () => {
		expect(isValidDomainName('legal.eagle')).toBe(true);
		expect(isValidDomainName('helpful')).toBe(true);
	});

	it('reserves the name of every file served at the root of the site', () => {
		// A file of client/static answers at /<its name>, before any route: a portfolio claimed under
		// that name would have its bare address (the link people copy) serve the file instead
		const root = fileURLToPath(new URL('../../../static/', import.meta.url));
		const files = readdirSync(root, { withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => entry.name);
		expect(files).toEqual(expect.arrayContaining(['og-hire.png', 'og-portfolio-fr.png']));
		for (const file of files)
			expect({ file, valid: isValidDomainName(file) }).toEqual({ file, valid: false });
		for (const name of ['jane.jpg', 'jane.jpeg', 'jane.webm', 'jane.mp4', 'jane.ico', 'jane.webp'])
			expect({ name, valid: isValidDomainName(name) }).toEqual({ name, valid: false });
		// A name that only looks like one
		expect(isValidDomainName('png.dev')).toBe(true);
		expect(isValidDomainName('jane.pngs')).toBe(true);
	});
});
