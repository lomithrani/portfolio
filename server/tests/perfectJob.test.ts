// The perfect job of an account (GET, PUT /perfect-job) against a real
// MongoDB (MONGO_URL, which must be local or come from TEST_MONGO_URL). Each
// test creates its own users, named with a suffix unique to that test, and
// removes them after: tests pass in any order (--randomize). How a job is
// scored against it is covered by tests/perfectJobScore.test.ts, and the
// journey step using it by tests/workflows.test.ts.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test';
import mongoose from 'mongoose';
import { env } from '../env';
import { createApp } from '../app';
import type { PerfectJob as PerfectJobCriteria } from 'portfolio-common';
import { PerfectJob, User } from '../models/database';
import { perfectJobOf } from '../services/perfectJobs';
import { authCookie } from './helpers';
import { assertDisposableDatabase } from './testDatabase';

/** Names unique to one test: everything it creates carries its suffix */
const testNames = () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const id = (name: string) => `pj-${name}-${suffix}`;
  return { suffix, id, email: (name: string) => `${id(name)}@example.com` };
};

let app: ReturnType<typeof createApp>;
let t: ReturnType<typeof testNames>;
let connected = false;

const call = async (method: string, path: string, { body, cookie }: { body?: unknown; cookie?: string } = {}) => {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  const text = body === undefined ? undefined : JSON.stringify(body);
  if (text !== undefined) headers['Content-Type'] = 'application/json';
  const response = await app.fetch(new Request(`http://localhost${path}`, { method, headers, body: text }));
  const responseText = await response.text();
  return { status: response.status, text: responseText, json: <T = any>() => JSON.parse(responseText) as T };
};

const createUser = async (name: string) => {
  const user = await User.create({ email: t.email(name), googleId: t.id(`sub-${name}`), name });
  const id = user._id.toString();
  return { id, cookie: await authCookie(id) };
};

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  // The unique index the route relies on (one perfect job per account)
  await Promise.all([User.init(), PerfectJob.init()]);
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
  if (!connected) return;
  const users = (await User.find({ email: new RegExp(`-${t.suffix}@`) }, '_id').lean()).map((user) => user._id);
  await PerfectJob.deleteMany({ user: { $in: users } });
  await User.deleteMany({ _id: { $in: users } });
});

const criteria: PerfectJobCriteria = {
  workMode: { importance: 5, dealBreaker: true, modes: ['hybrid', 'remote'], minRemoteDays: 3 },
  pay: { importance: 4, perYear: 70000 },
  skills: { importance: 3, names: ['TypeScript', 'Go'] }
};

