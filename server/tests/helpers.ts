import { mock } from 'bun:test';
import { Types } from 'mongoose';

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
export const TEST_DOMAIN_NAME = 'test.domain';
export const TEST_WORKFLOW_ID = new Types.ObjectId().toString();
export const TEST_EXPERIENCE_ID = new Types.ObjectId().toString();

// ── Fixtures ────────────────────────────────────────────────

export const testUser = {
  _id: TEST_USER_ID,
  id: TEST_USER_ID,
  email: 'test@gmail.com',
  name: 'Test',
  surname: 'User',
  toObject: () => testUser,
};

export const testDomain = {
  _id: new Types.ObjectId().toString(),
  name: TEST_DOMAIN_NAME,
  admin: TEST_USER_ID,
  experiences: [],
  save: mock(() => Promise.resolve(testDomain)),
  populate: mock(function (this: any) { return Promise.resolve(this); }),
  toObject: () => ({ ...testDomain, experiences: [] }),
};

export const testExperience = {
  _id: TEST_EXPERIENCE_ID,
  type: 'professional',
  title: 'Software Engineer',
  summary: 'Built stuff',
  projects: [],
  set: mock(function (this: any, data: any) { Object.assign(this, data); }),
  save: mock(() => Promise.resolve(testExperience)),
  toObject: () => testExperience,
};

export const testWorkflow = {
  _id: TEST_WORKFLOW_ID,
  id: TEST_WORKFLOW_ID,
  user: new Types.ObjectId(TEST_USER_ID),
  name: 'Test Workflow',
  enabled: true,
  description: 'A test workflow',
  steps: [],
  set: mock(function (this: any, data: any) { Object.assign(this, data); }),
  save: mock(() => Promise.resolve(testWorkflow)),
  toObject: () => ({ ...testWorkflow }),
};

export const experienceRequestBody = {
  type: 'professional',
  title: 'Software Engineer',
  summary: 'Built cool stuff',
  projects: [
    {
      name: 'Portfolio',
      summary: 'A portfolio website',
      hardSkills: [{ name: 'TypeScript', level: 5 }],
      softSkills: [{ name: 'Communication', level: 4 }],
    },
  ],
};

export const workflowRequestBody = {
  name: 'Hiring Workflow',
  enabled: true,
  description: 'A hiring workflow',
};

// ── Google OAuth mocking ────────────────────────────────────

export function mockGoogleOAuthSuccess(email = 'test@gmail.com') {
  const response = new Response(
    JSON.stringify({ email_verified: true, email }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
  global.fetch = mock(() => Promise.resolve(response));
}

export function mockGoogleOAuthFailure() {
  const response = new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' });
  global.fetch = mock(() => Promise.resolve(response));
}

export function mockGoogleOAuthUnverified(email = 'test@gmail.com') {
  const response = new Response(
    JSON.stringify({ email_verified: false, email }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
  global.fetch = mock(() => Promise.resolve(response));
}

// ── Request helpers ─────────────────────────────────────────

export function makeRequest(app: any, path: string, options: RequestInit = {}) {
  const baseUrl = `http://localhost`;
  return app.fetch(new Request(`${baseUrl}${path}`, options));
}

export function postJson(app: any, path: string, body: unknown, headers: Record<string, string> = {}) {
  return makeRequest(app, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

export function putJson(app: any, path: string, body: unknown, headers: Record<string, string> = {}) {
  return makeRequest(app, path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

export function getWithCookie(app: any, path: string, cookie: string) {
  return makeRequest(app, path, {
    method: 'GET',
    headers: { Cookie: cookie },
  });
}

export function postWithCookie(app: any, path: string, body: unknown, cookie: string) {
  return makeRequest(app, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
}

export function putWithCookie(app: any, path: string, body: unknown, cookie: string) {
  return makeRequest(app, path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
}

// ── Auth helper: login and get cookie ───────────────────────

export async function loginAndGetCookie(app: any) {
  mockGoogleOAuthSuccess(testUser.email);
  const loginRes = await postJson(app, '/login', { token: 'test-google-token' });
  const setCookie = loginRes.headers.get('Set-Cookie') ?? '';
  const authToken = parseCookie(setCookie)['auth'];
  return `auth=${authToken}`;
}
