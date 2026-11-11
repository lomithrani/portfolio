// The hiring journey (GET/PUT /workflow, GET /workflow/domains/:domainName,
// POST /workflow/domains/:domainName/steps/:stepId) against a real MongoDB
// (MONGO_URL, which must be local or come from TEST_MONGO_URL). Each test
// creates its own users, domains and postings, named with a suffix unique to
// that test, and removes them after: tests pass in any order (--randomize).
// The booking routes the journey gates are covered by
// tests/appointments.test.ts (they need its fake Google).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test';
import mongoose, { Types } from 'mongoose';
import { SignJWT } from 'jose';
import { NOTE_STEP_LIMITS, WORKFLOW_LIMITS, stepManifests } from 'portfolio-common';
import { env } from '../env';
import { createApp } from '../app';
import { ConflictError, JourneyStepLockedError, MissingAuthCookieError, ResourceNotFoundError } from '../errors';
import { Domain, JobPosting, User, Workflow, WorkflowInstance } from '../models/database';
import { enableRecruiterSpace } from '../services/recruiters';
import { assertStepOpen, openStepOfType, recordStepData } from '../services/workflows';
import { serverStep, serverStepTypes } from '../services/workflowSteps';
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

// ── Steps, as the owner's editor sends them ─────────────────

interface Step {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

const job = (id = 'job'): Step => ({ id, type: 'job', config: {} });
const meeting = (id = 'meeting'): Step => ({ id, type: 'meeting', config: {} });
const note = (id = 'note', title = 'Before you book', text = 'I am looking for a **remote** role.'): Step => ({
  id,
  type: 'note',
  config: { title, text }
});
const journey = (...steps: Step[]) => ({ steps });

/** The owner saves `steps` as their journey */
const setJourney = async (owner: TestUser, ...steps: Step[]) => {
  const saved = await call('PUT', '/workflow', { body: journey(...steps), cookie: owner.cookie });
  expect(saved.status).toBe(200);
  return saved.json();
};

const stepPath = (domain: string | undefined, stepId: string) => `/workflow/domains/${domain}/steps/${stepId}`;

/** `visitor` (none: anonymous) submits `input` on a step of the portfolio `domain` */
const submit = (domain: string | undefined, stepId: string, input: unknown, visitor?: TestUser) =>
  call('POST', stepPath(domain, stepId), { body: { input }, cookie: visitor?.cookie });

/** The journey of the portfolio `domain`, as `visitor` (none: anonymous) gets it */
const journeyOf = async (domain: string | undefined, visitor?: TestUser) => {
  const answer = await call('GET', `/workflow/domains/${domain}`, { cookie: visitor?.cookie });
  expect(answer.status).toBe(200);
  return answer.json();
};

const statuses = (shown: { steps: { id: string; status: string }[] }) =>
  shown.steps.map((step) => `${step.id}:${step.status}`);

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

describe('the step types', () => {
  it('has the same types in the API as in portfolio-common', () => {
    const manifests = stepManifests().map((manifest) => manifest.type);
    expect([...serverStepTypes()].sort()).toEqual([...manifests].sort());
    for (const type of manifests) {
      expect(serverStep(type)?.type).toBe(type);
      expect(type).toMatch(WORKFLOW_LIMITS.stepType);
    }
    // Not a type, even though every object has one
    for (const type of ['constructor', 'toString', '__proto__', 'quiz']) expect(serverStep(type)).toBeUndefined();
  });
});

describe("the owner's journey (GET, PUT /workflow)", () => {
  it('needs a session', async () => {
    expect((await call('GET', '/workflow')).status).toBe(401);
    expect((await call('PUT', '/workflow', { body: journey(meeting()) })).status).toBe(401);
  });

  it('starts with the meeting step only, then keeps the steps saved, in their order', async () => {
    const owner = await createUser('owner', { domain: true });
    expect((await call('GET', '/workflow', { cookie: owner.cookie })).json()).toEqual(journey(meeting()));

    const steps = [note('why'), job(), note('terms', 'My conditions', 'Four days a week.'), meeting()];
    expect(await setJourney(owner, ...steps)).toEqual(journey(...steps));
    expect((await call('GET', '/workflow', { cookie: owner.cookie })).json()).toEqual(journey(...steps));

    // The same steps in another order: a note after the job, then both before it
    const reordered = [job(), steps[2], steps[0], meeting()];
    expect(await setJourney(owner, ...reordered)).toEqual(journey(...reordered));
    const moved = [steps[2], steps[0], job(), meeting()];
    expect(await setJourney(owner, ...moved)).toEqual(journey(...moved));
    expect((await call('GET', '/workflow', { cookie: owner.cookie })).json()).toEqual(journey(...moved));

    // Replaced, never added to: one journey per account. An empty journey is one too
    expect(await setJourney(owner)).toEqual(journey());
    expect((await call('GET', '/workflow', { cookie: owner.cookie })).json()).toEqual(journey());
    expect(await Workflow.countDocuments({ user: owner.id })).toBe(1);
  });

  it("stores each step's settings as its type normalises them", async () => {
    const owner = await createUser('owner');
    const saved = await call('PUT', '/workflow', {
      cookie: owner.cookie,
      body: {
        steps: [
          { id: 'note', type: 'note', config: { title: '  Before you book ', text: ' Remote only.\n', colour: 'red' } },
          // No settings sent, and settings the type does not have
          { id: 'job', type: 'job' },
          { id: 'meeting', type: 'meeting', config: { anything: { nested: true } }, extra: 1 }
        ]
      }
    });
    expect(saved.status).toBe(200);
    const stored = journey(note('note', 'Before you book', 'Remote only.'), job(), meeting());
    expect(saved.json()).toEqual(stored);
    const document = await Workflow.collection.findOne({ user: new Types.ObjectId(owner.id) });
    // `config: {}` is stored, not dropped
    expect(document?.steps).toEqual(stored.steps);
  });

  it('refuses a type used more often than it allows', async () => {
    const owner = await createUser('owner');
    const refused = await call('PUT', '/workflow', {
      body: journey(note(), meeting(), meeting('meeting-2')),
      cookie: owner.cookie
    });
    expect(refused.status).toBe(422);
    expect(refused.json()).toEqual({
      type: 'validation',
      on: 'body',
      property: 'steps.2',
      message: '“Book a meeting” can be used only once.'
    });
    const twoJobs = await call('PUT', '/workflow', { body: journey(job(), job('job-2'), meeting()), cookie: owner.cookie });
    expect(twoJobs.status).toBe(422);
    expect(twoJobs.json().property).toBe('steps.1');

    // Any number of notes
    const notes = Array.from({ length: WORKFLOW_LIMITS.steps - 1 }, (_, index) => note(`note-${index}`));
    await setJourney(owner, ...notes, meeting());
    expect(await Workflow.countDocuments({ user: owner.id })).toBe(1);
  });

  it('refuses settings their type refuses, naming the step and the setting', async () => {
    const owner = await createUser('owner');
    const refused = async (...steps: Step[]) => {
      const answer = await call('PUT', '/workflow', { body: journey(...steps), cookie: owner.cookie });
      expect(answer.status).toBe(422);
      return answer.json();
    };

    expect(await refused(job(), note('note', '   '), meeting())).toEqual({
      type: 'validation',
      on: 'body',
      property: 'steps.1.config.title',
      message: 'Give the note a title.'
    });
    expect(await refused(note('note', 'x'.repeat(NOTE_STEP_LIMITS.title + 1)), meeting())).toMatchObject({
      property: 'steps.0.config.title'
    });
    expect(await refused(note('a'), note('b', 'Terms', ''), meeting())).toMatchObject({
      property: 'steps.1.config.text',
      message: 'Write the note recruiters will read.'
    });
    expect(await refused(note('note', 'Terms', 'x'.repeat(NOTE_STEP_LIMITS.text + 1)), meeting())).toMatchObject({
      property: 'steps.0.config.text'
    });
    // Settings that are not an object at all
    const notAnObject = await call('PUT', '/workflow', {
      body: { steps: [{ id: 'note', type: 'note', config: 'Before you book' }, meeting()] },
      cookie: owner.cookie
    });
    expect(notAnObject.status).toBe(422);
    expect(await Workflow.countDocuments({ user: owner.id })).toBe(0);
  });

  it('refuses a requirement that opens nothing, unknown types and journeys that are not one', async () => {
    const owner = await createUser('owner');
    const refused = async (body: unknown) => {
      const answer = await call('PUT', '/workflow', { body, cookie: owner.cookie });
      expect({ body, status: answer.status }).toEqual({ body, status: 422 });
      return answer.json();
    };

    expect(await refused(journey(job()))).toMatchObject({
      property: 'steps.0',
      message: expect.stringContaining('Book a meeting')
    });
    expect(await refused(journey(meeting(), job()))).toMatchObject({ property: 'steps.1' });
    expect(await refused(journey(note(), meeting(), note('after')))).toMatchObject({ property: 'steps.2' });

    // A type this version does not have
    expect(await refused(journey({ id: 'quiz', type: 'quiz', config: {} }, meeting()))).toEqual({
      type: 'validation',
      on: 'body',
      property: 'steps.0',
      message: 'This step is not available anymore: remove it.'
    });
    // Nor a property every object has
    expect(await refused(journey(meeting(), { id: 'x', type: 'constructor', config: {} }))).toMatchObject({
      property: 'steps.1'
    });
    await refused(journey({ id: 'x', type: 'Meeting', config: {} }));
    await refused({ steps: [{ id: 'meeting' }] });
    await refused({ steps: [{ type: 'meeting' }] });

    expect(await refused(journey(note('same'), note('same'), meeting()))).toMatchObject({
      message: 'Two steps have the same id.'
    });
    const tooMany = Array.from({ length: WORKFLOW_LIMITS.steps }, (_, index) => note(`note-${index}`));
    await refused(journey(...tooMany, meeting()));
    await refused({});
    await refused({ steps: 'meeting' });
    expect(await Workflow.countDocuments({ user: owner.id })).toBe(0);
  });

  it('refuses step ids that could not be keys of the progress', async () => {
    const owner = await createUser('owner');
    for (const id of ['__proto__', 'a.b', '$set', 'steps.note', 'a b', 'Note', '', '-a', 'x'.repeat(41), 'é']) {
      const answer = await call('PUT', '/workflow', { body: journey(meeting(id)), cookie: owner.cookie });
      expect({ id, status: answer.status, property: answer.json().property }).toEqual({
        id,
        status: 422,
        property: 'steps.0.id'
      });
    }
    const notAString = await call('PUT', '/workflow', {
      body: { steps: [{ id: { $ne: '' }, type: 'meeting' }] },
      cookie: owner.cookie
    });
    expect(notAString.status).toBe(422);
    expect(await Workflow.countDocuments({ user: owner.id })).toBe(0);
    expect(Object.hasOwn(Object.prototype, 'meeting')).toBe(false);
  });

  it('saves one journey when two first saves race', async () => {
    const owner = await createUser('owner');
    const answers = await Promise.all(
      Array.from({ length: 5 }, () => call('PUT', '/workflow', { body: journey(job(), meeting()), cookie: owner.cookie }))
    );
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await Workflow.countDocuments({ user: owner.id })).toBe(1);
  });
});

