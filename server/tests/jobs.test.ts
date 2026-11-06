// Job postings, their applicants and the public job pages against a real
// MongoDB (MONGO_URL, which must be local or come from TEST_MONGO_URL). Each
// test creates its own users (recruiters, candidates), recruiter spaces,
// domains and postings, all named with a suffix unique to that test, and
// removes them after: tests pass in any order (--randomize).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import mongoose, { Types } from 'mongoose';
import { JOB_LIMITS, normalizeJobPosting } from 'portfolio-common';
import type { JobPostingInput } from 'portfolio-common';
import { env } from '../env';
import { createApp } from '../app';
import { Domain, JobApplication, JobPosting, User } from '../models/database';
import { enableRecruiterSpace } from '../services/recruiters';
import { authCookie } from './helpers';
import { assertDisposableDatabase } from './testDatabase';

/** Names unique to one test: everything it creates carries its suffix */
const testNames = () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const id = (name: string) => `jobs-${name}-${suffix}`;
  return { suffix, id, email: (name: string) => `${id(name)}@example.com` };
};

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UNKNOWN_ID = new Types.ObjectId().toString();

/** A valid posting: CDI in Lyon, hybrid 2 days, 39 h a week, 45-55 k€ a year */
const sampleJob = (overrides: Record<string, unknown> = {}) => ({
  title: 'Senior Backend Engineer',
  description: '## The job\n\nBuild the billing platform.',
  company: 'Acme',
  status: 'open',
  location: { country: 'FR', city: 'Lyon', postalCode: '69002', workMode: 'hybrid', remoteDaysPerWeek: 2 },
  contract: { type: 'cdi', trialPeriodMonths: 4, collectiveAgreement: 'Syntec' },
  workingTime: { arrangement: 'weekly_hours', hoursPerWeek: 39, rttDaysPerYear: 10 },
  pay: { min: 45000, max: 55000, currency: 'EUR', period: 'year' },
  ...overrides
});

/** The sample with every optional field set */
const richJob = (overrides: Record<string, unknown> = {}) =>
  sampleJob({
    openings: 2,
    contract: { type: 'cdi', startDate: '2027-01-04', trialPeriodMonths: 4, collectiveAgreement: 'Syntec' },
    pay: { min: 45000, max: 55000, currency: 'EUR', period: 'year', variable: '10% bonus' },
    organization: { directReports: 3, peers: 5, levelsToCeo: 2 },
    requirements: { seniority: 'senior', education: 'bac_5', skills: ['Go', 'Kafka'], languages: ['English (C1)'] },
    benefits: ['Meal vouchers', 'Remote allowance'],
    travel: 'occasional',
    ...overrides
  });

// ── API calls ───────────────────────────────────────────────

let app: ReturnType<typeof createApp>;

const call = async (method: string, path: string, { body, cookie }: { body?: unknown; cookie?: string } = {}) => {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  const text = body === undefined ? undefined : JSON.stringify(body);
  if (text !== undefined) headers['Content-Type'] = 'application/json';
  const response = await app.fetch(new Request(`http://localhost${path}`, { method, headers, body: text }));
  const responseText = await response.text();
  return {
    status: response.status,
    text: responseText,
    json: <T = any>() => JSON.parse(responseText) as T
  };
};

// ── Test data ───────────────────────────────────────────────

interface TestUser {
  id: string;
  cookie: string;
  email: string;
  googleId: string;
  /** The domain it owns, if any */
  domain?: string;
}

let t: ReturnType<typeof testNames>;

/** A user of this test, with a recruiter space and/or a domain */
const createUser = async (
  name: string,
  { recruiter = false, domain = false }: { recruiter?: boolean; domain?: boolean } = {}
): Promise<TestUser> => {
  const email = t.email(name);
  const googleId = t.id(`sub-${name}`);
  const user = await User.create({ email, googleId, name: `${name}-first`, surname: `${name}-last` });
  const id = user._id.toString();
  if (recruiter) expect(await enableRecruiterSpace(id)).toBe(true);
  let domainName: string | undefined;
  if (domain) {
    domainName = t.id(name);
    await Domain.create({ name: domainName, admin: user._id, experiences: [], headerTitle: `${name} portfolio` });
  }
  return { id, cookie: await authCookie(id), email, googleId, domain: domainName };
};

const createRecruiter = (name = 'recruiter') => createUser(name, { recruiter: true });
const createCandidate = (name = 'candidate') => createUser(name, { domain: true });

/** POST /jobs as `recruiter`; expects success */
const createJob = async (recruiter: TestUser, body: Record<string, unknown> = sampleJob()) => {
  const result = await call('POST', '/jobs', { body, cookie: recruiter.cookie });
  expect(result.status).toBe(200);
  return result.json();
};

/** POST /jobs/:id/application as `candidate`, with the JSON body the route requires */
const apply = (jobId: string, candidate: TestUser) =>
  call('POST', `/jobs/${jobId}/application`, { body: {}, cookie: candidate.cookie });

/** Removes what a test created: its users, their domains, postings and applications */
const removeTestData = async (suffix: string) => {
  const named = new RegExp(`-${suffix}(@|$)`);
  const users = (await User.find({ email: named }, '_id').lean()).map((user) => user._id);
  const jobs = (await JobPosting.find({ recruiter: { $in: users } }, '_id').lean()).map((job) => job._id);
  await JobApplication.deleteMany({ $or: [{ job: { $in: jobs } }, { candidate: { $in: users } }] });
  await JobPosting.deleteMany({ _id: { $in: jobs } });
  await Domain.deleteMany({ $or: [{ admin: { $in: users } }, { name: named }] });
  await User.deleteMany({ _id: { $in: users } });
};

let connected = false;

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  // The unique indexes the routes rely on (one application per candidate)
  await Promise.all([User.init(), Domain.init(), JobPosting.init(), JobApplication.init()]);
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

// ── Session and recruiter space ─────────────────────────────

