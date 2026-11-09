// End-to-end tests against a real MongoDB (MONGO_URL, which must be local or
// come from TEST_MONGO_URL), going through the API with real models. Each test
// creates the users, domains and skills it needs, named with a suffix unique
// to that test, and removes them after: tests pass in any order (--randomize)
// and never touch data they did not create.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import mongoose, { Types } from 'mongoose';
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
  deleteWithCookie,
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
  // Skill names match ignoring case: a test may create any casing of its names
  await Skill.deleteMany({ displayName: new RegExp(named.source, 'i') });
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

describe('experience fields and validation (real collections)', () => {
  it('stores location and period, serves them, and changes or clears them on edit', async () => {
    const domainName = t.id('domain');
    const owner = await loginWithDomain('owner', domainName);
    const project = experienceBody().projects[0];

    const posted = await postWithCookie(
      app,
      '/experiences',
      experienceBody({
        location: ' Paris, France ',
        // Month precision: stored as the 1st of the month (UTC)
        start: '2024-03-15T10:00:00.000Z',
        projects: [{ ...project, start: '2024-03-01T00:00:00.000Z' }]
      }),
      owner.cookie
    );
    expect(posted.status).toBe(200);
    const created = await readJson(posted);
    expect(created).toMatchObject({ location: 'Paris, France', start: '2024-03-01T00:00:00.000Z' });
    // Ongoing
    expect(created.end).toBeUndefined();

    const served = (await readJson(await makeRequest(app, `/domain/${domainName}`))).experiences[0];
    expect(served).toMatchObject({ _id: created._id, location: 'Paris, France', start: '2024-03-01T00:00:00.000Z' });
    expect(served.end).toBeUndefined();
    expect(served.projects[0].start).toBe('2024-03-01T00:00:00.000Z');
    expect(served.projects[0].end).toBeUndefined();

    // Ended, location cleared
    const ended = await putWithCookie(
      app,
      `/experiences/${created._id}`,
      experienceBody({ location: '  ', start: '2024-03-01T00:00:00.000Z', end: '2025-06-01T00:00:00.000Z' }),
      owner.cookie
    );
    expect(ended.status).toBe(200);
    let stored = (await Experience.findById(created._id))!.toObject();
    expect(stored).not.toHaveProperty('location');
    expect(stored.start?.toISOString()).toBe('2024-03-01T00:00:00.000Z');
    expect(stored.end?.toISOString()).toBe('2025-06-01T00:00:00.000Z');

    // No period at all
    const undated = await putWithCookie(app, `/experiences/${created._id}`, experienceBody(), owner.cookie);
    expect(undated.status).toBe(200);
    stored = (await Experience.findById(created._id))!.toObject();
    expect(stored).not.toHaveProperty('start');
    expect(stored).not.toHaveProperty('end');
  });

  it('answers 422 naming the field for an end before the start or a blank name, writing nothing', async () => {
    const domainName = t.id('domain');
    const owner = await loginWithDomain('owner', domainName);
    const title = t.id('invalid');
    const project = experienceBody().projects[0];
    const invalid: [Record<string, unknown>, string][] = [
      [{ title, start: '2024-03-01T00:00:00.000Z', end: '2023-12-01T00:00:00.000Z' }, 'end'],
      [{ title, projects: [{ ...project, start: '2024-03-01T00:00:00.000Z', end: '2024-01-01T00:00:00.000Z' }] }, 'projects.0.end'],
      [{ title: '  ' }, 'title'],
      [{ title, projects: [project, { ...project, name: '   ' }] }, 'projects.1.name']
    ];

    for (const [fields, property] of invalid) {
      const result = await postWithCookie(app, '/experiences', experienceBody(fields), owner.cookie);
      expect(result.status).toBe(422);
      expect(await readJson(result)).toMatchObject({ type: 'validation', property });
    }
    expect(await Experience.countDocuments({ title })).toBe(0);
    expect((await Domain.findOne({ name: domainName }))!.experiences).toHaveLength(0);
    // Skills are only created for a valid request
    expect(await Skill.countDocuments({ displayName: new RegExp(`-${t.suffix}$`, 'i') })).toBe(0);

    // An invalid edit leaves the stored experience as it was
    const created = await readJson(await postWithCookie(app, '/experiences', experienceBody({ title }), owner.cookie));
    const edit = await putWithCookie(
      app,
      `/experiences/${created._id}`,
      experienceBody({ title: 'Edited', start: '2024-03-01T00:00:00.000Z', end: '2024-02-01T00:00:00.000Z' }),
      owner.cookie
    );
    expect(edit.status).toBe(422);
    expect((await readJson(edit)).property).toBe('end');
    expect((await Experience.findById(created._id))?.title).toBe(title);
  });

  it('reuses an existing skill whatever the case of the name sent', async () => {
    const owner = await loginWithDomain('owner', t.id('domain'));
    const displayName = t.id('TypeScript');
    const existing = await Skill.create({ displayName, names: [displayName] });

    const posted = await postWithCookie(
      app,
      '/experiences',
      experienceBody({
        projects: [{
          ...experienceRequestBody.projects[0],
          hardSkills: [{ name: ` ${displayName.toLowerCase()} `, level: -1 }, { name: displayName.toUpperCase(), level: -1 }],
          softSkills: [{ name: displayName.toLowerCase(), level: -1 }]
        }]
      }),
      owner.cookie
    );

    expect(posted.status).toBe(200);
    const { projects } = await readJson(posted);
    // One entry per skill, shown with the existing spelling
    expect(projects[0].hardSkills).toHaveLength(1);
    expect(projects[0].hardSkills[0].skill).toMatchObject({ _id: String(existing._id), displayName });
    expect(projects[0].softSkills[0].skill._id).toBe(String(existing._id));
    expect(await Skill.countDocuments({ displayName: new RegExp(`-${t.suffix}$`, 'i') })).toBe(1);
  });

  it('keeps every experience posted concurrently', async () => {
    const domainName = t.id('domain');
    const owner = await loginWithDomain('owner', domainName);

    const results = await Promise.all(
      [1, 2, 3].map((n) => postWithCookie(app, '/experiences', experienceBody({ title: `Concurrent ${n}` }), owner.cookie))
    );

    expect(results.map((result) => result.status)).toEqual([200, 200, 200]);
    const ids = await Promise.all(results.map(async (result) => (await readJson(result))._id));
    const domain = await Domain.findOne({ name: domainName });
    expect(domain!.experiences.map(String).sort()).toEqual(ids.sort());
  });

  it('leaves no orphan experience when its domain cannot be updated', async () => {
    const domainName = t.id('domain');
    const owner = await loginWithDomain('owner', domainName);
    const title = t.id('orphan');
    spyOn(Domain, 'updateOne').mockRejectedValueOnce(new Error('write conflict') as never);

    const result = await postWithCookie(app, '/experiences', experienceBody({ title }), owner.cookie);

    expect(result.status).toBe(500);
    expect(await Experience.countDocuments({ title })).toBe(0);
    expect((await Domain.findOne({ name: domainName }))!.experiences).toHaveLength(0);
  });
});

