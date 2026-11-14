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
  Skill,
  User,
  Workflow,
  WorkflowInstance
} from '../models/database';
import { REVOKE_ENDPOINT } from '../services/googleCalendar';
import { logger } from '../services/logger';
import { deleteAccount } from '../services/accountDeletion';
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
  await WorkflowInstance.deleteMany({ $or: [{ owner: { $in: userIds } }, { visitor: { $in: userIds } }] });
  await AppointmentSchedule.deleteMany({ user: { $in: userIds } });
  await AppointmentBooking.deleteMany({ user: { $in: userIds } });
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

const login = async (name: string) => {
  const token = await signGoogleIdToken({ claims: { sub: t.id(`sub-${name}`), email: t.email(name) } });
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
  workflowInstances: await WorkflowInstance.countDocuments({ $or: [{ owner: userId }, { visitor: userId }] }),
  jobPostings: await JobPosting.countDocuments({ recruiter: userId }),
  jobApplications: await JobApplication.countDocuments({ candidate: userId }),
  appointmentSchedules: await AppointmentSchedule.countDocuments({ user: userId }),
  appointmentBookings: await AppointmentBooking.countDocuments({ user: userId })
});

const nothing = {
  user: 0,
  domains: 0,
  experiences: 0,
  workflows: 0,
  workflowInstances: 0,
  jobPostings: 0,
  jobApplications: 0,
  appointmentSchedules: 0,
  appointmentBookings: 0
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
    const otherBefore = await remaining(other.userId, other.domainName, other.experienceId);
    expect(await remaining(candidate.userId, candidate.domainName, candidate.experienceId)).toEqual({
      user: 1,
      domains: 1,
      experiences: 1,
      workflows: 1,
      workflowInstances: 2,
      jobPostings: 1,
      jobApplications: 1,
      appointmentSchedules: 1,
      appointmentBookings: 1
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

    expect(summary).toMatchObject({ domains: 1, experiences: 0, workflows: 1, jobPostings: 1, googleCalendar: 'none' });
    expect(await remaining(account.userId, account.domainName, account.experienceId)).toEqual(nothing);
  });
});
