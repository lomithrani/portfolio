// The hiring journey (GET/PUT /workflow, GET /workflow/domains/:domainName,
// PUT /workflow/domains/:domainName/job) against a real MongoDB (MONGO_URL,
// which must be local or come from TEST_MONGO_URL). Each test creates its own
// users, domains and postings, named with a suffix unique to that test, and
// removes them after: tests pass in any order (--randomize). The booking
// routes the journey gates are covered by tests/appointments.test.ts (they
// need its fake Google).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test';
import mongoose, { Types } from 'mongoose';
import { SignJWT } from 'jose';
import { env } from '../env';
import { createApp } from '../app';
import { Domain, JobPosting, User, Workflow, WorkflowInstance } from '../models/database';
import { enableRecruiterSpace } from '../services/recruiters';
import { authCookie } from './helpers';
import { assertDisposableDatabase } from './testDatabase';

/** Names unique to one test: everything it creates carries its suffix */
const testNames = () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const id = (name: string) => `wf-${name}-${suffix}`;
  return { suffix, id, email: (name: string) => `${id(name)}@example.com` };
};

let app: ReturnType<typeof createApp>;
let t: ReturnType<typeof testNames>;

const call = async (method: string, path: string, { body, cookie }: { body?: unknown; cookie?: string } = {}) => {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  const text = body === undefined ? undefined : JSON.stringify(body);
  if (text !== undefined) headers['Content-Type'] = 'application/json';
  const response = await app.fetch(new Request(`http://localhost${path}`, { method, headers, body: text }));
  const responseText = await response.text();
  return { status: response.status, text: responseText, json: <T = any>() => JSON.parse(responseText) as T };
};

interface TestUser {
  id: string;
  cookie: string;
  domain?: string;
}

const createUser = async (
  name: string,
  { recruiter = false, domain = false }: { recruiter?: boolean; domain?: boolean } = {}
): Promise<TestUser> => {
  const user = await User.create({ email: t.email(name), googleId: t.id(`sub-${name}`), name });
  const id = user._id.toString();
  if (recruiter) expect(await enableRecruiterSpace(id)).toBe(true);
  let domainName: string | undefined;
  if (domain) {
    domainName = t.id(name);
    await Domain.create({ name: domainName, admin: user._id, experiences: [] });
  }
  return { id, cookie: await authCookie(id), domain: domainName };
};

/** A job posting of `recruiter`, stored directly (the job routes are covered by tests/jobs.test.ts) */
const createJob = async (recruiter: TestUser, fields: Record<string, unknown> = {}) => {
  const job = await JobPosting.create({
    recruiter: recruiter.id,
    title: 'Staff Engineer',
    description: 'Build things.',
    company: 'Acme',
    status: 'open',
    location: { country: 'FR', city: 'Lyon', workMode: 'hybrid', remoteDaysPerWeek: 2 },
    contract: { type: 'cdi' },
    workingTime: { arrangement: 'weekly_hours', hoursPerWeek: 35 },
    pay: { min: 50000, max: 60000, currency: 'EUR', period: 'year' },
    ...fields
  });
  return job._id.toString();
};

const steps = (...types: string[]) => ({ steps: types.map((type) => ({ type })) });

const removeTestData = async (suffix: string) => {
  const named = new RegExp(`-${suffix}(@|$)`);
  const users = (await User.find({ email: named }, '_id').lean()).map((user) => user._id);
  await WorkflowInstance.deleteMany({ $or: [{ owner: { $in: users } }, { visitor: { $in: users } }] });
  await Workflow.deleteMany({ user: { $in: users } });
  await JobPosting.deleteMany({ recruiter: { $in: users } });
  await Domain.deleteMany({ $or: [{ admin: { $in: users } }, { name: named }] });
  await User.deleteMany({ _id: { $in: users } });
};

let connected = false;

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  // The unique indexes the routes rely on (one journey per owner, one progress per visitor)
  await Promise.all([User.init(), Domain.init(), Workflow.init(), WorkflowInstance.init()]);
});

afterAll(async () => {
  if (connected) await mongoose.disconnect();
});

beforeEach(() => {
  t = testNames();
  app = createApp();
});

afterEach(async () => {
  mock.restore();
  if (connected) await removeTestData(t.suffix);
});

