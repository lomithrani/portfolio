// Acceptance of the Terms of use with the age confirmation (services/legal.ts),
// against a real MongoDB (MONGO_URL, local or from TEST_MONGO_URL): recorded
// by POST /login and PUT /me/consent, required by POST /domain/claim (and by
// the recruiter space: tests/account.test.ts, tests/jobs.test.ts), shown
// as `termsVersion` in the user DTO. Each test logs in its own users and
// claims its own domains, named with a suffix unique to that test, and
// removes them after: tests pass in any order (--randomize).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test';
import mongoose, { Types } from 'mongoose';
import { AGE_CONFIRMATION_KEY, AGE_CONFIRMATION_KEYS, LEGAL_VERSION, legalMessages } from 'portfolio-common';
import { env } from '../env';
import { createApp } from '../app';
import { Domain, User } from '../models/database';
import { hasAcceptedCurrentTerms, recordConsent, requireCurrentTerms, userAcceptedCurrentTerms } from '../services/legal';
import { CONSENT, authCookie, parseCookie, signGoogleIdToken, useTestGoogleKeys } from './helpers';
import { assertDisposableDatabase } from './testDatabase';

/** Names unique to one test: everything it creates carries its suffix */
const testNames = () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const id = (name: string) => `consent-${name}-${suffix}`;
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