describe('access', () => {
  const job = `/jobs/${UNKNOWN_ID}`;
  const sessionRoutes: [string, string, unknown?][] = [
    ['GET', '/recruiter/jobs'],
    ['GET', `/recruiter/jobs/${UNKNOWN_ID}`],
    ['POST', '/jobs', sampleJob()],
    ['PUT', job, sampleJob()],
    ['PUT', `${job}/status`, { status: 'closed' }],
    ['DELETE', job],
    ['POST', `${job}/applicants`, { domain: 'someone' }],
    ['DELETE', `${job}/applicants/${UNKNOWN_ID}`],
    ['GET', `${job}/application`],
    ['POST', `${job}/application`],
    ['DELETE', `${job}/application`]
  ];

  it.each(sessionRoutes)('%s %s requires a session (401)', async (method, path, body) => {
    const result = await call(method, path, { body });
    expect(result.status).toBe(401);
  });

  it('serves the public pages without a session', async () => {
    const recruiter = await createRecruiter();
    const created = await createJob(recruiter);

    expect((await call('GET', '/jobs')).status).toBe(200);
    const page = await call('GET', `/jobs/${created._id}`);
    expect(page.status).toBe(200);
    expect(page.json()._id).toBe(created._id);
  });

  it('refuses the recruiter routes to an account without a recruiter space (403), creating nothing', async () => {
    const recruiter = await createRecruiter();
    const created = await createJob(recruiter);
    // Has a portfolio, not a recruiter space
    const visitor = await createCandidate('visitor');
    const id = created._id;

    const attempts: [string, string, unknown?][] = [
      ['GET', '/recruiter/jobs'],
      ['GET', `/recruiter/jobs/${id}`],
      ['POST', '/jobs', sampleJob()],
      ['PUT', `/jobs/${id}`, sampleJob({ title: 'Taken over' })],
      ['PUT', `/jobs/${id}/status`, { status: 'closed' }],
      ['DELETE', `/jobs/${id}`],
      ['POST', `/jobs/${id}/applicants`, { domain: visitor.domain }],
      ['DELETE', `/jobs/${id}/applicants/${UNKNOWN_ID}`]
    ];
    for (const [method, path, body] of attempts) {
      const result = await call(method, path, { body, cookie: visitor.cookie });
      expect([method, path, result.status, result.text]).toEqual([method, path, 403, 'Create your recruiter space first']);
    }

    expect(await JobPosting.countDocuments({ recruiter: visitor.id })).toBe(0);
    const stored = await JobPosting.findById(id).lean();
    expect(stored?.title).toBe('Senior Backend Engineer');
    expect(stored?.status).toBe('open');
    expect(await JobApplication.countDocuments({ job: id })).toBe(0);
  });

  it('rejects ids that are not ObjectIds (422)', async () => {
    const recruiter = await createRecruiter();
    expect((await call('GET', '/jobs/not-an-id')).status).toBe(422);
    expect((await call('GET', '/recruiter/jobs/not-an-id', { cookie: recruiter.cookie })).status).toBe(422);
    expect((await call('DELETE', `/jobs/${UNKNOWN_ID}/applicants/nope`, { cookie: recruiter.cookie })).status).toBe(422);
  });
});

// ── Validation and normalisation ────────────────────────────

describe('validation', () => {
  it.each([
    ['a blank title', sampleJob({ title: '   ' }), 'title', 'Title is required'],
    [
      'no city for an on-site job',
      sampleJob({ location: { country: 'FR', workMode: 'on_site' } }),
      'location.city',
      'City is required unless the job is fully remote'
    ],
    [
      'a CDD without its duration',
      sampleJob({ contract: { type: 'cdd' } }),
      'contract.durationMonths',
      'Duration is required for this contract'
    ],
    [
      'weekly hours without the hours',
      sampleJob({ workingTime: { arrangement: 'weekly_hours' } }),
      'workingTime.hoursPerWeek',
      'Hours per week are required'
    ],
    [
      'a maximum pay below the minimum',
      sampleJob({ pay: { min: 55000, max: 45000, currency: 'EUR', period: 'year' } }),
      'pay.max',
      'Maximum pay must not be below the minimum'
    ],
    [
      'a start date that is not a date',
      sampleJob({ contract: { type: 'cdi', startDate: '2027-02-30' } }),
      'contract.startDate',
      'Start date must be a date (YYYY-MM-DD) from 2000 to 2100'
    ],
    [
      'a start date of year 0',
      sampleJob({ contract: { type: 'cdi', startDate: '0000-01-01' } }),
      'contract.startDate',
      'Start date must be a date (YYYY-MM-DD) from 2000 to 2100'
    ],
    [
      'a start date centuries ago',
      sampleJob({ contract: { type: 'cdi', startDate: '1850-03-01' } }),
      'contract.startDate',
      'Start date must be a date (YYYY-MM-DD) from 2000 to 2100'
    ],
    [
      'a pay with more than 2 decimals',
      sampleJob({ pay: { min: 45000.001, max: 55000, currency: 'EUR', period: 'year' } }),
      'pay.min',
      'Minimum pay must be a positive amount (at most 2 decimals)'
    ]
  ])('refuses %s with a 422 naming the field, creating nothing', async (_label, body, property, message) => {
    const recruiter = await createRecruiter();

    const result = await call('POST', '/jobs', { body, cookie: recruiter.cookie });

    expect(result.status).toBe(422);
    expect(result.json()).toEqual({ type: 'validation', on: 'body', property, message });
    expect(await JobPosting.countDocuments({ recruiter: recruiter.id })).toBe(0);
  });

  it('refuses an unknown contract type with a schema 422', async () => {
    const recruiter = await createRecruiter();

    const result = await call('POST', '/jobs', {
      body: sampleJob({ contract: { type: 'cdx' } }),
      cookie: recruiter.cookie
    });

    expect(result.status).toBe(422);
    expect(result.json()).toMatchObject({ type: 'validation', on: 'body', property: 'contract.type' });
    expect(await JobPosting.countDocuments({ recruiter: recruiter.id })).toBe(0);
  });

  it('leaves the choices the recruiter did not make unset, and refuses missing required ones', async () => {
    const recruiter = await createRecruiter();

    // No travel, seniority nor education: none is filled in for them
    const created = await createJob(recruiter, sampleJob({ requirements: { skills: ['Go'] } }));
    expect(created.requirements).toEqual({ skills: ['Go'] });
    expect(created).not.toHaveProperty('travel');
    const stored = await JobPosting.findById(created._id).lean();
    expect(stored?.requirements).toEqual({ skills: ['Go'] });
    expect(stored).not.toHaveProperty('travel');

    // A status change without a status does not make a draft
    const noStatus = await call('PUT', `/jobs/${created._id}/status`, { body: {}, cookie: recruiter.cookie });
    expect([noStatus.status, noStatus.json().property]).toEqual([422, 'status']);
    expect((await JobPosting.findById(created._id).lean())?.status).toBe('open');

    const noWorkMode = await call('POST', '/jobs', {
      body: sampleJob({ location: { country: 'FR', city: 'Lyon' } }),
      cookie: recruiter.cookie
    });
    expect([noWorkMode.status, noWorkMode.json().property]).toEqual([422, 'location.workMode']);
    expect(await JobPosting.countDocuments({ recruiter: recruiter.id })).toBe(1);
  });

  it('validates edits too, leaving the posting unchanged', async () => {
    const recruiter = await createRecruiter();
    const created = await createJob(recruiter);

    const result = await call('PUT', `/jobs/${created._id}`, {
      body: sampleJob({ title: 'Changed', workingTime: { arrangement: 'annual_days' } }),
      cookie: recruiter.cookie
    });

    expect(result.status).toBe(422);
    expect(result.json().property).toBe('workingTime.daysPerYear');
    expect((await JobPosting.findById(created._id).lean())?.title).toBe('Senior Backend Engineer');
  });

  it('accepts a fully remote job without a city', async () => {
    const recruiter = await createRecruiter();

    const created = await createJob(recruiter, sampleJob({ location: { country: 'FR', workMode: 'remote' } }));

    expect(created.location).toEqual({ country: 'FR', workMode: 'remote' });
  });
});

