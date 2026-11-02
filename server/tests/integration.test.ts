// End-to-end tests against a real MongoDB (MONGO_URL, which must be local or
// come from TEST_MONGO_URL), going through the API with real models. Each test
// creates the users, domains and skills it needs, named with a suffix unique
// to that test, and removes them after: tests pass in any order (--randomize)
// and never touch data they did not create.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test';
import mongoose from 'mongoose';
import { env } from '../env';
import { createApp } from '../app';
import { Domain, Experience, Skill, User, Workflow } from '../models/database';
import {
  experienceRequestBody,
  getWithCookie,
  makeRequest,
  parseCookie,
  postJson,
  postWithCookie,
  putWithCookie,
  signGoogleIdToken,
  useTestGoogleKeys,
  workflowRequestBody,
  readJson
} from './helpers';
import { assertDisposableDatabase } from './testDatabase';

/** Names unique to one test: everything it creates carries its suffix */
const testNames = () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const id = (name: string) => `it-${name}-${suffix}`;
  return { suffix, id, email: (name: string) => `${id(name)}@example.com` };
};

/** Removes what a test created: everything named with its suffix, and what those users own */
const removeTestData = async (suffix: string) => {
  const named = new RegExp(`-${suffix}(@|$)`);
  const userIds = (await User.find({ email: named }, '_id')).map((user) => user._id);
  const domains = await Domain.find({ $or: [{ admin: { $in: userIds } }, { name: named }] });
  await Experience.deleteMany({
    $or: [{ _id: { $in: domains.flatMap((domain) => domain.experiences.map(String)) } }, { title: named }]
  });
  await Domain.deleteMany({ _id: { $in: domains.map((domain) => domain._id) } });
  await Workflow.deleteMany({ user: { $in: userIds } });
  await User.deleteMany({ _id: { $in: userIds } });
  await Skill.deleteMany({ displayName: named });
};

let app: ReturnType<typeof createApp>;
let t: ReturnType<typeof testNames>;
// Set once beforeAll has connected. Teardown then always runs: after a dropped
// connection Mongoose waits for it to come back, or the hook fails (never skipped)
let connected = false;

/** experienceRequestBody with skills named for this test, so its cleanup removes them */
const experienceBody = (fields: Record<string, unknown> = {}) => ({
  ...experienceRequestBody,
  projects: [
    {
      ...experienceRequestBody.projects[0],
      hardSkills: [{ name: t.id('skill-hard'), level: -1 }],
      softSkills: [{ name: t.id('skill-soft'), level: -1 }]
    }
  ],
  ...fields
});

/**
 * Logs in with Google as this test's user `name` (sub and email derived from
 * it); `email` signs in to another account's address
 */
const login = async (name: string, email = t.email(name)) => {
  const result = await postJson(app, '/login', {
    token: await signGoogleIdToken({ claims: { sub: t.id(`sub-${name}`), email } })
  });
  const cookie = `auth=${parseCookie(result.headers.get('Set-Cookie') ?? '')['auth']}`;
  return { result, cookie, body: result.status === 200 ? await readJson(result) : undefined };
};

/** Logs in as `name`, who then claims the domain `domainName` */
const loginWithDomain = async (name: string, domainName: string) => {
  const user = await login(name);
  expect(user.result.status).toBe(200);
  const claim = await postWithCookie(app, '/domain/claim', { name: domainName }, user.cookie);
  expect(claim.status).toBe(200);
  return user;
};

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  // Unique indexes must exist for the race and conflict tests
  await Promise.all([User.init(), Domain.init(), Skill.init()]);
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
  if (connected) await removeTestData(t.suffix);
});

describe('login with Google (real users collection)', () => {
  it('creates a user keyed by Google sub on first login, then finds it by sub', async () => {
    const first = await login('owner');
    expect(first.result.status).toBe(200);
    const stored = await User.findOne({ email: t.email('owner') });
    expect(stored?.googleId).toBe(t.id('sub-owner'));

    const second = await login('owner');
    expect(second.body.user._id).toBe(first.body.user._id);
    expect(await User.countDocuments({ email: t.email('owner') })).toBe(1);
  });

  it('links a user created before googleId existed (matched by verified email)', async () => {
    const legacy = await User.create({ email: t.email('legacy'), name: 'Legacy' });

    const { result, body } = await login('legacy');

    expect(result.status).toBe(200);
    expect(body.user._id).toBe(legacy._id.toString());
    expect((await User.findById(legacy._id))?.googleId).toBe(t.id('sub-legacy'));
  });

  it('never hands an account linked to one Google account to another', async () => {
    // A legacy account, linked to its Google account by its first login
    await User.create({ email: t.email('legacy'), name: 'Legacy' });
    expect((await login('legacy')).result.status).toBe(200);

    const { result } = await login('intruder', t.email('legacy'));

    expect(result.status).toBe(409);
    expect(result.headers.get('Set-Cookie') ?? '').not.toContain('auth=ey');
  });
});

