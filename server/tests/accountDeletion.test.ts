// DELETE /me (services/accountDeletion.ts) against a real MongoDB (MONGO_URL,
// local or from TEST_MONGO_URL): everything tied to the account goes, other
// accounts keep theirs. Each test creates two accounts with data in every
// collection that references a user, named with a suffix unique to that
// test, and removes whatever is left after: tests pass in any order.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import mongoose, { Types } from 'mongoose';
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
  PerfectJob,
  Workflow,
  WorkflowInstance
} from '../models/database';
import { REVOKE_ENDPOINT } from '../services/googleCalendar';
import { logger } from '../services/logger';
import { LEGACY_WORKFLOWS_COLLECTION, deleteAccount } from '../services/accountDeletion';
import { CARRIED_PLAN_IMPORTS_MS, carriedPlanImportsKey } from '../services/accountQuotas';
import { hashValue, peekRateLimit, rateLimitKey, takeRateLimit } from '../services/rateLimit';
import { RESUME_IMPORT_MONTHLY_WINDOW_MS, resumeImportAttemptsKey, resumeImportUserKey } from '../services/resumeImport';
import { jobImportAttemptsKey } from '../services/jobImport';
import { stepSuggestionAttemptsKey, stepSuggestionOwnerKey } from '../services/stepSuggestions';
import { feedbackAccountKey, feedbackAttemptsKey } from '../services/feedback';
import {
  CONSENT,
  authCookie,
  experienceRequestBody,
  parseCookie,
  signGoogleIdToken,
  useTestGoogleKeys
} from './helpers';
import { assertDisposableDatabase } from './testDatabase';

const testNames = () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const id = (name: string) => `del-${name}-${suffix}`;
  return { suffix, id, email: (name: string) => `${id(name)}@example.com` };
};

let t: ReturnType<typeof testNames>;
/** Rate limit counters a test created (removed after it), by _id prefix */
const createdCounters = new Set<string>();
let app: ReturnType<typeof createApp>;
let connected = false;

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  await Promise.all([User.init(), Domain.init(), Skill.init(), JobApplication.init(), WorkflowInstance.init()]);
});

afterAll(async () => {
  if (connected) await mongoose.disconnect();
});

beforeEach(() => {
  t = testNames();
  app = createApp();
  useTestGoogleKeys();
});

afterEach(async () => {
  mock.restore();
  if (!connected) return;
  const named = new RegExp(`-${t.suffix}(@|$)`);
  const userIds = (await User.find({ email: named }, '_id')).map((user) => user._id);
  const domains = await Domain.find({ $or: [{ admin: { $in: userIds } }, { name: named }] });
  await Experience.deleteMany({ _id: { $in: domains.flatMap((domain) => domain.experiences.map(String)) } });
  await Domain.deleteMany({ _id: { $in: domains.map((domain) => domain._id) } });
  const jobIds = (await JobPosting.find({ recruiter: { $in: userIds } }, '_id')).map((job) => job._id);
  await JobApplication.deleteMany({ $or: [{ job: { $in: jobIds } }, { candidate: { $in: userIds } }] });
  await JobPosting.deleteMany({ _id: { $in: jobIds } });
  await Workflow.deleteMany({ user: { $in: userIds } });
  await PerfectJob.deleteMany({ user: { $in: userIds } });
  await WorkflowInstance.deleteMany({ $or: [{ owner: { $in: userIds } }, { visitor: { $in: userIds } }] });
  await AppointmentSchedule.deleteMany({ user: { $in: userIds } });
  await AppointmentBooking.deleteMany({ user: { $in: userIds } });
  await mongoose.connection.collection(LEGACY_WORKFLOWS_COLLECTION).deleteMany({ name: named });
  await RateLimitCounter.deleteMany({ _id: { $in: [...createdCounters] } });
  createdCounters.clear();
  await Skill.deleteMany({ displayName: new RegExp(named.source, 'i') });
  await User.deleteMany({ _id: { $in: userIds } });
});

const call = async (method: string, path: string, { body, cookie }: { body?: unknown; cookie?: string } = {}) => {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  const text = body === undefined ? undefined : JSON.stringify(body);
  if (text !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = String(Buffer.byteLength(text));
  }
  const response = await app.fetch(new Request(`http://localhost${path}`, { method, headers, body: text }));
  const responseText = await response.text();
  return {
    status: response.status,
    text: responseText,
    headers: response.headers,
    json: <T = any>() => JSON.parse(responseText) as T
  };
};

