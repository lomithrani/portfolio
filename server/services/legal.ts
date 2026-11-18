import { Types } from 'mongoose';
import { LEGAL_VERSION, ageConfirmationKey, parseConsent } from 'portfolio-common';
import type { ConsentInput, ConsentSource } from 'portfolio-common';
import { User } from '../models/database';
import { CouldntVerifyJwtError, FieldValidationError } from '../errors';
import { UNKNOWN_USER } from '../protocol';
import { m } from './legal.messages';

// Acceptances of the Terms of use and Privacy policy (portfolio-common
// LEGAL_VERSION), with the age confirmation (the key of its wording in the request's language, ageConfirmationKey()): recorded
// on the account, append-only (User.legalAcceptances), so the account can
// show what it accepted and when (GDPR art. 7(1)).

interface AcceptanceHolder {
  legalAcceptances?: readonly { version?: string | null }[] | null;
}

/** Version of the account's latest acceptance, if any */
export const latestTermsVersion = (user: AcceptanceHolder): string | undefined => {
  const version = user.legalAcceptances?.at(-1)?.version;
  return version ? version : undefined;
};

/** Whether the account's latest acceptance is of the terms in force */
export const hasAcceptedCurrentTerms = (user: AcceptanceHolder | null | undefined): boolean =>
  !!user && latestTermsVersion(user) === LEGAL_VERSION;

/**
 * The confirmation a client sent, checked (portfolio-common parseConsent):
 * throws FieldValidationError (422) naming `consent`, `consent.ageConfirmed`
 * or `consent.termsVersion` (an older version of the terms) otherwise
 */
export const assertValidConsent = (input: unknown): ConsentInput => {
  const result = parseConsent(input);
  if (!result.ok) throw new FieldValidationError(result.property, result.message);
  return result.consent;
};

/** Whether the stored account accepted the terms in force (one indexed lookup, no document loaded) */
export const userAcceptedCurrentTerms = async (userId: string | Types.ObjectId) =>
  !!(await User.exists({ _id: userId, 'legalAcceptances.version': LEGAL_VERSION }));

/**
 * Records that the account accepted the terms in force, from `source`. The
 * input is checked first (422, see assertValidConsent). Appended once per
 * version: an account that already accepted LEGAL_VERSION keeps its first
 * acceptance, atomically, whatever the number of concurrent requests.
 * Returns whether an acceptance was added (false: already accepted, or no
 * such account).
 */
export const recordConsent = async (
  userId: string | Types.ObjectId,
  input: unknown,
  source: ConsentSource
): Promise<boolean> => {
  const consent = assertValidConsent(input);
  if (!Types.ObjectId.isValid(userId)) return false;
  const result = await User.updateOne(
    // Versions only move forward: one already accepted is never accepted again
    { _id: userId, 'legalAcceptances.version': { $ne: consent.termsVersion } },
    {
      $push: {
        legalAcceptances: {
          version: consent.termsVersion,
          acceptedAt: new Date(),
          ageConfirmationKey: ageConfirmationKey(),
          source
        }
      }
    }
  );
  return result.modifiedCount > 0;
};

/**
 * Gate of the routes that need the terms in force (POST /domain/claim, and
 * opening the recruiter space: PUT /me/mode, POST /login with the mode
 * 'recruiter'): an account that accepted them goes through; otherwise the
 * confirmation sent with the request is checked and recorded from `source`.
 * Throws FieldValidationError (422 on `consent`, saying what it was for:
 * the portfolio, or the recruiter space for the source 'recruiter') without
 * one, or for an invalid one, and CouldntVerifyJwtError (401) when the
 * account no longer exists.
 */
export const requireCurrentTerms = async (
  userId: string,
  input: unknown,
  source: ConsentSource
): Promise<void> => {
  if (await userAcceptedCurrentTerms(userId)) return;
  if (input === undefined || input === null) {
    throw new FieldValidationError(
      'consent',
      source === 'recruiter' ? () => m.recruiterConsentRequired : () => m.claimConsentRequired
    );
  }
  if (await recordConsent(userId, input, source)) return;
  // Nothing recorded: accepted meanwhile by a concurrent request, or the
  // account is gone (deleted while this session was still valid). The gated
  // route never goes on for an account without an acceptance on record
  if (!(await userAcceptedCurrentTerms(userId))) {
    throw new CouldntVerifyJwtError(UNKNOWN_USER);
  }
};