describe('domains and experiences (real collections)', () => {
  it('claims a domain, then rejects a second claim of the same name', async () => {
    const domainName = t.id('domain');
    const owner = await login('owner');
    const other = await login('other');

    const claim = await postWithCookie(app, '/domain/claim', { name: domainName.toUpperCase() }, owner.cookie);
    expect(claim.status).toBe(200);
    expect((await readJson(claim)).name).toBe(domainName);

    const taken = await postWithCookie(app, '/domain/claim', { name: domainName }, other.cookie);
    expect(taken.status).toBe(409);

    const invalid = await postWithCookie(app, '/domain/claim', { name: 'login' }, other.cookie);
    expect(invalid.status).toBe(400);
  });

  it('creates experiences from the admin form and serves them populated', async () => {
    const domainName = t.id('domain');
    const companyName = `IT Company ${t.suffix}`;
    const [skillA, skillB] = [t.id('skill-a'), t.id('skill-b')];
    const owner = await loginWithDomain('owner', domainName);
    const project = {
      ...experienceRequestBody.projects[0],
      hardSkills: [{ name: skillA, level: -1 }, { name: skillA, level: -1 }],
      softSkills: [{ name: skillB, level: -1 }]
    };

    // The form's default company { name: '' } means "no company"
    const withoutCompany = await postWithCookie(
      app,
      '/experiences',
      { ...experienceRequestBody, projects: [project] },
      owner.cookie
    );
    expect(withoutCompany.status).toBe(200);
    const created = await readJson(withoutCompany);
    expect(created.company).toBeUndefined();
    // Populated like GET /domain/:name, so the client can render it as is
    expect(created.projects[0].hardSkills[0].skill.displayName).toBe(skillA);

    const withCompany = await postWithCookie(
      app,
      '/experiences',
      {
        ...experienceRequestBody,
        title: 'Second',
        company: { name: companyName, summary: 'Owner summary' },
        projects: [project]
      },
      owner.cookie
    );
    expect(withCompany.status).toBe(200);
    const second = await readJson(withCompany);
    expect(second.company).toEqual({ name: companyName, summary: 'Owner summary' });

    const domain = await readJson(await makeRequest(app, `/domain/${domainName}`));
    expect(domain.admin).toBe(owner.body.user._id);
    expect(domain.experiences).toHaveLength(2);
    expect(domain.experiences[1].company.name).toBe(companyName);
    expect(domain.experiences[1].projects[0].hardSkills[0].skill.displayName).toBe(skillA);
    expect(domain.experiences[1].projects[0].softSkills[0].skill.displayName).toBe(skillB);

    // Editing sends back the company it received, here with a new summary
    const edited = await putWithCookie(
      app,
      `/experiences/${second._id}`,
      {
        ...experienceRequestBody,
        title: 'Second (edited)',
        company: { ...domain.experiences[1].company, summary: 'Edited summary' },
        projects: [project]
      },
      owner.cookie
    );
    expect(edited.status).toBe(200);
    const editedBody = await readJson(edited);
    expect(editedBody.title).toBe('Second (edited)');
    expect(editedBody.company).toEqual({ name: companyName, summary: 'Edited summary' });
    expect(await Skill.countDocuments({ displayName: skillA })).toBe(1);
  });

  it('keeps company details per experience when two tenants use the same name', async () => {
    const [domainName, otherDomainName] = [t.id('domain'), t.id('domain-other')];
    const companyName = `IT Company ${t.suffix}`;
    const owner = await loginWithDomain('owner', domainName);
    const ownerPosted = await postWithCookie(
      app,
      '/experiences',
      experienceBody({ company: { name: companyName, summary: 'Owner summary' } }),
      owner.cookie
    );
    expect(ownerPosted.status).toBe(200);

    const other = await login('other');
    const claim = await postWithCookie(app, '/domain/claim', { name: otherDomainName }, other.cookie);
    expect(claim.status).toBe(200);

    const posted = await postWithCookie(
      app,
      '/experiences',
      experienceBody({
        title: 'Other tenant',
        company: { name: companyName, summary: 'Other summary', svg: '<svg onload="x()"/>' }
      }),
      other.cookie
    );
    expect(posted.status).toBe(200);

    const ownerDomain = await readJson(await makeRequest(app, `/domain/${domainName}`));
    expect(ownerDomain.experiences[0].company).toEqual({ name: companyName, summary: 'Owner summary' });
    const otherDomain = await readJson(await makeRequest(app, `/domain/${otherDomainName}`));
    expect(otherDomain.experiences[0].company).toEqual({
      name: companyName,
      summary: 'Other summary',
      svg: '<svg onload="x()"/>'
    });
  });

  it('returns 403 when another user edits the domain', async () => {
    const domainName = t.id('domain');
    await loginWithDomain('owner', domainName);
    const other = await login('other');

    const result = await putWithCookie(app, `/domain/${domainName}`, { theme: 'crimson' }, other.cookie);

    expect(result.status).toBe(403);
  });
});

