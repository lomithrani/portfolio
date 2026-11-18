import { t } from "elysia";
import { TERMS_VERSION_MAX_LENGTH } from "portfolio-common";

/**
 * The confirmation a client sends once the person ticked the age and terms
 * checkbox (portfolio-common ConsentInput): with POST /login, POST
 * /domain/claim, PUT /me/consent and PUT /me/mode (opening the recruiter
 * space). The version must be the one in force
 * (portfolio-common LEGAL_VERSION), which services/legal.ts checks: an older
 * one is a 422 on `consent.termsVersion`
 */
export const consentRequest = t.Object({
  termsVersion: t.String({ minLength: 1, maxLength: TERMS_VERSION_MAX_LENGTH }),
  ageConfirmed: t.Literal(true)
});

/**
 * Where the confirmation sent with POST /login was given: the landing page, a
 * claim form (it signs in before it claims), or the recruiter space's sign-in
 */
export const loginConsentSource = t.UnionEnum(['landing', 'claim', 'recruiter'], { default: undefined });

/** Body of PUT /me/consent: the confirmation, and where it was given */
export const acceptTermsRequest = t.Object({
  termsVersion: t.String({ minLength: 1, maxLength: TERMS_VERSION_MAX_LENGTH }),
  ageConfirmed: t.Literal(true),
  // No default: t.UnionEnum defaults to its first value
  source: t.Optional(t.UnionEnum(['claim', 'account', 'recruiter'], { default: undefined }))
});

/** Body of DELETE /me: the word typed to confirm, so no request deletes an account by accident */
export const deleteAccountRequest = t.Object({
  confirm: t.Literal('DELETE')
});