describe('DELETE /experiences/:id (real collections)', () => {
  it('deletes an experience of the owner: gone from the domain and the collection', async () => {
    const domainName = t.id('domain');
    const owner = await loginWithDomain('owner', domainName);
    const ids: string[] = [];
    for (const title of ['First', 'Second']) {
      const posted = await postWithCookie(app, '/experiences', experienceBody({ title }), owner.cookie);
      ids.push((await readJson(posted))._id);
    }

    const result = await deleteWithCookie(app, `/experiences/${ids[0]}`, owner.cookie);

    expect(result.status).toBe(200);
    expect(await readJson(result)).toEqual({ id: ids[0] });
    const domain = await readJson(await makeRequest(app, `/domain/${domainName}`));
    expect(domain.experiences.map((experience: { _id: string }) => experience._id)).toEqual([ids[1]]);
    expect(await Experience.exists({ _id: ids[0] })).toBeNull();
    expect(await Experience.exists({ _id: ids[1] })).toBeTruthy();

    // Already gone
    expect((await deleteWithCookie(app, `/experiences/${ids[0]}`, owner.cookie)).status).toBe(404);
  });

  it('answers 404 for another user\'s experience or an unknown id, 422 for a malformed id, 401 without auth', async () => {
    const domainName = t.id('domain');
    const owner = await loginWithDomain('owner', domainName);
    const other = await loginWithDomain('other', t.id('domain-other'));
    const { _id: id } = await readJson(await postWithCookie(app, '/experiences', experienceBody(), owner.cookie));

    expect((await deleteWithCookie(app, `/experiences/${id}`, other.cookie)).status).toBe(404);
    expect((await deleteWithCookie(app, `/experiences/${new Types.ObjectId()}`, owner.cookie)).status).toBe(404);
    expect((await deleteWithCookie(app, '/experiences/not-an-id', owner.cookie)).status).toBe(422);
    expect((await deleteWithCookie(app, `/experiences/${id}`, '')).status).toBe(401);

    // Untouched
    expect(await Experience.exists({ _id: id })).toBeTruthy();
    expect((await Domain.findOne({ name: domainName }))!.experiences.map(String)).toEqual([id]);
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

describe('hiring journey (real collection)', () => {
  it('persists the journey and refuses a step that opens nothing', async () => {
    const owner = await login('owner');
    expect(owner.result.status).toBe(200);

    const saved = await putWithCookie(app, '/workflow', workflowRequestBody, owner.cookie);
    expect(saved.status).toBe(200);
    expect(await readJson(saved)).toEqual(workflowRequestBody);
    const stored = await Workflow.findOne({ user: owner.body.user._id }).lean();
    expect(stored?.steps.map((step) => step.type)).toEqual(['job', 'meeting']);

    const dangling = await putWithCookie(app, '/workflow', { steps: [{ type: 'job' }] }, owner.cookie);
    expect(dangling.status).toBe(422);

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

  it('matches names and aliases ignoring case and spaces, keeping the display name', async () => {
    const displayName = t.id('Kubernetes');
    const alias = t.id('k8s');
    const skill = await Skill.create({ displayName, names: [displayName, alias] });

    expect(String(await Skill.findOrCreate(alias.toUpperCase()))).toBe(String(skill._id));
    expect(String(await Skill.findOrCreate(` ${displayName.toLowerCase()} `))).toBe(String(skill._id));

    expect((await Skill.findById(skill._id))?.displayName).toBe(displayName);
    expect(await Skill.countDocuments({ displayName: new RegExp(`-${t.suffix}$`, 'i') })).toBe(1);
  });

  it('resolves to the oldest of case variants stored before matching ignored case', async () => {
    const older = await Skill.create({ displayName: t.id('Rust') });
    await Skill.create({ displayName: t.id('rust') });

    expect(String(await Skill.findOrCreate(t.id('RUST')))).toBe(String(older._id));
  });
});
