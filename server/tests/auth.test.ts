import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { decodeJwt, errors as joseErrors, generateKeyPair } from 'jose';
import { User } from '../models/database';
import {
  parseCookie,
  makeUser,
  signGoogleIdToken,
  testGoogleVerifier,
  useTestGoogleKeys,
  postJson,
  getWithCookie,
  makeRequest,
  authCookie,
  TEST_GOOGLE_SUB,
  TEST_USER_ID,
  readJson
} from './helpers';
import { createApp } from '../app';
import { InvalidGoogleTokenError } from '../errors';
import { createGoogleIdTokenVerifier, google } from '../services/google';
import { env } from '../env';

const sevenDaysMinusOneSecond = 1000 * 60 * 60 * 24 * 7 - 1000;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp();
  useTestGoogleKeys();
});

afterEach(() => {
  mock.restore();
});

const expectRejectedLogin = async (result: Response) => {
  expect(result.status).toBe(401);
  // No session may be issued for a rejected token
  expect(result.headers.get('Set-Cookie') ?? '').not.toContain('auth=ey');
};

describe('Google ID token verification', () => {
  it('accepts a token signed by Google for our client ID', async () => {
    const identity = await testGoogleVerifier(await signGoogleIdToken());
    expect(identity).toEqual({ sub: TEST_GOOGLE_SUB, email: 'test@gmail.com' });
  });

  it('accepts the legacy issuer without https://', async () => {
    const token = await signGoogleIdToken({ issuer: 'accounts.google.com' });
    expect((await testGoogleVerifier(token)).sub).toBe(TEST_GOOGLE_SUB);
  });

  it.each([
    ['issued for another OAuth client (aud)', { audience: 'SOME-OTHER-APP.apps.googleusercontent.com' }],
    ['from another issuer', { issuer: 'https://evil.example.com' }],
    ['expired', { expiresIn: Math.floor(Date.now() / 1000) - 3600 }],
    ['with email_verified false', { claims: { email_verified: false } }],
    ['with email_verified "false" (string, truthy)', { claims: { email_verified: 'false' } }],
    ['with email_verified "true" (string, not a boolean)', { claims: { email_verified: 'true' } }],
    ['without email_verified', { claims: { email_verified: undefined } }],
    ['without email', { claims: { email: undefined } }],
  ])('rejects a token %s', async (_label, options) => {
    const token = await signGoogleIdToken(options);
    await expect(testGoogleVerifier(token)).rejects.toBeInstanceOf(InvalidGoogleTokenError);
  });

  it('rejects a token signed with another key', async () => {
    const { privateKey } = await generateKeyPair('RS256');
    const token = await signGoogleIdToken({ privateKey });
    await expect(testGoogleVerifier(token)).rejects.toBeInstanceOf(InvalidGoogleTokenError);
  });

  it('rejects garbage', async () => {
    await expect(testGoogleVerifier('abc&access_token=zzz')).rejects.toBeInstanceOf(InvalidGoogleTokenError);
  });

  it('rejects a token whose key id Google does not publish', async () => {
    const verifier = createGoogleIdTokenVerifier({
      audience: env.GOOGLE_CLIENT_ID,
      keySet: () => Promise.reject(new joseErrors.JWKSNoMatchingKey())
    });
    await expect(verifier(await signGoogleIdToken())).rejects.toBeInstanceOf(InvalidGoogleTokenError);
  });

  // What jose's remote key set throws when Google's certs endpoint fails
  it.each([
    ['answers non-200 or invalid JSON', new joseErrors.JOSEError('Expected 200 OK from the JSON Web Key Set HTTP response')],
    ['times out', new joseErrors.JWKSTimeout()],
    ['serves an invalid key set', new joseErrors.JWKSInvalid()],
    ['cannot be reached', new TypeError('fetch failed')],
  ])('does not blame the token when Google\'s key endpoint %s', async (_label, keyError) => {
    const verifier = createGoogleIdTokenVerifier({
      audience: env.GOOGLE_CLIENT_ID,
      keySet: () => Promise.reject(keyError)
    });
    const rejection = verifier(await signGoogleIdToken());
    await expect(rejection).rejects.toBe(keyError);
  });

  it('answers 500, not 401, when Google\'s key endpoint fails', async () => {
    spyOn(google, 'verifyIdToken').mockImplementation(
      createGoogleIdTokenVerifier({
        audience: env.GOOGLE_CLIENT_ID,
        keySet: () => Promise.reject(new joseErrors.JOSEError('Expected 200 OK from the JSON Web Key Set HTTP response'))
      })
    );

    const result = await postJson(app, '/login', { token: await signGoogleIdToken() });

    expect(result.status).toBe(500);
    expect(await result.text()).toBe('Internal Server Error');
  });
});

