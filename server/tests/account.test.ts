// Account modes (candidate / recruiter) against a real MongoDB (MONGO_URL,
// local or from TEST_MONGO_URL): /login, /isLogged, GET /me and PUT /me/mode,
// and the recruiter space they create. Each test logs in its own users and
// claims its own domains, all named with a suffix unique to that test, and
// removes them after: tests pass in any order (--randomize).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import mongoose, { Types } from 'mongoose';
import { env } from '../env';
import { createApp } from '../app';
import { Domain, User } from '../models/database';
import { enableRecruiterSpace, findRecruiterSpace } from '../services/recruiters';
import { authCookie, parseCookie, signGoogleIdToken, useTestGoogleKeys } from './helpers';
import { assertDisposableDatabase } from './testDatabase';

/** Names unique to one test: everything it creates carries its suffix */
const testNames = () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const id = (name: string) => `acct-${name}-${suffix}`;
  return { suffix, id, email: (name: string) => `${id(name)}@example.com` };
};

let t: ReturnType<typeof testNames>;
let app: ReturnType<typeof createApp>;
let connected = false;

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  await Promise.all([User.init(), Domain.init()]);
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
  const users = (await User.find({ email: named }, '_id')).map((user) => user._id);
  await Domain.deleteMany({ $or: [{ admin: { $in: users } }, { name: named }] });
  await User.deleteMany({ _id: { $in: users } });
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

/** POST /login with Google as this test's user `name` (sub and email derived from it) */
const login = async (name: string, mode?: string) => {
  const token = await signGoogleIdToken({ claims: { sub: t.id(`sub-${name}`), email: t.email(name) } });
  const result = await call('POST', '/login', { body: mode === undefined ? { token } : { token, mode } });
  expect(result.status).toBe(200);
  const cookie = `auth=${parseCookie(result.headers.get('Set-Cookie') ?? '')['auth']}`;
  const user = result.json().user;
  return { cookie, userId: user._id as string, user, text: result.text };
};

const me = (cookie: string) => call('GET', '/me', { cookie });
const switchMode = (cookie: string, mode: unknown) => call('PUT', '/me/mode', { body: { mode }, cookie });
const isLogged = (cookie: string) => call('GET', '/isLogged', { cookie });

/** The user as stored, recruiter space included */
const stored = (userId: string) => User.findById(userId).lean();

/**
 * From now on, the modifiedCount of every User.updateOne that writes a whole
 * recruiter space: their sum is the number of spaces actually written, which
 * the final document cannot tell (a second creation looks like the first)
 */
const recruiterSpaceWrites = () => {
  const updateOne = User.updateOne.bind(User);
  const modified: number[] = [];
  spyOn(User, 'updateOne').mockImplementation(((...args: Parameters<typeof updateOne>) =>
    updateOne(...args).then((result) => {
      const update = args[1] as { $set?: Record<string, unknown> } | undefined;
      if (update?.$set && 'recruiter' in update.$set) modified.push(result.modifiedCount);
      return result;
    })) as never);
  return modified;
};

const sum = (counts: number[]) => counts.reduce((total, count) => total + count, 0);