describe('the perfect job (GET, PUT /perfect-job)', () => {
  it('needs a session', async () => {
    expect((await call('GET', '/perfect-job')).status).toBe(401);
    expect((await call('PUT', '/perfect-job', { body: { criteria } })).status).toBe(401);
    expect((await call('GET', '/perfect-job', { cookie: 'auth=not-a-session' })).status).toBe(401);
  });

  it('starts without any criterion, then keeps the ones saved', async () => {
    const owner = await createUser('owner');
    const empty = await call('GET', '/perfect-job', { cookie: owner.cookie });
    expect({ status: empty.status, body: empty.json() }).toEqual({ status: 200, body: { criteria: {} } });
    expect(await PerfectJob.countDocuments({ user: owner.id })).toBe(0);

    const saved = await call('PUT', '/perfect-job', { body: { criteria }, cookie: owner.cookie });
    expect({ status: saved.status, body: saved.json() }).toEqual({ status: 200, body: { criteria } });
    expect((await call('GET', '/perfect-job', { cookie: owner.cookie })).json()).toEqual({ criteria });

    // A save replaces every criterion; none at all is a perfect job too
    const replaced = await call('PUT', '/perfect-job', {
      body: { criteria: { travel: { importance: 2, max: 'none' } } },
      cookie: owner.cookie
    });
    expect(replaced.json()).toEqual({ criteria: { travel: { importance: 2, max: 'none' } } });
    expect((await call('PUT', '/perfect-job', { body: { criteria: {} }, cookie: owner.cookie })).json()).toEqual({ criteria: {} });
    expect(await PerfectJob.countDocuments({ user: owner.id })).toBe(1);
  });

  it('stores the criteria as portfolio-common normalises them', async () => {
    const owner = await createUser('owner');
    const saved = await call('PUT', '/perfect-job', {
      body: {
        criteria: {
          skills: { importance: 3, names: [' Go ', 'go', 'Rust'], weight: 100 },
          workMode: { importance: 2, modes: ['remote'], minRemoteDays: 2 },
          $where: { importance: 5 },
          'a.b': { importance: 5 }
        }
      },
      cookie: owner.cookie
    });
    expect(saved.status).toBe(200);
    const expected = { workMode: { importance: 2, modes: ['remote'] }, skills: { importance: 3, names: ['Go', 'Rust'] } };
    expect(saved.json()).toEqual({ criteria: expected });
    expect((await PerfectJob.findOne({ user: owner.id }).lean())?.criteria).toEqual(expected);
  });

  it('refuses criteria that break a rule, naming the setting, and keeps what was saved', async () => {
    const owner = await createUser('owner');
    expect((await call('PUT', '/perfect-job', { body: { criteria }, cookie: owner.cookie })).status).toBe(200);
    const refused = async (body: unknown) => {
      const answer = await call('PUT', '/perfect-job', { body, cookie: owner.cookie });
      expect({ body, status: answer.status }).toEqual({ body, status: 422 });
      return answer.json();
    };

    expect(await refused({ criteria: { pay: { importance: 3 } } })).toEqual({
      type: 'validation',
      on: 'body',
      property: 'criteria.pay.perYear',
      message: 'Give the pay you ask for: per year, per day, or both.'
    });
    expect(await refused({ criteria: { travel: { importance: 9, max: 'none' } } })).toMatchObject({
      property: 'criteria.travel.importance'
    });
    expect(await refused({ criteria: { skills: 'TypeScript' } })).toMatchObject({ property: 'criteria.skills' });
    // The first rule broken, in the editor's order
    expect(await refused({ criteria: { travel: { importance: 3 }, titles: { importance: 3, keywords: [] } } })).toMatchObject({
      property: 'criteria.titles.keywords'
    });
    for (const value of ['remote', ['pay'], 5]) {
      expect(await refused({ criteria: value })).toMatchObject({ property: 'criteria', message: 'Criteria must be an object.' });
    }
    await refused({});
    expect((await call('GET', '/perfect-job', { cookie: owner.cookie })).json()).toEqual({ criteria });
  });

  it("is its owner's alone", async () => {
    const owner = await createUser('owner');
    const other = await createUser('other');
    expect((await call('PUT', '/perfect-job', { body: { criteria }, cookie: owner.cookie })).status).toBe(200);
    expect((await call('GET', '/perfect-job', { cookie: other.cookie })).json()).toEqual({ criteria: {} });
    expect((await call('PUT', '/perfect-job', { body: { criteria: {} }, cookie: other.cookie })).status).toBe(200);
    expect(await perfectJobOf(owner.id)).toEqual(criteria);
  });

  it('saves one perfect job when two first saves race', async () => {
    const owner = await createUser('owner');
    const answers = await Promise.all(
      [1, 2, 3, 4].map((importance) =>
        call('PUT', '/perfect-job', { body: { criteria: { travel: { importance, max: 'none' } } }, cookie: owner.cookie })
      )
    );
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200, 200]);
    expect(await PerfectJob.countDocuments({ user: owner.id })).toBe(1);
  });

  it('leaves out stored criteria that are not criteria anymore', async () => {
    const owner = await createUser('owner');
    await PerfectJob.create({
      user: owner.id,
      criteria: { pay: { importance: 4, perYear: 70000 }, travel: { importance: 3, max: 'weekly' }, old: { importance: 1 } }
    });
    expect((await call('GET', '/perfect-job', { cookie: owner.cookie })).json()).toEqual({
      criteria: { pay: { importance: 4, perYear: 70000 } }
    });
  });
});