describe('normalisation', () => {
  it('stores pay amounts with 2 decimals at most, float noise rounded away', async () => {
    const recruiter = await createRecruiter();

    const created = await createJob(
      recruiter,
      sampleJob({ pay: { min: 11.879999999999999, max: 12.000000001, currency: 'EUR', period: 'hour' } })
    );

    expect(created.pay).toEqual({ min: 11.88, max: 12, currency: 'EUR', period: 'hour' });
    expect((await JobPosting.findById(created._id).lean())?.pay).toEqual(created.pay);
  });

  it('stores and returns the posting normalised: fields that do not apply dropped, text and lists cleaned', async () => {
    const recruiter = await createRecruiter();

    const created = await createJob(
      recruiter,
      sampleJob({
        title: '  Senior   Backend Engineer ',
        description: '\r\n## The job\r\n\r\nBuild it.  \r\n',
        company: '   ',
        location: { country: 'FR', city: ' Lyon ', workMode: 'on_site', remoteDaysPerWeek: 2 },
        contract: { type: 'cdi', durationMonths: 12, collectiveAgreement: '  ' },
        workingTime: { arrangement: 'annual_days', hoursPerWeek: 39, daysPerYear: 218 },
        requirements: { skills: ['  Go ', 'go', 'Kafka', ' ', 'GO'], languages: [] },
        benefits: [' Meal vouchers ', 'meal vouchers', ''],
        organization: {}
      })
    );

    const expected = {
      title: 'Senior Backend Engineer',
      description: '## The job\n\nBuild it.',
      location: { country: 'FR', city: 'Lyon', workMode: 'on_site' },
      contract: { type: 'cdi' },
      workingTime: { arrangement: 'annual_days', daysPerYear: 218 },
      requirements: { skills: ['Go', 'Kafka'] },
      benefits: ['Meal vouchers']
    };
    expect(created).toMatchObject(expected);
    expect(created).not.toHaveProperty('company');
    expect(created).not.toHaveProperty('organization');

    const stored = await JobPosting.findById(created._id).lean();
    expect(stored).toMatchObject(expected);
    expect(stored).not.toHaveProperty('company');
    expect(stored).not.toHaveProperty('organization');
    expect(stored?.requirements).not.toHaveProperty('languages');
  });

  it('drops the remote days when an edit makes the job on site', async () => {
    const recruiter = await createRecruiter();
    const created = await createJob(recruiter);
    expect(created.location.remoteDaysPerWeek).toBe(2);

    const result = await call('PUT', `/jobs/${created._id}`, {
      body: sampleJob({ location: { country: 'FR', city: 'Lyon', workMode: 'on_site', remoteDaysPerWeek: 2 } }),
      cookie: recruiter.cookie
    });

    expect(result.status).toBe(200);
    expect(result.json().location).toEqual({ country: 'FR', city: 'Lyon', workMode: 'on_site' });
    expect((await JobPosting.findById(created._id).lean())?.location).toEqual({
      country: 'FR',
      city: 'Lyon',
      workMode: 'on_site'
    });
  });
});

// ── Create, read, update, delete ────────────────────────────