describe("a portfolio's journey (GET /workflow/domains/:domainName)", () => {
  it('shows the steps to anyone, and 404 for an unknown portfolio', async () => {
    const owner = await createUser('owner', { domain: true });
    expect(await journeyOf(owner.domain)).toEqual({ steps: [{ id: 'meeting', type: 'meeting', status: 'pending' }] });

    await setJourney(owner, job(), meeting());
    // Names are matched ignoring case, as the portfolio pages do
    expect(await journeyOf(owner.domain!.toUpperCase())).toEqual({
      steps: [
        { id: 'job', type: 'job', status: 'pending' },
        { id: 'meeting', type: 'meeting', status: 'pending' }
      ]
    });

    const unknown = await call('GET', `/workflow/domains/${t.id('nope')}`);
    expect(unknown.status).toBe(404);
    expect(unknown.text).toBe('Domain not found');
  });

  it("shows a note's text to visitors, and no settings of the other steps", async () => {
    const owner = await createUser('owner', { domain: true });
    const recruiter = await createUser('recruiter', { recruiter: true });
    await setJourney(owner, note(), job(), meeting());

    const expected = {
      steps: [
        {
          id: 'note',
          type: 'note',
          status: 'pending',
          config: { title: 'Before you book', text: 'I am looking for a **remote** role.' }
        },
        { id: 'job', type: 'job', status: 'pending' },
        { id: 'meeting', type: 'meeting', status: 'pending' }
      ]
    };
    expect(await journeyOf(owner.domain)).toEqual(expected);
    expect(await journeyOf(owner.domain, recruiter)).toEqual(expected);
    expect(await journeyOf(owner.domain, owner)).toEqual({ ...expected, own: true });
  });

  it('tells the owner it is theirs, and ignores a cookie that is not a session', async () => {
    const owner = await createUser('owner', { domain: true });
    expect(await journeyOf(owner.domain, owner)).toEqual({
      steps: [{ id: 'meeting', type: 'meeting', status: 'pending' }],
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

  it("ignores a forged cookie on a visitor's progress too", async () => {
    const owner = await createUser('owner', { domain: true });
    const recruiter = await createUser('recruiter');
    await setJourney(owner, note(), meeting());
    expect((await submit(owner.domain, 'note', { acknowledged: true }, recruiter)).status).toBe(200);
    expect(statuses(await journeyOf(owner.domain, recruiter))).toEqual(['note:succeeded', 'meeting:pending']);

    const otherKey = new TextEncoder().encode('another-secret');
    const foreignJwt = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(recruiter.id).setExpirationTime('1h').sign(otherKey);
    for (const cookie of [`auth=${recruiter.id}`, `auth=${foreignJwt}`]) {
      const forged = await call('GET', `/workflow/domains/${owner.domain}`, { cookie });
      expect(statuses(forged.json())).toEqual(['note:pending', 'meeting:pending']);
      // Nor does it submit anything
      const posted = await call('POST', stepPath(owner.domain, 'note'), { body: { input: { acknowledged: true } }, cookie });
      expect(posted.status).toBe(401);
    }
  });

  it("follows the visitor's job: succeeded while it is theirs and open", async () => {
    const owner = await createUser('owner', { domain: true });
    const recruiter = await createUser('recruiter', { recruiter: true });
    await setJourney(owner, job(), meeting());
    const jobId = await createJob(recruiter);
    expect((await submit(owner.domain, 'job', { jobId }, recruiter)).status).toBe(200);

    const meetingStep = { id: 'meeting', type: 'meeting', status: 'pending' };
    expect(await journeyOf(owner.domain, recruiter)).toEqual({
      steps: [
        {
          id: 'job',
          type: 'job',
          status: 'succeeded',
          view: { job: { _id: jobId, title: 'Staff Engineer', company: 'Acme', status: 'open' } }
        },
        meetingStep
      ]
    });
    // Anyone else sees no progress: not the anonymous visitor, the owner or another recruiter
    const other = await createUser('other', { recruiter: true });
    for (const viewer of [undefined, owner, other]) {
      expect((await journeyOf(owner.domain, viewer)).steps).toEqual([{ id: 'job', type: 'job', status: 'pending' }, meetingStep]);
    }

    await JobPosting.updateOne({ _id: jobId }, { status: 'filled' });
    expect(await journeyOf(owner.domain, recruiter)).toEqual({
      steps: [
        {
          id: 'job',
          type: 'job',
          status: 'pending',
          view: { job: { _id: jobId, title: 'Staff Engineer', company: 'Acme', status: 'filled' } }
        },
        meetingStep
      ]
    });

    await JobPosting.deleteOne({ _id: jobId });
    expect(await journeyOf(owner.domain, recruiter)).toEqual({
      steps: [{ id: 'job', type: 'job', status: 'pending' }, meetingStep]
    });
  });

  it('stops at a stored step whose type is gone, instead of skipping it', async () => {
    const owner = await createUser('owner', { domain: true });
    const recruiter = await createUser('recruiter', { recruiter: true });
    await setJourney(owner, note(), meeting());
    expect((await submit(owner.domain, 'note', { acknowledged: true }, recruiter)).status).toBe(200);
    await openStepOfType(owner.id, recruiter.id, 'meeting', () => new Error('no meeting step'));

    // As a version that had a `quiz` step stored it: written to the collection, not through the API
    const stored = [note(), { id: 'quiz', type: 'quiz', config: { questions: 3 } }, meeting()];
    await Workflow.collection.updateOne({ user: new Types.ObjectId(owner.id) }, { $set: { steps: stored } });

    // The owner still has it (to remove it), and cannot save it again
    expect((await call('GET', '/workflow', { cookie: owner.cookie })).json()).toEqual({ steps: stored });
    const saved = await call('PUT', '/workflow', { body: { steps: stored }, cookie: owner.cookie });
    expect(saved.status).toBe(422);
    expect(saved.json()).toMatchObject({ property: 'steps.1', message: 'This step is not available anymore: remove it.' });

    // Visitors see it, without its settings, and never get past it
    expect(await journeyOf(owner.domain, recruiter)).toEqual({
      steps: [
        { id: 'note', type: 'note', status: 'succeeded', config: note().config },
        { id: 'quiz', type: 'quiz', status: 'pending' },
        { id: 'meeting', type: 'meeting', status: 'pending' }
      ]
    });
    const submitted = await submit(owner.domain, 'quiz', { answers: [1, 2, 3] }, recruiter);
    expect(submitted.status).toBe(409);
    expect(submitted.text).toBe('Nothing can be submitted on this step');
    await expect(assertStepOpen(owner.id, recruiter.id, 'meeting')).rejects.toBeInstanceOf(JourneyStepLockedError);
    await expect(
      openStepOfType(owner.id, recruiter.id, 'meeting', () => new Error('no meeting step'))
    ).rejects.toBeInstanceOf(JourneyStepLockedError);
    // Even with something stored under its id
    await recordStepData(owner.id, recruiter.id, 'quiz', { passed: true });
    expect(statuses(await journeyOf(owner.domain, recruiter))).toEqual(['note:succeeded', 'quiz:pending', 'meeting:pending']);

    // Removed by the owner: the journey goes on
    await setJourney(owner, note(), meeting());
    await assertStepOpen(owner.id, recruiter.id, 'meeting');
  });
});

describe('submitting a step (POST /workflow/domains/:domainName/steps/:stepId)', () => {
  it('confirms a note, once the visitor says they read it', async () => {
    const owner = await createUser('owner', { domain: true });
    const visitor = await createUser('visitor');
    await setJourney(owner, note(), meeting());

    for (const input of [undefined, null, {}, { acknowledged: false }, { acknowledged: 'true' }, true, [true], 'yes']) {
      const refused = await submit(owner.domain, 'note', input, visitor);
      expect({ input, status: refused.status }).toEqual({ input, status: 422 });
    }
    expect((await submit(owner.domain, 'note', { acknowledged: 1 }, visitor)).json()).toEqual({
      type: 'validation',
      on: 'body',
      property: 'input.acknowledged',
      message: 'Confirm that you have read the note'
    });
    // A request without a JSON body
    expect((await call('POST', stepPath(owner.domain, 'note'), { cookie: visitor.cookie })).status).toBe(422);
    expect(await WorkflowInstance.countDocuments({ owner: owner.id })).toBe(0);

    const confirmed = await submit(owner.domain, 'note', { acknowledged: true, more: 'ignored' }, visitor);
    expect(confirmed.status).toBe(200);
    expect(confirmed.json()).toEqual({
      steps: [
        { id: 'note', type: 'note', status: 'succeeded', config: note().config },
        { id: 'meeting', type: 'meeting', status: 'pending' }
      ]
    });
    const instances = await WorkflowInstance.find({ owner: owner.id }).lean();
    expect(instances).toHaveLength(1);
    expect(String(instances[0].visitor)).toBe(visitor.id);
    expect(Object.keys(instances[0].steps ?? {})).toEqual(['note']);
    expect(instances[0].steps?.note.data).toEqual({ acknowledgedAt: expect.any(Date) });
    expect(instances[0].steps?.note.updatedAt).toBeInstanceOf(Date);
  });

  it('records the open job the recruiter picks, and the one picked after it', async () => {
    const owner = await createUser('owner', { domain: true });
    const recruiter = await createUser('recruiter', { recruiter: true });
    await setJourney(owner, job(), meeting());
    const first = await createJob(recruiter);
    const second = await createJob(recruiter, { title: 'Platform Lead', company: undefined });

    const picked = await submit(owner.domain, 'job', { jobId: first }, recruiter);
    expect(picked.status).toBe(200);
    expect(picked.json()).toEqual({
      steps: [
        {
          id: 'job',
          type: 'job',
          status: 'succeeded',
          view: { job: { _id: first, title: 'Staff Engineer', company: 'Acme', status: 'open' } }
        },
        { id: 'meeting', type: 'meeting', status: 'pending' }
      ]
    });

    expect((await submit(owner.domain, 'job', { jobId: second }, recruiter)).json().steps[0].view).toEqual({
      job: { _id: second, title: 'Platform Lead', status: 'open' }
    });
    const instances = await WorkflowInstance.find({ owner: owner.id }).lean();
    expect(instances).toHaveLength(1);
    expect(String(instances[0].visitor)).toBe(recruiter.id);
    expect(instances[0].steps?.job.data).toEqual({ job: second, selectedAt: expect.any(Date) });
  });

  it("refuses an account without a recruiter space, another recruiter's job, a job that is not open and what is not a job id", async () => {
    const owner = await createUser('owner', { domain: true });
    const recruiter = await createUser('recruiter', { recruiter: true });
    const candidate = await createUser('candidate', { domain: true });
    const other = await createUser('other', { recruiter: true });
    await setJourney(owner, job(), meeting());

    const noSpace = await submit(owner.domain, 'job', { jobId: await createJob(recruiter) }, candidate);
    expect(noSpace.status).toBe(403);
    expect(noSpace.text).toBe('Create your recruiter space first');

    const notTheirs = await submit(owner.domain, 'job', { jobId: await createJob(other) }, recruiter);
    expect(notTheirs.status).toBe(404);
    expect(notTheirs.text).toBe('Job posting not found');
    expect((await submit(owner.domain, 'job', { jobId: new Types.ObjectId().toString() }, recruiter)).status).toBe(404);

    for (const status of ['draft', 'on_hold', 'filled', 'closed']) {
      const answer = await submit(owner.domain, 'job', { jobId: await createJob(recruiter, { status }) }, recruiter);
      expect({ status, answer: answer.status, text: answer.text }).toEqual({
        status,
        answer: 409,
        text: 'Only an open job description can be picked'
      });
    }

    const open = await createJob(recruiter);
    for (const input of [undefined, {}, { jobId: 'nope' }, { jobId: { $ne: null } }, { jobId: [open] }, open, { job: open }]) {
      const answer = await submit(owner.domain, 'job', input, recruiter);
      expect({ input, status: answer.status, property: answer.json().property }).toEqual({
        input,
        status: 422,
        property: 'input.jobId'
      });
    }
    expect(await WorkflowInstance.countDocuments({ owner: owner.id })).toBe(0);
  });

  it('needs a session, a portfolio, a step of the journey, and a step that takes something', async () => {
    const owner = await createUser('owner', { domain: true });
    const visitor = await createUser('visitor');
    await setJourney(owner, note(), meeting());

    const anonymous = await submit(owner.domain, 'note', { acknowledged: true });
    expect(anonymous.status).toBe(401);

    const unknownPortfolio = await submit(t.id('nope'), 'note', { acknowledged: true }, visitor);
    expect(unknownPortfolio.status).toBe(404);
    expect(unknownPortfolio.text).toBe('Domain not found');

    // A step the journey does not have (anymore): the page is out of date
    const unknownStep = await submit(owner.domain, 'note-2', { acknowledged: true }, visitor);
    expect(unknownStep.status).toBe(409);
    expect(unknownStep.text).toBe('This hiring journey changed: reload the page');
    // `constructor` is an id like any other, not a step every journey has
    expect((await submit(owner.domain, 'constructor', { acknowledged: true }, visitor)).status).toBe(409);

    // What is not a step id never reaches the journey
    for (const stepId of ['__proto__', 'a.b', '$set', 'Note', 'x'.repeat(41)]) {
      const answer = await submit(owner.domain, encodeURIComponent(stepId), { acknowledged: true }, visitor);
      expect({ stepId, status: answer.status }).toEqual({ stepId, status: 422 });
    }
    expect(await WorkflowInstance.countDocuments({ owner: owner.id })).toBe(0);

    // The meeting step is booked, not submitted
    expect((await submit(owner.domain, 'note', { acknowledged: true }, visitor)).status).toBe(200);
    const meetingSubmitted = await submit(owner.domain, 'meeting', { bookedAt: new Date() }, visitor);
    expect(meetingSubmitted.status).toBe(409);
    expect(meetingSubmitted.text).toBe('Nothing can be submitted on this step');
    expect(statuses(await journeyOf(owner.domain, visitor))).toEqual(['note:succeeded', 'meeting:pending']);
  });

  it('refuses the owner on their own journey', async () => {
    const owner = await createUser('owner', { domain: true, recruiter: true });
    await setJourney(owner, note(), job(), meeting());
    for (const [stepId, input] of [
      ['note', { acknowledged: true }],
      ['job', { jobId: await createJob(owner) }],
      ['meeting', {}],
      ['gone', {}]
    ] as const) {
      const own = await submit(owner.domain, stepId, input, owner);
      expect({ stepId, status: own.status, text: own.text }).toEqual({
        stepId,
        status: 403,
        text: 'You cannot go through your own hiring journey'
      });
    }
    expect(await WorkflowInstance.countDocuments({ owner: owner.id })).toBe(0);
  });

  it('refuses a step while a step before it did not succeed', async () => {
    const owner = await createUser('owner', { domain: true });
    const recruiter = await createUser('recruiter', { recruiter: true });
    await setJourney(owner, note('why'), job(), note('terms'), meeting());
    const jobId = await createJob(recruiter);

    const locked = async (stepId: string, input: unknown) => {
      const answer = await submit(owner.domain, stepId, input, recruiter);
      expect({ stepId, status: answer.status, text: answer.text }).toEqual({
        stepId,
        status: 403,
        text: 'Complete the earlier steps of the hiring journey first'
      });
    };
    await locked('job', { jobId });
    await locked('terms', { acknowledged: true });
    // Locked before the step looks at what is submitted
    await locked('job', { jobId: 'nope' });
    await locked('meeting', {});
    expect(await WorkflowInstance.countDocuments({ owner: owner.id })).toBe(0);

    expect((await submit(owner.domain, 'why', { acknowledged: true }, recruiter)).status).toBe(200);
    await locked('terms', { acknowledged: true });
    expect((await submit(owner.domain, 'job', { jobId }, recruiter)).status).toBe(200);
    const done = await submit(owner.domain, 'terms', { acknowledged: true }, recruiter);
    expect(statuses(done.json())).toEqual(['why:succeeded', 'job:succeeded', 'terms:succeeded', 'meeting:pending']);

    // The job is closed since: the steps after it are locked again, what was done on them is kept
    await JobPosting.updateOne({ _id: jobId }, { status: 'closed' });
    expect(statuses(await journeyOf(owner.domain, recruiter))).toEqual([
      'why:succeeded',
      'job:pending',
      'terms:succeeded',
      'meeting:pending'
    ]);
    await locked('terms', { acknowledged: true });
    await expect(assertStepOpen(owner.id, recruiter.id, 'meeting')).rejects.toBeInstanceOf(JourneyStepLockedError);
  });

  it("keeps a visitor's progress when the steps are reordered", async () => {
    const owner = await createUser('owner', { domain: true });
    const recruiter = await createUser('recruiter', { recruiter: true });
    await setJourney(owner, note('why'), job(), note('terms'), meeting());
    const jobId = await createJob(recruiter);
    expect((await submit(owner.domain, 'why', { acknowledged: true }, recruiter)).status).toBe(200);
    expect((await submit(owner.domain, 'job', { jobId }, recruiter)).status).toBe(200);

    // Reordered, and a note reworded: the same ids
    await setJourney(owner, note('terms', 'Conditions', 'Reworded.'), job(), note('why'), meeting());
    expect(statuses(await journeyOf(owner.domain, recruiter))).toEqual([
      'terms:pending',
      'job:succeeded',
      'why:succeeded',
      'meeting:pending'
    ]);
    // Done already, but behind a step that is not
    expect((await submit(owner.domain, 'job', { jobId }, recruiter)).status).toBe(403);
    await expect(assertStepOpen(owner.id, recruiter.id, 'meeting')).rejects.toBeInstanceOf(JourneyStepLockedError);

    expect((await submit(owner.domain, 'terms', { acknowledged: true }, recruiter)).status).toBe(200);
    await assertStepOpen(owner.id, recruiter.id, 'meeting');
  });

  it("drops a visitor's progress on a step the owner removes", async () => {
    const owner = await createUser('owner', { domain: true });
    const recruiter = await createUser('recruiter', { recruiter: true });
    const bystander = await createUser('bystander', { domain: true });
    await setJourney(owner, note('why'), note('terms'), meeting());
    await setJourney(bystander, note('why'), meeting());
    for (const [domain, stepId] of [[owner.domain, 'why'], [owner.domain, 'terms'], [bystander.domain, 'why']] as const) {
      expect((await submit(domain, stepId, { acknowledged: true }, recruiter)).status).toBe(200);
    }

    // `why` removed; a step added later takes its id (as the editor names new steps)
    await setJourney(owner, note('terms'), meeting());
    expect(statuses(await journeyOf(owner.domain, recruiter))).toEqual(['terms:succeeded', 'meeting:pending']);
    await setJourney(owner, note('why', 'Something else', 'Not read yet.'), note('terms'), meeting());
    expect(statuses(await journeyOf(owner.domain, recruiter))).toEqual(['why:pending', 'terms:succeeded', 'meeting:pending']);
    const instance = await WorkflowInstance.findOne({ owner: owner.id, visitor: recruiter.id }).lean();
    expect(Object.keys(instance?.steps ?? {})).toEqual(['terms']);
    // Another owner's journey is untouched
    expect(statuses(await journeyOf(bystander.domain, recruiter))).toEqual(['why:succeeded', 'meeting:pending']);

    // The same id for another type: what the note stored means nothing to the job step
    await setJourney(owner, { id: 'terms', type: 'job', config: {} }, meeting());
    expect(statuses(await journeyOf(owner.domain, recruiter))).toEqual(['terms:pending', 'meeting:pending']);
    const after = await WorkflowInstance.findOne({ owner: owner.id, visitor: recruiter.id }).lean();
    expect(Object.keys(after?.steps ?? {})).toEqual([]);
  });
});

describe('the engine behind the routes of a step (services/workflows.ts)', () => {
  const noStep = () => new ResourceNotFoundError('No such step');

  it('opens the step to anyone when it comes first, and to the owner wherever it is', async () => {
    const owner = await createUser('owner', { domain: true });
    const visitor = await createUser('visitor');

    // The default journey
    for (const caller of [undefined, visitor.id, owner.id, 'not-an-id']) {
      await assertStepOpen(owner.id, caller, 'meeting');
      expect((await openStepOfType(owner.id, caller, 'meeting', noStep)).stepId).toBe('meeting');
    }

    await setJourney(owner, note(), meeting());
    await assertStepOpen(owner.id, undefined, 'note');
    await assertStepOpen(owner.id, owner.id, 'meeting');
    expect(await (await openStepOfType(owner.id, owner.id, 'meeting', noStep)).invitationLines('https://web.example')).toEqual([]);
    await expect(assertStepOpen(owner.id, undefined, 'meeting')).rejects.toBeInstanceOf(MissingAuthCookieError);
    await expect(assertStepOpen(owner.id, 'not-an-id', 'meeting')).rejects.toBeInstanceOf(MissingAuthCookieError);
    await expect(assertStepOpen(owner.id, visitor.id, 'meeting')).rejects.toBeInstanceOf(JourneyStepLockedError);
    await expect(openStepOfType(owner.id, undefined, 'meeting', noStep)).rejects.toBeInstanceOf(MissingAuthCookieError);
    await expect(openStepOfType(owner.id, visitor.id, 'meeting', noStep)).rejects.toBeInstanceOf(JourneyStepLockedError);

    // A step the journey does not have
    await expect(assertStepOpen(owner.id, visitor.id, 'job')).rejects.toBeInstanceOf(ConflictError);
    await expect(openStepOfType(owner.id, visitor.id, 'job', noStep)).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(openStepOfType(owner.id, owner.id, 'constructor', noStep)).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it('describes for the invitation what the visitor did on the steps before, in order', async () => {
    const owner = await createUser('owner', { domain: true });
    const recruiter = await createUser('recruiter', { recruiter: true });
    await setJourney(owner, note('why'), job(), note('terms'), meeting());
    const jobId = await createJob(recruiter, { company: undefined });
    expect((await submit(owner.domain, 'why', { acknowledged: true }, recruiter)).status).toBe(200);
    expect((await submit(owner.domain, 'job', { jobId }, recruiter)).status).toBe(200);
    expect((await submit(owner.domain, 'terms', { acknowledged: true }, recruiter)).status).toBe(200);

    const step = await openStepOfType(owner.id, recruiter.id, 'meeting', noStep);
    expect(step.stepId).toBe('meeting');
    // Notes say nothing; the job says what the meeting is about
    expect(await step.invitationLines()).toEqual(['Job: Staff Engineer']);
    expect(await step.invitationLines('https://web.example')).toEqual([
      'Job: Staff Engineer',
      `https://web.example/jobs/${jobId}`
    ]);
  });

  it('picks the first open step when a journey has several of the type', async () => {
    const owner = await createUser('owner', { domain: true });
    const visitor = await createUser('visitor');
    // Not a journey the API saves today (a meeting can be used once): written to the collection
    const stored = [meeting('first-call'), note(), meeting('second-call')];
    await Workflow.collection.insertOne({ user: new Types.ObjectId(owner.id), steps: stored });

    expect((await openStepOfType(owner.id, undefined, 'meeting', noStep)).stepId).toBe('first-call');
    expect((await openStepOfType(owner.id, visitor.id, 'meeting', noStep)).stepId).toBe('first-call');

    await Workflow.collection.updateOne(
      { user: new Types.ObjectId(owner.id) },
      { $set: { steps: [note(), meeting('first-call'), meeting('second-call')] } }
    );
    await expect(openStepOfType(owner.id, visitor.id, 'meeting', noStep)).rejects.toBeInstanceOf(JourneyStepLockedError);
    expect((await submit(owner.domain, 'note', { acknowledged: true }, visitor)).status).toBe(200);
    expect((await openStepOfType(owner.id, visitor.id, 'meeting', noStep)).stepId).toBe('first-call');
    // Booked: the first is done, and still the one a new booking goes to
    await recordStepData(owner.id, visitor.id, 'first-call', { bookedAt: new Date() });
    expect(statuses(await journeyOf(owner.domain, visitor))).toEqual([
      'note:succeeded',
      'first-call:succeeded',
      'second-call:pending'
    ]);
    expect((await openStepOfType(owner.id, visitor.id, 'meeting', noStep)).stepId).toBe('first-call');
  });

  it('records what a step stored only for a visitor already in the journey', async () => {
    const owner = await createUser('owner', { domain: true });
    const visitor = await createUser('visitor');
    await setJourney(owner, note(), meeting());

    // No trace of who books on an open page, nor of the owner
    for (const caller of [undefined, owner.id, visitor.id, 'not-an-id']) {
      await recordStepData(owner.id, caller, 'meeting', { bookedAt: new Date() });
    }
    expect(await WorkflowInstance.countDocuments({ owner: owner.id })).toBe(0);

    expect((await submit(owner.domain, 'note', { acknowledged: true }, visitor)).status).toBe(200);
    await recordStepData(owner.id, visitor.id, 'meeting', { bookedAt: new Date() });
    expect(statuses(await journeyOf(owner.domain, visitor))).toEqual(['note:succeeded', 'meeting:succeeded']);
    // What is not a step id is never made a field path
    for (const stepId of ['a.b', '$set', '__proto__', 'note.data']) {
      await expect(recordStepData(owner.id, visitor.id, stepId, {})).rejects.toThrow('Not a step id');
    }
    const instance = await WorkflowInstance.findOne({ owner: owner.id, visitor: visitor.id }).lean();
    expect(Object.keys(instance?.steps ?? {}).sort()).toEqual(['meeting', 'note']);
  });
});
