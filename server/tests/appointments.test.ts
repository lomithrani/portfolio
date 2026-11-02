// Appointments (Google Calendar) against a real MongoDB (MONGO_URL, which must
// be local or come from TEST_MONGO_URL). Google is faked at the fetch layer:
// the real @googleapis/calendar and google-auth-library clients build every
// request, so tokens really go from the database to Google, and nowhere else.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import mongoose from 'mongoose';
import { env } from '../env';
import { createApp } from '../app';
import {
  AppointmentBooking,
  AppointmentSchedule,
  Domain,
  Experience,
  RateLimitCounter,
  Skill,
  User,
  Workflow
} from '../models/database';
import {
  BOOKING_REQUESTS_PER_EMAIL,
  BOOKING_REQUESTS_PER_IP,
  MAX_UPCOMING_BOOKINGS_PER_EMAIL,
  normalizeEmail
} from '../services/appointmentBookings';
import { rateLimitAddress } from '../services/clientAddress';
import { CALENDAR_SCOPE } from '../services/googleCalendar';
import { rateLimitKey } from '../services/rateLimit';
import { wallClockToUTC } from '../services/slotComputation';
import {
  experienceRequestBody,
  parseCookie,
  signGoogleIdToken,
  useTestGoogleKeys,
  workflowRequestBody
} from './helpers';
import { assertDisposableDatabase } from './testDatabase';

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const id = (name: string) => `ap-${name}-${suffix}`;
const emails = ['owner', 'other', 'sweep'].map((name) => `${id(name)}@example.com`);
const [OWNER_EMAIL, OTHER_EMAIL, SWEEP_EMAIL] = emails;
const OWNER_DOMAIN = id('domain');
const SWEEP_DOMAIN = id('domain-sweep');
const SKILL_NAMES = [id('skill-hard'), id('skill-soft')];
/** Visitor emails: unique per run, as the per-email rate limit outlives the suite */
const visitor = (name: string) => `${id(name)}@example.com`;
const JANE_EMAIL = visitor('jane');

const TEST_CLIENT_SECRET = 'GOCSPX-test-client-secret';
const PRIMARY_CALENDAR = `${id('calendar')}@example.com`;
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

const createFakeGoogle = () => {
  let counter = 0;
  const state = {
    /** Every token Google issued: none may ever appear in an API response */
    issuedTokens: new Set<string>(),
    accessTokens: new Set<string>(),
    refreshTokens: new Set<string>(),
    busy: [] as { start: string; end: string }[],
    events: new Map<string, FakeEvent>(),
    requests: [] as GoogleRequest[],
    /** Outcome of the next event insert: refused (403), or created with its response lost */
    nextInsert: 'ok' as 'ok' | 'rejected' | 'response-lost',
    /** One-shot: the next lookup of an event id waits for its promise */
    gates: new Map<string, Promise<void>>()
  };

  const issue = (kind: 'access' | 'refresh') => {
    const token = `${kind}-token-${suffix}-${++counter}`;
    state.issuedTokens.add(token);
    (kind === 'access' ? state.accessTokens : state.refreshTokens).add(token);
    return token;
  };

  const tokenEndpoint = (body: string) => {
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
      if (!state.refreshTokens.has(params.get('refresh_token') ?? '')) {
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      }
      return Response.json({ access_token: issue('access'), expires_in: 3599, scope: CALENDAR_SCOPE, token_type: 'Bearer' });
    }
    return Response.json({ error: 'unsupported_grant_type' }, { status: 400 });
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
      if (recorded.url.origin === 'https://www.googleapis.com' && recorded.url.pathname.startsWith('/calendar/v3/')) {
        return calendarApi(recorded);
      }
      throw new Error(`Unexpected request to ${recorded.method} ${recorded.url}`);
    }) as typeof fetch);
  };

  return { state, install };
};

const google = createFakeGoogle();

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
/** Rate limit counters the booking requests touched, deleted after the suite */
const rateLimitKeys = new Set<string>();

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