const googleSub = (name: string) => t.id(`sub-${name}`);

const login = async (name: string) => {
  const token = await signGoogleIdToken({ claims: { sub: googleSub(name), email: t.email(name) } });
  const result = await call('POST', '/login', { body: { token, consent: CONSENT } });
  expect(result.status).toBe(200);
  const cookie = `auth=${parseCookie(result.headers.get('Set-Cookie') ?? '')['auth']}`;
  return { cookie, userId: result.json().user._id as string };
};

const job = (recruiter: string, title: string): Record<string, unknown> => ({
  recruiter,
  title,
  description: '## The job\n\nBuild the billing platform.',
  company: 'Acme',
  status: 'open',
  publishedAt: new Date(),
  location: { country: 'FR', city: 'Lyon', postalCode: '69002', workMode: 'hybrid', remoteDaysPerWeek: 2 },
  contract: { type: 'cdi', trialPeriodMonths: 4 },
  workingTime: { arrangement: 'weekly_hours', hoursPerWeek: 39 },
  pay: { min: 45000, max: 55000, currency: 'EUR', period: 'year' }
});

const schedule = (user: string) => ({ user, title: 'Intro call', timezone: 'Europe/Paris' });

const booking = (user: string, scheduleId: Types.ObjectId, hoursAhead: number) => {
  const start = new Date(Date.now() + hoursAhead * 3_600_000);
  return {
    schedule: scheduleId,
    user,
    calendarId: 'primary',
    start,
    end: new Date(start.getTime() + 30 * 60_000),
    emailHash: `hash-${t.suffix}`,
    eventId: `evt${hoursAhead}`
  };
};

/**
 * An account with data in every collection that references a user: a domain
 * with an experience (through the API), a hiring journey, progress of a
 * visitor in it, a job posting with an applicant, a schedule with a booking
 */
const accountWithData = async (name: string) => {
  const user = await login(name);
  const domainName = t.id(`${name}-domain`);
  expect((await call('POST', '/domain/claim', { body: { name: domainName }, cookie: user.cookie })).status).toBe(200);
  const experience = await call('POST', '/experiences', {
    body: {
      ...experienceRequestBody,
      title: t.id(`${name}-experience`),
      projects: [
        {
          ...experienceRequestBody.projects[0],
          hardSkills: [{ name: t.id('shared-skill'), level: -1 }],
          softSkills: []
        }
      ]
    },
    cookie: user.cookie
  });
  expect(experience.status).toBe(200);
  await Workflow.create({ user: user.userId, steps: [{ id: 'meeting', type: 'meeting', config: {} }] });
  // What the account looks for in a job, where it travels from included
  await PerfectJob.create({
    user: user.userId,
    criteria: {
      commute: {
        importance: 4,
        from: '1 rue du Test, Lyon',
        place: { label: '1 Rue du Test 69001 Lyon', lat: 45.767, lon: 4.834 },
        modes: ['bike'],
        maxMinutesPerWeek: 300
      }
    }
  });
  // A document of the old /workflows API, still stored in the legacy collection
  await mongoose.connection.collection(LEGACY_WORKFLOWS_COLLECTION).insertOne({
    user: new Types.ObjectId(user.userId),
    name: t.id(`${name}-legacy-workflow`),
    description: 'Written through the old /workflows API',
    enabled: true,
    steps: []
  });
  const posting = await JobPosting.create(job(user.userId, t.id(`${name}-job`)));
  const scheduleDoc = await AppointmentSchedule.create(schedule(user.userId));
  await AppointmentBooking.create(booking(user.userId, scheduleDoc._id, 48 + Math.floor(Math.random() * 1000)));
  const domain = (await Domain.findOne({ name: domainName }))!;
  return { ...user, domainName, domain, experienceId: experience.json()._id as string, posting, schedule: scheduleDoc };
};