describe('postings', () => {
  it('creates a posting and returns it with its id and dates only, never its recruiter', async () => {
    const recruiter = await createRecruiter();

    const created = await createJob(recruiter, richJob());

    expect(created).toEqual({
      ...richJob(),
      _id: expect.stringMatching(/^[0-9a-f]{24}$/),
      createdAt: expect.stringMatching(ISO_INSTANT),
      updatedAt: expect.stringMatching(ISO_INSTANT),
      publishedAt: expect.stringMatching(ISO_INSTANT)
    });

    // The same posting on every read
    const detail = await call('GET', `/recruiter/jobs/${created._id}`, { cookie: recruiter.cookie });
    expect(detail.status).toBe(200);
    expect(detail.json()).toEqual({ ...created, applicants: [] });
    const page = await call('GET', `/jobs/${created._id}`);
    expect(page.json()).toEqual(created);
  });

  it('publishes a posting the first time it leaves draft, and keeps that date', async () => {
    const recruiter = await createRecruiter();
    const draft = await createJob(recruiter, sampleJob({ status: 'draft' }));
    expect(draft).not.toHaveProperty('publishedAt');

    const stillDraft = await call('PUT', `/jobs/${draft._id}`, {
      body: sampleJob({ status: 'draft', title: 'Still a draft' }),
      cookie: recruiter.cookie
    });
    expect(stillDraft.json()).not.toHaveProperty('publishedAt');

    const opened = await call('PUT', `/jobs/${draft._id}/status`, { body: { status: 'open' }, cookie: recruiter.cookie });
    expect(opened.status).toBe(200);
    const { publishedAt } = opened.json();
    expect(publishedAt).toMatch(ISO_INSTANT);
    expect(opened.json()).toMatchObject({ status: 'open', title: 'Still a draft' });

    const backToDraft = await call('PUT', `/jobs/${draft._id}/status`, { body: { status: 'draft' }, cookie: recruiter.cookie });
    expect(backToDraft.json()).toMatchObject({ status: 'draft', publishedAt });

    const edited = await call('PUT', `/jobs/${draft._id}`, {
      body: sampleJob({ status: 'filled' }),
      cookie: recruiter.cookie
    });
    expect(edited.json()).toMatchObject({ status: 'filled', publishedAt });
    expect((await JobPosting.findById(draft._id).lean())?.publishedAt?.toISOString()).toBe(publishedAt);
  });

  it('refuses an unknown status', async () => {
    const recruiter = await createRecruiter();
    const created = await createJob(recruiter);

    const result = await call('PUT', `/jobs/${created._id}/status`, { body: { status: 'archived' }, cookie: recruiter.cookie });

    expect(result.status).toBe(422);
    expect((await JobPosting.findById(created._id).lean())?.status).toBe('open');
  });

  it('replaces every field on edit: optional fields left out are removed', async () => {
    const recruiter = await createRecruiter();
    const created = await createJob(recruiter, richJob());

    const result = await call('PUT', `/jobs/${created._id}`, {
      body: sampleJob({ title: 'Staff Engineer', company: undefined }),
      cookie: recruiter.cookie
    });

    expect(result.status).toBe(200);
    const edited = result.json();
    const { company: _company, ...withoutCompany } = sampleJob({ title: 'Staff Engineer' });
    expect(edited).toEqual({
      ...withoutCompany,
      _id: created._id,
      createdAt: created.createdAt,
      updatedAt: expect.stringMatching(ISO_INSTANT),
      publishedAt: created.publishedAt
    });
    expect(new Date(edited.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());

    const stored = await JobPosting.findById(created._id).lean();
    for (const field of ['company', 'openings', 'organization', 'requirements', 'benefits', 'travel']) {
      expect(stored).not.toHaveProperty(field);
    }
    expect(stored?.contract).toEqual({ type: 'cdi', trialPeriodMonths: 4, collectiveAgreement: 'Syntec' });
    expect(stored?.pay).toEqual({ min: 45000, max: 55000, currency: 'EUR', period: 'year' });
  });

  it('answers 404 when the posting is deleted while it is edited', async () => {
    const recruiter = await createRecruiter();
    const created = await createJob(recruiter);
    // Loaded by the edit, then deleted (e.g. from another tab) before it is saved
    const loaded = await JobPosting.findById(created._id);
    await JobPosting.deleteOne({ _id: created._id });
    spyOn(JobPosting, 'findOne').mockResolvedValueOnce(loaded as never);

    const result = await call('PUT', `/jobs/${created._id}/status`, { body: { status: 'closed' }, cookie: recruiter.cookie });

    expect(result.status).toBe(404);
    expect(result.text).toBe('Job posting not found');
    expect(await JobPosting.exists({ _id: created._id })).toBeNull();
  });

  it('answers 404 when the posting is deleted while an edit that changes its lists is saved', async () => {
    const recruiter = await createRecruiter();
    const created = await createJob(recruiter, sampleJob({ benefits: ['A'] }));
    const loaded = await JobPosting.findById(created._id);
    await JobPosting.deleteOne({ _id: created._id });
    spyOn(JobPosting, 'findOne').mockResolvedValueOnce(loaded as never);

    // A whole list replaced: save() filters on the version it loaded (Mongoose's VersionError)
    const result = await call('PUT', `/jobs/${created._id}`, {
      body: sampleJob({ benefits: ['B'] }),
      cookie: recruiter.cookie
    });

    expect([result.status, result.text]).toEqual([404, 'Job posting not found']);
    expect(await JobPosting.exists({ _id: created._id })).toBeNull();
  });

  it('refuses (409) an edit that replaces a list the posting changed meanwhile, never a 500', async () => {
    const recruiter = await createRecruiter();
    const created = await createJob(recruiter, sampleJob({ benefits: ['A'] }));
    // Two edits loaded the posting at once (e.g. saved from two tabs together)
    const [first, second] = await Promise.all([JobPosting.findById(created._id), JobPosting.findById(created._id)]);
    spyOn(JobPosting, 'findOne')
      .mockResolvedValueOnce(first as never)
      .mockResolvedValueOnce(second as never);

    const saved = await call('PUT', `/jobs/${created._id}`, { body: sampleJob({ benefits: ['B'] }), cookie: recruiter.cookie });
    const late = await call('PUT', `/jobs/${created._id}`, { body: sampleJob({ benefits: ['C'] }), cookie: recruiter.cookie });

    expect(saved.status).toBe(200);
    expect([late.status, late.text]).toEqual([409, 'This job posting was changed since you opened it']);
    expect((await JobPosting.findById(created._id).lean())?.benefits).toEqual(['B']);
  });

  it('refuses (409) an edit started from an older version of the posting, which stays unchanged', async () => {
    const recruiter = await createRecruiter();
    const created = await createJob(recruiter, sampleJob({ status: 'draft' }));
    // Opened in the editor, then published from another tab
    await Bun.sleep(5);
    const opened = await call('PUT', `/jobs/${created._id}/status`, { body: { status: 'open' }, cookie: recruiter.cookie });
    expect(opened.status).toBe(200);

    // The editor's stale form: its status is still draft
    const stale = await call('PUT', `/jobs/${created._id}`, {
      body: { ...sampleJob({ status: 'draft', title: 'Typo fixed' }), updatedAt: created.updatedAt },
      cookie: recruiter.cookie
    });

    expect([stale.status, stale.text]).toEqual([409, 'This job posting was changed since you opened it']);
    expect(await JobPosting.findById(created._id).lean()).toMatchObject({ status: 'open', title: 'Senior Backend Engineer' });
    expect((await call('GET', `/jobs/${created._id}`)).status).toBe(200);

    // Unchanged forms are refused too: nothing to save, but the posting is not the one the editor showed
    const unchanged = await call('PUT', `/jobs/${created._id}`, {
      body: { ...sampleJob({ status: 'open' }), updatedAt: created.updatedAt },
      cookie: recruiter.cookie
    });
    expect(unchanged.status).toBe(409);

    // From the current version: saved
    const current = opened.json().updatedAt;
    const edited = await call('PUT', `/jobs/${created._id}`, {
      body: { ...sampleJob({ status: 'open', title: 'Typo fixed' }), updatedAt: current },
      cookie: recruiter.cookie
    });
    expect(edited.status).toBe(200);
    expect(edited.json()).toMatchObject({ status: 'open', title: 'Typo fixed' });
    expect(edited.json()).not.toHaveProperty('updatedAt', current);
    // Without updatedAt, the last edit wins (API clients that do not track versions)
    const blind = await call('PUT', `/jobs/${created._id}`, { body: sampleJob({ title: 'Blind' }), cookie: recruiter.cookie });
    expect([blind.status, blind.json().title]).toEqual([200, 'Blind']);
  });

  it('refuses an updatedAt that is not a date (422)', async () => {
    const recruiter = await createRecruiter();
    const created = await createJob(recruiter);

    const result = await call('PUT', `/jobs/${created._id}`, {
      body: { ...sampleJob({ title: 'Changed' }), updatedAt: 'yesterday' },
      cookie: recruiter.cookie
    });

    expect([result.status, result.json().property]).toEqual([422, 'updatedAt']);
    expect((await JobPosting.findById(created._id).lean())?.title).toBe('Senior Backend Engineer');
  });

  it('deletes a posting with its applications', async () => {
    const recruiter = await createRecruiter();
    const candidate = await createCandidate();
    const other = await createCandidate('other');
    const created = await createJob(recruiter);
    const kept = await createJob(recruiter, sampleJob({ title: 'Kept' }));
    expect((await apply(created._id, candidate)).status).toBe(200);
    expect((await apply(kept._id, candidate)).status).toBe(200);
    const added = await call('POST', `/jobs/${created._id}/applicants`, { body: { domain: other.domain }, cookie: recruiter.cookie });
    expect(added.status).toBe(200);

    const result = await call('DELETE', `/jobs/${created._id}`, { cookie: recruiter.cookie });

    expect(result.status).toBe(200);
    expect(result.json()).toEqual({ id: created._id });
    expect(await JobPosting.exists({ _id: created._id })).toBeNull();
    expect(await JobApplication.countDocuments({ job: created._id })).toBe(0);
    // The recruiter's other posting keeps its applicant
    expect(await JobApplication.countDocuments({ job: kept._id })).toBe(1);
    expect((await call('GET', `/recruiter/jobs/${created._id}`, { cookie: recruiter.cookie })).status).toBe(404);
    expect((await call('GET', `/jobs/${created._id}`)).status).toBe(404);
    expect((await call('DELETE', `/jobs/${created._id}`, { cookie: recruiter.cookie })).status).toBe(404);
  });

  it("lists the recruiter's own postings, most recently updated first, with their applicant counts", async () => {
    const recruiter = await createRecruiter();
    const other = await createRecruiter('other-recruiter');
    const first = await createJob(recruiter, sampleJob({ title: 'First', status: 'draft' }));
    const second = await createJob(recruiter, sampleJob({ title: 'Second' }));
    const third = await createJob(recruiter, sampleJob({ title: 'Third', status: 'on_hold' }));
    await createJob(other, sampleJob({ title: 'Not mine' }));
    // Edited last: now the most recently updated
    await Bun.sleep(5);
    expect((await call('PUT', `/jobs/${first._id}/status`, { body: { status: 'open' }, cookie: recruiter.cookie })).status).toBe(200);
    const [alice, bob] = await Promise.all([createCandidate('alice'), createCandidate('bob')]);
    for (const candidate of [alice, bob]) {
      expect((await apply(second._id, candidate)).status).toBe(200);
    }
    expect(
      (await call('POST', `/jobs/${first._id}/applicants`, { body: { domain: alice.domain }, cookie: recruiter.cookie })).status
    ).toBe(200);

    const result = await call('GET', '/recruiter/jobs', { cookie: recruiter.cookie });

    expect(result.status).toBe(200);
    const { jobs } = result.json<{ jobs: { _id: string; title: string; applicantCount: number }[] }>();
    expect(jobs.map(({ title, applicantCount }) => [title, applicantCount])).toEqual([
      ['First', 1],
      ['Third', 0],
      ['Second', 2]
    ]);
    expect(jobs[1]).toEqual({ ...third, applicantCount: 0 });

    // A recruiter space with no posting yet
    const newcomer = await createRecruiter('newcomer');
    expect((await call('GET', '/recruiter/jobs', { cookie: newcomer.cookie })).json()).toEqual({ jobs: [] });
  });

  it(`keeps at most ${JOB_LIMITS.jobsPerRecruiter} postings per recruiter (409)`, async () => {
    const recruiter = await createRecruiter();
    const stored = normalizeJobPosting(sampleJob() as JobPostingInput);
    await JobPosting.insertMany(
      Array.from({ length: JOB_LIMITS.jobsPerRecruiter }, () => ({ ...stored, recruiter: recruiter.id }))
    );

    const result = await call('POST', '/jobs', { body: sampleJob(), cookie: recruiter.cookie });

    expect(result.status).toBe(409);
    expect(result.text).toBe(
      `You can keep at most ${JOB_LIMITS.jobsPerRecruiter} job postings: delete one to add another`
    );
    expect(await JobPosting.countDocuments({ recruiter: recruiter.id })).toBe(JOB_LIMITS.jobsPerRecruiter);
  });

  it('never goes over the posting limit, even when creations arrive at once', async () => {
    const recruiter = await createRecruiter();
    const stored = normalizeJobPosting(sampleJob() as JobPostingInput);
    await JobPosting.insertMany(
      Array.from({ length: JOB_LIMITS.jobsPerRecruiter - 1 }, () => ({ ...stored, recruiter: recruiter.id }))
    );

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, n) => call('POST', '/jobs', { body: sampleJob({ title: `Burst ${n}` }), cookie: recruiter.cookie }))
    );

    // One place left: one creation at most takes it, the others are refused
    const created = results.filter((result) => result.status === 200);
    expect(created.length).toBeLessThanOrEqual(1);
    const full = `You can keep at most ${JOB_LIMITS.jobsPerRecruiter} job postings: delete one to add another`;
    expect(results.filter((result) => result.status !== 200).map((result) => [result.status, result.text])).toEqual(
      Array.from({ length: results.length - created.length }, () => [409, full])
    );
    expect(await JobPosting.countDocuments({ recruiter: recruiter.id })).toBe(JOB_LIMITS.jobsPerRecruiter - 1 + created.length);
    for (const result of created) expect(await JobPosting.exists({ _id: result.json()._id })).not.toBeNull();
  });
});

