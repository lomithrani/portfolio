// The Terms of use and Privacy policy in force, and the confirmation a person gives when they
// accept them: an unticked checkbox (AgeTermsConsent.svelte in the client) whose exact wording is
// legalMessages.ageConfirmation, in the language of the page. The API records each acceptance on
// the account (version, date, wording key, where it was given), never a birth date: the age is
// only declared.

import { localized, type Localized } from '../i18n';
import { legalMessages } from './legal.messages';

/** Version (date) of the Terms of use and Privacy policy in force; bump when either changes materially */
export const LEGAL_VERSION = '2026-11-18';

/** Fixed age floor of the confirmation (GDPR art. 8 max threshold, above COPPA 13, French working age 16) */
export const MINIMUM_AGE = 16;

/**
 * Key of the exact wording of the age confirmation the user ticked (stored with the acceptance),
 * one per language: the wordings are legalMessages.ageConfirmation
 */
export const AGE_CONFIRMATION_KEYS: Localized<string> = {
	en: 'age-16-working-age-v1',
	fr: 'age-16-working-age-v1-fr'
};

/** Key of the English wording */
export const AGE_CONFIRMATION_KEY = AGE_CONFIRMATION_KEYS.en;

/** Key of the wording shown in the language in use */
export const ageConfirmationKey = (): string => localized(AGE_CONFIRMATION_KEYS);

/**
 * What a client sends when the person ticked the confirmation (POST /login, PUT /me/consent,
 * POST /domain/claim, PUT /me/mode when it opens the recruiter space)
 */
export type ConsentInput = { termsVersion: string; ageConfirmed: true };

/**
 * Where an acceptance was given: the landing page's sign-in, a claim form, the account page, or
 * the recruiter space (its sign-in, its creation, or accepting again from it)
 */
export const CONSENT_SOURCES = ['landing', 'claim', 'account', 'recruiter'] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

/** Longest termsVersion the API reads (a version is a date: 10 characters) */
export const TERMS_VERSION_MAX_LENGTH = 32;

/** The field of a refused confirmation, as the API names it in a 422 (`property`) */
export type ConsentProblemProperty = 'consent' | 'consent.ageConfirmed' | 'consent.termsVersion';

export type ConsentResult =
	| { ok: true; consent: ConsentInput }
	| { ok: false; property: ConsentProblemProperty; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether `version` is the version of the terms in force (LEGAL_VERSION) */
export const isCurrentTermsVersion = (version: unknown): boolean => version === LEGAL_VERSION;

/**
 * Checks a confirmation sent by a client (untrusted): valid only when it is an object with
 * `ageConfirmed === true` and `termsVersion === LEGAL_VERSION`. The result keeps only those two
 * fields.
 */
export const parseConsent = (input: unknown): ConsentResult => {
	if (!isRecord(input)) return { ok: false, property: 'consent', message: legalMessages.consentRequired };
	if (input.ageConfirmed !== true) {
		return { ok: false, property: 'consent.ageConfirmed', message: legalMessages.consentRequired };
	}
	if (!isCurrentTermsVersion(input.termsVersion)) {
		return { ok: false, property: 'consent.termsVersion', message: legalMessages.staleTerms };
	}
	return { ok: true, consent: { termsVersion: LEGAL_VERSION, ageConfirmed: true } };
};

/** Why a confirmation is refused, null when it is valid (see parseConsent) */
export const consentProblem = (input: unknown): string | null => {
	const result = parseConsent(input);
	return result.ok ? null : result.message;
};

/** The confirmation of the terms in force, as the client sends it once the box is ticked */
export const currentConsent = (): ConsentInput => ({
	termsVersion: LEGAL_VERSION,
	ageConfirmed: true
});