describe("the owner's journey (GET, PUT /workflow)", () => {
  it('needs a session', async () => {
    expect((await call('GET', '/workflow')).status).toBe(401);
    expect((await call('PUT', '/workflow', { body: steps('meeting') })).status).toBe(401);
  });

  it('starts with the meeting step only, then keeps the steps saved, in their order', async () => {
    const owner = await createUser('owner', { domain: true });
    expect((await call('GET', '/workflow', { cookie: owner.cookie })).json()).toEqual(steps('meeting'));

    const saved = await call('PUT', '/workflow', { body: steps('job', 'meeting'), cookie: owner.cookie });
    expect(saved.status).toBe(200);
    expect(saved.json()).toEqual(steps('job', 'meeting'));
    expect((await call('GET', '/workflow', { cookie: owner.cookie })).json()).toEqual(steps('job', 'meeting'));

    // Replaced, never added to: one journey per account
    expect((await call('PUT', '/workflow', { body: steps(), cookie: owner.cookie })).json()).toEqual(steps());
    expect((await call('GET', '/workflow', { cookie: owner.cookie })).json()).toEqual(steps());
    expect(await Workflow.countDocuments({ user: owner.id })).toBe(1);
  });

  it('refuses a step used twice, a requirement that opens nothing and unknown steps', async () => {
    const owner = await createUser('owner');
    const refused = async (body: unknown) => {
      const answer = await call('PUT', '/workflow', { body, cookie: owner.cookie });
      expect(answer.status).toBe(422);
      return answer.json();
    };

    expect(await refused(steps('job'))).toMatchObject({ property: 'steps', message: expect.stringContaining('Book a meeting') });
    expect(await refused(steps('meeting', 'job'))).toMatchObject({ property: 'steps' });
    expect(await refused(steps('meeting', 'meeting'))).toMatchObject({ property: 'steps' });
    await refused(steps('contact'));
    await refused({ steps: [{ type: 'job' }, { type: 'meeting' }, { type: 'meeting' }] });
    await refused({});
    expect(await Workflow.countDocuments({ user: owner.id })).toBe(0);
  });

  it('saves one journey when two first saves race', async () => {
    const owner = await createUser('owner');
    const answers = await Promise.all(
      Array.from({ length: 5 }, () => call('PUT', '/workflow', { body: steps('job', 'meeting'), cookie: owner.cookie }))
    );
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await Workflow.countDocuments({ user: owner.id })).toBe(1);
  });
});

