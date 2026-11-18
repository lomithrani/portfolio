// What a candidate still has to set up before sharing their link (GET
// /me/readiness, services/candidateReadiness.ts) against a real MongoDB
// (MONGO_URL, which must be local or come from TEST_MONGO_URL). Each test
// creates its own users, portfolios, experiences, perfect jobs, journeys and
// meeting types, named with a suffix unique to that test, and removes them
// after: tests pass in any order (--randomize). The documents it reads are
// covered by their own routes' tests (perfectJob, workflows, appointments).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test';
import mongoose, { Types } from 'mongoose';
import { ExperienceType, journeyTemplate } from 'portfolio-common';
import { env } from '../env';
import { createApp } from '../app';
import { AppointmentSchedule, Domain, Experience, PerfectJob, User, Workflow } from '../models/database';
import { authCookie } from './helpers';
import { assertDisposableDatabase } from './testDatabase';

/** Names unique to one test: everything it creates carries its suffix */
const testNames = () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const id = (name: string) => `ready-${name}-${suffix}`;
  return { suffix, id, email: (name: string) => `${id(name)}@example.com` };
};

let app: ReturnType<typeof createApp>;
let t: ReturnType<typeof testNames>;
let connected = false;
const savedCalendar = env.googleCalendarEnabled;
const savedCommute = env.commuteTimesEnabled;

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

/** An account, with a portfolio of `experiences` experiences when `domain` */
const createUser = async (
  name: string,
  { domain = false, experiences = 0 }: { domain?: boolean; experiences?: number } = {}
): Promise<TestUser> => {
  const user = await User.create({ email: t.email(name), googleId: t.id(`sub-${name}`), name });
  const id = user._id.toString();
  let domainName: string | undefined;
  if (domain) {
    domainName = t.id(name);
    // Stored directly, titled with the test's suffix (the experience routes are covered by tests/experiences.test.ts)
    const created = await Experience.insertMany(
      Array.from({ length: experiences }, (_, index) => ({ type: ExperienceType.Professional, title: `${t.id(name)} ${index}` }))
    );
    await Domain.create({ name: domainName, admin: user._id, experiences: created.map((experience) => experience._id) });
  }
  return { id, cookie: await authCookie(id), domain: domainName };
};

const readiness = async (user: TestUser) => {
  const answer = await call('GET', '/me/readiness', { cookie: user.cookie });
  expect(answer.status).toBe(200);
  return answer;
};

/** The hours of a meeting type: Mondays, 9 to 12 */
const MONDAY_MORNINGS = [{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00' }];

/** A day `days` from today (UTC), as a date override names it */
const dayFromToday = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/**
 * A meeting type of `user`, stored directly (the schedule routes are covered by
 * tests/appointments.test.ts): with weekly hours unless `availability` or `dateOverrides` say
 */
const createSchedule = (
  user: TestUser,
  enabled: boolean,
  { availability = MONDAY_MORNINGS, dateOverrides = [] }: { availability?: unknown[]; dateOverrides?: unknown[] } = {}
) =>
  AppointmentSchedule.create({
    user: user.id,
    title: t.id('call'),
    timezone: 'Europe/Paris',
    enabled,
    availability,
    dateOverrides
  });

/** What a new account has: nothing set up, the default journey */
const NOTHING = {
  domain: null,
  experiences: 0,
  perfectJob: { criteria: 0, essentials: { pay: false, workMode: false, place: false, contractTypes: false } },
  journey: { saved: false, types: ['meeting'], blocked: false, gate: false, meeting: true },
  calendar: { connected: false, reconnect: false, enabledSchedules: 0 }
};

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  await Promise.all([User.init(), Domain.init(), Workflow.init(), PerfectJob.init()]);
});

afterAll(async () => {
  env.googleCalendarEnabled = savedCalendar;
  env.commuteTimesEnabled = savedCommute;
  if (connected) await mongoose.disconnect();
});

beforeEach(() => {
  t = testNames();
  app = createApp();
});