describe('cross-site form bodies (real collections)', () => {
  const formRequest = (path: string, body: FormData | URLSearchParams, cookie: string) =>
    makeRequest(app, path, { method: 'POST', headers: { Cookie: cookie }, body });

  const multipart = (fields: Record<string, string>) => {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.set(name, value);
    return form;
  };

  it('answers 415 to multipart and urlencoded bodies and writes nothing', async () => {
    const [domainName, formDomainName] = [t.id('domain'), t.id('domain-form')];
    const owner = await loginWithDomain('owner', domainName);
    const experienceCount = (await Domain.findOne({ name: domainName }))!.experiences.length;
    const planted = {
      type: 'professional',
      title: t.id('form-experience'),
      summary: 'Planted by a cross-site form',
      projects: '[]'
    };

    for (const body of [multipart(planted), new URLSearchParams(planted)]) {
      expect((await formRequest('/experiences', body, owner.cookie)).status).toBe(415);
    }
    expect(await Experience.countDocuments({ title: planted.title })).toBe(0);
    expect((await Domain.findOne({ name: domainName }))!.experiences).toHaveLength(experienceCount);

    // A user without a domain cannot be given one either
    const user = await login('form');
    for (const body of [new URLSearchParams({ name: formDomainName }), multipart({ name: formDomainName })]) {
      expect((await formRequest('/domain/claim', body, user.cookie)).status).toBe(415);
    }
    expect(await Domain.exists({ name: formDomainName })).toBeNull();

    // The same requests as JSON (what the client sends) go through
    const claim = await postWithCookie(app, '/domain/claim', { name: formDomainName }, user.cookie);
    expect(claim.status).toBe(200);
    const posted = await postWithCookie(
      app,
      '/experiences',
      experienceBody({ title: planted.title }),
      user.cookie
    );
    expect(posted.status).toBe(200);
  });
});

describe('workflows (real collection)', () => {
  it('persists a workflow and rejects an empty name', async () => {
    const owner = await login('owner');

    const created = await postWithCookie(app, '/workflows', workflowRequestBody, owner.cookie);
    expect(created.status).toBe(200);
    const workflow = await readJson(created);
    expect(await Workflow.exists({ _id: workflow._id })).toBeTruthy();

    const empty = await postWithCookie(app, '/workflows', { name: '', enabled: true }, owner.cookie);
    expect(empty.status).toBe(422);

    const isLogged = await getWithCookie(app, '/isLogged', owner.cookie);
    expect((await readJson(isLogged)).user.email).toBe(t.email('owner'));
  });
});

describe('Skill.findOrCreate under concurrency', () => {
  it('creates one skill when the same new name is looked up concurrently', async () => {
    const skillName = t.id('race');
    const ids = await Promise.all(Array.from({ length: 5 }, () => Skill.findOrCreate(skillName)));

    expect(new Set(ids.map(String)).size).toBe(1);
    expect(await Skill.countDocuments({ displayName: skillName })).toBe(1);
  });
});
