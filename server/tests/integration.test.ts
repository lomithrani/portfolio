// End-to-end tests against a real MongoDB (MONGO_URL), going through the API
// with real models. Every document uses a unique suffix and is removed after.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test';
import mongoose from 'mongoose';
import { env } from '../env';
import { createApp } from '../app';
import { Company, Domain, Experience, Skill, User, Workflow } from '../models/database';
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

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const id = (name: string) => `it-${name}-${suffix}`;
const emails = ['owner', 'legacy', 'other'].map((name) => `${id(name)}@example.com`);
const [OWNER_EMAIL, LEGACY_EMAIL, OTHER_EMAIL] = emails;
const DOMAIN_NAME = id('domain');
const COMPANY_NAME = `IT Company ${suffix}`;
const SKILL_NAMES = [id('skill-a'), id('skill-b'), id('race')];

let app: ReturnType<typeof createApp>;

const login = async (sub: string, email: string) => {
  const result = await postJson(app, '/login', {
    token: await signGoogleIdToken({ claims: { sub, email } })
  });
  const cookie = `auth=${parseCookie(result.headers.get('Set-Cookie') ?? '')['auth']}`;
  return { result, cookie, body: result.status === 200 ? await readJson(result) : undefined };
};

beforeAll(async () => {
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  // Unique indexes must exist for the race and conflict tests
  await Promise.all([User.init(), Domain.init(), Skill.init(), Company.init()]);
});

afterAll(async () => {
  const users = await User.find({ email: { $in: emails } });
  const userIds = users.map((user) => user._id);
  const domains = await Domain.find({ admin: { $in: userIds } });
  await Experience.deleteMany({ _id: { $in: domains.flatMap((domain) => domain.experiences.map(String)) } });
  await Domain.deleteMany({ _id: { $in: domains.map((domain) => domain._id) } });
  await Workflow.deleteMany({ user: { $in: userIds } });
  await User.deleteMany({ _id: { $in: userIds } });
  await Company.deleteMany({ name: COMPANY_NAME });
  await Skill.deleteMany({ displayName: { $in: SKILL_NAMES } });
  await mongoose.disconnect();
});

beforeEach(() => {
  app = createApp();
  useTestGoogleKeys();
});

afterEach(() => {
  mock.restore();
});

describe('login with Google (real users collection)', () => {
  it('creates a user keyed by Google sub on first login, then finds it by sub', async () => {
    const first = await login(id('sub-owner'), OWNER_EMAIL);
    expect(first.result.status).toBe(200);
    const stored = await User.findOne({ email: OWNER_EMAIL });
    expect(stored?.googleId).toBe(id('sub-owner'));

    const second = await login(id('sub-owner'), OWNER_EMAIL);
    expect(second.body.user._id).toBe(first.body.user._id);
    expect(await User.countDocuments({ email: OWNER_EMAIL })).toBe(1);
  });

  it('links a user created before googleId existed (matched by verified email)', async () => {
    const legacy = await User.create({ email: LEGACY_EMAIL, name: 'Legacy' });

    const { result, body } = await login(id('sub-legacy'), LEGACY_EMAIL);

    expect(result.status).toBe(200);
    expect(body.user._id).toBe(legacy._id.toString());
    expect((await User.findById(legacy._id))?.googleId).toBe(id('sub-legacy'));
  });

  it('never hands an account linked to one Google account to another', async () => {
    const { result } = await login(id('sub-intruder'), LEGACY_EMAIL);

    expect(result.status).toBe(409);
    expect(result.headers.get('Set-Cookie') ?? '').not.toContain('auth=ey');
  });
});