describe("another recruiter's posting", () => {
  it('is not found (404) by every recruiter route, and stays unchanged', async () => {
    const owner = await createRecruiter('owner');
    const intruder = await createUser('intruder', { recruiter: true, domain: true });
    const candidate = await createCandidate();
    const created = await createJob(owner);
    const listed = await call('POST', `/jobs/${created._id}/applicants`, { body: { domain: candidate.domain }, cookie: owner.cookie });
    expect(listed.status).toBe(200);
    const applicationId = listed.json()._id;
    const id = created._id;

    const attempts: [string, string, unknown?][] = [
      ['GET', `/recruiter/jobs/${id}`],
      ['PUT', `/jobs/${id}`, sampleJob({ title: 'Taken over' })],
      ['PUT', `/jobs/${id}/status`, { status: 'closed' }],
      ['DELETE', `/jobs/${id}`],
      ['POST', `/jobs/${id}/applicants`, { domain: intruder.domain }],
      ['DELETE', `/jobs/${id}/applicants/${applicationId}`]
    ];
    for (const [method, path, body] of attempts) {
      const result = await call(method, path, { body, cookie: intruder.cookie });
      expect([method, path, result.status, result.text]).toEqual([method, path, 404, 'Job posting not found']);
      // Same answer as an id that does not exist
      const unknown = await call(method, path.replace(id, UNKNOWN_ID), { body, cookie: intruder.cookie });
      expect([method, unknown.status, unknown.text]).toEqual([method, 404, 'Job posting not found']);
    }

    const stored = await JobPosting.findById(id).lean();
    expect(stored).toMatchObject({ title: 'Senior Backend Engineer', status: 'open' });
    expect(await JobApplication.countDocuments({ job: id })).toBe(1);
    expect((await call('GET', '/recruiter/jobs', { cookie: intruder.cookie })).json()).toEqual({ jobs: [] });
  });
});

