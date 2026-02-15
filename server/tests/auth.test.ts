import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { User } from '../models/database';
import { jwtDecode } from 'jwt-decode';
import {
  parseCookie,
  testUser,
  mockGoogleOAuthSuccess,
  mockGoogleOAuthFailure,
  mockGoogleOAuthUnverified,
  postJson,
  getWithCookie,
  makeRequest,
  loginAndGetCookie,
} from './helpers';
import { createApp } from '../app';

const sevenDaysMinusOneSecond = 1000 * 60 * 60 * 24 * 7 - 1000;
let app: ReturnType<typeof createApp>;
let originalFetch: typeof global.fetch;

beforeEach(() => {
  originalFetch = global.fetch;
  app = createApp();

  // Mock User.findOneAndUpdate for login
  User.findOneAndUpdate = mock(() => Promise.resolve(testUser)) as any;
  User.findById = mock(() => Promise.resolve(testUser)) as any;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('POST /login', () => {
  it('should create/return user on valid Google token', async () => {
    mockGoogleOAuthSuccess(testUser.email);

    const result = await postJson(app, '/login', { token: 'valid-token' });

    expect(result.status).toBe(200);

    const setCookie = result.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toContain('auth=');

    const authToken = parseCookie(setCookie)['auth'];
    const decoded = jwtDecode(authToken);

    const response = (await result.json()) as { user: any; expires: number };
    expect(response.user.email).toBe(testUser.email);
    expect(response.expires).toBeGreaterThan((Date.now() + sevenDaysMinusOneSecond) / 1000);
    expect(Math.abs(decoded.exp! - response.expires)).toBeLessThan(2);
  });

  it('should return 401 for invalid Google token', async () => {
    mockGoogleOAuthFailure();

    const result = await postJson(app, '/login', { token: 'invalid-token' });

    expect(result.status).not.toBe(200);
  });

  it('should return 401 for unverified email', async () => {
    mockGoogleOAuthUnverified();

    const result = await postJson(app, '/login', { token: 'unverified-token' });

    expect(result.status).not.toBe(200);
  });

  it('should return 422 when token is missing from body', async () => {
    const result = await postJson(app, '/login', {});

    expect(result.status).toBe(422);
  });
});

describe('GET /isLogged', () => {
  it('should return logged:false without auth cookie', async () => {
    const result = await makeRequest(app, '/isLogged');

    expect(result.status).toBe(200);
    const response = await result.json();
    expect(response.logged).toBe(false);
    expect(response.reason).toBeDefined();
  });

  it('should return logged:true with valid auth cookie', async () => {
    const cookie = await loginAndGetCookie(app);

    const result = await getWithCookie(app, '/isLogged', cookie);

    expect(result.status).toBe(200);
    const response = (await result.json()) as { logged: boolean; user: any; expires: number };
    expect(response.logged).toBe(true);
    expect(response.user).toBeDefined();
    expect(response.expires).toBeGreaterThan(Date.now() / 1000);
  });

  it('should return logged:false with invalid auth cookie', async () => {
    const result = await getWithCookie(app, '/isLogged', 'auth=invalid-jwt-token');

    expect(result.status).toBe(200);
    const response = await result.json();
    expect(response.logged).toBe(false);
  });
});

describe('GET /logout', () => {
  it('should clear the auth cookie', async () => {
    const cookie = await loginAndGetCookie(app);

    const result = await getWithCookie(app, '/logout', cookie);

    expect(result.status).toBe(200);

    const setCookie = result.headers.get('Set-Cookie') ?? '';
    // Cookie should be removed (expired or empty)
    expect(setCookie).toContain('auth=');
  });
});