const login = async (sub: string, email: string) => {
  const result = await call('POST', '/login', {
    body: { token: await signGoogleIdToken({ claims: { sub, email } }) }
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

let owner: { cookie: string; userId: string };
let other: { cookie: string; userId: string };
const savedSecret = env.GOOGLE_CLIENT_SECRET;

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  // Indexes first: the unique (schedule, start) index is what refuses a second booking
  await Promise.all([User.init(), Domain.init(), AppointmentBooking.init(), RateLimitCounter.init()]);
  env.GOOGLE_CLIENT_SECRET = TEST_CLIENT_SECRET;
  env.googleCalendarEnabled = true;

  app = createApp();
  useTestGoogleKeys();
  owner = await login(id('sub-owner'), OWNER_EMAIL);
  other = await login(id('sub-other'), OTHER_EMAIL);
  expect((await call('POST', '/domain/claim', { body: { name: OWNER_DOMAIN }, cookie: owner.cookie })).status).toBe(200);
  mock.restore();
});

afterAll(async () => {
  env.GOOGLE_CLIENT_SECRET = savedSecret;
  env.googleCalendarEnabled = savedSecret !== undefined;
  if (mongoose.connection.readyState !== 1) return;
  const users = await User.find({ email: { $in: emails } });
  const userIds = users.map((user) => user._id);
  const domains = await Domain.find({ admin: { $in: userIds } });
  await Experience.deleteMany({ _id: { $in: domains.flatMap((domain) => domain.experiences.map(String)) } });
  await Domain.deleteMany({ _id: { $in: domains.map((domain) => domain._id) } });
  await AppointmentSchedule.deleteMany({ user: { $in: userIds } });
  await AppointmentBooking.deleteMany({ user: { $in: userIds } });
  if (rateLimitKeys.size > 0) {
    await RateLimitCounter.deleteMany({ _id: { $regex: `^(${[...rateLimitKeys].join('|')}):` } });
  }
  await Workflow.deleteMany({ user: { $in: userIds } });
  await Skill.deleteMany({ displayName: { $in: SKILL_NAMES } });
  await User.deleteMany({ _id: { $in: userIds } });
  await mongoose.disconnect();
});

beforeEach(() => {
  app = createApp();
  useTestGoogleKeys();
  google.install();
});

afterEach(() => {
  mock.restore();
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
      expect(status.json()).toEqual({ configured: false, connected: false, connectedAt: null });

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
      await User.findOne({ email: OWNER_EMAIL }),
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

  beforeAll(async () => {
    scheduleId = (await AppointmentSchedule.create({ ...scheduleBody(), user: owner.userId }))._id.toString();
    pausedId = (await AppointmentSchedule.create({ ...scheduleBody({ title: 'Paused', enabled: false }), user: owner.userId }))._id.toString();
  });

  it('lists the enabled schedules of a domain without private fields', async () => {
    const listed = await call('GET', `/appointments/domains/${OWNER_DOMAIN.toUpperCase()}/schedules`);
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
    expect((await call('GET', `/appointments/domains/${id('nope')}/schedules`)).status).toBe(404);
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
        body: { scheduleId, startTime, name: 'Jane Recruiter', email: JANE_EMAIL, notes: 'Hello' }
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
      attendees: [{ email: JANE_EMAIL }],
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
    const upcoming = await call('GET', '/appointments/upcoming', { cookie: owner.cookie });
    expect(upcoming.status).toBe(200);
    const [booking] = upcoming.json<{ id: string; calendarId: string; attendees: string[] }[]>();
    expect(booking).toMatchObject({ calendarId: PRIMARY_CALENDAR, attendees: [JANE_EMAIL] });

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
  const bookingsAt = (startTime: string) => AppointmentBooking.find({ start: new Date(startTime) }).lean();
  const eventsAt = (startTime: string) =>
    [...google.state.events.values()].filter((event) => event.start?.dateTime === startTime);

  it('books a slot once when two requests race for it', async () => {
    google.state.busy = [];
    const slot = at('10:00', dateIn(8));

    const results = await Promise.all([bookSlot(slot, visitor('racer-1')), bookSlot(slot, visitor('racer-2'))]);
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
    expect((await bookSlot(slot, visitor('racer-3'))).status).toBe(409);
    expect(eventsAt(slot)).toHaveLength(1);
  });

  it("refuses a slot overlapping another of the owner's bookings, whatever calendar id its schedule names", async () => {
    google.state.busy = [];
    // 'primary': the same calendar as PRIMARY_CALENDAR, by its alias
    const quick = await AppointmentSchedule.create({
      ...scheduleBody({ title: 'Quick chat', durationMinutes: 30, calendarId: 'primary' }),
      user: owner.userId
    });
    try {
      const date = dateIn(8);
      // 10:30-11:00 overlaps the 10:00-11:00 booked above; 11:00-11:30 does not
      expect((await bookSlot(at('10:30', date), visitor('quick-1'), quick.id)).status).toBe(409);
      expect((await bookSlot(at('11:00', date), visitor('quick-2'), quick.id)).status).toBe(200);
      expect(await AppointmentBooking.countDocuments({ schedule: quick._id })).toBe(1);
    } finally {
      await AppointmentSchedule.deleteOne({ _id: quick._id });
    }
  });

  it('makes a cancelled slot bookable again', async () => {
    google.state.busy = [];
    const slot = at('09:00', dateIn(9));
    const query = `?calendarId=${encodeURIComponent(PRIMARY_CALENDAR)}`;

    expect((await bookSlot(slot, visitor('first'))).status).toBe(200);
    expect((await bookSlot(slot, visitor('second'))).status).toBe(409);

    // Cancelled from the admin panel: the booking goes with the event
    const [first] = eventsAt(slot);
    expect((await call('DELETE', `/appointments/events/${first.id}${query}`, { cookie: owner.cookie })).status).toBe(200);
    expect(await bookingsAt(slot)).toEqual([]);
    expect((await bookSlot(slot, visitor('second'))).status).toBe(200);

    // Deleted in Google Calendar directly: the stale booking gives way once Google confirms the event is gone
    const [second] = eventsAt(slot);
    google.state.events.delete(second.id);
    expect((await bookSlot(slot, visitor('third'))).status).toBe(200);
    const [third] = eventsAt(slot);
    expect((await bookingsAt(slot)).map((booking) => booking.eventId)).toEqual([third.id]);

    // An abandoned reservation (the API stopped before creating the event) gives way after a while
    await AppointmentBooking.updateOne(
      { eventId: third.id },
      { $unset: { eventId: 1 }, $set: { heldAt: new Date(Date.now() - 60 * 60_000) } }
    );
    google.state.events.delete(third.id);
    expect((await bookSlot(slot, visitor('fourth'))).status).toBe(200);
    expect(await bookingsAt(slot)).toHaveLength(1);
  });

  it('releases a booking Google refused, and keeps one whose event Google may have created', async () => {
    google.state.busy = [];
    const date = dateIn(12);

    // Refused (403): no event, the slot is free again
    google.state.nextInsert = 'rejected';
    expect((await bookSlot(at('09:00', date), visitor('refused'))).status).toBe(500);
    expect(await bookingsAt(at('09:00', date))).toEqual([]);
    expect((await bookSlot(at('09:00', date), visitor('after-refusal'))).status).toBe(200);

    // Created, but the response was lost: the booking stays, pending
    const slot = at('10:00', date);
    google.state.nextInsert = 'response-lost';
    expect((await bookSlot(slot, visitor('lost'))).status).toBe(500);
    const [pending] = await bookingsAt(slot);
    expect(pending.eventId).toBeUndefined();
    expect(eventsAt(slot).map((event) => event.id)).toEqual([pending._id.toHexString()]);
    expect((await bookSlot(slot, visitor('retry'))).status).toBe(409);

    // Long after, as if the API had stopped: Google has the event under the
    // booking's id, so the booking keeps the slot, and now records it
    await AppointmentBooking.updateOne({ _id: pending._id }, { $set: { heldAt: new Date(Date.now() - 60 * 60_000) } });
    expect((await bookSlot(slot, visitor('later'))).status).toBe(409);
    expect((await AppointmentBooking.findById(pending._id).lean())?.eventId).toBe(pending._id.toHexString());
    expect(eventsAt(slot)).toHaveLength(1);
  });

  it('does not let a request take over a booking whose request is still running', async () => {
    google.state.busy = [];
    const slot = at('10:00', dateIn(13));
    const lease = await AppointmentSchedule.create({ ...scheduleBody({ title: 'Lease', durationMinutes: 30 }), user: owner.userId });
    try {
      // An earlier 10:00-10:30 booking of another schedule, whose event the owner deleted in Google Calendar
      expect((await bookSlot(slot, visitor('lease-earlier'), lease.id)).status).toBe(200);
      const [earlier] = eventsAt(slot);
      google.state.events.delete(earlier.id);

      // Request A (10:00-11:00) overlaps it, and its lookup of that event hangs
      let release = () => {};
      google.state.gates.set(earlier.id, new Promise<void>((resolve) => (release = resolve)));
      const a = bookSlot(slot, visitor('lease-a'));
      for (let i = 0; i < 200 && google.state.gates.has(earlier.id); i++) await Bun.sleep(5);
      expect(google.state.gates.has(earlier.id)).toBe(false);

      // Meanwhile A's booking looks abandoned (held long ago): request B takes it over, and books
      const [held] = await AppointmentBooking.find({ schedule: scheduleId, start: new Date(slot) }).lean();
      await AppointmentBooking.updateOne({ _id: held._id }, { $set: { heldAt: new Date(Date.now() - 60 * 60_000) } });
      expect((await bookSlot(slot, visitor('lease-b'))).status).toBe(200);

      // A resumes: it lost its hold, so it creates no second event
      release();
      expect((await a).status).toBe(409);
      expect(eventsAt(slot)).toHaveLength(1);
    } finally {
      await AppointmentSchedule.deleteOne({ _id: lease._id });
    }
  });

  it('caps the upcoming bookings of one email address on a schedule', async () => {
    google.state.busy = [];
    const date = dateIn(10);
    const mailbox = id('capped');
    // One mailbox, whatever the case or +tag
    const variants = [`${mailbox}@example.com`, `${mailbox}+b@Example.com`, `${mailbox.toUpperCase()}+c@example.com`];
    expect(MAX_UPCOMING_BOOKINGS_PER_EMAIL).toBe(2);

    expect((await bookSlot(at('09:00', date), variants[0])).status).toBe(200);
    expect((await bookSlot(at('10:00', date), variants[1])).status).toBe(200);
    const capped = await bookSlot(at('11:00', date), variants[2]);
    expect(capped.status).toBe(429);
    expect(capped.text).toContain('maximum number of upcoming bookings');
    // Refused before the invitation
    expect(eventsAt(at('11:00', date))).toEqual([]);

    // The owner deletes one of them in Google Calendar: it no longer counts
    google.state.events.delete(eventsAt(at('09:00', date))[0].id);
    expect((await bookSlot(at('11:00', date), variants[2])).status).toBe(200);
  });

  it('rate limits booking requests per IP address, and per email once the slot is free', async () => {
    const savedHeader = env.CLIENT_IP_HEADER;
    env.CLIENT_IP_HEADER = 'x-real-ip';
    try {
      google.state.busy = [];
      const slot = at('09:00', dateIn(11));
      const unknownSchedule = new mongoose.Types.ObjectId().toString();
      const book = (email: string, ip: string, id = unknownSchedule) =>
        call('POST', '/appointments/book', {
          body: { scheduleId: id, startTime: slot, name: 'Spammer', email },
          headers: { 'X-Real-IP': ip }
        });
      // A random IPv6 /64 per run: counters outlive the suite until their window ends
      const group = () => Math.floor(Math.random() * 0x10000).toString(16);
      const network = `2001:db8:${group()}:${group()}`;
      const anotherNetwork = () => `2001:db8:${group()}:${group()}::1`;

      // Per IP (IPv6: per /64), whatever the outcome (404 here)
      for (let i = 1; i <= BOOKING_REQUESTS_PER_IP.limit; i++) {
        expect((await book(visitor(`ip-${i}`), `${network}::${i}`)).status).toBe(404);
      }
      const limited = await book(visitor('ip-over'), `${network}:ffff::1`, scheduleId);
      // Refused before calling Google
      expect(google.state.requests).toEqual([]);
      expect(limited.status).toBe(429);
      expect(limited.text).toStartWith('Too many booking requests from your network. Try again in ');
      const retryAfter = Number(limited.headers.get('retry-after'));
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(BOOKING_REQUESTS_PER_IP.windowMs / 1000);
      // Another network is not affected
      expect((await book(visitor('ip-other'), anotherNetwork())).status).toBe(404);

      // Per email (any case or +tag), from different networks. Only requests
      // that reach a free slot count: invalid ones cannot use up the quota of
      // the address they name
      const mailbox = id('victim');
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

    expect((await call('GET', `/appointments/domains/${OWNER_DOMAIN}/schedules`)).json()).toEqual([]);
    expect((await call('GET', `/appointments/available-slots?scheduleId=${scheduleId}&date=${BOOKING_DATE}`)).status).toBe(409);
  });
});

describe('no Google token in any API response', () => {
  it('calls every route with valid input and finds the tokens in none of the responses', async () => {
    const first = responses.length;
    const sweep = await login(id('sub-sweep'), SWEEP_EMAIL);
    const auth = { cookie: sweep.cookie };

    // Connected first, so every route below answers while tokens are stored
    // (including /login, called again)
    expect((await call('POST', '/appointments/connect', { ...auth, body: { code: 'code-sweep' } })).status).toBe(200);
    const stored = await storedTokens(sweep.userId);
    expect(google.state.refreshTokens.has(stored?.googleCalendar?.refreshToken ?? '')).toBe(true);

    await login(id('sub-sweep'), SWEEP_EMAIL);
    expect((await call('GET', '/isLogged', auth)).status).toBe(200);
    expect((await call('GET', '/health')).status).toBe(200);
    expect((await call('POST', '/domain/claim', { ...auth, body: { name: SWEEP_DOMAIN } })).status).toBe(200);
    expect((await call('GET', '/appointments/calendar-status', auth)).status).toBe(200);

    expect((await call('GET', `/domain/${SWEEP_DOMAIN}`)).status).toBe(200);
    expect((await call('PUT', `/domain/${SWEEP_DOMAIN}`, { ...auth, body: { headerTitle: 'Sweep' } })).status).toBe(200);

    const project = {
      ...experienceRequestBody.projects[0],
      hardSkills: [{ name: SKILL_NAMES[0], level: -1 }],
      softSkills: [{ name: SKILL_NAMES[1], level: -1 }]
    };
    const experience = await call('POST', '/experiences', { ...auth, body: { ...experienceRequestBody, projects: [project] } });
    expect(experience.status).toBe(200);
    expect(
      (await call('PUT', `/experiences/${experience.json()._id}`, {
        ...auth,
        body: { ...experienceRequestBody, title: 'Staff Engineer', projects: [project] }
      })).status
    ).toBe(200);

    const workflow = await call('POST', '/workflows', { ...auth, body: workflowRequestBody });
    expect(workflow.status).toBe(200);
    expect((await call('PUT', `/workflows/${workflow.json()._id}`, { ...auth, body: workflowRequestBody })).status).toBe(200);

    expect((await call('GET', '/appointments/calendars', auth)).status).toBe(200);

    const schedule = await call('POST', '/appointments/schedules', { ...auth, body: scheduleBody() });
    expect(schedule.status).toBe(200);
    const scheduleId = schedule.json()._id as string;
    expect((await call('PUT', `/appointments/schedules/${scheduleId}`, { ...auth, body: scheduleBody() })).status).toBe(200);
    expect((await call('GET', '/appointments/schedules', auth)).status).toBe(200);

    google.state.busy = [];
    expect((await call('GET', `/appointments/domains/${SWEEP_DOMAIN}/schedules`)).status).toBe(200);
    expect((await call('GET', `/appointments/schedules/${scheduleId}/public`)).status).toBe(200);
    expect((await call('GET', `/appointments/available-slots?scheduleId=${scheduleId}&date=${BOOKING_DATE}`)).status).toBe(200);
    const booked = await call('POST', '/appointments/book', {
      body: { scheduleId, startTime: at('11:00'), name: 'Sweep', email: visitor('sweep-visitor') }
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

    // Neither token, in any body or header of this suite
    expect(google.state.refreshTokens.size).toBeGreaterThan(0);
    expect(google.state.accessTokens.size).toBeGreaterThan(0);
    const leaks = responses.flatMap((response) =>
      [...google.state.issuedTokens]
        .filter((token) => response.text.includes(token))
        .map((token) => `${response.method} ${response.path} -> ${token}`)
    );
    expect(leaks).toEqual([]);
  });
});
