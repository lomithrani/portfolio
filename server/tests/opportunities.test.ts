// The private page of a job posting (GET /opportunities/jobs/:id, services/jobAccess.ts) against
// a real MongoDB (MONGO_URL, which must be local or come from TEST_MONGO_URL): its recruiter reads
// it, and the portfolio owner on whose hiring journey the recruiter picked it; anyone else gets
// the 404 of an unknown id. Each test creates its own owners, recruiters, postings, journeys and
// progress, named with a suffix unique to that test, and removes them after: tests pass in any
// order (--randomize).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test';
import mongoose, { Types } from 'mongoose';
import { env } from '../env';
import { createApp } from '../app';
import { Domain, JobPosting, User, Workflow, WorkflowInstance } from '../models/database';
import { authCookie, openRecruiterSpace } from './helpers';
import { assertDisposableDatabase } from './testDatabase';

/** Names unique to one test: everything it creates carries its suffix */
const testNames = () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const id = (name: string) => `opp-${name}-${suffix}`;
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
  email: string;
  cookie: string;
  domain?: string;
}

const createUser = async (
  name: string,
  { recruiter = false, domain = false }: { recruiter?: boolean; domain?: boolean } = {}
): Promise<TestUser> => {
  const email = t.email(name);
  const user = await User.create({ email, googleId: t.id(`sub-${name}`), name, surname: 'Tester' });
  const id = user._id.toString();
  if (recruiter) expect(await openRecruiterSpace(id)).toBe(true);
  let domainName: string | undefined;
  if (domain) {
    domainName = t.id(name);
    await Domain.create({ name: domainName, admin: user._id, experiences: [] });
  }
  return { id, email, cookie: await authCookie(id), domain: domainName };
};

/** A job posting of `recruiter`, stored directly (the job routes are covered by tests/jobs.test.ts) */
const createJob = async (recruiter: TestUser, fields: Record<string, unknown> = {}) => {
  const job = await JobPosting.create({
    recruiter: recruiter.id,
    title: 'Staff Engineer',
    description: 'Build **things**.',
    company: 'Acme',
    status: 'open',
    location: { country: 'FR', city: 'Lyon', workMode: 'hybrid', remoteDaysPerWeek: 2 },
    contract: { type: 'cdi' },
    workingTime: { arrangement: 'weekly_hours', hoursPerWeek: 35 },
    pay: { min: 50000, max: 60000, currency: 'EUR', period: 'year' },
    publishedAt: new Date(),
    ...fields
  });
  return job._id.toString();
};

/** The owner saves a journey of these step types, each under its type's name */
const setJourney = async (owner: TestUser, ...types: string[]) => {
  const saved = await call('PUT', '/workflow', {
    body: { steps: types.map((type) => ({ id: type, type, config: {} })) },
    cookie: owner.cookie
  });
  expect(saved.status).toBe(200);
};

/** `recruiter` picks the posting `jobId` on the job step of `owner`'s journey, as the Hire page does */
const pick = async (owner: TestUser, recruiter: TestUser, jobId: string, stepId = 'job') => {
  const picked = await call('POST', `/workflow/domains/${owner.domain}/steps/${stepId}`, {
    body: { input: { jobId } },
    cookie: recruiter.cookie
  });
  expect(picked.status).toBe(200);
};

/** GET /opportunities/jobs/:id as `user` (none: signed out) */
const read = (jobId: string, user?: TestUser) => call('GET', `/opportunities/jobs/${jobId}`, { cookie: user?.cookie });

/** An owner with a journey (a job step, then the meeting), and a recruiter who picked an open job on it */
const pickedJob = async () => {
  const owner = await createUser('owner', { domain: true });
  const recruiter = await createUser('recruiter', { recruiter: true });
  await setJourney(owner, 'job', 'meeting');
  const jobId = await createJob(recruiter);
  await pick(owner, recruiter, jobId);
  return { owner, recruiter, jobId };
};

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
  await Promise.all([User.init(), Domain.init(), JobPosting.init(), Workflow.init(), WorkflowInstance.init()]);
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

