// Appointments (Google Calendar) against a real MongoDB (MONGO_URL, which must
// be local or come from TEST_MONGO_URL). Google is faked at the fetch layer:
// the real @googleapis/calendar and google-auth-library clients build every
// request, so tokens really go from the database to Google, and nowhere else.
// Each test logs in its own users, claims its own domain and gets a fresh fake
// Google, named with a suffix unique to that test, and its data is removed
// after: tests pass in any order (--randomize).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import type { Mock } from 'bun:test';
import mongoose from 'mongoose';
import { MAX_AVAILABLE_DATES_RANGE, addDays, bookingHorizon } from 'portfolio-common';
import { env } from '../env';
import { createApp } from '../app';
import {
  AppointmentBooking,
  AppointmentSchedule,
  Domain,
  Experience,
  JobApplication,
  JobPosting,
  RateLimitCounter,
  Skill,
  User,
  Workflow,
  WorkflowInstance
} from '../models/database';
import {
  AVAILABILITY_REQUESTS_PER_IP,
  BOOKING_REQUESTS_PER_EMAIL,
  BOOKING_REQUESTS_PER_IP,
  MAX_UPCOMING_BOOKINGS_PER_EMAIL,
  normalizeEmail
} from '../services/appointmentBookings';
import { rateLimitAddress } from '../services/clientAddress';
import { CALENDAR_SCOPE, RECONNECT_REQUIRED_MESSAGE } from '../services/googleCalendar';
import { logger } from '../services/logger';
import { rateLimitKey } from '../services/rateLimit';
import { jobImportAttemptsKey, jobImportCounters } from '../services/jobImport';
import { resumeImportAttemptsKey, resumeImportCounters, resumeImportUserKey } from '../services/resumeImport';
import { wallClockToUTC } from '../services/slotComputation';
import {
  experienceRequestBody,
  messageStream,
  parseCookie,
  signGoogleIdToken,
  useTestGoogleKeys,
  workflowRequestBody
} from './helpers';
import { assertDisposableDatabase } from './testDatabase';

/** Names unique to one test: everything it creates carries its suffix */
const testNames = () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const id = (name: string) => `ap-${name}-${suffix}`;
  return { suffix, id, email: (name: string) => `${id(name)}@example.com` };
};

const TEST_CLIENT_SECRET = 'GOCSPX-test-client-secret';
const PRIMARY_CALENDAR = `ap-calendar-${testNames().suffix}@example.com`;
const TIMEZONE = 'Europe/Paris';

// ── Fake Google (OAuth token endpoint + Calendar v3) ────────

interface FakeEvent {
  id: string;
  calendarId: string;
  status: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  attendees?: { email?: string }[];
  extendedProperties?: { private?: Record<string, string> };
  hangoutLink?: string;
  htmlLink?: string;
}

interface GoogleRequest {
  method: string;
  url: URL;
  authorization: string | null;
  body: string;
}

const googleError = (status: number, message: string) =>
  Response.json({ error: { code: status, message } }, { status });

/** Every token any test's fake Google issued: none may ever appear in an API response */
const allIssuedTokens = new Set<string>();

const createFakeGoogle = (suffix: string) => {
  let counter = 0;
  const state = {
    /** Every token Google issued: none may ever appear in an API response */
    issuedTokens: new Set<string>(),
    accessTokens: new Set<string>(),
    refreshTokens: new Set<string>(),
    busy: [] as { start: string; end: string }[],
    events: new Map<string, FakeEvent>(),
    requests: [] as GoogleRequest[],
    /** Outcome of the next event insert: refused (403), credentials refused (401), or created with its response lost */
    nextInsert: 'ok' as 'ok' | 'rejected' | 'unauthenticated' | 'response-lost',
    /** One-shot: the next lookup of an event id waits for its promise */
    gates: new Map<string, Promise<void>>(),
    /** One-shot: the next refresh token grant waits for this promise */
    refreshGate: null as Promise<void> | null,
    /** Every token the API asked Google to revoke */
    revokeRequests: [] as string[]
  };

  /**
   * The owner removed the app from their Google account (or the refresh token
   * expired): every token issued so far is refused from now on
   */
  const revokeGrant = () => {
    state.refreshTokens.clear();
    state.accessTokens.clear();
  };

  const issue = (kind: 'access' | 'refresh') => {
    const token = `${kind}-token-${suffix}-${++counter}`;
    state.issuedTokens.add(token);
    allIssuedTokens.add(token);
    (kind === 'access' ? state.accessTokens : state.refreshTokens).add(token);
    return token;
  };

  const tokenEndpoint = async (body: string) => {
    const params = new URLSearchParams(body);
    if (params.get('client_secret') !== TEST_CLIENT_SECRET || params.get('client_id') !== env.GOOGLE_CLIENT_ID) {
      return Response.json({ error: 'invalid_client' }, { status: 401 });
    }
    if (params.get('grant_type') === 'authorization_code') {
      const code = params.get('code');
      if (!code?.startsWith('code-')) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      return Response.json({
        access_token: issue('access'),
        expires_in: 3599,
        // Google only sends a refresh token on the first consent
        ...(code !== 'code-without-refresh' && { refresh_token: issue('refresh') }),
        scope: code === 'code-without-calendar' ? 'openid email' : `openid ${CALENDAR_SCOPE}`,
        token_type: 'Bearer'
      });
    }
    if (params.get('grant_type') === 'refresh_token') {
      const gate = state.refreshGate;
      if (gate) {
        state.refreshGate = null;
        await gate;
      }
      if (!state.refreshTokens.has(params.get('refresh_token') ?? '')) {
        // Google's answer for a revoked, expired or foreign refresh token
        return Response.json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, { status: 400 });
      }
      return Response.json({ access_token: issue('access'), expires_in: 3599, scope: CALENDAR_SCOPE, token_type: 'Bearer' });
    }
    return Response.json({ error: 'unsupported_grant_type' }, { status: 400 });
  };

  // Revoking a token revokes its whole grant
  const revokeEndpoint = (url: URL) => {
    const token = url.searchParams.get('token') ?? '';
    state.revokeRequests.push(token);
    if (!state.refreshTokens.has(token) && !state.accessTokens.has(token)) {
      return Response.json({ error: 'invalid_token', error_description: 'Token expired or revoked' }, { status: 400 });
    }
    revokeGrant();
    return Response.json({});
  };

  const calendarApi = async (request: GoogleRequest) => {
    const { method, url, body } = request;
    const accessToken = request.authorization?.replace(/^Bearer /, '') ?? '';
    if (!state.accessTokens.has(accessToken)) return googleError(401, 'Invalid Credentials');

    const path = url.pathname.slice('/calendar/v3'.length);
    if (method === 'GET' && path === '/users/me/calendarList') {
      return Response.json({
        items: [
          { id: PRIMARY_CALENDAR, summary: 'Owner', primary: true, accessRole: 'owner' },
          { id: 'work@example.com', summary: 'Work', accessRole: 'writer' }
        ]
      });
    }
    if (method === 'POST' && path === '/freeBusy') {
      const { items } = JSON.parse(body) as { items: { id: string }[] };
      return Response.json({
        calendars: Object.fromEntries(items.map((item) => [item.id, { busy: state.busy }]))
      });
    }

    const match = /^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(path);
    if (!match) return googleError(404, 'Not Found');
    const calendarId = decodeURIComponent(match[1]);
    const eventId = match[2] && decodeURIComponent(match[2]);

    if (!eventId && method === 'POST') {
      const outcome = state.nextInsert;
      state.nextInsert = 'ok';
      if (outcome === 'rejected') return googleError(403, 'Forbidden');
      if (outcome === 'unauthenticated') return googleError(401, 'Invalid Credentials');

      const requested = JSON.parse(body) as Omit<FakeEvent, 'id' | 'calendarId' | 'status'> & { id?: string };
      // Client-chosen ids: base32hex, 5 to 1024 characters, unique per calendar
      if (requested.id !== undefined && !/^[a-v0-9]{5,1024}$/.test(requested.id)) return googleError(400, 'Invalid resource id value.');
      const id = requested.id ?? `evt${++counter}`;
      if (state.events.has(id)) return googleError(409, 'The requested identifier already exists.');
      const created: FakeEvent = { ...requested, id, calendarId, status: 'confirmed' };
      created.htmlLink = `https://calendar.google.com/event?eid=${created.id}`;
      if (url.searchParams.get('conferenceDataVersion') === '1') {
        created.hangoutLink = 'https://meet.google.com/abc-defg-hij';
      }
      state.events.set(created.id, created);
      // Created, but the answer never reaches the API
      if (outcome === 'response-lost') throw new TypeError('fetch failed');
      return Response.json(created);
    }
    if (!eventId && method === 'GET') {
      const [key, value] = (url.searchParams.get('privateExtendedProperty') ?? '').split('=');
      const items = [...state.events.values()].filter(
        (event) =>
          event.calendarId === calendarId && (!key || event.extendedProperties?.private?.[key] === value)
      );
      return Response.json({ items });
    }

    const gate = eventId && method === 'GET' ? state.gates.get(eventId) : undefined;
    if (gate) {
      state.gates.delete(eventId);
      await gate;
    }
    const event = eventId ? state.events.get(eventId) : undefined;
    if (!event || event.calendarId !== calendarId) return googleError(404, 'Not Found');
    if (method === 'GET') return Response.json(event);
    if (method === 'DELETE') {
      state.events.delete(event.id);
      return new Response(null, { status: 204 });
    }
    return googleError(405, 'Method Not Allowed');
  };

  /** Routes global fetch to the fake until mock.restore(); requests are recorded per test */
  const install = () => {
    state.requests = [];
    return spyOn(globalThis, 'fetch').mockImplementation((async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? new Request(input, init) : new Request(String(input), init);
      const recorded: GoogleRequest = {
        method: request.method,
        url: new URL(request.url),
        authorization: request.headers.get('authorization'),
        body: await request.text()
      };
      state.requests.push(recorded);
      if (recorded.url.origin === 'https://oauth2.googleapis.com' && recorded.url.pathname === '/token') {
        return tokenEndpoint(recorded.body);
      }
      if (recorded.url.origin === 'https://oauth2.googleapis.com' && recorded.url.pathname === '/revoke') {
        return revokeEndpoint(recorded.url);
      }
      if (recorded.url.origin === 'https://www.googleapis.com' && recorded.url.pathname.startsWith('/calendar/v3/')) {
        return calendarApi(recorded);
      }
      throw new Error(`Unexpected request to ${recorded.method} ${recorded.url}`);
    }) as typeof fetch);
  };

  return { state, install, revokeGrant };
};

// A fresh fake per test (beforeEach): no events, busy times or tokens carry over
let google: ReturnType<typeof createFakeGoogle>;

// ── API calls, all recorded ─────────────────────────────────