const call = async (
  method: string,
  path: string,
  { body, cookie, language }: { body?: unknown; cookie?: string; language?: string } = {}
) => {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  if (language) headers['Accept-Language'] = language;
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

const googleToken = (name: string) =>
  signGoogleIdToken({ claims: { sub: t.id(`sub-${name}`), email: t.email(name) } });

/** POST /login as this test's user `name`, with the extra body fields given */
const loginCall = async (name: string, fields: Record<string, unknown> = {}) =>
  call('POST', '/login', { body: { token: await googleToken(name), ...fields } });

const login = async (name: string, fields: Record<string, unknown> = {}) => {
  const result = await loginCall(name, fields);
  expect(result.status).toBe(200);
  const cookie = `auth=${parseCookie(result.headers.get('Set-Cookie') ?? '')['auth']}`;
  const user = result.json().user;
  return { cookie, userId: user._id as string, user };
};

interface StoredAcceptance {
  version: string;
  acceptedAt: Date;
  ageConfirmationKey: string;
  source: string;
}

const stored = (userId: string) =>
  User.findById(userId).lean<{ legalAcceptances?: StoredAcceptance[] } & Record<string, unknown>>();
const acceptances = async (userId: string) => (await stored(userId))?.legalAcceptances ?? [];
const me = (cookie: string) => call('GET', '/me', { cookie });
const accept = (cookie: string, body: Record<string, unknown> = CONSENT) =>
  call('PUT', '/me/consent', { body, cookie });
const claim = (cookie: string, body: Record<string, unknown>) => call('POST', '/domain/claim', { body, cookie });

const sessionIssued = (headers: Headers) => (headers.get('Set-Cookie') ?? '').includes('auth=ey');

describe('POST /login with the age and terms confirmation', () => {
  it('records the acceptance before issuing the session, and shows its version', async () => {
    const before = Date.now();
    const { cookie, userId, user } = await login('landing', { consent: CONSENT });

    expect(user).toEqual({ _id: userId, email: t.email('landing'), recruiter: false, termsVersion: LEGAL_VERSION });
    expect((await me(cookie)).json().user).toEqual(user);
    expect((await call('GET', '/isLogged', { cookie })).json().user).toEqual(user);

    const [acceptance, ...others] = await acceptances(userId);
    expect(others).toEqual([]);
    expect(acceptance).toEqual({
      version: LEGAL_VERSION,
      acceptedAt: expect.any(Date),
      ageConfirmationKey: AGE_CONFIRMATION_KEY,
      source: 'landing'
    });
    expect(acceptance.acceptedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(acceptance.acceptedAt.getTime()).toBeLessThanOrEqual(Date.now());
    // Data minimisation: nothing else about the person is stored with it
    expect(Object.keys((await stored(userId))!).sort()).toEqual(['__v', '_id', 'email', 'googleId', 'legalAcceptances']);
  });

  it('takes the space chosen on the same request too', async () => {
    const { userId, user } = await login('both', { consent: CONSENT, mode: 'candidate' });

    expect(user).toEqual({
      _id: userId,
      email: t.email('both'),
      activeMode: 'candidate',
      recruiter: false,
      termsVersion: LEGAL_VERSION
    });
  });

  it('keeps the first acceptance of a version when the account signs in with it again', async () => {
    const first = await login('again', { consent: CONSENT });
    const [acceptance] = await acceptances(first.userId);

    const second = await login('again', { consent: CONSENT });

    expect(second.user.termsVersion).toBe(LEGAL_VERSION);
    expect(await acceptances(first.userId)).toEqual([acceptance]);
  });

  it('refuses an older version of the terms (422) without creating the account or a session', async () => {
    const result = await loginCall('stale', { consent: { termsVersion: '2025-01-01', ageConfirmed: true } });

    expect(result.status).toBe(422);
    expect(result.json()).toEqual({
      type: 'validation',
      on: 'body',
      property: 'consent.termsVersion',
      message: legalMessages.staleTerms
    });
    expect(sessionIssued(result.headers)).toBe(false);
    expect(await User.exists({ email: t.email('stale') })).toBeNull();
  });

  it.each([
    ['an unticked age confirmation', { termsVersion: LEGAL_VERSION, ageConfirmed: false }],
    ['no age confirmation', { termsVersion: LEGAL_VERSION }],
    ['no version', { ageConfirmed: true }],
    ['an overlong version', { termsVersion: 'x'.repeat(33), ageConfirmed: true }],
    ['a confirmation that is not an object', true]
  ])('refuses %s (422) without creating the account or a session', async (_label, consent) => {
    const result = await loginCall('invalid', { consent });

    expect(result.status).toBe(422);
    expect(result.json()).toMatchObject({ type: 'validation', on: 'body', property: expect.stringMatching(/^consent/) });
    expect(sessionIssued(result.headers)).toBe(false);
    expect(await User.exists({ email: t.email('invalid') })).toBeNull();
  });

  it('without it signs in as before, and records nothing', async () => {
    const { cookie, userId, user } = await login('plain');

    expect(user).toEqual({ _id: userId, email: t.email('plain'), recruiter: false });
    expect((await me(cookie)).json().user.termsVersion).toBeUndefined();
    expect((await stored(userId))?.legalAcceptances).toBeUndefined();
  });

  it('records where the box was ticked: a claim form that signs in first says so', async () => {
    const { userId } = await login('modal', { consent: CONSENT, consentSource: 'claim' });

    expect(await acceptances(userId)).toEqual([expect.objectContaining({ version: LEGAL_VERSION, source: 'claim' })]);
  });

  it('records the recruiter space as the source of a sign-in into it, which opens the space', async () => {
    const { userId, user } = await login('recruiter', { consent: CONSENT, mode: 'recruiter', consentSource: 'recruiter' });

    expect(user).toMatchObject({ activeMode: 'recruiter', recruiter: true, termsVersion: LEGAL_VERSION });
    expect(await acceptances(userId)).toEqual([expect.objectContaining({ version: LEGAL_VERSION, source: 'recruiter' })]);
  });

  it.each([['account'], ['elsewhere']])('refuses the source %s on sign-in (422), without creating the account', async (source) => {
    const result = await loginCall('bad-source', { consent: CONSENT, consentSource: source });

    expect(result.status).toBe(422);
    expect(sessionIssued(result.headers)).toBe(false);
    expect(await User.exists({ email: t.email('bad-source') })).toBeNull();
  });

  it('records it for an existing account that never accepted', async () => {
    const { userId } = await login('existing');

    const { user } = await login('existing', { consent: CONSENT });

    expect(user.termsVersion).toBe(LEGAL_VERSION);
    expect(await acceptances(userId)).toEqual([expect.objectContaining({ version: LEGAL_VERSION, source: 'landing' })]);
  });
});

describe('PUT /me/consent', () => {
  it('records the acceptance from the account page by default, and returns the account', async () => {
    const { cookie, userId } = await login('page', { mode: 'candidate' });

    const result = await accept(cookie);

    expect(result.status).toBe(200);
    expect(result.json()).toEqual({
      user: { _id: userId, email: t.email('page'), activeMode: 'candidate', recruiter: false, termsVersion: LEGAL_VERSION }
    });
    expect(await acceptances(userId)).toEqual([
      { version: LEGAL_VERSION, acceptedAt: expect.any(Date), ageConfirmationKey: AGE_CONFIRMATION_KEY, source: 'account' }
    ]);
  });

  it('records the wording ticked: the French one for a page in French', async () => {
    const { cookie, userId } = await login('french');

    const result = await call('PUT', '/me/consent', { body: CONSENT, cookie, language: 'fr' });

    expect(result.status).toBe(200);
    expect(AGE_CONFIRMATION_KEYS.fr).not.toBe(AGE_CONFIRMATION_KEYS.en);
    expect(await acceptances(userId)).toEqual([
      expect.objectContaining({ version: LEGAL_VERSION, ageConfirmationKey: AGE_CONFIRMATION_KEYS.fr })
    ]);
  });

  it.each([['claim'], ['recruiter']])('records where it was given: %s', async (source) => {
    const { cookie, userId } = await login('given');

    expect((await accept(cookie, { ...CONSENT, source })).status).toBe(200);

    expect((await acceptances(userId)).map((entry) => entry.source)).toEqual([source]);
  });

  it('records a version once, even when sent several times at once', async () => {
    const { cookie, userId } = await login('twice');

    const results = await Promise.all([accept(cookie), accept(cookie), accept(cookie)]);

    expect(results.map((result) => result.status)).toEqual([200, 200, 200]);
    expect(results.map((result) => result.json().user.termsVersion)).toEqual([LEGAL_VERSION, LEGAL_VERSION, LEGAL_VERSION]);
    expect(await acceptances(userId)).toHaveLength(1);
  });

  it('adds the terms in force after an older acceptance, keeping the history', async () => {
    const { cookie, userId } = await login('history');
    const old = { version: '2025-01-01', acceptedAt: new Date('2025-01-02'), ageConfirmationKey: 'age-v0', source: 'landing' };
    await User.updateOne({ _id: userId }, { $set: { legalAcceptances: [old] } });
    expect((await me(cookie)).json().user.termsVersion).toBe('2025-01-01');

    const result = await accept(cookie);

    expect(result.json().user.termsVersion).toBe(LEGAL_VERSION);
    expect(await acceptances(userId)).toEqual([
      old,
      expect.objectContaining({ version: LEGAL_VERSION, ageConfirmationKey: AGE_CONFIRMATION_KEY, source: 'account' })
    ]);
  });

  it('refuses an older version of the terms (422) and records nothing', async () => {
    const { cookie, userId } = await login('stale');

    const result = await accept(cookie, { termsVersion: '2025-01-01', ageConfirmed: true });

    expect(result.status).toBe(422);
    expect(result.json()).toMatchObject({ property: 'consent.termsVersion', message: legalMessages.staleTerms });
    expect((await stored(userId))?.legalAcceptances).toBeUndefined();
  });

  it.each([
    ['an unticked age confirmation', { termsVersion: LEGAL_VERSION, ageConfirmed: false }, 'ageConfirmed'],
    ['no version', { ageConfirmed: true }, 'termsVersion'],
    ['the landing page as its source', { ...CONSENT, source: 'landing' }, 'source'],
    ['an unknown source', { ...CONSENT, source: 'admin' }, 'source']
  ])('refuses %s (422) and records nothing', async (_label, body, property) => {
    const { cookie, userId } = await login('invalid');

    const result = await accept(cookie, body);

    expect(result.status).toBe(422);
    expect(result.json()).toMatchObject({ type: 'validation', on: 'body', property });
    expect((await stored(userId))?.legalAcceptances).toBeUndefined();
  });

  it('answers 401 without a session, or for an account that no longer exists', async () => {
    expect((await call('PUT', '/me/consent', { body: CONSENT })).status).toBe(401);

    const userId = new Types.ObjectId().toString();
    const gone = await accept(await authCookie(userId));
    expect(gone.status).toBe(401);
    expect(gone.text).toBe('Unauthorized: unknown user');
    expect(await User.exists({ _id: userId })).toBeNull();
  });
});

describe('POST /domain/claim and the terms', () => {
  it('refuses the claim of an account that has not accepted the terms (422 on consent)', async () => {
    const { cookie, userId } = await login('unaccepted');
    const name = t.id('domain');

    const result = await claim(cookie, { name });

    expect(result.status).toBe(422);
    expect(result.json()).toEqual({
      type: 'validation',
      on: 'body',
      property: 'consent',
      message: 'Confirm your age and accept the terms of use to create your portfolio.'
    });
    expect(await Domain.exists({ name })).toBeNull();
    expect((await me(cookie)).json().user.domain).toBeUndefined();
    expect((await stored(userId))?.legalAcceptances).toBeUndefined();
  });

  it('claims with the confirmation sent along, recorded from the claim', async () => {
    const { cookie, userId } = await login('with-consent');
    const name = t.id('domain');

    const result = await claim(cookie, { name, consent: CONSENT });

    expect(result.status).toBe(200);
    expect(result.json().name).toBe(name);
    expect((await me(cookie)).json().user).toMatchObject({ domain: name, termsVersion: LEGAL_VERSION });
    expect(await acceptances(userId)).toEqual([expect.objectContaining({ version: LEGAL_VERSION, source: 'claim' })]);
  });

  it('claims without a confirmation once the account accepted the terms in force', async () => {
    const { cookie, userId } = await login('accepted', { consent: CONSENT });
    const name = t.id('domain');

    expect((await claim(cookie, { name })).status).toBe(200);

    expect(await Domain.exists({ name, admin: userId })).not.toBeNull();
    // Nothing recorded twice
    expect((await acceptances(userId)).map((entry) => entry.source)).toEqual(['landing']);
  });

  it('asks again an account that only accepted an older version', async () => {
    const { cookie, userId } = await login('outdated');
    await User.updateOne(
      { _id: userId },
      { $set: { legalAcceptances: [{ version: '2025-01-01', acceptedAt: new Date(), ageConfirmationKey: 'age-v0', source: 'landing' }] } }
    );
    const name = t.id('domain');

    expect((await claim(cookie, { name })).json().property).toBe('consent');
    expect((await claim(cookie, { name, consent: CONSENT })).status).toBe(200);
    expect((await acceptances(userId)).map((entry) => entry.version)).toEqual(['2025-01-01', LEGAL_VERSION]);
  });

  it('refuses an older version sent with the claim (422 on consent.termsVersion)', async () => {
    const { cookie } = await login('stale');
    const name = t.id('domain');

    const result = await claim(cookie, { name, consent: { termsVersion: '2025-01-01', ageConfirmed: true } });

    expect(result.status).toBe(422);
    expect(result.json()).toMatchObject({ property: 'consent.termsVersion', message: legalMessages.staleTerms });
    expect(await Domain.exists({ name })).toBeNull();
  });

  it('checks the name before the terms, and records nothing for an invalid one', async () => {
    const { cookie, userId } = await login('bad-name');

    const result = await claim(cookie, { name: 'legal', consent: CONSENT });

    expect(result.status).toBe(400);
    expect((await stored(userId))?.legalAcceptances).toBeUndefined();
  });

  it('then tells a taken name and an account that already owns a portfolio apart', async () => {
    const owner = await login('owner', { consent: CONSENT });
    const other = await login('other', { consent: CONSENT });
    const name = t.id('domain');
    expect((await claim(owner.cookie, { name })).status).toBe(200);

    expect((await claim(other.cookie, { name })).text).toBe('Domain already exists');
    expect((await claim(owner.cookie, { name: t.id('second') })).text).toBe('You already own a domain');
  });

  it('leaves the portfolios claimed before the terms existed online', async () => {
    const { cookie, userId } = await login('grandfathered');
    const name = t.id('domain');
    await Domain.create({ name, admin: userId, experiences: [] });

    expect((await me(cookie)).json().user).toMatchObject({ domain: name });
    expect((await call('GET', `/domain/${name}`)).status).toBe(200);
  });
});

describe('services/legal.ts', () => {
  it('tells whether the account accepted the terms in force', async () => {
    const { userId } = await login('service');
    expect(await userAcceptedCurrentTerms(userId)).toBe(false);
    expect(hasAcceptedCurrentTerms(await stored(userId))).toBe(false);

    expect(await recordConsent(userId, CONSENT, 'account')).toBe(true);
    expect(await recordConsent(userId, CONSENT, 'claim')).toBe(false);

    expect(await userAcceptedCurrentTerms(userId)).toBe(true);
    expect(hasAcceptedCurrentTerms(await stored(userId))).toBe(true);
    expect(hasAcceptedCurrentTerms(null)).toBe(false);
    expect(hasAcceptedCurrentTerms({ legalAcceptances: [{ version: LEGAL_VERSION }, { version: '2025-01-01' }] })).toBe(false);
  });

  it('never lets a gated route go on for an account that does not exist (401), consent or not', async () => {
    const userId = new Types.ObjectId().toString();
    await expect(requireCurrentTerms(userId, CONSENT, 'claim')).rejects.toMatchObject({ status: 401 });
    await expect(requireCurrentTerms(userId, undefined, 'claim')).rejects.toMatchObject({ status: 422 });
  });

  it('says what the terms are needed for: the portfolio, or the recruiter space', async () => {
    const { userId } = await login('gate');

    await expect(requireCurrentTerms(userId, undefined, 'claim')).rejects.toMatchObject({
      status: 422,
      property: 'consent',
      message: 'Confirm your age and accept the terms of use to create your portfolio.'
    });
    await expect(requireCurrentTerms(userId, undefined, 'recruiter')).rejects.toMatchObject({
      status: 422,
      property: 'consent',
      message: 'Confirm your age and accept the terms of use to open your recruiter space.'
    });
    // With the confirmation, recorded from where it was given
    await requireCurrentTerms(userId, CONSENT, 'recruiter');
    expect(await acceptances(userId)).toEqual([expect.objectContaining({ version: LEGAL_VERSION, source: 'recruiter' })]);
  });

  it('records nothing for an account that does not exist', async () => {
    const userId = new Types.ObjectId().toString();
    expect(await recordConsent(userId, CONSENT, 'account')).toBe(false);
    expect(await recordConsent('not-an-id', CONSENT, 'account')).toBe(false);
    expect(await User.exists({ _id: userId })).toBeNull();
  });
});
