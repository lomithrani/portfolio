import { t } from "elysia";
import { TERMS_VERSION_MAX_LENGTH } from "portfolio-common";

/**
 * The confirmation a client sends once the person ticked the age and terms
 * checkbox (portfolio-common ConsentInput): with POST /login, POST
 * /domain/claim and PUT /me/consent. The version must be the one in force
 * (portfolio-common LEGAL_VERSION), which services/legal.ts checks: an older
 * one is a 422 on `consent.termsVersion`
 */
export const consentRequest = t.Object({
  termsVersion: t.String({ minLength: 1, maxLength: TERMS_VERSION_MAX_LENGTH }),
  ageConfirmed: t.Literal(true)
});

/** Body of PUT /me/consent: the confirmation, and where it was given */
export const acceptTermsRequest = t.Object({
  termsVersion: t.String({ minLength: 1, maxLength: TERMS_VERSION_MAX_LENGTH }),
  ageConfirmed: t.Literal(true),
  // No default: t.UnionEnum defaults to its first value
  source: t.Optional(t.UnionEnum(['claim', 'account'], { default: undefined }))
});

/** Body of DELETE /me: the word typed to confirm, so no request deletes an account by accident */
export const deleteAccountRequest = t.Object({
  confirm: t.Literal('DELETE')
});