// ── Public pages ────────────────────────────────────────────

describe('public pages', () => {
  it('show a posting unless it is a draft', async () => {
    const recruiter = await createRecruiter();
    const draft = await createJob(recruiter, sampleJob({ status: 'draft' }));

    const hidden = await call('GET', `/jobs/${draft._id}`);
    expect(hidden.status).toBe(404);
    expect(hidden.text).toBe('Job posting not found');
    expect((await call('GET', `/jobs/${UNKNOWN_ID}`)).status).toBe(404);

    for (const status of ['open', 'on_hold', 'filled', 'closed']) {
      await call('PUT', `/jobs/${draft._id}/status`, { body: { status }, cookie: recruiter.cookie });
      const page = await call('GET', `/jobs/${draft._id}`);
      expect([status, page.status, page.json().status]).toEqual([status, 200, status]);
    }
  });

  it('list the open postings only, most recently published first, without their descriptions', async () => {
    const recruiter = await createRecruiter();
    const older = await createJob(recruiter, sampleJob({ title: t.id('older') }));
    await Bun.sleep(5);
    const newer = await createJob(recruiter, sampleJob({ title: t.id('newer') }));
    const hidden = await Promise.all(
      ['draft', 'on_hold', 'filled', 'closed'].map((status) => createJob(recruiter, sampleJob({ title: t.id(status), status })))
    );
    // An edit does not move a posting up the list
    await Bun.sleep(5);
    const edited = await call('PUT', `/jobs/${older._id}`, {
      body: sampleJob({ title: t.id('older'), company: 'Edited' }),
      cookie: recruiter.cookie
    });
    expect(edited.status).toBe(200);

    const result = await call('GET', '/jobs');

    expect(result.status).toBe(200);
    const { jobs } = result.json<{ jobs: { _id: string; status: string }[] }>();
    expect(jobs.length).toBeLessThanOrEqual(100);
    expect(jobs.every((job) => job.status === 'open')).toBe(true);
    const mine = jobs.filter((job) => [older._id, newer._id, ...hidden.map((job) => job._id)].includes(job._id));
    const { description: _newer, ...newerSummary } = newer;
    const { description: _older, ...olderSummary } = edited.json();
    expect(mine).toEqual([newerSummary, olderSummary]);
  });

  it('list 10 postings of one recruiter at most: no account can push the others out', async () => {
    const employer = await createRecruiter('employer');
    const flooder = await createRecruiter('flooder');
    const kept = await createJob(employer, sampleJob({ title: t.id('kept') }));
    await Bun.sleep(5);
    const flood = [];
    for (let n = 0; n < 12; n++) flood.push(await createJob(flooder, sampleJob({ title: t.id(`flood-${n}`) })));

    const { jobs } = (await call('GET', '/jobs')).json<{ jobs: { _id: string }[] }>();

    const ids = jobs.map((job) => job._id);
    expect(ids).toContain(kept._id);
    const listedFlood = flood.filter((job) => ids.includes(job._id));
    // The 10 most recently published of the flood
    expect(listedFlood.map((job) => job._id)).toEqual(flood.slice(2).map((job) => job._id));
  });

  it('never tell who posted a posting (no user id)', async () => {
    const recruiter = await createUser('recruiter', { recruiter: true, domain: true });
    const created = await createJob(recruiter, sampleJob({ title: t.id('confidential') }));
    const candidate = await createCandidate();

    const responses = [
      await call('GET', '/jobs'),
      await call('GET', `/jobs/${created._id}`),
      await call('GET', `/jobs/${created._id}/application`, { cookie: candidate.cookie })
    ];

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.text).not.toContain(recruiter.id);
    }
    expect(responses[0].text).toContain(created._id);
  });
});

// ── Applications ────────────────────────────────────────────