interface RecordedResponse {
  method: string;
  path: string;
  status: number;
  /** Body and headers, as sent to the browser */
  text: string;
}

const responses: RecordedResponse[] = [];
let app: ReturnType<typeof createApp>;
/** Rate limit counters this test's booking and availability requests touched, removed after it */
let rateLimitKeys = new Set<string>();

const call = async (
  method: string,
  path: string,
  { body, cookie, headers: extraHeaders }: { body?: unknown; cookie?: string; headers?: Record<string, string> } = {}
) => {
  const headers: Record<string, string> = { ...extraHeaders };
  if (cookie) headers.Cookie = cookie;
  if (path === '/appointments/book') {
    const email = (body as { email?: unknown } | undefined)?.email;
    if (typeof email === 'string') rateLimitKeys.add(rateLimitKey('book:email', normalizeEmail(email)));
    const ip = headers['X-Real-IP'];
    if (ip) rateLimitKeys.add(rateLimitKey('book:ip', rateLimitAddress(ip)));
  }
  if (path.startsWith('/appointments/available-') && headers['X-Real-IP']) {
    rateLimitKeys.add(rateLimitKey('availability:ip', rateLimitAddress(headers['X-Real-IP'])));
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  );
  const text = await response.text();
  responses.push({
    method,
    path,
    status: response.status,
    text: `${JSON.stringify([...response.headers])}\n${text}`
  });
  return {
    status: response.status,
    text,
    headers: response.headers,
    json: <T = any>() => JSON.parse(text) as T
  };
};

/** Logs in with Google as this test's user `name` (sub and email derived from it) */
const login = async (name: string) => {
  const result = await call('POST', '/login', {
    body: { token: await signGoogleIdToken({ claims: { sub: t.id(`sub-${name}`), email: t.email(name) } }) }
  });
  expect(result.status).toBe(200);
  const cookie = `auth=${parseCookie(result.headers.get('Set-Cookie') ?? '')['auth']}`;
  return { cookie, userId: result.json().user._id as string };
};

const scheduleBody = (overrides: Record<string, unknown> = {}) => ({
  title: 'Intro call',
  description: 'A first chat',
  durationMinutes: 60,
  bufferMinutes: 0,
  minNoticeHours: 24,
  maxAdvanceDays: 30,
  timezone: TIMEZONE,
  calendarId: PRIMARY_CALENDAR,
  locationType: 'google_meet' as const,
  availability: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '12:00' })),
  enabled: true,
  ...overrides
});

/** YYYY-MM-DD, `days` from today (UTC) */
const dateIn = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const BOOKING_DATE = dateIn(7);
const at = (time: string, date = BOOKING_DATE) => wallClockToUTC(date, time, TIMEZONE).toISOString();

const storedTokens = (userId: string) =>
  User.findById(userId).select('+googleCalendar.refreshToken +googleCalendar.accessToken');

/** Connects the owner's Google Calendar (calendar scope and a refresh token) */
const connectOwner = async () => {
  const connected = await call('POST', '/appointments/connect', { body: { code: 'code-1' }, cookie: owner.cookie });
  expect(connected.status).toBe(200);
};

/** API responses (bodies and headers) that contain a token Google issued */
const tokenLeaks = (recorded: RecordedResponse[]) =>
  recorded.flatMap((response) =>
    [...allIssuedTokens]
      .filter((token) => response.text.includes(token))
      .map((token) => `${response.method} ${response.path} -> ${token}`)
  );

/** Removes what a test created: everything named with its suffix, and what those users own */
const removeTestData = async (suffix: string) => {
  const named = new RegExp(`-${suffix}(@|$)`);
  const userIds = (await User.find({ email: named }, '_id')).map((user) => user._id);
  const domains = await Domain.find({ $or: [{ admin: { $in: userIds } }, { name: named }] });
  await Experience.deleteMany({ _id: { $in: domains.flatMap((domain) => domain.experiences.map(String)) } });
  await Domain.deleteMany({ _id: { $in: domains.map((domain) => domain._id) } });
  await AppointmentSchedule.deleteMany({ user: { $in: userIds } });
  await AppointmentBooking.deleteMany({ user: { $in: userIds } });
  if (rateLimitKeys.size > 0) {
    await RateLimitCounter.deleteMany({ _id: { $regex: `^(${[...rateLimitKeys].join('|')}):` } });
  }
  await Workflow.deleteMany({ user: { $in: userIds } });
  await WorkflowInstance.deleteMany({ $or: [{ owner: { $in: userIds } }, { visitor: { $in: userIds } }] });
  const jobIds = (await JobPosting.find({ recruiter: { $in: userIds } }, '_id')).map((job) => job._id);
  await JobApplication.deleteMany({ $or: [{ job: { $in: jobIds } }, { candidate: { $in: userIds } }] });
  await JobPosting.deleteMany({ _id: { $in: jobIds } });
  await Skill.deleteMany({ displayName: named });
  await User.deleteMany({ _id: { $in: userIds } });
};

let t: ReturnType<typeof testNames>;
/** Index in `responses` of this test's first response */
let testResponses = 0;
let owner: { cookie: string; userId: string };
let other: { cookie: string; userId: string };
const savedSecret = env.GOOGLE_CLIENT_SECRET;
// Set once beforeAll has connected. Teardown then always runs: after a dropped
// connection Mongoose waits for it to come back, or the hook fails (never skipped)
let connected = false;

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  // Indexes first: the unique (schedule, start) index is what refuses a second booking
  await Promise.all([User.init(), Domain.init(), AppointmentBooking.init(), RateLimitCounter.init()]);
  env.GOOGLE_CLIENT_SECRET = TEST_CLIENT_SECRET;
  env.googleCalendarEnabled = true;
});

afterAll(async () => {
  env.GOOGLE_CLIENT_SECRET = savedSecret;
  env.googleCalendarEnabled = savedSecret !== undefined;
  if (connected) await mongoose.disconnect();
});

beforeEach(async () => {
  t = testNames();
  testResponses = responses.length;
  rateLimitKeys = new Set();
  app = createApp();
  useTestGoogleKeys();
  google = createFakeGoogle(t.suffix);
  google.install();
  // Every test starts with an owner (calendar not connected) who has a domain, and another user
  owner = await login('owner');
  other = await login('other');
  expect((await call('POST', '/domain/claim', { body: { name: t.id('domain') }, cookie: owner.cookie })).status).toBe(200);
});

afterEach(async () => {
  mock.restore();
  // No Google token in any body or header this test received, whichever order the tests run in
  const leaks = tokenLeaks(responses.slice(testResponses));
  if (connected) await removeTestData(t.suffix);
  expect(leaks).toEqual([]);
});