/** Every document of the account `userId` still stored, by collection */
const remaining = async (userId: string, domainName: string, experienceId: string) => ({
  user: await User.countDocuments({ _id: userId }),
  domains: await Domain.countDocuments({ $or: [{ admin: userId }, { name: domainName }] }),
  experiences: await Experience.countDocuments({ _id: experienceId }),
  workflows: await Workflow.countDocuments({ user: userId }),
  legacyWorkflows: await mongoose.connection
    .collection(LEGACY_WORKFLOWS_COLLECTION)
    .countDocuments({ user: new Types.ObjectId(userId) }),
  workflowInstances: await WorkflowInstance.countDocuments({ $or: [{ owner: userId }, { visitor: userId }] }),
  perfectJobs: await PerfectJob.countDocuments({ user: userId }),
  jobPostings: await JobPosting.countDocuments({ recruiter: userId }),
  jobApplications: await JobApplication.countDocuments({ candidate: userId }),
  appointmentSchedules: await AppointmentSchedule.countDocuments({ user: userId }),
  appointmentBookings: await AppointmentBooking.countDocuments({ user: userId }),
  bookedMeetings: await AppointmentBooking.countDocuments({ visitor: userId })
});

const nothing = {
  user: 0,
  domains: 0,
  experiences: 0,
  workflows: 0,
  legacyWorkflows: 0,
  workflowInstances: 0,
  perfectJobs: 0,
  jobPostings: 0,
  jobApplications: 0,
  appointmentSchedules: 0,
  appointmentBookings: 0,
  bookedMeetings: 0
};

/** Routes global fetch to a fake of Google's revocation endpoint; anything else fails the test */
const fakeGoogleRevoke = (answer: () => Response | Promise<Response> = () => Response.json({})) => {
  const requests: { url: string; body: string; contentType: string | null }[] = [];
  spyOn(globalThis, 'fetch').mockImplementation((async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(String(input), init);
    if (request.url !== REVOKE_ENDPOINT) throw new Error(`Unexpected request to ${request.url}`);
    requests.push({ url: request.url, body: await request.text(), contentType: request.headers.get('content-type') });
    return answer();
  }) as typeof fetch);
  return requests;
};

/** Every line the API logs from now on, as text */
const capturedLogs = () => {
  const lines: string[] = [];
  const capture = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  };
  for (const level of ['debug', 'info', 'warn', 'error'] as const) {
    spyOn(logger, level).mockImplementation(capture as never);
  }
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    spyOn(console, level).mockImplementation(capture as never);
  }
  return lines;
};

const deleteMe = (cookie?: string, body: unknown = { confirm: 'DELETE' }) => call('DELETE', '/me', { body, cookie });

