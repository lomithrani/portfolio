import { createRemoteJWKSet, decodeProtectedHeader, errors as joseErrors, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import { env } from '../env';
import { InvalidGoogleTokenError } from '../errors';

// Google Sign-In ID tokens are verified locally against Google's published
// signing keys: signature, issuer, audience (our OAuth client ID) and expiry.
// See https://developers.google.com/identity/gsi/web/guides/verify-google-id-token

export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
export const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');

export interface GoogleIdentity {
  /** Stable Google account ID */
  sub: string;
  email: string;
}

export interface GoogleIdTokenVerifierOptions {
  /** Expected `aud` claim: the OAuth client ID the token was issued for */
  audience: string;
  /** Signing keys; defaults to Google's remote JWKS (fetched and cached lazily) */
  keySet?: JWTVerifyGetKey;
}

// Errors that mean the token itself is bad (401). JWTExpired and
// JWTClaimValidationFailed cover exp, iss and aud.
const INVALID_TOKEN_ERRORS = [
  joseErrors.JWSInvalid,
  joseErrors.JWTInvalid,
  joseErrors.JWTClaimValidationFailed,
  joseErrors.JWTExpired,
  joseErrors.JWSSignatureVerificationFailed,
  joseErrors.JWKSNoMatchingKey,
  joseErrors.JWKSMultipleMatchingKeys,
  joseErrors.JOSEAlgNotAllowed,
  joseErrors.JOSENotSupported
];

const isInvalidTokenError = (error: unknown) =>
  INVALID_TOKEN_ERRORS.some((ErrorClass) => error instanceof ErrorClass);

/** True when the token names its signing key, as Google's always do */
const hasKeyId = (idToken: string) => {
  try {
    const { kid } = decodeProtectedHeader(idToken);
    return typeof kid === 'string' && kid.length > 0;
  } catch {
    // Not a JWS at all
    return false;
  }
};

export const createGoogleIdTokenVerifier = ({ audience, keySet }: GoogleIdTokenVerifierOptions) => {
  let keys = keySet;

  return async (idToken: string): Promise<GoogleIdentity> => {
    // Without a kid, jose cannot choose between Google's keys while it
    // publishes two (key rotation) and throws JWKSMultipleMatchingKeys
    if (!hasKeyId(idToken)) throw new InvalidGoogleTokenError('Invalid Google token');

    keys ??= createRemoteJWKSet(GOOGLE_JWKS_URL);

    let payload;
    try {
      ({ payload } = await jwtVerify(idToken, keys, {
        issuer: GOOGLE_ISSUERS,
        audience,
        algorithms: ['RS256'],
        clockTolerance: 30
      }));
    } catch (error) {
      if (isInvalidTokenError(error)) throw new InvalidGoogleTokenError('Invalid Google token');
      // Anything else, e.g. Google's key endpoint timing out, answering
      // non-200 or invalid JSON (a plain JOSEError), is not the caller's fault
      throw error;
    }

    // Must be the JSON boolean true: a string such as "false" is truthy
    if (payload.email_verified !== true) {
      throw new InvalidGoogleTokenError('Google account email is not verified');
    }
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new InvalidGoogleTokenError('Invalid Google token');
    }
    if (typeof payload.email !== 'string' || !payload.email) {
      throw new InvalidGoogleTokenError('Invalid Google token');
    }

    return { sub: payload.sub, email: payload.email };
  };
};

// Indirection so tests can replace the verifier with spyOn(google, 'verifyIdToken')
export const google = {
  verifyIdToken: createGoogleIdTokenVerifier({ audience: env.GOOGLE_CLIENT_ID })
};