describe("a portfolio's journey (GET /workflow/domains/:domainName)", () => {
  it('shows the steps to anyone, and 404 for an unknown portfolio', async () => {
    const owner = await createUser('owner', { domain: true });
    expect((await call('GET', `/workflow/domains/${owner.domain}`)).json()).toEqual({
      steps: [{ type: 'meeting', done: false }]
    });

    await call('PUT', '/workflow', { body: steps('job', 'meeting'), cookie: owner.cookie });
    // Names are matched ignoring case, as the portfolio pages do
    const shown = await call('GET', `/workflow/domains/${owner.domain!.toUpperCase()}`);
    expect(shown.json()).toEqual({ steps: [{ type: 'job', done: false }, { type: 'meeting', done: false }] });

    const unknown = await call('GET', `/workflow/domains/${t.id('nope')}`);
    expect(unknown.status).toBe(404);
    expect(unknown.text).toBe('Domain not found');
  });

  it('tells the owner it is theirs, and ignores a cookie that is not a session', async () => {
    const owner = await createUser('owner', { domain: true });
    expect((await call('GET', `/workflow/domains/${owner.domain}`, { cookie: owner.cookie })).json()).toEqual({
      steps: [{ type: 'meeting', done: false }],
      own: true
    });
    // Only a session signed with JWT_SECRET counts: not the owner's id, nor a JWT naming them
    // signed with another key
    const otherKey = new TextEncoder().encode('another-secret');
    const foreignJwt = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(owner.id).setExpirationTime('1h').sign(otherKey);
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: owner.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.`;
    for (const cookie of ['auth=not-a-jwt', `auth=${owner.id}`, `auth=${foreignJwt}`, `auth=${unsigned}`]) {
      const forged = await call('GET', `/workflow/domains/${owner.domain}`, { cookie });
      expect({ cookie, status: forged.status, own: forged.json().own }).toEqual({ cookie, status: 200, own: undefined });
    }
  });

  it("follows the visitor's job: done while it is theirs and open", async () => {
    const owner = await createUser('owner', { domain: true });
    const recruiter = await createUser('recruiter', { recruiter: true });
    await call('PUT', '/workflow', { body: steps('job', 'meeting'), cookie: owner.cookie });
    const jobId = await createJob(recruiter);
    expect((await call('PUT', `/workflow/domains/${owner.domain}/job`, { body: { jobId }, cookie: recruiter.cookie })).status).toBe(200);

    const journey = () => call('GET', `/workflow/domains/${owner.domain}`, { cookie: recruiter.cookie }).then((answer) => answer.json());
    expect(await journey()).toEqual({
      steps: [{ type: 'job', done: true }, { type: 'meeting', done: false }],
      job: { _id: jobId, title: 'Staff Engineer', company: 'Acme', status: 'open' }
    });
    // Anyone else sees no progress
    expect((await call('GET', `/workflow/domains/${owner.domain}`)).json().steps[0].done).toBe(false);

    await JobPosting.updateOne({ _id: jobId }, { status: 'filled' });
    expect(await journey()).toEqual({
      steps: [{ type: 'job', done: false }, { type: 'meeting', done: false }],
      job: { _id: jobId, title: 'Staff Engineer', company: 'Acme', status: 'filled' }
    });

    await JobPosting.deleteOne({ _id: jobId });
    expect(await journey()).toEqual({ steps: [{ type: 'job', done: false }, { type: 'meeting', done: false }] });
  });
});

describe('the job step (PUT /workflow/domains/:domainName/job)', () => {
  const pick = (domain: string, jobId: string, cookie?: string) =>
    call('PUT', `/workflow/domains/${domain}/job`, { body: { jobId }, cookie });

  it('records the open job the recruiter picks, and the one picked after it', async () => {
    const owner = await createUser('owner', { domain: true });
    const recruiter = await createUser('recruiter', { recruiter: true });
    await call('PUT', '/workflow', { body: steps('job', 'meeting'), cookie: owner.cookie });
    const first = await createJob(recruiter);
    const second = await createJob(recruiter, { title: 'Platform Lead', company: undefined });

    const picked = await pick(owner.domain!, first, recruiter.cookie);
    expect(picked.status).toBe(200);
    expect(picked.json()).toEqual({
      steps: [{ type: 'job', done: true }, { type: 'meeting', done: false }],
      job: { _id: first, title: 'Staff Engineer', company: 'Acme', status: 'open' }
    });

    expect((await pick(owner.domain!, second, recruiter.cookie)).json().job).toEqual({
      _id: second,
      title: 'Platform Lead',
      status: 'open'
    });
    const instances = await WorkflowInstance.find({ owner: owner.id }).lean();
    expect(instances).toHaveLength(1);
    expect(String(instances[0].visitor)).toBe(recruiter.id);
    expect(String(instances[0].job)).toBe(second);
    expect(instances[0].jobSelectedAt).toBeInstanceOf(Date);
  });

  it('needs a session, a portfolio and a journey with a job step', async () => {
    const owner = await createUser('owner', { domain: true });
    const recruiter = await createUser('recruiter', { recruiter: true });
    const jobId = await createJob(recruiter);

    expect((await pick(owner.domain!, jobId)).status).toBe(401);
    expect((await pick(t.id('nope'), jobId, recruiter.cookie)).status).toBe(404);
    expect((await call('PUT', `/workflow/domains/${owner.domain}/job`, { body: { jobId: 'nope' }, cookie: recruiter.cookie })).status).toBe(422);

    // The default journey has no job step
    const noStep = await pick(owner.domain!, jobId, recruiter.cookie);
    expect(noStep.status).toBe(409);
    expect(noStep.text).toBe('This hiring journey does not ask for a job');
    expect(await WorkflowInstance.countDocuments({ owner: owner.id })).toBe(0);
  });

  it("refuses the owner, an account without a recruiter space, another recruiter's job and a job that is not open", async () => {
    const owner = await createUser('owner', { domain: true, recruiter: true });
    const recruiter = await createUser('recruiter', { recruiter: true });
    const candidate = await createUser('candidate', { domain: true });
    const other = await createUser('other', { recruiter: true });
    await call('PUT', '/workflow', { body: steps('job', 'meeting'), cookie: owner.cookie });

    const ownersJob = await createJob(owner);
    const own = await pick(owner.domain!, ownersJob, owner.cookie);
    expect(own.status).toBe(403);
    expect(own.text).toBe('You cannot pick a job for your own portfolio');

    const noSpace = await pick(owner.domain!, await createJob(recruiter), candidate.cookie);
    expect(noSpace.status).toBe(403);
    expect(noSpace.text).toBe('Create your recruiter space first');

    const notTheirs = await pick(owner.domain!, await createJob(other), recruiter.cookie);
    expect(notTheirs.status).toBe(404);
    expect(notTheirs.text).toBe('Job posting not found');
    expect((await pick(owner.domain!, new Types.ObjectId().toString(), recruiter.cookie)).status).toBe(404);

    for (const status of ['draft', 'on_hold', 'filled', 'closed']) {
      const answer = await pick(owner.domain!, await createJob(recruiter, { status }), recruiter.cookie);
      expect({ status, answer: answer.status, text: answer.text }).toEqual({
        status,
        answer: 409,
        text: 'Only an open job description can be picked'
      });
    }
    expect(await WorkflowInstance.countDocuments({ owner: owner.id })).toBe(0);
  });
});