describe('POST /login', () => {
  it('logs in an existing user matched by Google sub', async () => {
    const user = makeUser();
    const findOne = spyOn(User, 'findOne').mockResolvedValue(user as never);

    const result = await postJson(app, '/login', { token: await signGoogleIdToken() });

    expect(result.status).toBe(200);
    expect(findOne).toHaveBeenCalledWith({ googleId: TEST_GOOGLE_SUB });

    const setCookie = result.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/');
    // Secure only in production or with SameSite=None
    expect(setCookie).not.toContain('Secure');

    const authToken = parseCookie(setCookie)['auth'];
    const decoded = decodeJwt(authToken);
    expect(decoded.sub).toBe(TEST_USER_ID);

    const response = await readJson(result);
    // Public user fields only
    expect(response.user).toEqual({
      _id: TEST_USER_ID,
      email: 'test@gmail.com',
      name: 'Test',
      surname: 'User'
    });
    expect(response.expires).toBeGreaterThan((Date.now() + sevenDaysMinusOneSecond) / 1000);
    expect(Math.abs(decoded.exp! - response.expires)).toBeLessThan(2);
  });

  it('links a pre-existing user by verified email and stores the Google sub', async () => {
    spyOn(User, 'findOne').mockResolvedValue(null as never);
    const legacyUser = makeUser({ googleId: TEST_GOOGLE_SUB });
    const findOneAndUpdate = spyOn(User, 'findOneAndUpdate').mockResolvedValue(legacyUser as never);
    const create = spyOn(User, 'create');

    const result = await postJson(app, '/login', { token: await signGoogleIdToken() });

    expect(result.status).toBe(200);
    const [filter, update] = findOneAndUpdate.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Record<string, unknown>
    ];
    expect(filter.email).toBe('test@gmail.com');
    // Only accounts not yet linked to a Google account may be matched by email
    expect(filter.$or).toEqual([{ googleId: { $exists: false } }, { googleId: null }]);
    expect(update).toEqual({ $set: { googleId: TEST_GOOGLE_SUB } });
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ['a token issued for another app', { audience: 'SOME-OTHER-APP.apps.googleusercontent.com' }],
    ['an unverified email (email_verified "false")', { claims: { email_verified: 'false' } }],
    ['an unverified email (email_verified false)', { claims: { email_verified: false } }],
    ['an expired token', { expiresIn: Math.floor(Date.now() / 1000) - 3600 }],
  ])('returns 401 for %s', async (_label, options) => {
    const findOne = spyOn(User, 'findOne').mockResolvedValue(makeUser() as never);

    const result = await postJson(app, '/login', { token: await signGoogleIdToken(options) });

    await expectRejectedLogin(result);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('returns 401 for a malformed token', async () => {
    await expectRejectedLogin(await postJson(app, '/login', { token: 'invalid-token' }));
  });

  it('returns 422 when token is missing from body', async () => {
    const result = await postJson(app, '/login', {});

    expect(result.status).toBe(422);
  });
});

describe('GET /isLogged', () => {
  it('should return logged:false without auth cookie', async () => {
    const result = await makeRequest(app, '/isLogged');

    expect(result.status).toBe(200);
    const response = await readJson(result);
    expect(response.logged).toBe(false);
    expect(response.reason).toBeDefined();
  });

  it('should return logged:true with valid auth cookie', async () => {
    spyOn(User, 'findById').mockResolvedValue(makeUser() as never);

    const result = await getWithCookie(app, '/isLogged', await authCookie());

    expect(result.status).toBe(200);
    const response = await readJson(result);
    expect(response.logged).toBe(true);
    expect(response.user._id).toBe(TEST_USER_ID);
    expect(response.user.googleId).toBeUndefined();
    expect(response.expires).toBeGreaterThan(Date.now() / 1000);
  });

  it('should return logged:false when the user no longer exists', async () => {
    spyOn(User, 'findById').mockResolvedValue(null as never);

    const result = await getWithCookie(app, '/isLogged', await authCookie());

    expect(result.status).toBe(200);
    expect((await readJson(result)).logged).toBe(false);
  });

  it('should return logged:false with invalid auth cookie', async () => {
    const result = await getWithCookie(app, '/isLogged', 'auth=invalid-jwt-token');

    expect(result.status).toBe(200);
    const response = await readJson(result);
    expect(response.logged).toBe(false);
  });
});

describe('GET /logout', () => {
  it('clears the auth cookie with the attributes it was set with', async () => {
    const result = await getWithCookie(app, '/logout', await authCookie());

    expect(result.status).toBe(200);

    const setCookie = result.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toStartWith('auth=;');
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
  });
});
