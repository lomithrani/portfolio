import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { Domain, Experience, User } from '../models/database';
import { createApp } from '../app';
import {
  testUser,
  testDomain,
  testExperience,
  experienceRequestBody,
  postJson,
  postWithCookie,
  loginAndGetCookie,
  mockGoogleOAuthSuccess,
} from './helpers';

let app: ReturnType<typeof createApp>;
let originalFetch: typeof global.fetch;

beforeEach(() => {
  originalFetch = global.fetch;
  app = createApp();

  // Default mocks for auth flow
  User.findOneAndUpdate = mock(() => Promise.resolve(testUser)) as any;
  User.findById = mock(() => Promise.resolve(testUser)) as any;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('POST /experiences', () => {
  it('should reject requests without auth', async () => {
    const result = await postJson(app, '/experiences', experienceRequestBody);

    // Should fail with auth error (not 200)
    expect(result.status).not.toBe(200);
  });

  it('should create an experience with valid auth and body', async () => {
    const cookie = await loginAndGetCookie(app);

    const saveMock = mock(() => Promise.resolve(testExperience));
    const domainSaveMock = mock(() => Promise.resolve(testDomain));

    Domain.findOne = mock(() =>
      Promise.resolve({
        ...testDomain,
        experiences: [],
        save: domainSaveMock,
      })
    ) as any;

    Experience.fromRequest = mock(() =>
      Promise.resolve({
        ...testExperience,
        save: saveMock,
      })
    ) as any;

    const result = await postWithCookie(app, '/experiences', experienceRequestBody, cookie);

    expect(result.status).toBe(200);
    expect(Experience.fromRequest).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(domainSaveMock).toHaveBeenCalledTimes(1);
  });

  it('should return error when user has no domain', async () => {
    const cookie = await loginAndGetCookie(app);

    Domain.findOne = mock(() => Promise.resolve(null)) as any;

    const result = await postWithCookie(app, '/experiences', experienceRequestBody, cookie);

    expect(result.status).not.toBe(200);
  });

  it('should return 422 for invalid body (missing required fields)', async () => {
    const cookie = await loginAndGetCookie(app);

    const result = await postWithCookie(app, '/experiences', { title: 'Missing fields' }, cookie);

    expect(result.status).toBe(422);
  });
});