describe('DELETE /me', () => {
  it("deletes the account and everything tied to it, and nothing of other accounts", async () => {
    const candidate = await accountWithData('candidate');
    const other = await accountWithData('other');
    // Applications both ways: to the other's posting, and the other to this account's posting
    await JobApplication.create({ job: other.posting._id, candidate: candidate.userId, domain: candidate.domain._id, source: 'applied' });
    await JobApplication.create({ job: candidate.posting._id, candidate: other.userId, domain: other.domain._id, source: 'applied' });
    // Journey progress both ways
    const step = { meeting: { data: { booked: true }, updatedAt: new Date() } };
    await WorkflowInstance.create({ owner: candidate.userId, visitor: other.userId, steps: step });
    await WorkflowInstance.create({ owner: other.userId, visitor: candidate.userId, steps: step });
    // A meeting booked with the other account, signed in: it stays booked, no longer tied to this account
    const visited = await AppointmentBooking.create({
      ...booking(other.userId, other.schedule._id, 2000),
      visitor: candidate.userId
    });
    const otherBefore = await remaining(other.userId, other.domainName, other.experienceId);
    expect(await remaining(candidate.userId, candidate.domainName, candidate.experienceId)).toEqual({
      user: 1,
      domains: 1,
      experiences: 1,
      workflows: 1,
      legacyWorkflows: 1,
      workflowInstances: 2,
      perfectJobs: 1,
      jobPostings: 1,
      jobApplications: 1,
      appointmentSchedules: 1,
      appointmentBookings: 1,
      bookedMeetings: 1
    });

    const result = await deleteMe(candidate.cookie);

    expect(result.status).toBe(204);
    expect(result.text).toBe('');
    expect(await remaining(candidate.userId, candidate.domainName, candidate.experienceId)).toEqual(nothing);
    // The applications to the deleted posting went with it
    expect(await JobApplication.countDocuments({ job: candidate.posting._id })).toBe(0);
    // The other account keeps everything of its own, minus what pointed at the deleted one
    expect(await remaining(other.userId, other.domainName, other.experienceId)).toEqual({
      ...otherBefore,
      workflowInstances: 0,
      jobApplications: 0
    });
    expect(await JobPosting.exists({ _id: other.posting._id })).not.toBeNull();
    expect(await AppointmentSchedule.exists({ _id: other.schedule._id })).not.toBeNull();
    expect(await AppointmentBooking.findById(visited._id).lean()).toMatchObject({ eventId: 'evt2000' });
    expect((await AppointmentBooking.findById(visited._id).lean())?.visitor).toBeUndefined();
    // The skills catalogue is shared: the other portfolio still uses the skill
    expect(await Skill.exists({ displayName: t.id('shared-skill') })).not.toBeNull();

    // The address can be claimed by someone else
    const availability = await call('GET', `/domain/${candidate.domainName}/availability`);
    expect(availability.json()).toEqual({ name: candidate.domainName, available: true });
    const newcomer = await login('newcomer');
    const claim = await call('POST', '/domain/claim', { body: { name: candidate.domainName }, cookie: newcomer.cookie });
    expect(claim.status).toBe(200);
  });

  it('ends the session: the cookie is cleared as GET /logout clears it, and the old one no longer works', async () => {
    const { cookie } = await login('session');
    const logout = await call('GET', '/logout', { cookie });

    const result = await deleteMe(cookie);

    expect(result.status).toBe(204);
    const setCookie = result.headers.get('Set-Cookie') ?? '';
    expect(parseCookie(setCookie)['auth']).toBe('');
    expect(setCookie).toContain('Max-Age=0');
    expect(setCookie).toContain('HttpOnly');
    // Same attributes as the logout's, so browsers drop the same cookie
    const attributes = (header: string) =>
      header.split(';').slice(1).map((part) => part.trim()).filter((part) => !part.startsWith('Expires=')).sort();
    expect(attributes(setCookie)).toEqual(attributes(logout.headers.get('Set-Cookie') ?? ''));

    expect((await call('GET', '/me', { cookie })).status).toBe(401);
    expect((await call('GET', '/isLogged', { cookie })).json()).toEqual({ logged: false, reason: 'Unknown user' });
    // A second deletion with the old cookie finds no account
    expect((await deleteMe(cookie)).status).toBe(401);
  });

  it('revokes the Google Calendar grant at Google, with the token in the body, and never logs it', async () => {
    const { cookie, userId } = await login('calendar');
    const refreshToken = `refresh-${t.suffix}`;
    const accessToken = `access-${t.suffix}`;
    await User.updateOne(
      { _id: userId },
      { $set: { googleCalendar: { refreshToken, accessToken, tokenExpiry: new Date(), connectedAt: new Date() } } }
    );
    const revoked = fakeGoogleRevoke();
    const logs = capturedLogs();

    const result = await deleteMe(cookie);

    expect(result.status).toBe(204);
    expect(revoked).toEqual([
      { url: REVOKE_ENDPOINT, body: `token=${refreshToken}`, contentType: 'application/x-www-form-urlencoded' }
    ]);
    expect(await User.exists({ _id: userId })).toBeNull();
    // One info line, with the user id and nothing personal
    const deletion = logs.filter((line) => line.includes('Account deleted'));
    expect(deletion).toHaveLength(1);
    expect(deletion[0]).toContain(userId);
    expect(deletion[0]).toContain('revoked');
    for (const line of logs) {
      for (const secret of [refreshToken, accessToken, t.email('calendar')]) expect(line).not.toContain(secret);
    }
    expect(result.text).not.toContain(refreshToken);
  });

  it.each([
    ['refuses', () => Response.json({ error: 'invalid_token' }, { status: 400 })],
    ['does not answer', () => Promise.reject(new TypeError('fetch failed'))]
  ])('deletes the account even when Google %s the revocation', async (_label, answer) => {
    const { cookie, userId } = await login('google-down');
    const refreshToken = `refresh-${t.suffix}`;
    await User.updateOne({ _id: userId }, { $set: { googleCalendar: { refreshToken, connectedAt: new Date() } } });
    const revoked = fakeGoogleRevoke(answer);
    const logs = capturedLogs();

    expect((await deleteMe(cookie)).status).toBe(204);

    expect(revoked).toHaveLength(1);
    expect(await User.exists({ _id: userId })).toBeNull();
    for (const line of logs) expect(line).not.toContain(refreshToken);
  });

  it('asks Google nothing for an account without a calendar connection', async () => {
    const { cookie } = await login('no-calendar');
    const revoked = fakeGoogleRevoke();

    expect((await deleteMe(cookie)).status).toBe(204);
    expect(revoked).toEqual([]);
  });

  it.each([
    ['no body', undefined],
    ['an empty body', {}],
    ['another word', { confirm: 'delete' }],
    ['a confirmation that is not a string', { confirm: true }]
  ])('refuses %s (422) and deletes nothing', async (_label, body) => {
    const { cookie, userId } = await login('unconfirmed');
    const revoked = fakeGoogleRevoke();

    const result = await call('DELETE', '/me', { body, cookie });

    expect(result.status).toBe(422);
    expect(await User.exists({ _id: userId })).not.toBeNull();
    expect(result.headers.get('Set-Cookie') ?? '').not.toContain('Max-Age=0');
    expect(revoked).toEqual([]);
  });

  it('answers 401 without a session, or for an account that no longer exists, and deletes nothing', async () => {
    const { userId } = await login('bystander');

    expect((await deleteMe()).status).toBe(401);
    const gone = await deleteMe(await authCookie(new Types.ObjectId().toString()));
    expect(gone.status).toBe(401);
    expect(gone.text).toBe('Unauthorized: unknown user');
    expect(await User.exists({ _id: userId })).not.toBeNull();
  });

  it("refuses every request of the account's other sessions (401): nothing is recreated under its id", async () => {
    const { cookie, userId } = await login('stale-session');
    // The same session on another device, or a copy of the cookie: DELETE /me only clears the caller's
    const otherDevice = cookie;
    expect((await deleteMe(cookie)).status).toBe(204);

    const name = t.id('ghost');
    const claim = await call('POST', '/domain/claim', { body: { name, consent: CONSENT }, cookie: otherDevice });
    expect(claim.status).toBe(401);
    expect(claim.text).toBe('Unauthorized: unknown user');
    expect((await call('PUT', '/workflow', { body: { steps: [] }, cookie: otherDevice })).status).toBe(401);
    expect((await call('POST', '/experiences', { body: experienceRequestBody, cookie: otherDevice })).status).toBe(401);
    expect((await call('PUT', '/me/consent', { body: CONSENT, cookie: otherDevice })).status).toBe(401);
    expect((await call('PUT', '/me/mode', { body: { mode: 'recruiter' }, cookie: otherDevice })).status).toBe(401);

    expect(await Domain.exists({ name })).toBeNull();
    expect(await Domain.exists({ admin: userId })).toBeNull();
    expect(await Workflow.exists({ user: userId })).toBeNull();
    expect(await User.exists({ _id: userId })).toBeNull();
  });

  it('keeps the quotas the account used for its Google identity: signing in again does not reset them', async () => {
    const before = await login('quota');
    // Used: 2 résumé imports this month, 4 attempts today, the 3 job imports of the plan, 1 job import
    // attempt, 1 step suggestion (2 attempts), 2 feedbacks (3 attempts) today
    const used: [string, number, number][] = [
      [resumeImportUserKey(before.userId), RESUME_IMPORT_MONTHLY_WINDOW_MS, 2],
      [resumeImportAttemptsKey(before.userId), 24 * 60 * 60_000, 4],
      [jobImportAttemptsKey(before.userId), 24 * 60 * 60_000, 1],
      [stepSuggestionOwnerKey(before.userId), 24 * 60 * 60_000, 1],
      [stepSuggestionAttemptsKey(before.userId), 24 * 60 * 60_000, 2],
      [feedbackAccountKey(before.userId), 24 * 60 * 60_000, 2],
      [feedbackAttemptsKey(before.userId), 24 * 60 * 60_000, 3]
    ];
    for (const [key, windowMs, count] of used) {
      for (let index = 0; index < count; index += 1) {
        createdCounters.add((await takeRateLimit(key, { limit: 100, windowMs })).counterId);
      }
    }
    expect((await call('PUT', '/me/mode', { body: { mode: 'recruiter', consent: CONSENT }, cookie: before.cookie })).status).toBe(200);
    await User.updateOne({ _id: before.userId }, { $set: { 'recruiter.jobImportsUsed': 3 } });

    expect((await deleteMe(before.cookie)).status).toBe(204);
    // What is kept: counters keyed by a hash of the Google id, expiring with their window
    const sub = googleSub('quota');
    const carried = await RateLimitCounter.find({ _id: { $regex: `^carried:.*:${hashValue(sub)}(:|$)` } }).lean();
    for (const counter of carried) createdCounters.add(counter._id);
    expect(carried).toHaveLength(8);
    const planCounter = await RateLimitCounter.findById(carriedPlanImportsKey(sub)).lean();
    expect(planCounter?.count).toBe(3);
    expect(planCounter!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + CARRIED_PLAN_IMPORTS_MS);
    expect(JSON.stringify(carried)).not.toContain(sub);
    expect(JSON.stringify(carried)).not.toContain(before.userId);

    const after = await login('quota');
    expect(after.userId).not.toBe(before.userId);
    for (const [key, windowMs, count] of [
      [resumeImportUserKey(after.userId), RESUME_IMPORT_MONTHLY_WINDOW_MS, 2],
      [resumeImportAttemptsKey(after.userId), 24 * 60 * 60_000, 4],
      [jobImportAttemptsKey(after.userId), 24 * 60 * 60_000, 1],
      [stepSuggestionOwnerKey(after.userId), 24 * 60 * 60_000, 1],
      [stepSuggestionAttemptsKey(after.userId), 24 * 60 * 60_000, 2],
      [feedbackAccountKey(after.userId), 24 * 60 * 60_000, 2],
      [feedbackAttemptsKey(after.userId), 24 * 60 * 60_000, 3]
    ] as const) {
      createdCounters.add(`${key}:${Math.floor(Date.now() / windowMs) * windowMs}`);
      expect((await peekRateLimit(key, { windowMs })).count).toBe(count);
    }
    // The plan's job imports come back with the new recruiter space
    expect((await call('PUT', '/me/mode', { body: { mode: 'recruiter', consent: CONSENT }, cookie: after.cookie })).status).toBe(200);
    expect((await User.findById(after.userId).lean())?.recruiter?.jobImportsUsed).toBe(3);

    // Another Google identity starts from nothing
    const stranger = await login('quota-stranger');
    expect((await peekRateLimit(resumeImportUserKey(stranger.userId), { windowMs: RESUME_IMPORT_MONTHLY_WINDOW_MS })).count).toBe(0);
    expect(rateLimitKey('carried:resume-import:user', sub)).not.toBe(rateLimitKey('carried:resume-import:user', googleSub('quota-stranger')));
  });

  it('refuses a form body (415) before anything is deleted', async () => {
    const { cookie, userId } = await login('form');

    const response = await app.fetch(
      new Request('http://localhost/me', {
        method: 'DELETE',
        headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'confirm=DELETE'
      })
    );

    expect(response.status).toBe(415);
    expect(await User.exists({ _id: userId })).not.toBeNull();
  });
});

describe('deleteAccount', () => {
  it('answers 401 for an account that does not exist', async () => {
    await expect(deleteAccount(new Types.ObjectId().toString())).rejects.toMatchObject({ status: 401 });
    await expect(deleteAccount('not-an-id')).rejects.toMatchObject({ status: 401 });
  });

  it('can be run again after an interrupted deletion', async () => {
    const account = await accountWithData('interrupted');
    // Interrupted after the experiences: the rest is still there
    await Experience.deleteOne({ _id: account.experienceId });

    const summary = await deleteAccount(account.userId);

    expect(summary).toMatchObject({
      domains: 1,
      experiences: 0,
      workflows: 1,
      legacyWorkflows: 1,
      jobPostings: 1,
      googleCalendar: 'none'
    });
    expect(await remaining(account.userId, account.domainName, account.experienceId)).toEqual(nothing);
  });
});