describe('a new account', () => {
  it('has no active mode, no recruiter space and no domain', async () => {
    const { cookie, userId, user } = await login('new');

    const expected = { _id: userId, email: t.email('new'), recruiter: false };
    expect(user).toEqual(expected);
    expect((await me(cookie)).json()).toEqual({ user: expected });
    expect((await isLogged(cookie)).json().user).toEqual(expected);

    const doc = await stored(userId);
    expect(doc?.activeMode).toBeUndefined();
    expect(doc?.recruiter).toBeUndefined();
  });

  it('chosen as a candidate on login gets the mode, but no recruiter space', async () => {
    const { userId, user } = await login('candidate', 'candidate');

    expect(user).toEqual({ _id: userId, email: t.email('candidate'), activeMode: 'candidate', recruiter: false });
    expect((await stored(userId))?.recruiter).toBeUndefined();
  });

  it('chosen as a recruiter on login gets its recruiter space on the free plan', async () => {
    const before = Date.now();
    const { cookie, userId, user } = await login('recruiter', 'recruiter');

    expect(user).toEqual({ _id: userId, email: t.email('recruiter'), activeMode: 'recruiter', recruiter: true });
    const doc = await stored(userId);
    expect(doc?.activeMode).toBe('recruiter');
    expect(doc?.recruiter).toEqual({ enabledAt: expect.any(Date), plan: 'free', jobImportsUsed: 0 });
    expect(doc!.recruiter!.enabledAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(doc!.recruiter!.enabledAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(await findRecruiterSpace(userId)).toEqual({ enabledAt: doc!.recruiter!.enabledAt, plan: 'free', jobImportsUsed: 0 });
    expect((await me(cookie)).json().user).toEqual(user);
  });
});

describe('POST /login', () => {
  it('refuses an unknown mode (422) without issuing a session or creating the account', async () => {
    const token = await signGoogleIdToken({ claims: { sub: t.id('sub-bad'), email: t.email('bad') } });
    const result = await call('POST', '/login', { body: { token, mode: 'admin' } });

    expect(result.status).toBe(422);
    expect(result.json()).toMatchObject({ type: 'validation', on: 'body', property: 'mode' });
    expect(result.headers.get('Set-Cookie') ?? '').not.toContain('auth=ey');
    expect(await User.exists({ email: t.email('bad') })).toBeNull();
  });

  it('without a mode keeps the mode the account last chose', async () => {
    await login('returning', 'recruiter');
    await switchMode((await login('returning')).cookie, 'candidate');

    const { user } = await login('returning');
    expect(user).toMatchObject({ activeMode: 'candidate', recruiter: true });
  });

  it('with a mode switches an existing account to it', async () => {
    const first = await login('existing', 'candidate');
    const { user } = await login('existing', 'recruiter');

    expect(user).toEqual({ _id: first.userId, email: t.email('existing'), activeMode: 'recruiter', recruiter: true });
  });
});

describe('PUT /me/mode', () => {
  it('creates the recruiter space once: switching back and forth keeps it and its imports used', async () => {
    const { cookie, userId } = await login('switch', 'recruiter');
    await User.updateOne({ _id: userId }, { $set: { 'recruiter.jobImportsUsed': 2 } });
    const space = (await stored(userId))!.recruiter!;

    const toCandidate = await switchMode(cookie, 'candidate');
    expect(toCandidate.status).toBe(200);
    expect(toCandidate.json()).toEqual({
      user: { _id: userId, email: t.email('switch'), activeMode: 'candidate', recruiter: true }
    });
    expect((await stored(userId))?.recruiter).toEqual(space);

    const toRecruiter = await switchMode(cookie, 'recruiter');
    expect(toRecruiter.json().user).toMatchObject({ activeMode: 'recruiter', recruiter: true });
    // Logging in as a recruiter again does not reset it either
    expect((await login('switch', 'recruiter')).user.activeMode).toBe('recruiter');

    const doc = await stored(userId);
    expect(doc?.activeMode).toBe('recruiter');
    expect(doc?.recruiter).toEqual({ enabledAt: space.enabledAt, plan: 'free', jobImportsUsed: 2 });
  });

  it('creates the recruiter space of a candidate account the first time it chooses it', async () => {
    const { cookie, userId } = await login('upgrade', 'candidate');

    const result = await switchMode(cookie, 'recruiter');

    expect(result.json().user).toEqual({ _id: userId, email: t.email('upgrade'), activeMode: 'recruiter', recruiter: true });
    expect((await stored(userId))?.recruiter).toEqual({ enabledAt: expect.any(Date), plan: 'free', jobImportsUsed: 0 });
  });

  it.each([
    ['an unknown mode', { mode: 'admin' }],
    ['no mode', {}],
    ['a mode that is not a string', { mode: 1 }]
  ])('refuses %s (422) and changes nothing', async (_label, body) => {
    const { cookie, userId } = await login('invalid', 'candidate');

    const result = await call('PUT', '/me/mode', { body, cookie });

    expect(result.status).toBe(422);
    expect(result.json()).toMatchObject({ type: 'validation', on: 'body', property: 'mode' });
    const doc = await stored(userId);
    expect(doc?.activeMode).toBe('candidate');
    expect(doc?.recruiter).toBeUndefined();
  });

  it('answers 401 without a session', async () => {
    const result = await call('PUT', '/me/mode', { body: { mode: 'recruiter' } });
    expect(result.status).toBe(401);
  });

  it('answers 401, and creates nothing, for a session whose account no longer exists', async () => {
    const userId = new Types.ObjectId().toString();
    const cookie = await authCookie(userId);

    for (const mode of ['candidate', 'recruiter']) {
      const result = await switchMode(cookie, mode);
      expect(result.status).toBe(401);
      expect(result.text).toBe('Unauthorized: unknown user');
    }
    expect(await User.exists({ _id: userId })).toBeNull();
  });
});

describe('GET /me', () => {
  it('answers 401 without a session, or for an account that no longer exists', async () => {
    expect((await call('GET', '/me')).status).toBe(401);

    const gone = await me(await authCookie(new Types.ObjectId().toString()));
    expect(gone.status).toBe(401);
    expect(gone.text).toBe('Unauthorized: unknown user');
  });

  it('names the domain the account owns, in every mode', async () => {
    const { cookie, userId } = await login('owner', 'candidate');
    const domainName = t.id('domain');
    expect((await call('POST', '/domain/claim', { body: { name: domainName }, cookie })).status).toBe(200);

    const expected = { _id: userId, email: t.email('owner'), activeMode: 'candidate', recruiter: false, domain: domainName };
    expect((await me(cookie)).json()).toEqual({ user: expected });
    expect((await isLogged(cookie)).json().user).toEqual(expected);
    expect((await login('owner')).user).toEqual(expected);
    expect((await switchMode(cookie, 'recruiter')).json().user).toEqual({
      ...expected,
      activeMode: 'recruiter',
      recruiter: true
    });
  });

  it('names no domain for an account that owns none, whoever else does', async () => {
    const owner = await login('someone');
    const theirDomain = t.id('their-domain');
    // A domain must exist for the lookup to wrongly find it
    expect((await call('POST', '/domain/claim', { body: { name: theirDomain }, cookie: owner.cookie })).status).toBe(200);
    expect((await me(owner.cookie)).json().user.domain).toBe(theirDomain);
    const { cookie } = await login('nobody');

    expect((await me(cookie)).json().user.domain).toBeUndefined();
    expect((await isLogged(cookie)).json().user.domain).toBeUndefined();
  });
});

describe('enableRecruiterSpace', () => {
  it('creates one space when called concurrently, and keeps it after', async () => {
    const user = await User.create({ email: t.email('concurrent'), googleId: t.id('sub-concurrent') });
    const writes = recruiterSpaceWrites();

    const results = await Promise.all(Array.from({ length: 5 }, () => enableRecruiterSpace(user.id)));

    expect(results).toEqual([true, true, true, true, true]);
    expect(writes).toHaveLength(5);
    expect(sum(writes)).toBe(1);
    const space = (await stored(user.id))!.recruiter!;
    expect(space).toEqual({ enabledAt: expect.any(Date), plan: 'free', jobImportsUsed: 0 });

    await User.updateOne({ _id: user.id }, { $set: { 'recruiter.jobImportsUsed': 2 } });
    expect(await enableRecruiterSpace(user.id)).toBe(true);
    expect((await stored(user.id))?.recruiter).toEqual({ ...space, jobImportsUsed: 2 });
  });

  it('creates one space when the account switches to recruiter twice at once', async () => {
    const { cookie, userId } = await login('double');
    const writes = recruiterSpaceWrites();

    const results = await Promise.all([switchMode(cookie, 'recruiter'), switchMode(cookie, 'recruiter')]);

    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(results.map((result) => result.json().user)).toEqual([
      expect.objectContaining({ activeMode: 'recruiter', recruiter: true }),
      expect.objectContaining({ activeMode: 'recruiter', recruiter: true })
    ]);
    // Both requests tried to create it, one did
    expect(writes).toHaveLength(2);
    expect(sum(writes)).toBe(1);
    expect((await stored(userId))?.recruiter).toEqual({ enabledAt: expect.any(Date), plan: 'free', jobImportsUsed: 0 });
  });

  it('answers false, and creates nothing, for an account that no longer exists', async () => {
    const userId = new Types.ObjectId().toString();
    expect(await enableRecruiterSpace(userId)).toBe(false);
    expect(await User.exists({ _id: userId })).toBeNull();
  });
});

describe('the user DTO', () => {
  it('never carries the Google Calendar connection, its tokens or the Google id', async () => {
    const first = await login('calendar', 'recruiter');
    const secrets = [`refresh-${t.suffix}`, `access-${t.suffix}`];
    await User.updateOne(
      { _id: first.userId },
      {
        $set: {
          googleCalendar: {
            refreshToken: secrets[0],
            accessToken: secrets[1],
            tokenExpiry: new Date(),
            connectedAt: new Date()
          }
        }
      }
    );

    const bodies = [
      (await login('calendar')).text,
      (await login('calendar', 'candidate')).text,
      (await isLogged(first.cookie)).text,
      (await me(first.cookie)).text,
      (await switchMode(first.cookie, 'recruiter')).text
    ];

    for (const body of bodies) {
      for (const secret of [...secrets, 'googleCalendar', 'googleId', t.id('sub-calendar'), 'jobImportsUsed']) {
        expect(body).not.toContain(secret);
      }
      const { user } = JSON.parse(body);
      expect(Object.keys(user).sort()).toEqual(['_id', 'activeMode', 'email', 'recruiter']);
    }
  });
});