afterEach(async () => {
  mock.restore();
  env.googleCalendarEnabled = savedCalendar;
  env.commuteTimesEnabled = savedCommute;
  if (!connected) return;
  const named = new RegExp(`-${t.suffix}(@|$)`);
  const users = (await User.find({ email: named }, '_id').lean()).map((user) => user._id);
  await Experience.deleteMany({ title: new RegExp(`-${t.suffix} \\d+$`) });
  await AppointmentSchedule.deleteMany({ user: { $in: users } });
  await PerfectJob.deleteMany({ user: { $in: users } });
  await Workflow.deleteMany({ user: { $in: users } });
  await Domain.deleteMany({ admin: { $in: users } });
  await User.deleteMany({ _id: { $in: users } });
});

describe('GET /me/readiness', () => {
  it('needs a session, of an account that still exists', async () => {
    expect((await call('GET', '/me/readiness')).status).toBe(401);
    const gone = await authCookie(new Types.ObjectId().toString());
    expect((await call('GET', '/me/readiness', { cookie: gone })).status).toBe(401);
  });

  it('says a new account has set up nothing, and has the default journey', async () => {
    const user = await createUser('new');
    const answer = (await readiness(user)).json();
    expect(answer).toEqual({ ...NOTHING, calendar: { ...NOTHING.calendar, configured: env.googleCalendarEnabled } });
    // Reading it saves nothing
    expect(await Workflow.countDocuments({ user: user.id })).toBe(0);
  });

  it('counts the experiences of the portfolio the account owns', async () => {
    const empty = await createUser('empty', { domain: true });
    expect((await readiness(empty)).json()).toMatchObject({ domain: empty.domain, experiences: 0 });
    const owner = await createUser('owner', { domain: true, experiences: 2 });
    expect((await readiness(owner)).json()).toMatchObject({ domain: owner.domain, experiences: 2 });
  });

  it('says which criteria are rated, never what they ask for', async () => {
    const owner = await createUser('owner', { domain: true });
    const criteria = {
      pay: { importance: 5, dealBreaker: true, perYear: 87_654 },
      workMode: { importance: 4, modes: ['hybrid'], minRemoteDays: 3 },
      cities: { importance: 4, places: ['Villeurbanne'] },
      contractTypes: { importance: 3, types: ['cdi'] },
      skills: { importance: 2, names: ['Elixir'] }
    };
    expect((await call('PUT', '/perfect-job', { body: { criteria }, cookie: owner.cookie })).status).toBe(200);

    const answer = await readiness(owner);
    expect(answer.json().perfectJob).toEqual({
      criteria: 5,
      essentials: { pay: true, workMode: true, place: true, contractTypes: true }
    });
    // The whole answer, but the portfolio's name: its random suffix could hold one of the values
    const text = answer.text.replaceAll(owner.domain!, '');
    for (const value of ['87654', '87 654', 'Villeurbanne', 'Elixir', 'hybrid', 'cdi', 'dealBreaker', 'importance']) {
      expect(text).not.toContain(value);
    }
  });

  const ESSENTIAL_OF = { pay: 'pay', workMode: 'workMode', cities: 'place', contractTypes: 'contractTypes' } as const;
  it.each([
    ['pay', { importance: 5, perYear: 50_000 }],
    ['workMode', { importance: 4, modes: ['remote'] }],
    ['cities', { importance: 4, places: ['Lyon'] }],
    ['contractTypes', { importance: 3, types: ['cdi'] }]
  ] as const)('says the %s criterion rated, and no other essential', async (criterion, setting) => {
    const owner = await createUser('owner');
    const saved = await call('PUT', '/perfect-job', { body: { criteria: { [criterion]: setting } }, cookie: owner.cookie });
    expect(saved.status).toBe(200);
    const essentials = { pay: false, workMode: false, place: false, contractTypes: false, [ESSENTIAL_OF[criterion]]: true };
    expect((await readiness(owner)).json().perfectJob).toEqual({ criteria: 1, essentials });
  });

  it('counts the commute as where the office is while travel times are computed, and leaves out what is not rated', async () => {
    env.commuteTimesEnabled = true;
    const owner = await createUser('owner');
    // Stored as the API keeps it, without a lookup (the address routes are covered by tests/commute.test.ts)
    await PerfectJob.create({
      user: owner.id,
      criteria: {
        commute: { importance: 4, from: '1 rue de la République, Lyon', modes: ['bike'], maxMinutesPerWeek: 300 },
        travel: { importance: 1, max: 'occasional' }
      }
    });
    const answer = await readiness(owner);
    expect(answer.json().perfectJob).toEqual({
      criteria: 2,
      essentials: { pay: false, workMode: false, place: true, contractTypes: false }
    });
    expect(answer.text).not.toContain('République');

    // Travel times off: the commute is left out of every score, so it says nothing of the office
    env.commuteTimesEnabled = false;
    expect((await readiness(owner)).json().perfectJob).toEqual({
      criteria: 2,
      essentials: { pay: false, workMode: false, place: false, contractTypes: false }
    });
  });

  it('tells the gate from other journeys, and a saved journey from the default one', async () => {
    const owner = await createUser('owner', { domain: true });
    const save = async (steps: unknown) =>
      expect((await call('PUT', '/workflow', { body: { steps }, cookie: owner.cookie })).status).toBe(200);

    await save(journeyTemplate('gate'));
    const gate = await readiness(owner);
    expect(gate.json().journey).toEqual({
      saved: true,
      types: ['note', 'job', 'job-match', 'meeting'],
      blocked: false,
      gate: true,
      meeting: true
    });
    // The note and the minimum are settings: not in the answer
    const { title } = journeyTemplate('gate')[0].config as { title: string };
    expect(gate.text).not.toContain(title);
    expect(gate.text).not.toContain('minScore');

    // Without the note, with notes between its steps, whatever the match's settings: still the gate
    const note = (id: string) => ({ id, type: 'note', config: { title: t.id(id), text: 'Read me.' } });
    const job = { id: 'job', type: 'job', config: {} };
    const match = (config: object) => ({ id: 'job-match', type: 'job-match', config });
    const meeting = { id: 'meeting', type: 'meeting', config: {} };
    for (const steps of [
      [job, match({ minScore: 70, showDetails: true }), meeting],
      [job, note('a'), match({ minScore: 70, showDetails: true }), note('b'), meeting],
      [job, match({ minScore: 35, showDetails: false }), meeting]
    ]) {
      await save(steps);
      expect((await readiness(owner)).json().journey).toEqual({
        saved: true,
        types: steps.map((step) => step.type),
        blocked: false,
        gate: true,
        meeting: true
      });
    }

    // A job without its match, and the default journey saved as it is, are no gate
    await save([job, meeting]);
    expect((await readiness(owner)).json().journey).toEqual({
      saved: true,
      types: ['job', 'meeting'],
      blocked: false,
      gate: false,
      meeting: true
    });
    await save(journeyTemplate('open'));
    expect((await readiness(owner)).json().journey).toEqual({ ...NOTHING.journey, saved: true });

    // A journey without a meeting step leads nowhere
    await save([]);
    expect((await readiness(owner)).json().journey).toEqual({
      saved: true,
      types: [],
      blocked: false,
      gate: false,
      meeting: false
    });
  });

  // Written by hand, or by an older version: never through PUT /workflow, which refuses them all
  it.each([
    ['a stored step that is not one', [{ id: 'job', type: 'job', config: {} }, { type: 'job-match' }], ['job', '']],
    [
      'a step of a type this version does not have',
      [
        { id: 'job', type: 'job', config: {} },
        { id: 'job-match', type: 'job-match', config: { minScore: 70, showDetails: true } },
        { id: 'old', type: 'interview', config: {} }
      ],
      ['job', 'job-match', 'interview']
    ],
    [
      'a job match without a job step before it',
      [{ id: 'job-match', type: 'job-match', config: { minScore: 70, showDetails: true } }],
      ['job-match']
    ]
  ])('says the meeting cannot be reached behind %s, and that it is no gate', async (_name, before, beforeTypes) => {
    const owner = await createUser('owner');
    await Workflow.collection.insertOne({
      user: new Types.ObjectId(owner.id),
      steps: [...before, { id: 'meeting', type: 'meeting', config: {} }]
    });
    expect((await readiness(owner)).json().journey).toEqual({
      saved: true,
      types: [...beforeTypes, 'meeting'],
      blocked: true,
      gate: false,
      meeting: false
    });
  });

  it('says nothing blocks a journey whose step that is not one comes after the meeting', async () => {
    const owner = await createUser('owner');
    await Workflow.collection.insertOne({
      user: new Types.ObjectId(owner.id),
      steps: [
        { id: 'job', type: 'job', config: {} },
        { id: 'job-match', type: 'job-match', config: { minScore: 70, showDetails: true } },
        { id: 'meeting', type: 'meeting', config: {} },
        { id: 'old', type: 'interview', config: {} }
      ]
    });
    expect((await readiness(owner)).json().journey).toEqual({
      saved: true,
      types: ['job', 'job-match', 'meeting', 'interview'],
      blocked: false,
      gate: true,
      meeting: true
    });
  });

  it('says whether the calendar is connected or must be connected again, and counts the meeting types open to booking', async () => {
    env.googleCalendarEnabled = true;
    const owner = await createUser('owner', { domain: true });
    await createSchedule(owner, true);
    // Hours on one day of its own only
    await createSchedule(owner, true, {
      availability: [],
      dateOverrides: [{ date: dayFromToday(7), available: true, windows: [{ startTime: '14:00', endTime: '16:00' }] }]
    });
    // Not counted: turned off; turned on without hours (as a new one starts), or only with days
    // off, or with hours only on a day that is over
    await createSchedule(owner, false);
    await createSchedule(owner, true, { availability: [] });
    await createSchedule(owner, true, { availability: [], dateOverrides: [{ date: dayFromToday(3), available: false }] });
    await createSchedule(owner, true, {
      availability: [],
      dateOverrides: [{ date: dayFromToday(-3), available: true, windows: [{ startTime: '14:00', endTime: '16:00' }] }]
    });
    await User.updateOne(
      { _id: owner.id },
      { $set: { 'googleCalendar.refreshToken': t.id('refresh-token'), 'googleCalendar.connectedAt': new Date() } }
    );

    const connected = await readiness(owner);
    expect(connected.json().calendar).toEqual({ configured: true, connected: true, reconnect: false, enabledSchedules: 2 });
    expect(connected.text).not.toContain(t.id('refresh-token'));

    // Google refused the grant: cleared, with the day it happened (services/googleCalendar.ts)
    await User.updateOne(
      { _id: owner.id },
      {
        $unset: { 'googleCalendar.refreshToken': 1, 'googleCalendar.connectedAt': 1 },
        $set: { 'googleCalendar.revokedAt': new Date() }
      }
    );
    expect((await readiness(owner)).json().calendar).toEqual({
      configured: true,
      connected: false,
      reconnect: true,
      enabledSchedules: 2
    });

    // A server without Google Calendar says so, whatever is stored
    env.googleCalendarEnabled = false;
    expect((await readiness(owner)).json().calendar.configured).toBe(false);
  });

  it("never reads another account's documents", async () => {
    env.googleCalendarEnabled = true;
    const owner = await createUser('owner', { domain: true, experiences: 3 });
    const perfectJob = await call('PUT', '/perfect-job', {
      body: { criteria: { pay: { importance: 5, perYear: 70_000 } } },
      cookie: owner.cookie
    });
    expect(perfectJob.status).toBe(200);
    const journey = await call('PUT', '/workflow', { body: { steps: journeyTemplate('gate') }, cookie: owner.cookie });
    expect(journey.status).toBe(200);
    await createSchedule(owner, true);
    await User.updateOne({ _id: owner.id }, { $set: { 'googleCalendar.refreshToken': t.id('refresh-token') } });
    expect((await readiness(owner)).json()).toMatchObject({
      experiences: 3,
      perfectJob: { criteria: 1, essentials: { pay: true } },
      journey: { gate: true },
      calendar: { connected: true, enabledSchedules: 1 }
    });

    // The route takes no account to read: the session's is the only one
    const other = await createUser('other');
    expect((await readiness(other)).json()).toEqual({ ...NOTHING, calendar: { ...NOTHING.calendar, configured: true } });
    const asked = await call('GET', `/me/readiness?user=${owner.id}&domain=${owner.domain}`, { cookie: other.cookie });
    expect(asked.json()).toEqual({ ...NOTHING, calendar: { ...NOTHING.calendar, configured: true } });
  });
});