describe('applying', () => {
  it('lists a candidate who applies with their portfolio, never their email', async () => {
    const recruiter = await createRecruiter();
    const candidate = await createCandidate();
    const created = await createJob(recruiter);

    expect((await call('GET', `/jobs/${created._id}/application`, { cookie: candidate.cookie })).json()).toEqual({
      applied: false
    });
    const applied = await apply(created._id, candidate);

    expect(applied.status).toBe(200);
    const appliedAt = applied.json().appliedAt;
    expect(applied.json()).toEqual({ applied: true, appliedAt: expect.stringMatching(ISO_INSTANT), source: 'applied' });
    expect((await call('GET', `/jobs/${created._id}/application`, { cookie: candidate.cookie })).json()).toEqual({
      applied: true,
      appliedAt,
      source: 'applied'
    });

    const detail = await call('GET', `/recruiter/jobs/${created._id}`, { cookie: recruiter.cookie });
    expect(detail.json().applicants).toEqual([
      {
        _id: expect.stringMatching(/^[0-9a-f]{24}$/),
        appliedAt,
        source: 'applied',
        candidate: { name: 'candidate-first', surname: 'candidate-last' },
        domain: { name: candidate.domain, headerTitle: 'candidate portfolio' }
      }
    ]);
    expect(detail.text).not.toContain(candidate.email);
    expect(detail.text).not.toContain(candidate.googleId);
    expect(detail.text).not.toContain(candidate.id);
  });

  it('accepts one application per candidate (409), even when two arrive at once', async () => {
    const recruiter = await createRecruiter();
    const candidate = await createCandidate();
    const created = await createJob(recruiter);

    const results = await Promise.all(
      [1, 2].map(() => apply(created._id, candidate))
    );

    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(results.find((result) => result.status === 409)?.text).toBe('You already applied');
    const again = await apply(created._id, candidate);
    expect([again.status, again.text]).toEqual([409, 'You already applied']);
    expect(await JobApplication.countDocuments({ job: created._id })).toBe(1);
  });

  it('needs a JSON body, so a cross-site request without a preflight never applies', async () => {
    const recruiter = await createRecruiter();
    const candidate = await createCandidate();
    const created = await createJob(recruiter);
    const url = `http://localhost/jobs/${created._id}/application`;

    // What a no-cors fetch from another site sends with the cookie: no body,
    // no Content-Type (a simple request, no CORS preflight)
    const bodyless = await app.fetch(
      new Request(url, { method: 'POST', headers: { Cookie: candidate.cookie, Origin: 'https://evil.example' } })
    );
    // An HTML form: refused before the route (app.ts)
    const form = await app.fetch(
      new Request(url, { method: 'POST', headers: { Cookie: candidate.cookie, 'Content-Type': 'text/plain' }, body: '{}' })
    );

    expect([bodyless.status, form.status]).toEqual([415, 415]);
    expect(await JobApplication.countDocuments({ job: created._id })).toBe(0);
    expect((await apply(created._id, candidate)).status).toBe(200);
  });

  it('takes applications while the posting is open only', async () => {
    const recruiter = await createRecruiter();
    const candidate = await createCandidate();
    const created = await createJob(recruiter, sampleJob({ status: 'draft' }));

    const toDraft = await apply(created._id, candidate);
    expect([toDraft.status, toDraft.text]).toEqual([404, 'Job posting not found']);
    expect((await call('GET', `/jobs/${created._id}/application`, { cookie: candidate.cookie })).status).toBe(404);
    expect((await apply(UNKNOWN_ID, candidate)).status).toBe(404);

    for (const status of ['on_hold', 'filled', 'closed']) {
      await call('PUT', `/jobs/${created._id}/status`, { body: { status }, cookie: recruiter.cookie });
      const result = await apply(created._id, candidate);
      expect([status, result.status, result.text]).toEqual([status, 409, 'This job posting is not taking applications']);
    }
    expect(await JobApplication.countDocuments({ job: created._id })).toBe(0);
  });

  it('needs a portfolio', async () => {
    const recruiter = await createRecruiter();
    const visitor = await createUser('visitor');
    const created = await createJob(recruiter);

    const result = await apply(created._id, visitor);

    expect([result.status, result.text]).toEqual([403, 'Claim a portfolio before applying']);
    expect(await JobApplication.countDocuments({ job: created._id })).toBe(0);
  });

  it("is not for the posting's own recruiter", async () => {
    const recruiter = await createUser('recruiter', { recruiter: true, domain: true });
    const created = await createJob(recruiter);

    const result = await apply(created._id, recruiter);

    expect([result.status, result.text]).toEqual([403, 'You cannot apply to your own job posting']);
    expect(await JobApplication.countDocuments({ job: created._id })).toBe(0);
    // What the job page asks to offer "Manage it": told to the recruiter alone
    const own = await call('GET', `/jobs/${created._id}/application`, { cookie: recruiter.cookie });
    expect([own.status, own.json()]).toEqual([200, { applied: false, own: true }]);
    const candidate = await createCandidate();
    const other = await call('GET', `/jobs/${created._id}/application`, { cookie: candidate.cookie });
    expect([other.status, other.json()]).toEqual([200, { applied: false }]);
  });

  it('can be withdrawn, whoever listed the candidate', async () => {
    const recruiter = await createRecruiter();
    const candidate = await createCandidate();
    const created = await createJob(recruiter);
    const other = await createJob(recruiter, sampleJob({ title: 'Other' }));
    expect((await apply(created._id, candidate)).status).toBe(200);
    expect(
      (await call('POST', `/jobs/${other._id}/applicants`, { body: { domain: candidate.domain }, cookie: recruiter.cookie })).status
    ).toBe(200);
    // Withdrawn even once the posting is no longer open
    await call('PUT', `/jobs/${other._id}/status`, { body: { status: 'closed' }, cookie: recruiter.cookie });

    for (const job of [created, other]) {
      const withdrawn = await call('DELETE', `/jobs/${job._id}/application`, { cookie: candidate.cookie });
      expect([withdrawn.status, withdrawn.json()]).toEqual([200, { applied: false }]);
      const again = await call('DELETE', `/jobs/${job._id}/application`, { cookie: candidate.cookie });
      expect([again.status, again.text]).toEqual([404, 'You have not applied to this job posting']);
    }
    expect((await call('GET', `/jobs/${created._id}/application`, { cookie: candidate.cookie })).json()).toEqual({
      applied: false
    });
    expect(await JobApplication.countDocuments({ candidate: candidate.id })).toBe(0);
  });

  it(`stops at ${JOB_LIMITS.applicantsPerJob} applicants (409)`, async () => {
    const recruiter = await createRecruiter();
    const candidate = await createCandidate();
    const created = await createJob(recruiter);
    // Applications of portfolios that do not exist: left out of the list
    await JobApplication.insertMany(
      Array.from({ length: JOB_LIMITS.applicantsPerJob }, () => ({
        job: created._id,
        candidate: new Types.ObjectId(),
        domain: new Types.ObjectId(),
        source: 'applied'
      }))
    );

    const result = await apply(created._id, candidate);
    const added = await call('POST', `/jobs/${created._id}/applicants`, { body: { domain: candidate.domain }, cookie: recruiter.cookie });

    const full = `This job posting has reached its limit of ${JOB_LIMITS.applicantsPerJob} applicants`;
    expect([result.status, result.text]).toEqual([409, full]);
    expect([added.status, added.text]).toEqual([409, full]);
    expect(await JobApplication.countDocuments({ job: created._id })).toBe(JOB_LIMITS.applicantsPerJob);
    expect((await call('GET', `/recruiter/jobs/${created._id}`, { cookie: recruiter.cookie })).json().applicants).toEqual([]);
  });

  it('never goes over the applicant limit, even when applications arrive at once', async () => {
    const recruiter = await createRecruiter();
    const created = await createJob(recruiter);
    await JobApplication.insertMany(
      Array.from({ length: JOB_LIMITS.applicantsPerJob - 1 }, () => ({
        job: created._id,
        candidate: new Types.ObjectId(),
        domain: new Types.ObjectId(),
        source: 'applied'
      }))
    );
    const candidates = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => createCandidate(`candidate-${n}`)));

    const results = await Promise.all(candidates.map((candidate) => apply(created._id, candidate)));

    // One place left: one application at most takes it, the others are refused
    const accepted = results.filter((result) => result.status === 200).length;
    expect(accepted).toBeLessThanOrEqual(1);
    const full = `This job posting has reached its limit of ${JOB_LIMITS.applicantsPerJob} applicants`;
    expect(results.filter((result) => result.status !== 200).map((result) => [result.status, result.text])).toEqual(
      Array.from({ length: candidates.length - accepted }, () => [409, full])
    );
    expect(await JobApplication.countDocuments({ job: created._id })).toBe(JOB_LIMITS.applicantsPerJob - 1 + accepted);
  });
});