describe('domains and experiences (real collections)', () => {
  it('claims a domain, then rejects a second claim of the same name', async () => {
    const owner = await login(id('sub-owner'), OWNER_EMAIL);
    const other = await login(id('sub-other'), OTHER_EMAIL);

    const claim = await postWithCookie(app, '/domain/claim', { name: DOMAIN_NAME.toUpperCase() }, owner.cookie);
    expect(claim.status).toBe(200);
    expect((await readJson(claim)).name).toBe(DOMAIN_NAME);

    const taken = await postWithCookie(app, '/domain/claim', { name: DOMAIN_NAME }, other.cookie);
    expect(taken.status).toBe(409);

    const invalid = await postWithCookie(app, '/domain/claim', { name: 'login' }, other.cookie);
    expect(invalid.status).toBe(400);
  });

  it('creates experiences from the admin form and serves them populated', async () => {
    const owner = await login(id('sub-owner'), OWNER_EMAIL);
    const project = {
      ...experienceRequestBody.projects[0],
      hardSkills: [{ name: SKILL_NAMES[0], level: -1 }, { name: SKILL_NAMES[0], level: -1 }],
      softSkills: [{ name: SKILL_NAMES[1], level: -1 }]
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
    expect(created.projects[0].hardSkills[0].skill.displayName).toBe(SKILL_NAMES[0]);

    const withCompany = await postWithCookie(
      app,
      '/experiences',
      { ...experienceRequestBody, title: 'Second', company: { name: COMPANY_NAME }, projects: [project] },
      owner.cookie
    );
    expect(withCompany.status).toBe(200);
    const second = await readJson(withCompany);
    expect(second.company.name).toBe(COMPANY_NAME);

    const domain = await readJson(await makeRequest(app, `/domain/${DOMAIN_NAME}`));
    expect(domain.admin).toBe(owner.body.user._id);
    expect(domain.experiences).toHaveLength(2);
    expect(domain.experiences[1].company.name).toBe(COMPANY_NAME);
    expect(domain.experiences[1].projects[0].hardSkills[0].skill.displayName).toBe(SKILL_NAMES[0]);
    expect(domain.experiences[1].projects[0].softSkills[0].skill.displayName).toBe(SKILL_NAMES[1]);

    // Editing sends back the populated company it received
    const edited = await putWithCookie(
      app,
      `/experiences/${second._id}`,
      {
        ...experienceRequestBody,
        title: 'Second (edited)',
        company: domain.experiences[1].company,
        projects: [project]
      },
      owner.cookie
    );
    expect(edited.status).toBe(200);
    const editedBody = await readJson(edited);
    expect(editedBody.title).toBe('Second (edited)');
    expect(editedBody.company._id).toBe(second.company._id);
    expect(await Company.countDocuments({ name: COMPANY_NAME })).toBe(1);
    expect(await Skill.countDocuments({ displayName: SKILL_NAMES[0] })).toBe(1);
  });

  it('returns 403 when another user edits the domain', async () => {
    const other = await login(id('sub-other'), OTHER_EMAIL);

    const result = await putWithCookie(app, `/domain/${DOMAIN_NAME}`, { theme: 'crimson' }, other.cookie);

    expect(result.status).toBe(403);
  });
});

describe('workflows (real collection)', () => {
  it('persists a workflow and rejects an empty name', async () => {
    const owner = await login(id('sub-owner'), OWNER_EMAIL);

    const created = await postWithCookie(app, '/workflows', workflowRequestBody, owner.cookie);
    expect(created.status).toBe(200);
    const workflow = await readJson(created);
    expect(await Workflow.exists({ _id: workflow._id })).toBeTruthy();

    const empty = await postWithCookie(app, '/workflows', { name: '', enabled: true }, owner.cookie);
    expect(empty.status).toBe(422);

    const isLogged = await getWithCookie(app, '/isLogged', owner.cookie);
    expect((await readJson(isLogged)).user.email).toBe(OWNER_EMAIL);
  });
});

describe('findOrCreate under concurrency', () => {
  it('creates one skill when the same new name is looked up concurrently', async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, () => Skill.findOrCreate(SKILL_NAMES[2])));

    expect(new Set(ids.map(String)).size).toBe(1);
    expect(await Skill.countDocuments({ displayName: SKILL_NAMES[2] })).toBe(1);
  });

  it('creates one company when the same new name is looked up concurrently', async () => {
    const ids = await Promise.all(
      Array.from({ length: 5 }, () => Company.findOrCreate({ name: ` ${COMPANY_NAME} ` }))
    );

    expect(new Set(ids.map(String)).size).toBe(1);
    expect(await Company.countDocuments({ name: COMPANY_NAME })).toBe(1);
    expect(await Company.findOrCreate({ name: '  ' })).toBeUndefined();
  });
});