describe('Google Calendar connection', () => {
  it('requires a session on every admin route', async () => {
    for (const [method, path] of [
      ['GET', '/appointments/calendar-status'],
      ['POST', '/appointments/connect'],
      ['POST', '/appointments/disconnect'],
      ['GET', '/appointments/calendars'],
      ['GET', '/appointments/schedules'],
      ['POST', '/appointments/schedules'],
      ['GET', '/appointments/upcoming'],
      ['DELETE', '/appointments/events/evt1']
    ]) {
      const body = method === 'POST' ? {} : undefined;
      expect({ method, path, status: (await call(method, path, { body })).status }).toEqual({ method, path, status: 401 });
    }
  });

  it('reports that it is not configured without GOOGLE_CLIENT_SECRET', async () => {
    env.GOOGLE_CLIENT_SECRET = undefined;
    env.googleCalendarEnabled = false;
    try {
      const status = await call('GET', '/appointments/calendar-status', { cookie: owner.cookie });
      expect(status.json()).toEqual({ configured: false, connected: false, connectedAt: null, revokedAt: null });

      const connect = await call('POST', '/appointments/connect', { body: { code: 'code-1' }, cookie: owner.cookie });
      expect(connect.status).toBe(409);
      expect(connect.text).toBe('Google Calendar is not configured on this server');
      expect(google.state.requests).toHaveLength(0);
    } finally {
      env.GOOGLE_CLIENT_SECRET = TEST_CLIENT_SECRET;
      env.googleCalendarEnabled = true;
    }
  });

  it('rejects codes Google refuses, without calendar access or without offline access', async () => {
    const connect = (code: string) =>
      call('POST', '/appointments/connect', { body: { code }, cookie: owner.cookie });

    const refused = await connect('expired');
    expect(refused.status).toBe(400);
    expect(refused.text).toBe('Google rejected the authorization code');

    const noCalendar = await connect('code-without-calendar');
    expect(noCalendar.status).toBe(400);
    expect(noCalendar.text).toBe('Calendar access was not granted');

    // A first connection must yield a refresh token, or nothing works an hour later
    const noRefresh = await connect('code-without-refresh');
    expect(noRefresh.status).toBe(400);
    expect(noRefresh.text).toContain('offline access');

    const status = await call('GET', '/appointments/calendar-status', { cookie: owner.cookie });
    expect(status.json()).toMatchObject({ configured: true, connected: false });
    expect((await storedTokens(owner.userId))?.googleCalendar?.refreshToken).toBeUndefined();
  });

  it('connects, storing tokens that default queries never load', async () => {
    const connect = await call('POST', '/appointments/connect', { body: { code: 'code-1' }, cookie: owner.cookie });
    expect(connect.status).toBe(200);
    expect(connect.json()).toEqual({ connected: true });

    // The exchange sent the server's client credentials and the GIS popup redirect URI
    const exchange = google.state.requests.find((request) => request.url.pathname === '/token');
    expect(new URLSearchParams(exchange?.body).get('redirect_uri')).toBe('postmessage');

    const status = await call('GET', '/appointments/calendar-status', { cookie: owner.cookie });
    expect(status.json()).toMatchObject({ configured: true, connected: true });
    expect(typeof status.json().connectedAt).toBe('string');

    const stored = await storedTokens(owner.userId);
    expect(google.state.refreshTokens.has(stored?.googleCalendar?.refreshToken ?? '')).toBe(true);
    expect(google.state.accessTokens.has(stored?.googleCalendar?.accessToken ?? '')).toBe(true);

    // select: false: documents and lean objects loaded the usual ways have no tokens
    const loaded = [
      await User.findById(owner.userId),
      await User.findOne({ email: t.email('owner') }),
      (await User.find({ _id: owner.userId }))[0],
      await User.findById(owner.userId).lean()
    ];
    for (const user of loaded) {
      expect(user?.googleCalendar?.connectedAt).toBeInstanceOf(Date);
      expect(user?.googleCalendar?.refreshToken).toBeUndefined();
      expect(user?.googleCalendar?.accessToken).toBeUndefined();
      const serialized = JSON.stringify(user);
      for (const token of google.state.issuedTokens) expect(serialized).not.toContain(token);
    }
  });

  it('keeps the stored refresh token when Google sends none on reconnect', async () => {
    await connectOwner();
    const before = await storedTokens(owner.userId);
    const reconnect = await call('POST', '/appointments/connect', {
      body: { code: 'code-without-refresh' },
      cookie: owner.cookie
    });
    expect(reconnect.status).toBe(200);

    const after = await storedTokens(owner.userId);
    expect(after?.googleCalendar?.refreshToken).toBe(before?.googleCalendar?.refreshToken ?? 'missing');
    expect(after?.googleCalendar?.accessToken).not.toBe(before?.googleCalendar?.accessToken ?? 'missing');
  });

  it('lists the writable calendars with the stored access token', async () => {
    await connectOwner();
    const calendars = await call('GET', '/appointments/calendars', { cookie: owner.cookie });
    expect(calendars.status).toBe(200);
    expect(calendars.json()).toEqual([
      { id: PRIMARY_CALENDAR, summary: 'Owner', primary: true },
      { id: 'work@example.com', summary: 'Work', primary: false }
    ]);

    const list = google.state.requests.find((request) => request.url.pathname.endsWith('/calendarList'));
    expect(list?.url.searchParams.get('minAccessRole')).toBe('writer');
    const stored = await storedTokens(owner.userId);
    expect(list?.authorization).toBe(`Bearer ${stored?.googleCalendar?.accessToken}`);
  });

  it('stores the access token Google refreshes', async () => {
    await connectOwner();
    await User.updateOne({ _id: owner.userId }, { $set: { 'googleCalendar.tokenExpiry': new Date(Date.now() - 60_000) } });

    expect((await call('GET', '/appointments/calendars', { cookie: owner.cookie })).status).toBe(200);
    const refresh = google.state.requests.find(
      (request) => new URLSearchParams(request.body).get('grant_type') === 'refresh_token'
    );
    expect(refresh).toBeDefined();

    // Persisted from the client's 'tokens' event, after the response
    const latest = [...google.state.accessTokens].at(-1);
    for (let attempt = 0; attempt < 50; attempt++) {
      if ((await storedTokens(owner.userId))?.googleCalendar?.accessToken === latest) break;
      await Bun.sleep(20);
    }
    const stored = await storedTokens(owner.userId);
    expect(stored?.googleCalendar?.accessToken).toBe(latest ?? 'missing');
    expect(stored?.googleCalendar?.tokenExpiry?.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('appointment schedules', () => {
  it('validates schedules', async () => {
    const create = (overrides: Record<string, unknown>) =>
      call('POST', '/appointments/schedules', { body: scheduleBody(overrides), cookie: owner.cookie });

    const unknownZone = await create({ timezone: 'Mars/Olympus_Mons' });
    expect(unknownZone.status).toBe(400);
    expect(unknownZone.text).toBe('Unknown time zone');

    const backwards = await create({ availability: [{ dayOfWeek: 1, startTime: '12:00', endTime: '09:00' }] });
    expect(backwards.status).toBe(400);

    expect((await create({ availability: [{ dayOfWeek: 1, startTime: '24:00', endTime: '25:00' }] })).status).toBe(422);
    expect((await create({ availability: [{ dayOfWeek: 7, startTime: '09:00', endTime: '10:00' }] })).status).toBe(422);
    expect((await create({ title: '' })).status).toBe(422);
    expect((await create({ durationMinutes: 1 })).status).toBe(422);

    expect(await AppointmentSchedule.countDocuments({ user: owner.userId })).toBe(0);
  });

  it("creates, lists, updates and deletes the owner's schedules only", async () => {
    const created = await call('POST', '/appointments/schedules', { body: scheduleBody(), cookie: owner.cookie });
    expect(created.status).toBe(200);
    const scheduleId = created.json()._id as string;

    const listed = await call('GET', '/appointments/schedules', { cookie: owner.cookie });
    expect(listed.json().map((schedule: { _id: string }) => schedule._id)).toEqual([scheduleId]);
    expect((await call('GET', '/appointments/schedules', { cookie: other.cookie })).json()).toEqual([]);

    const path = `/appointments/schedules/${scheduleId}`;
    expect((await call('PUT', path, { body: scheduleBody({ title: 'Hijacked' }), cookie: other.cookie })).status).toBe(404);
    expect((await call('DELETE', path, { cookie: other.cookie })).status).toBe(404);
    expect((await call('PUT', '/appointments/schedules/not-an-id', { body: scheduleBody(), cookie: owner.cookie })).status).toBe(422);

    const updated = await call('PUT', path, { body: scheduleBody({ title: 'Renamed' }), cookie: owner.cookie });
    expect(updated.status).toBe(200);
    expect((await AppointmentSchedule.findById(scheduleId))?.title).toBe('Renamed');

    expect((await call('DELETE', path, { cookie: owner.cookie })).status).toBe(200);
    expect(await AppointmentSchedule.exists({ _id: scheduleId })).toBeNull();
    expect((await call('DELETE', path, { cookie: owner.cookie })).status).toBe(404);
  });
});

describe('public booking', () => {
  let scheduleId: string;
  let pausedId: string;

  // After the top-level beforeEach: the owner connects, with one enabled and one paused schedule
  beforeEach(async () => {
    await connectOwner();
    scheduleId = (await AppointmentSchedule.create({ ...scheduleBody(), user: owner.userId }))._id.toString();
    pausedId = (await AppointmentSchedule.create({ ...scheduleBody({ title: 'Paused', enabled: false }), user: owner.userId }))._id.toString();
  });

  it('lists the enabled schedules of a domain without private fields', async () => {
    const listed = await call('GET', `/appointments/domains/${t.id('domain').toUpperCase()}/schedules`);
    expect(listed.status).toBe(200);
    const schedules = listed.json<Record<string, unknown>[]>();
    expect(schedules.map((schedule) => schedule.id)).toEqual([scheduleId]);
    expect(Object.keys(schedules[0]).sort()).toEqual([
      'availability',
      'description',
      'durationMinutes',
      'id',
      'locationDetails',
      'locationType',
      'maxAdvanceDays',
      'minNoticeHours',
      'timezone',
      'title'
    ]);

    const single = await call('GET', `/appointments/schedules/${scheduleId}/public`);
    expect(single.json()).toEqual(schedules[0]);
    expect((await call('GET', `/appointments/schedules/${pausedId}/public`)).status).toBe(404);
    expect((await call('GET', `/appointments/domains/${t.id('nope')}/schedules`)).status).toBe(404);
  });

  it('offers the free slots of a day', async () => {
    google.state.busy = [{ start: at('10:00'), end: at('10:30') }];

    const slots = await call('GET', `/appointments/available-slots?scheduleId=${scheduleId}&date=${BOOKING_DATE}`);
    expect(slots.status).toBe(200);
    expect(slots.json()).toEqual([
      { start: at('09:00'), end: at('10:00') },
      { start: at('11:00'), end: at('12:00') }
    ]);
    const freeBusy = google.state.requests.find((request) => request.url.pathname.endsWith('/freeBusy'));
    expect(JSON.parse(freeBusy?.body ?? '{}').items).toEqual([{ id: PRIMARY_CALENDAR }]);

    // Beyond maxAdvanceDays: nothing, without asking Google
    const before = google.state.requests.length;
    const far = await call('GET', `/appointments/available-slots?scheduleId=${scheduleId}&date=${dateIn(60)}`);
    expect(far.json()).toEqual([]);
    expect(google.state.requests.length).toBe(before);

    expect((await call('GET', `/appointments/available-slots?scheduleId=${scheduleId}&date=tomorrow`)).status).toBe(422);
    expect((await call('GET', `/appointments/available-slots?scheduleId=${pausedId}&date=${BOOKING_DATE}`)).status).toBe(404);
  });

  it('books a free slot once, re-checking it with Google', async () => {
    google.state.busy = [];
    const book = (startTime: string) =>
      call('POST', '/appointments/book', {
        body: { scheduleId, startTime, name: 'Jane Recruiter', email: t.email('jane'), notes: 'Hello' }
      });

    const booked = await book(at('09:00'));
    expect(booked.status).toBe(200);
    expect(booked.json()).toMatchObject({
      booked: true,
      start: at('09:00'),
      end: at('10:00'),
      meetLink: 'https://meet.google.com/abc-defg-hij'
    });

    const [event] = [...google.state.events.values()];
    expect(event).toMatchObject({
      calendarId: PRIMARY_CALENDAR,
      summary: 'Intro call — Jane Recruiter',
      attendees: [{ email: t.email('jane') }],
      extendedProperties: { private: { portfolio_appointment: 'true' } }
    });
    const insert = google.state.requests.find((request) => request.method === 'POST' && request.url.pathname.endsWith('/events'));
    expect(insert?.url.searchParams.get('sendUpdates')).toBe('all');

    // Google now reports the slot busy
    google.state.busy = [{ start: at('09:00'), end: at('10:00') }];
    expect((await book(at('09:00'))).status).toBe(409);
    expect((await book(at('09:15'))).status).toBe(409);
    // Inside the minimum notice
    expect((await book(new Date(Date.now() + 3_600_000).toISOString())).status).toBe(409);
    expect((await book('not a date')).status).toBe(400);
    expect(google.state.events.size).toBe(1);
  });

  it('lists upcoming bookings and cancels only events the app created', async () => {
    // A visitor's booking, made through the public route
    const booked = await call('POST', '/appointments/book', {
      body: { scheduleId, startTime: at('09:00'), name: 'Jane Recruiter', email: t.email('jane'), notes: 'Hello' }
    });
    expect(booked.status).toBe(200);

    const upcoming = await call('GET', '/appointments/upcoming', { cookie: owner.cookie });
    expect(upcoming.status).toBe(200);
    const [booking] = upcoming.json<{ id: string; calendarId: string; attendees: string[] }[]>();
    expect(booking).toMatchObject({ calendarId: PRIMARY_CALENDAR, attendees: [t.email('jane')] });

    // One of the owner's own events, on the same calendar
    google.state.events.set('personal', { id: 'personal', calendarId: PRIMARY_CALENDAR, status: 'confirmed', summary: 'Dentist' });
    const query = `?calendarId=${encodeURIComponent(PRIMARY_CALENDAR)}`;
    expect((await call('DELETE', `/appointments/events/personal${query}`, { cookie: owner.cookie })).status).toBe(404);
    expect(google.state.events.has('personal')).toBe(true);

    expect((await call('DELETE', `/appointments/events/${booking.id}${query}`, { cookie: other.cookie })).status).toBe(409);
    const cancelled = await call('DELETE', `/appointments/events/${booking.id}${query}`, { cookie: owner.cookie });
    expect(cancelled.status).toBe(200);
    expect(google.state.events.has(booking.id)).toBe(false);
  });

  // The fake FreeBusy never reports the events it created, as Google between
  // two requests' checks: only the server-side reservation refuses a second booking
  const bookSlot = (startTime: string, email: string, id = scheduleId) =>
    call('POST', '/appointments/book', { body: { scheduleId: id, startTime, name: 'Visitor', email } });
  const bookingsAt = (startTime: string) =>
    AppointmentBooking.find({ user: owner.userId, start: new Date(startTime) }).lean();
  const eventsAt = (startTime: string) =>
    [...google.state.events.values()].filter((event) => event.start?.dateTime === startTime);

  it('books a slot once when two requests race for it', async () => {
    const slot = at('10:00');

    const results = await Promise.all([bookSlot(slot, t.email('racer-1')), bookSlot(slot, t.email('racer-2'))]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(results.find((result) => result.status === 409)?.text).toBe('This slot is no longer available');

    // Both passed the FreeBusy check; one event, one booking, bound to it
    expect(google.state.requests.filter((request) => request.url.pathname.endsWith('/freeBusy'))).toHaveLength(2);
    const [event] = eventsAt(slot);
    expect(eventsAt(slot)).toHaveLength(1);
    const bookings = await bookingsAt(slot);
    expect(bookings).toHaveLength(1);
    expect(bookings[0].eventId).toBe(event.id);
    // The event carries the booking's id, so Google can be asked for it whatever happens
    expect(event.id).toBe(bookings[0]._id.toHexString());
    // Hashed: the visitor's address is not stored
    expect(JSON.stringify(bookings)).not.toContain('racer');

    // Later requests too
    expect((await bookSlot(slot, t.email('racer-3'))).status).toBe(409);
    expect(eventsAt(slot)).toHaveLength(1);
  });

  it("refuses a slot overlapping another of the owner's bookings, whatever calendar id its schedule names", async () => {
    expect((await bookSlot(at('10:00'), t.email('first'))).status).toBe(200);

    // 'primary': the same calendar as PRIMARY_CALENDAR, by its alias
    const quick = await AppointmentSchedule.create({
      ...scheduleBody({ title: 'Quick chat', durationMinutes: 30, calendarId: 'primary' }),
      user: owner.userId
    });
    // 10:30-11:00 overlaps the 10:00-11:00 booking; 11:00-11:30 does not
    expect((await bookSlot(at('10:30'), t.email('quick-1'), quick.id)).status).toBe(409);
    expect((await bookSlot(at('11:00'), t.email('quick-2'), quick.id)).status).toBe(200);
    expect(await AppointmentBooking.countDocuments({ schedule: quick._id })).toBe(1);
  });

  it('makes a cancelled slot bookable again', async () => {
    const slot = at('09:00');
    const query = `?calendarId=${encodeURIComponent(PRIMARY_CALENDAR)}`;

    expect((await bookSlot(slot, t.email('first'))).status).toBe(200);
    expect((await bookSlot(slot, t.email('second'))).status).toBe(409);

    // Cancelled from the admin panel: the booking goes with the event
    const [first] = eventsAt(slot);
    expect((await call('DELETE', `/appointments/events/${first.id}${query}`, { cookie: owner.cookie })).status).toBe(200);
    expect(await bookingsAt(slot)).toEqual([]);
    expect((await bookSlot(slot, t.email('second'))).status).toBe(200);

    // Deleted in Google Calendar directly: the stale booking gives way once Google confirms the event is gone
    const [second] = eventsAt(slot);
    google.state.events.delete(second.id);
    expect((await bookSlot(slot, t.email('third'))).status).toBe(200);
    const [third] = eventsAt(slot);
    expect((await bookingsAt(slot)).map((booking) => booking.eventId)).toEqual([third.id]);

    // An abandoned reservation (the API stopped before creating the event) gives way after a while
    await AppointmentBooking.updateOne(
      { eventId: third.id },
      { $unset: { eventId: 1 }, $set: { heldAt: new Date(Date.now() - 60 * 60_000) } }
    );
    google.state.events.delete(third.id);
    expect((await bookSlot(slot, t.email('fourth'))).status).toBe(200);
    expect(await bookingsAt(slot)).toHaveLength(1);
  });

  it('releases a booking Google refused, and keeps one whose event Google may have created', async () => {
    // Refused (403): no event, the slot is free again
    google.state.nextInsert = 'rejected';
    expect((await bookSlot(at('09:00'), t.email('refused'))).status).toBe(500);
    expect(await bookingsAt(at('09:00'))).toEqual([]);
    expect((await bookSlot(at('09:00'), t.email('after-refusal'))).status).toBe(200);

    // Created, but the response was lost: the booking stays, pending
    const slot = at('10:00');
    google.state.nextInsert = 'response-lost';
    expect((await bookSlot(slot, t.email('lost'))).status).toBe(500);
    const [pending] = await bookingsAt(slot);
    expect(pending.eventId).toBeUndefined();
    expect(eventsAt(slot).map((event) => event.id)).toEqual([pending._id.toHexString()]);
    expect((await bookSlot(slot, t.email('retry'))).status).toBe(409);

    // Long after, as if the API had stopped: Google has the event under the
    // booking's id, so the booking keeps the slot, and now records it
    await AppointmentBooking.updateOne({ _id: pending._id }, { $set: { heldAt: new Date(Date.now() - 60 * 60_000) } });
    expect((await bookSlot(slot, t.email('later'))).status).toBe(409);
    expect((await AppointmentBooking.findById(pending._id).lean())?.eventId).toBe(pending._id.toHexString());
    expect(eventsAt(slot)).toHaveLength(1);
  });

  it('does not let a request take over a booking whose request is still running', async () => {
    const slot = at('10:00');
    const lease = await AppointmentSchedule.create({ ...scheduleBody({ title: 'Lease', durationMinutes: 30 }), user: owner.userId });

    // An earlier 10:00-10:30 booking of another schedule, whose event the owner deleted in Google Calendar
    expect((await bookSlot(slot, t.email('earlier'), lease.id)).status).toBe(200);
    const [earlier] = eventsAt(slot);
    google.state.events.delete(earlier.id);

    // Request A (10:00-11:00) overlaps it, and its lookup of that event hangs
    let release = () => {};
    google.state.gates.set(earlier.id, new Promise<void>((resolve) => (release = resolve)));
    const a = bookSlot(slot, t.email('request-a'));
    for (let i = 0; i < 200 && google.state.gates.has(earlier.id); i++) await Bun.sleep(5);
    expect(google.state.gates.has(earlier.id)).toBe(false);

    // Meanwhile A's booking looks abandoned (held long ago): request B takes it over, and books
    const [held] = await AppointmentBooking.find({ schedule: scheduleId, start: new Date(slot) }).lean();
    await AppointmentBooking.updateOne({ _id: held._id }, { $set: { heldAt: new Date(Date.now() - 60 * 60_000) } });
    expect((await bookSlot(slot, t.email('request-b'))).status).toBe(200);

    // A resumes: it lost its hold, so it creates no second event
    release();
    expect((await a).status).toBe(409);
    expect(eventsAt(slot)).toHaveLength(1);
  });

  it('caps the upcoming bookings of one email address on a schedule', async () => {
    const mailbox = t.id('capped');
    // One mailbox, whatever the case or +tag
    const variants = [`${mailbox}@example.com`, `${mailbox}+b@Example.com`, `${mailbox.toUpperCase()}+c@example.com`];
    expect(MAX_UPCOMING_BOOKINGS_PER_EMAIL).toBe(2);

    expect((await bookSlot(at('09:00'), variants[0])).status).toBe(200);
    expect((await bookSlot(at('10:00'), variants[1])).status).toBe(200);
    const capped = await bookSlot(at('11:00'), variants[2]);
    expect(capped.status).toBe(429);
    expect(capped.text).toContain('maximum number of upcoming bookings');
    // Refused before the invitation
    expect(eventsAt(at('11:00'))).toEqual([]);

    // The owner deletes one of them in Google Calendar: it no longer counts
    google.state.events.delete(eventsAt(at('09:00'))[0].id);
    expect((await bookSlot(at('11:00'), variants[2])).status).toBe(200);
  });

  it('rate limits booking requests per IP address, and per email once the slot is free', async () => {
    const savedHeader = env.CLIENT_IP_HEADER;
    env.CLIENT_IP_HEADER = 'x-real-ip';
    try {
      const slot = at('09:00');
      const unknownSchedule = new mongoose.Types.ObjectId().toString();
      const book = (email: string, ip: string, id = unknownSchedule) =>
        call('POST', '/appointments/book', {
          body: { scheduleId: id, startTime: slot, name: 'Spammer', email },
          headers: { 'X-Real-IP': ip }
        });
      // A random IPv6 /64 per test: counters are only removed after it
      const group = () => Math.floor(Math.random() * 0x10000).toString(16);
      const network = `2001:db8:${group()}:${group()}`;
      const anotherNetwork = () => `2001:db8:${group()}:${group()}::1`;

      // Per IP (IPv6: per /64), whatever the outcome (404 here)
      for (let i = 1; i <= BOOKING_REQUESTS_PER_IP.limit; i++) {
        expect((await book(t.email(`ip-${i}`), `${network}::${i}`)).status).toBe(404);
      }
      const googleRequests = google.state.requests.length;
      const limited = await book(t.email('ip-over'), `${network}:ffff::1`, scheduleId);
      // Refused before calling Google
      expect(google.state.requests).toHaveLength(googleRequests);
      expect(limited.status).toBe(429);
      expect(limited.text).toStartWith('Too many booking requests from your network. Try again in ');
      const retryAfter = Number(limited.headers.get('retry-after'));
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(BOOKING_REQUESTS_PER_IP.windowMs / 1000);
      // Another network is not affected
      expect((await book(t.email('ip-other'), anotherNetwork())).status).toBe(404);

      // Per email (any case or +tag), from different networks. Only requests
      // that reach a free slot count: invalid ones cannot use up the quota of
      // the address they name
      const mailbox = t.id('victim');
      const variant = (i: number) => (i % 2 ? `${mailbox}+${i}@example.com` : `${mailbox.toUpperCase()}@EXAMPLE.COM`);
      for (let i = 1; i <= BOOKING_REQUESTS_PER_EMAIL.limit; i++) {
        expect((await book(variant(i), anotherNetwork())).status).toBe(404);
      }
      expect((await book(variant(0), anotherNetwork(), scheduleId)).status).toBe(200);
      // The slot is taken now, but these got past FreeBusy: they count
      for (let i = 2; i <= BOOKING_REQUESTS_PER_EMAIL.limit; i++) {
        expect((await book(variant(i), anotherNetwork(), scheduleId)).status).toBe(409);
      }
      const spammed = await book(`${mailbox}@example.com`, anotherNetwork(), scheduleId);
      expect(spammed.status).toBe(429);
      expect(spammed.text).toStartWith('Too many booking requests for this email address');
      expect(Number(spammed.headers.get('retry-after'))).toBeGreaterThan(0);
      expect(eventsAt(slot)).toHaveLength(1);
    } finally {
      env.CLIENT_IP_HEADER = savedHeader;
    }
  });

  it('offers nothing once the owner disconnects', async () => {
    const disconnected = await call('POST', '/appointments/disconnect', { body: {}, cookie: owner.cookie });
    expect(disconnected.json()).toEqual({ connected: false });
    // The whole subdocument is gone from MongoDB
    expect((await storedTokens(owner.userId).lean())?.googleCalendar).toBeUndefined();

    expect((await call('GET', `/appointments/domains/${t.id('domain')}/schedules`)).json()).toEqual([]);
    expect((await call('GET', `/appointments/available-slots?scheduleId=${scheduleId}&date=${BOOKING_DATE}`)).status).toBe(409);
  });
});

// The booking page greys out every date this route leaves out: it must list
// exactly the dates available-slots has slots for
describe('hiring journey gate', () => {
  let scheduleId: string;
  // The web app the bookings come from: an allowed origin whatever ALLOWED_DOMAINS this run has
  // (the invitation only links a job page of an allowed origin)
  const WEB_ORIGIN = 'https://web.journey-test.example';
  const savedOrigins = env.ALLOWED_DOMAINS;

  // After the top-level beforeEach: the owner connects, with one enabled schedule
  beforeEach(async () => {
    env.ALLOWED_DOMAINS = [...savedOrigins, WEB_ORIGIN];
    await connectOwner();
    scheduleId = (await AppointmentSchedule.create({ ...scheduleBody(), user: owner.userId }))._id.toString();
    google.state.busy = [];
  });

  afterEach(() => {
    env.ALLOWED_DOMAINS = savedOrigins;
  });

  const setJourney = async (...types: string[]) =>
    expect(
      (await call('PUT', '/workflow', { body: { steps: types.map((type) => ({ type })) }, cookie: owner.cookie })).status
    ).toBe(200);

  /** The three gated routes, as `cookie` (none: anonymous) calls them */
  const meetingRoutes = (cookie?: string) => ({
    dates: () => call('GET', `/appointments/available-dates?scheduleId=${scheduleId}`, { cookie }),
    slots: () => call('GET', `/appointments/available-slots?scheduleId=${scheduleId}&date=${BOOKING_DATE}`, { cookie }),
    book: (startTime = at('09:00')) =>
      call('POST', '/appointments/book', {
        cookie,
        headers: { Origin: WEB_ORIGIN },
        body: { scheduleId, startTime, name: 'Jane Recruiter', email: t.email('jane') }
      })
  });

  /** `other` as a recruiter with one job posting of `status` */
  const recruiterJob = async (status: string) => {
    expect((await call('PUT', '/me/mode', { body: { mode: 'recruiter' }, cookie: other.cookie })).status).toBe(200);
    const job = await call('POST', '/jobs', {
      cookie: other.cookie,
      body: {
        title: 'Staff Engineer',
        description: 'Build things.',
        company: 'Acme',
        status,
        location: { country: 'FR', city: 'Lyon', workMode: 'hybrid', remoteDaysPerWeek: 2 },
        contract: { type: 'cdi' },
        workingTime: { arrangement: 'weekly_hours', hoursPerWeek: 35 },
        pay: { min: 50000, max: 60000, currency: 'EUR', period: 'year' }
      }
    });
    expect(job.status).toBe(200);
    return job.json()._id as string;
  };

  it('offers no meeting type, and no availability, when the journey has no meeting step', async () => {
    await setJourney();
    const listed = await call('GET', `/appointments/domains/${t.id('domain')}/schedules`);
    expect(listed.json()).toEqual([]);
    const routes = meetingRoutes(other.cookie);
    for (const request of [routes.dates, routes.slots, () => routes.book()]) {
      const answer = await request();
      expect(answer.status).toBe(404);
      expect(answer.text).toBe('Schedule not found');
    }
    expect(google.state.requests.filter((request) => request.url.pathname !== '/token')).toEqual([]);
  });

  it('keeps booking open to anyone with the default journey', async () => {
    const routes = meetingRoutes();
    expect((await routes.slots()).status).toBe(200);
    expect((await routes.book()).status).toBe(200);
    // Nobody went through a journey: nothing recorded
    expect(await WorkflowInstance.countDocuments({ owner: owner.userId })).toBe(0);
  });

  it('opens the meeting step once the visitor picked an open job, and puts the job in the invitation', async () => {
    await setJourney('job', 'meeting');
    const before = google.state.requests.length;

    // Still listed: the page shows what the journey leads to
    expect((await call('GET', `/appointments/domains/${t.id('domain')}/schedules`)).json()).toHaveLength(1);

    const anonymous = meetingRoutes();
    for (const request of [anonymous.dates, anonymous.slots, () => anonymous.book()]) {
      const answer = await request();
      expect(answer.status).toBe(401);
      expect(answer.text).toBe('Sign in to continue the hiring journey');
    }
    const visitor = meetingRoutes(other.cookie);
    for (const request of [visitor.dates, visitor.slots, () => visitor.book()]) {
      const answer = await request();
      expect(answer.status).toBe(403);
      expect(answer.text).toBe('Complete the earlier steps of the hiring journey first');
    }
    // Refused before Google was asked anything
    expect(google.state.requests.length).toBe(before);

    const jobId = await recruiterJob('open');
    const picked = await call('PUT', `/workflow/domains/${t.id('domain')}/job`, { body: { jobId }, cookie: other.cookie });
    expect(picked.status).toBe(200);

    expect((await visitor.dates()).status).toBe(200);
    expect((await visitor.slots()).status).toBe(200);
    const booked = await visitor.book();
    expect(booked.status).toBe(200);
    const [event] = [...google.state.events.values()];
    expect(event.description).toBe(
      `Booked via portfolio by Jane Recruiter (${t.email('jane')})\nJob: Staff Engineer — Acme\n${WEB_ORIGIN}/jobs/${jobId}`
    );
    const instance = await WorkflowInstance.findOne({ owner: owner.userId, visitor: other.userId }).lean();
    expect(instance?.meetingBookedAt).toBeInstanceOf(Date);

    // The job is closed since: pick another open one first
    expect((await call('PUT', `/jobs/${jobId}/status`, { body: { status: 'closed' }, cookie: other.cookie })).status).toBe(200);
    expect((await visitor.slots()).status).toBe(403);
  });

  it('never links the job page of an origin the API does not allow', async () => {
    await setJourney('job', 'meeting');
    const jobId = await recruiterJob('open');
    expect((await call('PUT', `/workflow/domains/${t.id('domain')}/job`, { body: { jobId }, cookie: other.cookie })).status).toBe(200);

    const booked = await call('POST', '/appointments/book', {
      cookie: other.cookie,
      headers: { Origin: 'https://evil.example.com' },
      body: { scheduleId, startTime: at('09:00'), name: 'Jane Recruiter', email: t.email('jane') }
    });
    expect(booked.status).toBe(200);
    const [event] = [...google.state.events.values()];
    expect(event.description).toBe(`Booked via portfolio by Jane Recruiter (${t.email('jane')})\nJob: Staff Engineer — Acme`);
  });

  it('never stops the owner on their own journey', async () => {
    await setJourney('job', 'meeting');
    const routes = meetingRoutes(owner.cookie);
    expect((await routes.slots()).status).toBe(200);
    expect((await routes.book()).status).toBe(200);
    expect(await WorkflowInstance.countDocuments({ owner: owner.userId })).toBe(0);
  });
});

describe('bookable dates', () => {
  let scheduleId: string;
  /** A Monday off, a Wednesday with hours of its own, a Sunday busy all day: all past the minimum notice */
  let offMonday: string;
  let extraWednesday: string;
  let busySunday: string;

  /** The test schedule's booking horizon (maxAdvanceDays 30), as the API computes it now */
  const horizon = () => bookingHorizon({ timezone: TIMEZONE, maxAdvanceDays: 30 });
  /** Day of the week of a YYYY-MM-DD date (0 = Sunday) */
  const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
  /** The first date on or after `from` that falls on `day` */
  const nextWeekday = (day: number, from: string) => addDays(from, (day - weekday(from) + 7) % 7);
  /** Midnight in Paris at the start of a date */
  const midnight = (date: string) => wallClockToUTC(date, '00:00', TIMEZONE).toISOString();

  const availableDates = (from: string, to: string, id = scheduleId, headers?: Record<string, string>) =>
    call('GET', `/appointments/available-dates?scheduleId=${id}&from=${from}&to=${to}`, { headers });
  /** The bookable dates of an available-dates answer */
  const datesOf = (response: { json: <T>() => T }) => response.json<{ dates: string[] }>().dates;
  const availableSlots = (date: string, id = scheduleId, headers?: Record<string, string>) =>
    call('GET', `/appointments/available-slots?scheduleId=${id}&date=${date}`, { headers });
  const freeBusyRequests = () => google.state.requests.filter((request) => request.url.pathname.endsWith('/freeBusy'));

  // After the top-level beforeEach: the owner connects, with a Monday and Sunday schedule
  beforeEach(async () => {
    await connectOwner();
    // Past the 24 hours of minimum notice, wherever today falls in the week
    const start = addDays(horizon().first, 3);
    offMonday = nextWeekday(1, start);
    extraWednesday = nextWeekday(3, start);
    busySunday = nextWeekday(0, addDays(start, 7));
    const schedule = await AppointmentSchedule.create({
      ...scheduleBody({
        availability: [1, 0].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '12:00' })),
        dateOverrides: [
          { date: offMonday, available: false },
          { date: extraWednesday, available: true, windows: [{ startTime: '14:00', endTime: '16:00' }] }
        ]
      }),
      user: owner.userId
    });
    scheduleId = schedule._id.toString();
  });

  it('lists exactly the dates available-slots has slots for, with one FreeBusy call', async () => {
    const { first, last } = horizon();
    // The three Mondays after the one off: offMonday is at most 9 days away, the third one 30
    const mondays = [7, 14, 21].map((days) => addDays(offMonday, days));
    expect(mondays.every((monday) => weekday(monday) === 1 && monday <= last)).toBe(true);
    google.state.busy = [
      // All of a Sunday in Paris
      { start: midnight(busySunday), end: midnight(addDays(busySunday, 1)) },
      // Part of the next Monday
      { start: at('09:00', mondays[0]), end: at('11:00', mondays[0]) },
      // From a Sunday morning to the Monday morning after it
      { start: at('10:00', addDays(mondays[1], -1)), end: at('10:00', mondays[1]) },
      // All the slots of a Monday, in pieces
      { start: at('08:00', mondays[2]), end: at('10:00', mondays[2]) },
      { start: at('10:00', mondays[2]), end: at('12:30', mondays[2]) }
    ];

    const before = freeBusyRequests().length;
    const listed = await availableDates(first, last);
    expect(listed.status).toBe(200);
    expect(listed.json<{ horizon: unknown }>().horizon).toEqual({ first, last });
    const dates = datesOf(listed);
    expect(freeBusyRequests()).toHaveLength(before + 1);
    expect(JSON.parse(freeBusyRequests().at(-1)?.body ?? '{}')).toMatchObject({
      timeMin: midnight(first),
      timeMax: midnight(addDays(last, 1)),
      items: [{ id: PRIMARY_CALENDAR }]
    });

    expect(dates).toEqual([...dates].sort());
    expect(dates).toContain(extraWednesday);
    expect(dates).not.toContain(offMonday);
    expect(dates).not.toContain(busySunday);
    expect(dates).toContain(mondays[0]);
    expect(dates).toContain(mondays[1]);
    expect(dates).not.toContain(mondays[2]);
    // Past the minimum notice, every Monday and Sunday but those
    const expected: string[] = [];
    for (let date = addDays(first, 2); date <= last; date = addDays(date, 1)) {
      if ((weekday(date) <= 1 && ![offMonday, busySunday, mondays[2]].includes(date)) || date === extraWednesday) {
        expected.push(date);
      }
    }
    expect(dates.filter((date) => date >= addDays(first, 2))).toEqual(expected);

    // Every date of the horizon, either way
    for (let date = first; date <= last; date = addDays(date, 1)) {
      const slots = await availableSlots(date);
      expect(slots.status).toBe(200);
      expect({ date, bookable: slots.json<unknown[]>().length > 0 }).toEqual({ date, bookable: dates.includes(date) });
    }
  });

  it('clamps the range to the booking horizon, without asking Google outside it', async () => {
    const { first, last } = horizon();

    const fromThePast = await availableDates(addDays(first, -10), addDays(first, 20));
    expect(fromThePast.status).toBe(200);
    expect(datesOf(fromThePast).every((date) => date >= first)).toBe(true);
    expect(JSON.parse(freeBusyRequests().at(-1)?.body ?? '{}').timeMin).toBe(midnight(first));

    // Six days hold a Monday or a Sunday
    const pastTheEnd = await availableDates(addDays(last, -5), addDays(last, 20));
    expect(datesOf(pastTheEnd).length).toBeGreaterThan(0);
    expect(datesOf(pastTheEnd).every((date) => date <= last)).toBe(true);
    expect(JSON.parse(freeBusyRequests().at(-1)?.body ?? '{}').timeMax).toBe(midnight(addDays(last, 1)));

    const before = freeBusyRequests().length;
    for (const [from, to] of [
      [addDays(first, -40), addDays(first, -1)],
      [addDays(last, 1), addDays(last, 30)]
    ]) {
      const outside = await availableDates(from, to);
      expect(outside.status).toBe(200);
      // The horizon still: the page learns it from any answer
      expect(outside.json()).toEqual({ horizon: { first, last }, dates: [] });
    }
    expect(freeBusyRequests()).toHaveLength(before);
  });

  it("starts the range today by the API's clock without `from`, and makes it as long as allowed without `to`", async () => {
    const { first, last } = horizon();
    const asked = (query: string, id = scheduleId) => call('GET', `/appointments/available-dates?scheduleId=${id}${query}`);
    const lastFreeBusy = () => JSON.parse(freeBusyRequests().at(-1)?.body ?? '{}');

    // What the booking page asks first: the visitor's clock plays no part
    const head = await asked('');
    expect(head.status).toBe(200);
    expect(head.json<{ horizon: unknown }>().horizon).toEqual({ first, last });
    expect(datesOf(head)).toEqual(datesOf(await availableDates(first, last)));
    expect(datesOf(head)).toContain(extraWednesday);

    // A horizon longer than one range: the first answer covers its first 62 dates, and the rest is asked for
    const far = await AppointmentSchedule.create({
      ...scheduleBody({ maxAdvanceDays: 200 }),
      user: owner.userId
    });
    const farHead = await asked('', far.id);
    expect(farHead.json<{ horizon: unknown }>().horizon).toEqual({ first, last: addDays(first, 200) });
    expect(lastFreeBusy()).toMatchObject({
      timeMin: midnight(first),
      timeMax: midnight(addDays(first, MAX_AVAILABLE_DATES_RANGE))
    });
    expect(datesOf(farHead).at(-1)).toBe(addDays(first, MAX_AVAILABLE_DATES_RANGE - 1));
    const next = addDays(first, MAX_AVAILABLE_DATES_RANGE);
    const rest = await asked(`&from=${next}`, far.id);
    expect(datesOf(rest)[0]).toBe(next);
    expect(lastFreeBusy()).toMatchObject({
      timeMin: midnight(next),
      timeMax: midnight(addDays(next, MAX_AVAILABLE_DATES_RANGE))
    });

    // `to` alone: from today
    expect(datesOf(await asked(`&to=${addDays(first, 9)}`))).toEqual(
      datesOf(head).filter((date) => date <= addDays(first, 9))
    );
    const tooLong = await asked(`&to=${addDays(first, MAX_AVAILABLE_DATES_RANGE)}`);
    expect([tooLong.status, tooLong.text]).toEqual([400, `At most ${MAX_AVAILABLE_DATES_RANGE} dates per request`]);
  });

  it('validates the range, and refuses impossible dates on available-slots too', async () => {
    const { first } = horizon();
    const before = google.state.requests.length;

    expect((await availableDates('tomorrow', first)).status).toBe(422);
    expect((await availableDates(first, first, 'not-an-id')).status).toBe(422);
    expect((await call('GET', `/appointments/available-dates?from=${first}&to=${first}`)).status).toBe(422);

    for (const [from, to, message] of [
      ['2027-02-30', '2027-03-02', 'Invalid date'],
      [first, '2027-13-01', 'Invalid date'],
      [addDays(first, 1), first, 'The range must not end before it starts'],
      [first, addDays(first, MAX_AVAILABLE_DATES_RANGE), `At most ${MAX_AVAILABLE_DATES_RANGE} dates per request`]
    ]) {
      const refused = await availableDates(from, to);
      expect({ from, to, status: refused.status, text: refused.text }).toEqual({ from, to, status: 400, text: message });
    }
    // It used to answer with the slots of 2 March
    const impossible = await availableSlots('2027-02-30');
    expect([impossible.status, impossible.text]).toEqual([400, 'Invalid date']);
    expect(google.state.requests).toHaveLength(before);

    expect((await availableDates(first, addDays(first, MAX_AVAILABLE_DATES_RANGE - 1))).status).toBe(200);
  });

  it('answers like available-slots for a paused or unknown schedule and a disconnected calendar', async () => {
    const { first, last } = horizon();
    const paused = await AppointmentSchedule.create({ ...scheduleBody({ enabled: false }), user: owner.userId });
    const answers = async (id: string) => {
      const [dates, slots] = await Promise.all([availableDates(first, last, id), availableSlots(first, id)]);
      return [`${dates.status} ${dates.text}`, `${slots.status} ${slots.text}`];
    };

    expect(await answers(paused.id)).toEqual(['404 Schedule not found', '404 Schedule not found']);
    expect(await answers(new mongoose.Types.ObjectId().toString())).toEqual([
      '404 Schedule not found',
      '404 Schedule not found'
    ]);

    expect((await call('POST', '/appointments/disconnect', { body: {}, cookie: owner.cookie })).status).toBe(200);
    expect(await answers(scheduleId)).toEqual(['409 Google Calendar not connected', '409 Google Calendar not connected']);
  });

  it('counts a booking whose event is being created as busy, and no other', async () => {
    const monday = nextWeekday(1, addDays(offMonday, 1));
    const { first, last } = horizon();
    const isListed = async () => datesOf(await availableDates(first, last)).includes(monday);
    const slotsOfMonday = async () => (await availableSlots(monday)).json<unknown[]>().length;
    expect(await isListed()).toBe(true);

    // Another schedule of the owner holds the whole morning: its request is creating the event
    const booking = await AppointmentBooking.create({
      schedule: new mongoose.Types.ObjectId(),
      user: owner.userId,
      calendarId: 'work@example.com',
      start: new Date(at('09:00', monday)),
      end: new Date(at('12:00', monday)),
      emailHash: 'hash'
    });
    expect(await isListed()).toBe(false);
    expect(await slotsOfMonday()).toBe(0);

    // Held long ago: its request stopped, and Google has no event for it
    await AppointmentBooking.updateOne({ _id: booking._id }, { $set: { heldAt: new Date(Date.now() - 60 * 60_000) } });
    expect(await isListed()).toBe(true);
    expect(await slotsOfMonday()).toBe(3);

    // Confirmed: FreeBusy reports its event while it exists (here, the owner deleted it)
    await AppointmentBooking.updateOne({ _id: booking._id }, { $set: { eventId: 'deleted', heldAt: new Date() } });
    expect(await isListed()).toBe(true);
  });

  it('does not count availability lookups against the booking rate limit', async () => {
    const savedHeader = env.CLIENT_IP_HEADER;
    env.CLIENT_IP_HEADER = 'x-real-ip';
    try {
      const group = () => Math.floor(Math.random() * 0x10000).toString(16);
      const headers = { 'X-Real-IP': `2001:db8:${group()}:${group()}::1` };
      const { first, last } = horizon();

      let dates: string[] = [];
      for (let i = 0; i <= BOOKING_REQUESTS_PER_IP.limit; i++) {
        const listed = await availableDates(first, last, scheduleId, headers);
        expect(listed.status).toBe(200);
        dates = datesOf(listed);
        expect((await availableSlots(dates[0], scheduleId, headers)).status).toBe(200);
      }

      const [slot] = (await availableSlots(dates[0], scheduleId, headers)).json<{ start: string }[]>();
      const booked = await call('POST', '/appointments/book', {
        body: { scheduleId, startTime: slot.start, name: 'Visitor', email: t.email('browser') },
        headers
      });
      expect(booked.status).toBe(200);
      const counter = await RateLimitCounter.findOne({
        _id: { $regex: `^${rateLimitKey('book:ip', rateLimitAddress(headers['X-Real-IP']))}:` }
      }).lean();
      expect(counter?.count).toBe(1);
    } finally {
      env.CLIENT_IP_HEADER = savedHeader;
    }
  });

  it('rate limits availability lookups per IP address, both routes together, before asking Google', async () => {
    const savedHeader = env.CLIENT_IP_HEADER;
    env.CLIENT_IP_HEADER = 'x-real-ip';
    try {
      const group = () => Math.floor(Math.random() * 0x10000).toString(16);
      const network = `2001:db8:${group()}:${group()}`;
      const fromNetwork = (host: number) => ({ 'X-Real-IP': `${network}::${host.toString(16)}` });
      const { first, last } = horizon();
      // Past the horizon: answered without asking Google
      const outside = addDays(last, 1);

      // Per IP (IPv6: per /64), whatever the outcome
      for (let i = 1; i <= AVAILABILITY_REQUESTS_PER_IP.limit; i++) {
        const lookup = i % 2
          ? availableDates(outside, outside, scheduleId, fromNetwork(i))
          : availableSlots(outside, scheduleId, fromNetwork(i));
        expect((await lookup).status).toBe(200);
      }
      const before = freeBusyRequests().length;
      for (const limited of [
        await availableDates(first, last, scheduleId, fromNetwork(0xffff)),
        await availableSlots(first, scheduleId, fromNetwork(0xffff))
      ]) {
        expect(limited.status).toBe(429);
        expect(limited.text).toStartWith('Too many requests from your network. Try again in ');
        expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
      }
      expect(freeBusyRequests()).toHaveLength(before);

      // Another network is not affected, and booking from this one is counted on its own
      const otherNetwork = { 'X-Real-IP': `2001:db8:${group()}:${group()}::1` };
      const [date] = datesOf(await availableDates(first, last, scheduleId, otherNetwork));
      const [slot] = (await availableSlots(date, scheduleId, otherNetwork)).json<{ start: string }[]>();
      const booked = await call('POST', '/appointments/book', {
        body: { scheduleId, startTime: slot.start, name: 'Visitor', email: t.email('limited-network') },
        headers: fromNetwork(1)
      });
      expect(booked.status).toBe(200);
    } finally {
      env.CLIENT_IP_HEADER = savedHeader;
    }
  });
});

// Production, 2026-11-01: Google answered invalid_grant to the stored refresh
// token, and every Calendar call failed with a 500 and a gaxios stack trace.
// The fake Google answers like the real one, so the error each test runs into
// is the GaxiosError google-auth-library really throws.
describe('a grant Google refuses', () => {
  let scheduleId: string;

  // After the top-level beforeEach: the owner connects, with an enabled schedule
  beforeEach(async () => {
    await connectOwner();
    scheduleId = (await AppointmentSchedule.create({ ...scheduleBody(), user: owner.userId }))._id.toString();
  });

  /** The stored access token has expired: the next Calendar call refreshes it first */
  const expireAccessToken = () =>
    User.updateOne({ _id: owner.userId }, { $set: { 'googleCalendar.tokenExpiry': new Date(Date.now() - 60_000) } });

  const refreshRequests = () =>
    google.state.requests.filter((request) => new URLSearchParams(request.body).get('grant_type') === 'refresh_token');

  /** Warn and error logs from here on (calls go through) */
  const spyLogs = () => ({ warn: spyOn(logger, 'warn'), error: spyOn(logger, 'error') });

  const expectWarnOnly = (logs: ReturnType<typeof spyLogs>, reason: string, route: string) => {
    expect(logs.error).not.toHaveBeenCalled();
    expect(logs.warn).toHaveBeenCalledWith('Google refused the stored Google Calendar grant: connection cleared', { reason });
    expect(logs.warn).toHaveBeenCalledWith(RECONNECT_REQUIRED_MESSAGE, expect.objectContaining({ status: 409, route }));
    for (const [, attributes] of logs.warn.mock.calls) expect(attributes).not.toHaveProperty('stack');
  };

  /** Tokens gone, the date Google refused them kept, and the admin panel told so */
  const expectReconnectRequired = async () => {
    expect((await storedTokens(owner.userId).lean())?.googleCalendar).toEqual({ revokedAt: expect.any(Date) });
    const status = await call('GET', '/appointments/calendar-status', { cookie: owner.cookie });
    expect(status.json()).toEqual({ configured: true, connected: false, connectedAt: null, revokedAt: expect.any(String) });
  };

  it('clears the connection on invalid_grant and answers 409 Reconnect, logged at warn without a stack', async () => {
    await expireAccessToken();
    const refused = (await storedTokens(owner.userId))?.googleCalendar?.refreshToken;
    google.revokeGrant();
    const logs = spyLogs();

    const calendars = await call('GET', '/appointments/calendars', { cookie: owner.cookie });
    expect(calendars.status).toBe(409);
    expect(calendars.text).toBe(RECONNECT_REQUIRED_MESSAGE);
    // Refused at the refresh: the Calendar API was never called
    expect(refreshRequests()).toHaveLength(1);
    expect(google.state.requests.some((request) => request.url.pathname.startsWith('/calendar/'))).toBe(false);
    // Revoked at Google as well (already gone there: its 400 is ignored)
    expect(google.state.revokeRequests).toEqual([refused ?? 'missing']);

    expectWarnOnly(logs, 'invalid_grant', '/appointments/calendars');
    await expectReconnectRequired();

    // From now on: not connected, without asking Google again
    const asked = google.state.requests.length;
    const again = await call('GET', '/appointments/calendars', { cookie: owner.cookie });
    expect(again.status).toBe(409);
    expect(again.text).toBe('Google Calendar not connected');
    // Visitors are offered nothing
    expect((await call('GET', `/appointments/domains/${t.id('domain')}/schedules`)).json()).toEqual([]);
    expect((await call('GET', `/appointments/available-slots?scheduleId=${scheduleId}&date=${BOOKING_DATE}`)).status).toBe(409);
    expect(google.state.requests).toHaveLength(asked);
    expect(logs.error).not.toHaveBeenCalled();
  });

  it('connects again after a refused grant', async () => {
    await expireAccessToken();
    google.revokeGrant();
    expect((await call('GET', '/appointments/upcoming', { cookie: owner.cookie })).status).toBe(409);

    const reconnect = await call('POST', '/appointments/connect', { body: { code: 'code-2' }, cookie: owner.cookie });
    expect(reconnect.status).toBe(200);
    const status = await call('GET', '/appointments/calendar-status', { cookie: owner.cookie });
    expect(status.json()).toMatchObject({ configured: true, connected: true, revokedAt: null });
    expect((await storedTokens(owner.userId).lean())?.googleCalendar?.revokedAt).toBeUndefined();
    expect((await call('GET', '/appointments/calendars', { cookie: owner.cookie })).status).toBe(200);
  });

  it('revokes a cleared grant Google still holds, so the next consent issues a refresh token', async () => {
    // Only the access token is refused: the grant is still alive at Google
    const stored = (await storedTokens(owner.userId))?.googleCalendar?.refreshToken ?? 'missing';
    google.state.accessTokens.clear();

    expect((await call('GET', '/appointments/calendars', { cookie: owner.cookie })).status).toBe(409);
    expect(google.state.revokeRequests).toEqual([stored]);
    expect(google.state.refreshTokens.has(stored)).toBe(false);
    await expectReconnectRequired();
  });

  it('treats a 401 from the Calendar API (access token revoked with its grant) the same way', async () => {
    // The stored access token has not expired: it is sent as is, and refused
    google.revokeGrant();
    const logs = spyLogs();

    const upcoming = await call('GET', '/appointments/upcoming', { cookie: owner.cookie });
    expect(upcoming.status).toBe(409);
    expect(upcoming.text).toBe(RECONNECT_REQUIRED_MESSAGE);
    expect(refreshRequests()).toHaveLength(0);

    expectWarnOnly(logs, 'unauthenticated', '/appointments/upcoming');
    await expectReconnectRequired();
  });

  it('releases the booking when Google refuses the grant at the event insert', async () => {
    const slot = at('09:00');
    google.state.nextInsert = 'unauthenticated';
    const logs = spyLogs();

    const booked = await call('POST', '/appointments/book', {
      body: { scheduleId, startTime: slot, name: 'Visitor', email: t.email('visitor') }
    });
    expect(booked.status).toBe(409);
    // Google created nothing: the slot is not held
    expect(await AppointmentBooking.find({ user: owner.userId, start: new Date(slot) }).lean()).toEqual([]);
    expect(google.state.events.size).toBe(0);

    expectWarnOnly(logs, 'unauthenticated', '/appointments/book');
    await expectReconnectRequired();
  });

  it.each([
    ['with a new refresh token', 'code-2'],
    // Google sends no refresh token on a repeated consent: the stored one is kept
    ['keeping the stored refresh token', 'code-without-refresh']
  ])('keeps a grant the owner connected (%s) while a request was refused with the previous one', async (_, code) => {
    await expireAccessToken();
    let release = () => {};
    google.state.refreshGate = new Promise<void>((resolve) => (release = resolve));
    const pending = call('GET', '/appointments/calendars', { cookie: owner.cookie });
    for (let i = 0; i < 200 && google.state.refreshGate; i++) await Bun.sleep(5);
    expect(google.state.refreshGate).toBeNull();

    // Meanwhile the old grant dies and the owner connects again
    google.revokeGrant();
    expect((await call('POST', '/appointments/connect', { body: { code }, cookie: owner.cookie })).status).toBe(200);
    const reconnected = (await storedTokens(owner.userId))?.googleCalendar?.refreshToken;

    release();
    expect((await pending).status).toBe(409);
    // The new grant stays, and is not revoked
    expect((await storedTokens(owner.userId))?.googleCalendar?.refreshToken).toBe(reconnected ?? 'missing');
    expect(google.state.revokeRequests).toEqual([]);
    const status = await call('GET', '/appointments/calendar-status', { cookie: owner.cookie });
    expect(status.json()).toMatchObject({ connected: true, revokedAt: null });
    expect((await call('GET', '/appointments/calendars', { cookie: owner.cookie })).status).toBe(200);
  });

  it('does not take a wrong client secret (invalid_client) for a refused grant', async () => {
    await expireAccessToken();
    const before = (await storedTokens(owner.userId))?.googleCalendar?.refreshToken;
    // A server fault: reconnecting would not fix it, so it stays a logged 500
    env.GOOGLE_CLIENT_SECRET = 'GOCSPX-wrong-secret';
    try {
      const logs = spyLogs();
      const calendars = await call('GET', '/appointments/calendars', { cookie: owner.cookie });
      expect(calendars.status).toBe(500);
      expect(logs.error).toHaveBeenCalled();
    } finally {
      env.GOOGLE_CLIENT_SECRET = TEST_CLIENT_SECRET;
    }
    expect((await storedTokens(owner.userId))?.googleCalendar?.refreshToken).toBe(before ?? 'missing');
    const status = await call('GET', '/appointments/calendar-status', { cookie: owner.cookie });
    expect(status.json()).toMatchObject({ connected: true, revokedAt: null });
  });
});

describe('no Google token in any API response', () => {
  it('calls every route with valid input and finds the tokens in none of the responses', async () => {
    const first = responses.length;
    const sweepDomain = t.id('domain-sweep');
    const sweep = await login('sweep');
    const auth = { cookie: sweep.cookie };

    // Connected first, so every route below answers while tokens are stored
    // (including /login, called again)
    expect((await call('POST', '/appointments/connect', { ...auth, body: { code: 'code-sweep' } })).status).toBe(200);
    const stored = await storedTokens(sweep.userId);
    expect(google.state.refreshTokens.has(stored?.googleCalendar?.refreshToken ?? '')).toBe(true);

    await login('sweep');
    expect((await call('GET', '/isLogged', auth)).status).toBe(200);
    expect((await call('GET', '/health')).status).toBe(200);
    expect((await call('POST', '/domain/claim', { ...auth, body: { name: sweepDomain } })).status).toBe(200);
    expect((await call('GET', '/appointments/calendar-status', auth)).status).toBe(200);

    expect((await call('GET', `/domain/${sweepDomain}`)).status).toBe(200);
    expect((await call('PUT', `/domain/${sweepDomain}`, { ...auth, body: { headerTitle: 'Sweep' } })).status).toBe(200);

    const project = {
      ...experienceRequestBody.projects[0],
      hardSkills: [{ name: t.id('skill-hard'), level: -1 }],
      softSkills: [{ name: t.id('skill-soft'), level: -1 }]
    };
    const experience = await call('POST', '/experiences', { ...auth, body: { ...experienceRequestBody, projects: [project] } });
    expect(experience.status).toBe(200);
    expect(
      (await call('PUT', `/experiences/${experience.json()._id}`, {
        ...auth,
        body: { ...experienceRequestBody, title: 'Staff Engineer', projects: [project] }
      })).status
    ).toBe(200);
    expect((await call('DELETE', `/experiences/${experience.json()._id}`, auth)).status).toBe(200);

    // Meeting only: the anonymous availability and booking calls below stay open
    expect((await call('PUT', '/workflow', { ...auth, body: { steps: [{ type: 'meeting' }] } })).status).toBe(200);
    expect((await call('GET', '/workflow', auth)).status).toBe(200);
    expect((await call('GET', `/workflow/domains/${sweepDomain}`, auth)).status).toBe(200);

    // Résumé import (tests/resumeImport.test.ts covers it): its two requests,
    // to api.anthropic.com, are answered here instead of by the fake Google
    const savedAnthropicKey = env.ANTHROPIC_API_KEY;
    const savedGlobalKey = resumeImportCounters.globalKey;
    env.ANTHROPIC_API_KEY = 'sk-ant-api03-sweep-test-key';
    resumeImportCounters.globalKey = `resume-import:global:${t.id('sweep')}`;
    rateLimitKeys.add(resumeImportCounters.globalKey);
    rateLimitKeys.add(resumeImportUserKey(sweep.userId));
    rateLimitKeys.add(resumeImportAttemptsKey(sweep.userId));
    try {
      const fetchSpy = globalThis.fetch as unknown as Mock<(input: string | URL | Request) => Promise<Response>>;
      fetchSpy.mockImplementationOnce(async () => Response.json({ input_tokens: 1_000 }));
      // The paid call is streamed
      fetchSpy.mockImplementationOnce(async () =>
        messageStream({
          id: 'msg_sweep',
          type: 'message',
          role: 'assistant',
          model: 'claude-haiku-5-5',
          content: [{ type: 'text', text: '{"experiences":[],"unplacedSkills":[]}' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1_000, output_tokens: 20 }
        })
      );
      expect((await call('GET', '/experiences/import', auth)).status).toBe(200);
      const pdf = Buffer.from('%PDF-1.7\n%%EOF\n').toString('base64');
      expect((await call('POST', '/experiences/import', { ...auth, body: { file: pdf } })).status).toBe(200);
    } finally {
      env.ANTHROPIC_API_KEY = savedAnthropicKey;
      resumeImportCounters.globalKey = savedGlobalKey;
    }

    // Account spaces (tests/account.test.ts covers them)
    expect((await call('GET', '/me', auth)).status).toBe(200);
    expect((await call('PUT', '/me/mode', { ...auth, body: { mode: 'recruiter' } })).status).toBe(200);

    // Job description import (tests/jobImport.test.ts covers it), answered
    // like the résumé import's
    const savedJobImportKey = jobImportCounters.globalKey;
    env.ANTHROPIC_API_KEY = 'sk-ant-api03-sweep-test-key';
    jobImportCounters.globalKey = `job-import:global:${t.id('sweep')}`;
    rateLimitKeys.add(jobImportCounters.globalKey);
    rateLimitKeys.add(jobImportAttemptsKey(sweep.userId));
    try {
      const fetchSpy = globalThis.fetch as unknown as Mock<(input: string | URL | Request) => Promise<Response>>;
      fetchSpy.mockImplementationOnce(async () => Response.json({ input_tokens: 1_000 }));
      fetchSpy.mockImplementationOnce(async () =>
        messageStream({
          id: 'msg_sweep_job',
          type: 'message',
          role: 'assistant',
          model: 'claude-haiku-5-5',
          content: [{ type: 'text', text: '{}' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1_000, output_tokens: 20 }
        })
      );
      expect((await call('GET', '/jobs/import', auth)).status).toBe(200);
      const pdf = Buffer.from('%PDF-1.7\n%%EOF\n').toString('base64');
      expect((await call('POST', '/jobs/import', { ...auth, body: { file: pdf } })).status).toBe(200);
    } finally {
      env.ANTHROPIC_API_KEY = savedAnthropicKey;
      jobImportCounters.globalKey = savedJobImportKey;
    }

    // Job postings and their applicants (tests/jobs.test.ts covers them)
    const jobBody = {
      title: 'Backend engineer',
      description: 'Build the billing service',
      status: 'open',
      location: { country: 'FR', city: 'Lyon', workMode: 'on_site' },
      contract: { type: 'cdi' },
      workingTime: { arrangement: 'weekly_hours', hoursPerWeek: 35 },
      pay: { min: 45_000, max: 55_000, currency: 'EUR', period: 'year' }
    };
    const job = await call('POST', '/jobs', { ...auth, body: jobBody });
    expect(job.status).toBe(200);
    const jobId = job.json()._id as string;
    expect((await call('PUT', `/jobs/${jobId}`, { ...auth, body: { ...jobBody, title: 'Staff engineer' } })).status).toBe(200);
    expect((await call('PUT', `/jobs/${jobId}/status`, { ...auth, body: { status: 'open' } })).status).toBe(200);
    expect((await call('GET', '/jobs')).status).toBe(200);
    expect((await call('GET', `/jobs/${jobId}`)).status).toBe(200);
    expect((await call('GET', '/recruiter/jobs', auth)).status).toBe(200);
    expect((await call('GET', `/recruiter/jobs/${jobId}`, auth)).status).toBe(200);
    const added = await call('POST', `/jobs/${jobId}/applicants`, { ...auth, body: { domain: t.id('domain') } });
    expect(added.status).toBe(200);
    expect((await call('DELETE', `/jobs/${jobId}/applicants/${added.json()._id}`, auth)).status).toBe(200);
    // The job step of the owner's hiring journey (tests/workflows.test.ts covers it)
    expect((await call('PUT', '/workflow', { cookie: owner.cookie, body: workflowRequestBody })).status).toBe(200);
    expect((await call('PUT', `/workflow/domains/${t.id('domain')}/job`, { ...auth, body: { jobId } })).status).toBe(200);
    const candidate = { cookie: owner.cookie };
    expect((await call('GET', `/jobs/${jobId}/application`, candidate)).status).toBe(200);
    expect((await call('POST', `/jobs/${jobId}/application`, { ...candidate, body: {} })).status).toBe(200);
    expect((await call('DELETE', `/jobs/${jobId}/application`, candidate)).status).toBe(200);
    expect((await call('DELETE', `/jobs/${jobId}`, auth)).status).toBe(200);

    expect((await call('GET', '/appointments/calendars', auth)).status).toBe(200);

    const schedule = await call('POST', '/appointments/schedules', { ...auth, body: scheduleBody() });
    expect(schedule.status).toBe(200);
    const scheduleId = schedule.json()._id as string;
    expect((await call('PUT', `/appointments/schedules/${scheduleId}`, { ...auth, body: scheduleBody() })).status).toBe(200);
    expect((await call('GET', '/appointments/schedules', auth)).status).toBe(200);

    google.state.busy = [];
    expect((await call('GET', `/appointments/domains/${sweepDomain}/schedules`)).status).toBe(200);
    expect((await call('GET', `/appointments/schedules/${scheduleId}/public`)).status).toBe(200);
    expect((await call('GET', `/appointments/available-slots?scheduleId=${scheduleId}&date=${BOOKING_DATE}`)).status).toBe(200);
    expect(
      (await call('GET', `/appointments/available-dates?scheduleId=${scheduleId}&from=${BOOKING_DATE}&to=${dateIn(14)}`)).status
    ).toBe(200);
    const booked = await call('POST', '/appointments/book', {
      body: { scheduleId, startTime: at('11:00'), name: 'Sweep', email: t.email('sweep-visitor') }
    });
    expect(booked.status).toBe(200);

    const upcoming = await call('GET', '/appointments/upcoming', auth);
    expect(upcoming.status).toBe(200);
    const [event] = upcoming.json<{ id: string; calendarId: string }[]>();
    expect(
      (await call('DELETE', `/appointments/events/${event.id}?calendarId=${encodeURIComponent(event.calendarId)}`, auth)).status
    ).toBe(200);
    expect((await call('DELETE', `/appointments/schedules/${scheduleId}`, auth)).status).toBe(200);
    expect((await call('GET', '/logout', auth)).status).toBe(200);
    // Last: the tokens are gone after it
    expect((await call('POST', '/appointments/disconnect', { ...auth, body: {} })).status).toBe(200);

    const swept = responses.slice(first);

    // Every API route answered at least once with a 2xx: a new route fails
    // this test until it is added above
    const routes = createApp()
      .routes.filter((route) => route.method !== 'OPTIONS' && !route.path.startsWith('/swagger'))
      .map((route) => ({
        name: `${route.method} ${route.path}`,
        pattern: new RegExp(`^${route.path.replace(/:[^/]+/g, '[^/]+')}$`),
        method: route.method
      }));
    const uncovered = routes
      .filter(
        (route) =>
          !swept.some(
            (response) =>
              response.method === route.method &&
              response.status >= 200 &&
              response.status < 300 &&
              route.pattern.test(response.path.split('?')[0])
          )
      )
      .map((route) => route.name);
    expect(uncovered).toEqual([]);

    // Neither token, in any body or header of this suite so far (afterEach
    // also checks each test's own responses, whatever the order)
    expect(google.state.refreshTokens.size).toBeGreaterThan(0);
    expect(google.state.accessTokens.size).toBeGreaterThan(0);
    expect(tokenLeaks(responses)).toEqual([]);
  });
});