describe('applicants managed by the recruiter', () => {
  it('adds a portfolio by its domain name, and removes it', async () => {
    const recruiter = await createRecruiter();
    const candidate = await createCandidate();
    const created = await createJob(recruiter, sampleJob({ status: 'draft' }));

    const added = await call('POST', `/jobs/${created._id}/applicants`, {
      body: { domain: `  ${candidate.domain!.toUpperCase()} ` },
      cookie: recruiter.cookie
    });

    expect(added.status).toBe(200);
    const applicant = added.json();
    expect(applicant).toEqual({
      _id: expect.stringMatching(/^[0-9a-f]{24}$/),
      appliedAt: expect.stringMatching(ISO_INSTANT),
      source: 'added_by_recruiter',
      // The portfolio's public data only: the candidate shared nothing else
      candidate: {},
      domain: { name: candidate.domain, headerTitle: 'candidate portfolio' }
    });
    expect(added.text).not.toContain(candidate.email);
    const detail = await call('GET', `/recruiter/jobs/${created._id}`, { cookie: recruiter.cookie });
    expect(detail.json().applicants).toEqual([applicant]);

    const again = await call('POST', `/jobs/${created._id}/applicants`, { body: { domain: candidate.domain }, cookie: recruiter.cookie });
    expect([again.status, again.text]).toEqual([409, 'Already an applicant']);

    const removed = await call('DELETE', `/jobs/${created._id}/applicants/${applicant._id}`, { cookie: recruiter.cookie });
    expect([removed.status, removed.json()]).toEqual([200, { id: applicant._id }]);
    const removedAgain = await call('DELETE', `/jobs/${created._id}/applicants/${applicant._id}`, { cookie: recruiter.cookie });
    expect([removedAgain.status, removedAgain.text]).toEqual([404, 'Applicant not found']);
    expect(await JobApplication.countDocuments({ job: created._id })).toBe(0);
  });

  it('refuses an unknown domain, the recruiter\'s own portfolio and a candidate who already applied', async () => {
    const recruiter = await createUser('recruiter', { recruiter: true, domain: true });
    const candidate = await createCandidate();
    const created = await createJob(recruiter);
    expect((await apply(created._id, candidate)).status).toBe(200);

    const add = (domain: string) =>
      call('POST', `/jobs/${created._id}/applicants`, { body: { domain }, cookie: recruiter.cookie });
    const unknown = await add(t.id('nobody'));
    const own = await add(recruiter.domain!);
    const listed = await add(candidate.domain!);

    expect([unknown.status, unknown.text]).toEqual([404, 'Domain not found']);
    expect([own.status, own.text]).toEqual([403, 'You cannot add your own portfolio']);
    expect([listed.status, listed.text]).toEqual([409, 'Already an applicant']);
    expect(await JobApplication.countDocuments({ job: created._id })).toBe(1);
  });

  it("never shows the account name of a portfolio it adds, only that of a candidate who applied", async () => {
    const recruiter = await createRecruiter();
    const applicant = await createCandidate('applicant');
    const added = await createCandidate('added');
    const created = await createJob(recruiter);
    expect((await apply(created._id, applicant)).status).toBe(200);

    // Any recruiter space can add any portfolio: the owner's account name
    // (from Google) is not public, only the portfolio is
    const listed = await call('POST', `/jobs/${created._id}/applicants`, { body: { domain: added.domain }, cookie: recruiter.cookie });

    expect(listed.status).toBe(200);
    const { source, candidate, domain } = listed.json();
    expect([source, candidate, domain.name]).toEqual(['added_by_recruiter', {}, added.domain]);
    const detail = await call('GET', `/recruiter/jobs/${created._id}`, { cookie: recruiter.cookie });
    const applicants = detail.json<{ applicants: { source: string; candidate: object; domain: { name: string } }[] }>().applicants;
    expect(applicants.map((listed): unknown[] => [listed.source, listed.candidate, listed.domain.name])).toEqual([
      ['applied', { name: 'applicant-first', surname: 'applicant-last' }, applicant.domain],
      ['added_by_recruiter', {}, added.domain]
    ]);
    for (const text of [listed.text, detail.text]) {
      expect(text).not.toContain('added-first');
      expect(text).not.toContain('added-last');
    }
  });

  it('removes only an applicant of that posting', async () => {
    const recruiter = await createRecruiter();
    const candidate = await createCandidate();
    const first = await createJob(recruiter);
    const second = await createJob(recruiter, sampleJob({ title: 'Second' }));
    const added = await call('POST', `/jobs/${first._id}/applicants`, { body: { domain: candidate.domain }, cookie: recruiter.cookie });
    const applicationId = added.json()._id;

    const result = await call('DELETE', `/jobs/${second._id}/applicants/${applicationId}`, { cookie: recruiter.cookie });

    expect([result.status, result.text]).toEqual([404, 'Applicant not found']);
    expect(await JobApplication.exists({ _id: applicationId })).not.toBeNull();
  });
});