/** What the API answers for a posting the caller may not read: the 404 of an id no posting has */
const notFound = { status: 404, text: 'Job posting not found' };

describe('GET /opportunities/jobs/:id', () => {
  it('needs a session (401), whatever the id', async () => {
    const { jobId } = await pickedJob();
    for (const id of [jobId, new Types.ObjectId().toString(), 'not-an-id']) {
      const answer = await read(id);
      expect([id, answer.status]).toEqual([id, 401]);
      expect(answer.text).not.toContain('Staff Engineer');
    }
  });

  it('answers 422 for an id that is not one', async () => {
    const { owner } = await pickedJob();
    for (const id of ['not-an-id', '123', `${new Types.ObjectId().toString()}0`]) {
      expect([id, (await read(id, owner)).status]).toEqual([id, 422]);
    }
  });

  it('lets the recruiter read their own posting, whatever its status, draft included', async () => {
    const recruiter = await createUser('recruiter', { recruiter: true });
    for (const status of ['draft', 'open', 'on_hold', 'filled', 'closed']) {
      const jobId = await createJob(recruiter, { status, title: `Job ${status}` });
      const answer = await read(jobId, recruiter);
      expect([status, answer.status]).toEqual([status, 200]);
      const { job, access } = answer.json();
      expect(access).toBe('recruiter');
      expect(job).toMatchObject({ _id: jobId, title: `Job ${status}`, status, company: 'Acme' });
      expect(job).not.toHaveProperty('recruiter');
    }
  });

  it('lets the owner read the posting the recruiter picked on their journey, never naming the recruiter', async () => {
    const { owner, recruiter, jobId } = await pickedJob();

    const answer = await read(jobId, owner);
    expect(answer.status).toBe(200);
    const { job, access } = answer.json();
    expect(access).toBe('journey');
    expect(job).toMatchObject({
      _id: jobId,
      title: 'Staff Engineer',
      description: 'Build **things**.',
      company: 'Acme',
      status: 'open',
      location: { country: 'FR', city: 'Lyon', workMode: 'hybrid', remoteDaysPerWeek: 2 },
      pay: { min: 50000, max: 60000, currency: 'EUR', period: 'year' }
    });
    // The version the recruiter shared, and when
    expect(Object.keys(answer.json()).sort()).toEqual(['access', 'job', 'sharedAt']);
    expect(job).not.toHaveProperty('recruiter');
    expect(answer.text).not.toContain(recruiter.id);
    expect(answer.text).not.toContain(recruiter.email);
  });

  it('serves the owner the version the recruiter shared, until they share the posting again', async () => {
    const { owner, recruiter, jobId } = await pickedJob();
    const shared = await read(jobId, owner);
    const { sharedAt, job: before } = shared.json();
    expect(new Date(sharedAt).getTime()).not.toBeNaN();

    // Edited since (its description, and a pay written here directly: once opened, the API locks it)
    await JobPosting.updateOne(
      { _id: jobId },
      { description: 'Build *other* things.', pay: { min: 70000, max: 80000, currency: 'EUR', period: 'year' } }
    );
    const kept = (await read(jobId, owner)).json();
    expect(kept).toEqual({ access: 'journey', job: before, sharedAt });
    expect(kept.job).toMatchObject({ description: 'Build **things**.', pay: { min: 50000, max: 60000 } });
    // Its recruiter reads the posting as it is
    expect((await read(jobId, recruiter)).json().job).toMatchObject({ description: 'Build *other* things.' });
    // The status is the posting's, now
    await JobPosting.updateOne({ _id: jobId }, { status: 'on_hold' });
    expect((await read(jobId, owner)).json().job).toMatchObject({ status: 'on_hold', description: 'Build **things**.' });

    // Shared again (open again first): the owner reads the new version
    await JobPosting.updateOne({ _id: jobId }, { status: 'open' });
    await pick(owner, recruiter, jobId);
    const again = (await read(jobId, owner)).json();
    expect(again.job).toMatchObject({ description: 'Build *other* things.', pay: { min: 70000, max: 80000 } });
    expect(new Date(again.sharedAt).getTime()).toBeGreaterThanOrEqual(new Date(sharedAt).getTime());
  });

  it('serves a pick stored before versions were kept as the posting is now, without a date shared', async () => {
    const { owner, recruiter, jobId } = await pickedJob();
    // What the job step stored before it kept the version shared
    await WorkflowInstance.updateOne(
      { owner: owner.id, visitor: recruiter.id },
      { $set: { 'steps.job': { data: { job: jobId, selectedAt: new Date() }, updatedAt: new Date() } } }
    );
    await JobPosting.updateOne({ _id: jobId }, { description: 'Edited since.' });
    const answer = (await read(jobId, owner)).json();
    expect(answer.access).toBe('journey');
    expect(answer).not.toHaveProperty('sharedAt');
    expect(answer.job).toMatchObject({ _id: jobId, description: 'Edited since.' });
  });

  it('lets every owner on whose journey the recruiter picked the same posting read it', async () => {
    const { owner, recruiter, jobId } = await pickedJob();
    const secondOwner = await createUser('second-owner', { domain: true });
    await setJourney(secondOwner, 'job', 'meeting');
    await pick(secondOwner, recruiter, jobId);

    for (const user of [owner, secondOwner]) {
      const answer = await read(jobId, user);
      expect([user.domain, answer.status]).toEqual([user.domain, 200]);
      expect(answer.json()).toMatchObject({ access: 'journey', job: { _id: jobId } });
    }
    // A later pick on one journey ends it there only
    const other = await createJob(recruiter, { title: 'Principal Engineer' });
    await pick(secondOwner, recruiter, other);
    expect(await read(jobId, secondOwner)).toMatchObject(notFound);
    expect((await read(jobId, owner)).json().access).toBe('journey');
  });

  it('reads the id whatever its case, as the posting is found', async () => {
    const { owner, recruiter, jobId } = await pickedJob();
    const upper = jobId.toUpperCase();
    expect(upper).not.toBe(jobId);

    for (const [user, access] of [
      [owner, 'journey'],
      [recruiter, 'recruiter']
    ] as const) {
      const answer = await read(upper, user);
      expect([access, answer.status]).toEqual([access, 200]);
      expect(answer.json()).toMatchObject({ access, job: { _id: jobId } });
    }
  });

  it('keeps it readable to the owner once closed or paused, never as a draft', async () => {
    const { owner, recruiter, jobId } = await pickedJob();
    for (const status of ['on_hold', 'filled', 'closed']) {
      expect((await call('PUT', `/jobs/${jobId}/status`, { body: { status }, cookie: recruiter.cookie })).status).toBe(200);
      const answer = await read(jobId, owner);
      expect([status, answer.status]).toEqual([status, 200]);
      expect(answer.json().job.status).toBe(status);
    }
    // Back to a draft: its recruiter's alone again
    expect((await call('PUT', `/jobs/${jobId}/status`, { body: { status: 'draft' }, cookie: recruiter.cookie })).status).toBe(200);
    expect(await read(jobId, owner)).toMatchObject(notFound);
    expect((await read(jobId, recruiter)).json().access).toBe('recruiter');
  });

  it("follows the recruiter's latest pick: the job picked before is no longer the owner's to read", async () => {
    const { owner, recruiter, jobId: first } = await pickedJob();
    const second = await createJob(recruiter, { title: 'Principal Engineer' });

    await pick(owner, recruiter, second);
    expect(await read(first, owner)).toMatchObject(notFound);
    expect((await read(second, owner)).json()).toMatchObject({ access: 'journey', job: { title: 'Principal Engineer' } });
    // Its recruiter still reads both
    expect((await read(first, recruiter)).json().access).toBe('recruiter');
  });

  it('ends with the job step: a journey that no longer has one, or a posting deleted', async () => {
    const { owner, recruiter, jobId } = await pickedJob();

    // The owner removes the job step: what the recruiter did on it goes with it
    await setJourney(owner, 'meeting');
    expect(await read(jobId, owner)).toMatchObject(notFound);

    // Picked again on a journey that has the step again, then deleted by its recruiter
    await setJourney(owner, 'job', 'meeting');
    await pick(owner, recruiter, jobId);
    expect((await read(jobId, owner)).status).toBe(200);
    expect((await call('DELETE', `/jobs/${jobId}`, { cookie: recruiter.cookie })).status).toBe(200);
    expect(await read(jobId, owner)).toMatchObject(notFound);
    expect(await read(jobId, recruiter)).toMatchObject(notFound);
  });

  it('answers everyone else as for an id no posting has', async () => {
    const { owner, recruiter, jobId } = await pickedJob();
    // Another recruiter, an account without a portfolio, another owner with a journey of their own
    const otherRecruiter = await createUser('other-recruiter', { recruiter: true });
    const candidate = await createUser('candidate');
    const otherOwner = await createUser('other-owner', { domain: true });
    await setJourney(otherOwner, 'job', 'meeting');

    const unknown = await read(new Types.ObjectId().toString(), owner);
    expect(unknown).toMatchObject(notFound);
    for (const user of [otherRecruiter, candidate, otherOwner]) {
      const answer = await read(jobId, user);
      expect({ status: answer.status, text: answer.text }).toEqual(notFound);
    }
    // The recruiter's other postings, which were never picked
    const notPicked = await createJob(recruiter, { title: 'Not picked' });
    expect(await read(notPicked, owner)).toMatchObject(notFound);
  });

  it('reads only the pick of a job step of the journey the owner has now, by the posting’s own recruiter', async () => {
    const owner = await createUser('owner', { domain: true });
    const recruiter = await createUser('recruiter', { recruiter: true });
    const otherRecruiter = await createUser('other-recruiter', { recruiter: true });
    const jobId = await createJob(recruiter);
    const progress = (data: unknown) => ({ data, updatedAt: new Date() });

    // Stored under a step id the journey does not have (the default journey: a meeting step)
    await WorkflowInstance.create({ owner: owner.id, visitor: recruiter.id, steps: { job: progress({ job: jobId }) } });
    expect(await read(jobId, owner)).toMatchObject(notFound);

    // Under a step of another type (a note)
    const noteJourney = await call('PUT', '/workflow', {
      body: {
        steps: [
          { id: 'job', type: 'note', config: { title: 'Before you book', text: 'Remote only.' } },
          { id: 'meeting', type: 'meeting', config: {} }
        ]
      },
      cookie: owner.cookie
    });
    expect(noteJourney.status).toBe(200);
    expect(noteJourney.json().steps.map((step: { id: string; type: string }) => [step.id, step.type])).toEqual([
      ['job', 'note'],
      ['meeting', 'meeting']
    ]);
    const underNote = await WorkflowInstance.updateOne(
      { owner: owner.id, visitor: recruiter.id },
      { $set: { 'steps.job': progress({ job: jobId }) } }
    );
    expect(underNote.matchedCount).toBe(1);
    expect(await read(jobId, owner)).toMatchObject(notFound);

    // In the progress of another visitor than the posting's recruiter
    await setJourney(owner, 'job', 'meeting');
    await WorkflowInstance.create({ owner: owner.id, visitor: otherRecruiter.id, steps: { job: progress({ job: jobId }) } });
    expect(await read(jobId, owner)).toMatchObject(notFound);

    // Data that is not a pick (the id in a list)
    const inList = await WorkflowInstance.updateOne(
      { owner: owner.id, visitor: recruiter.id },
      { $set: { 'steps.job': progress({ job: [jobId] }) } }
    );
    expect(inList.modifiedCount).toBe(1);
    expect(await read(jobId, owner)).toMatchObject(notFound);

    // The recruiter's own pick on the job step: readable
    await pick(owner, recruiter, jobId);
    expect((await read(jobId, owner)).json().access).toBe('journey');
  });

  it("never stops the posting's recruiter who also owns a portfolio: they read it as its recruiter", async () => {
    const both = await createUser('both', { recruiter: true, domain: true });
    const owner = await createUser('owner', { domain: true });
    await setJourney(owner, 'job', 'meeting');
    const jobId = await createJob(both);
    await pick(owner, both, jobId);

    expect((await read(jobId, both)).json().access).toBe('recruiter');
    expect((await read(jobId, owner)).json().access).toBe('journey');
  });
});
