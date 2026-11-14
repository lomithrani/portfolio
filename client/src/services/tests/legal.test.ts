import { describe, expect, it } from 'vitest';
import {
	AGE_CONFIRMATION_KEY,
	AGE_CONFIRMATION_TEXT,
	CONSENT_REQUIRED_MESSAGE,
	CONSENT_SOURCES,
	LEGAL_VERSION,
	MINIMUM_AGE,
	RESERVED_DOMAIN_NAMES,
	STALE_TERMS_MESSAGE,
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
		expect(AGE_CONFIRMATION_TEXT).toContain(`at least ${MINIMUM_AGE} years old`);
		expect(AGE_CONFIRMATION_TEXT).toContain('minimum legal working age in my country');
		expect(AGE_CONFIRMATION_KEY).toBe('age-16-working-age-v1');
		expect(CONSENT_SOURCES).toEqual(['landing', 'claim', 'account']);
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
				message: CONSENT_REQUIRED_MESSAGE
			});
		}
	});

	it('refuses an age confirmation that is not exactly true', () => {
		for (const ageConfirmed of [false, 'true', 1, undefined]) {
			expect(parseConsent({ termsVersion: LEGAL_VERSION, ageConfirmed })).toEqual({
				ok: false,
				property: 'consent.ageConfirmed',
				message: CONSENT_REQUIRED_MESSAGE
			});
		}
	});

	it('refuses any other version of the terms as outdated', () => {
		for (const termsVersion of ['2025-01-01', '', undefined, LEGAL_VERSION + ' ']) {
			expect(parseConsent({ termsVersion, ageConfirmed: true })).toEqual({
				ok: false,
				property: 'consent.termsVersion',
				message: STALE_TERMS_MESSAGE
			});
		}
		expect(consentProblem({ termsVersion: '2025-01-01', ageConfirmed: true })).toBe(
			STALE_TERMS_MESSAGE
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
		'account'
	])('reserves %s for a page of the site', (name) => {
		expect(RESERVED_DOMAIN_NAMES.has(name)).toBe(true);
		expect(isValidDomainName(name)).toBe(false);
		expect(isValidDomainName(name.toUpperCase())).toBe(false);
	});

	it('still accepts names that only start like one', () => {
		expect(isValidDomainName('legal.eagle')).toBe(true);
		expect(isValidDomainName('helpful')).toBe(true);
	});
});
