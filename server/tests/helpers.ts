import { spyOn } from 'bun:test';
import { Types } from 'mongoose';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import type { JWTPayload } from 'jose';
import { env } from '../env';
import { Domain, Experience, User, Workflow } from '../models/database';
import { createGoogleIdTokenVerifier, google } from '../services/google';

// Tests replace model methods with spyOn(...) and every test file restores
// them with `afterEach(() => mock.restore())`, so nothing leaks between files.

// ── Cookie parsing ──────────────────────────────────────────

export const parseCookie = (str: string) =>
  str
    .split(';')
    .map((v) => v.split('='))
    .reduce(
      (acc, v) => {
        acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1]?.trim() ?? 'true');
        return acc;
      },
      {} as Record<string, string>
    );

// ── Test IDs ────────────────────────────────────────────────

export const TEST_USER_ID = new Types.ObjectId().toString();
export const TEST_GOOGLE_SUB = '109876543210987654321';
export const TEST_DOMAIN_NAME = 'test.domain';
export const TEST_WORKFLOW_ID = new Types.ObjectId().toString();
export const TEST_EXPERIENCE_ID = new Types.ObjectId().toString();

// ── Fixtures: real (unsaved) Mongoose documents ─────────────

export const makeUser = (overrides: Record<string, unknown> = {}) =>
  new User({
    _id: TEST_USER_ID,
    email: 'test@gmail.com',
    name: 'Test',
    surname: 'User',
    googleId: TEST_GOOGLE_SUB,
    ...overrides
  });

export const makeDomain = (overrides: Record<string, unknown> = {}) =>
  new Domain({
    name: TEST_DOMAIN_NAME,
    admin: new Types.ObjectId(TEST_USER_ID),
    experiences: [],
    ...overrides
  });

export const makeExperience = (overrides: Record<string, unknown> = {}) =>
  new Experience({
    _id: TEST_EXPERIENCE_ID,
    type: 'professional',
    title: 'Software Engineer',
    summary: 'Built stuff',
    projects: [],
    ...overrides
  });

export const makeWorkflow = (overrides: Record<string, unknown> = {}) =>
  new Workflow({
    _id: TEST_WORKFLOW_ID,
    user: new Types.ObjectId(TEST_USER_ID),
    name: 'Test Workflow',
    enabled: true,
    description: 'A test workflow',
    steps: [],
    ...overrides
  });

// What the admin modal sends when creating an experience (newExperienceStore
// defaults: company { name: '' })
export const experienceRequestBody = {
  type: 'professional',
  title: 'Software Engineer',
  summary: 'Built cool stuff',
  company: { name: '' },
  projects: [
    {
      name: 'Portfolio',
      summary: 'A portfolio website',
      hardSkills: [{ name: 'TypeScript', level: -1 }],
      softSkills: [{ name: 'Communication', level: -1 }],
    },
  ],
};

export const workflowRequestBody = {
  name: 'Hiring Workflow',
  enabled: true,
  description: 'A hiring workflow',
};

// ── Google ID tokens ────────────────────────────────────────
// A local RSA key pair stands in for Google's signing keys, so tokens go
// through the real verifier (signature, iss, aud, exp, email_verified).

const googleKeys = await generateKeyPair('RS256');
const googlePublicJwk = { ...(await exportJWK(googleKeys.publicKey)), kid: 'test-key', alg: 'RS256' };
export const testGoogleKeySet = createLocalJWKSet({ keys: [googlePublicJwk] });

export const testGoogleVerifier = createGoogleIdTokenVerifier({
  audience: env.GOOGLE_CLIENT_ID,
  keySet: testGoogleKeySet
});

export interface GoogleTokenOptions {
  claims?: Record<string, unknown>;
  audience?: string;
  issuer?: string;
  expiresIn?: string | number;
  privateKey?: CryptoKey;
  /** Key id in the protected header; null leaves it out */
  kid?: string | null;
}

/** Signs an ID token shaped like Google's (claims can be overridden) */
export const signGoogleIdToken = async ({
  claims = {},
  audience = env.GOOGLE_CLIENT_ID,
  issuer = 'https://accounts.google.com',
  expiresIn = '1h',
  privateKey = googleKeys.privateKey,
  kid = 'test-key'
}: GoogleTokenOptions = {}) =>
  new SignJWT({
    email: 'test@gmail.com',
    email_verified: true,
    name: 'Test User',
    azp: audience,
    ...claims
  } as JWTPayload)
    .setProtectedHeader({ alg: 'RS256', ...(kid !== null && { kid }), typ: 'JWT' })
    .setSubject((claims.sub as string | undefined) ?? TEST_GOOGLE_SUB)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(privateKey);

/** Routes /login's Google verification through the local test keys */
export const useTestGoogleKeys = () =>
  spyOn(google, 'verifyIdToken').mockImplementation(testGoogleVerifier);

// ── Auth cookie ─────────────────────────────────────────────

/** A session cookie as /login issues it (HS256 JWT signed with JWT_SECRET) */
export const authCookie = async (userId = TEST_USER_ID, expiresIn: string | number = '7d') => {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(env.JWT_SECRET));
  return `auth=${token}`;
};

// ── Request helpers ─────────────────────────────────────────

export interface FetchApp {
  fetch(request: Request): Response | Promise<Response>;
}

export function makeRequest(app: FetchApp, path: string, options: RequestInit = {}) {
  const baseUrl = `http://localhost`;
  return app.fetch(new Request(`${baseUrl}${path}`, options));
}

/**
 * Resolves once the onAfterResponse hooks (HTTP metrics) of the requests
 * already answered have run: Elysia queues them with setImmediate while it
 * handles a request, so they fire after app.fetch() resolves, possibly in the
 * next test. Await it before spying on the metrics, so an earlier test's late
 * calls stay out of the spy, and after a request, so its own calls are in.
 */
export const afterResponseHooks = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Parsed JSON body (typed loosely: tests assert on its shape) */
export const readJson = <T = any>(response: Response): Promise<T> => response.json() as Promise<T>;

export function postJson(app: FetchApp, path: string, body: unknown, headers: Record<string, string> = {}) {
  return makeRequest(app, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

export function putJson(app: FetchApp, path: string, body: unknown, headers: Record<string, string> = {}) {
  return makeRequest(app, path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

export function getWithCookie(app: FetchApp, path: string, cookie: string) {
  return makeRequest(app, path, {
    method: 'GET',
    headers: { Cookie: cookie },
  });
}

export function postWithCookie(app: FetchApp, path: string, body: unknown, cookie: string) {
  return postJson(app, path, body, { Cookie: cookie });
}

export function putWithCookie(app: FetchApp, path: string, body: unknown, cookie: string) {
  return putJson(app, path, body, { Cookie: cookie });
}
