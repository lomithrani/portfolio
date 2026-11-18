// Job postings of the recruiter space against a real MongoDB (MONGO_URL,
// which must be local or come from TEST_MONGO_URL), and the routes of the
// job board and its applications, which are gone. Each test creates its own
// users (recruiters, candidates), recruiter spaces, domains and postings, all
// named with a suffix unique to that test, and removes them after: tests pass
// in any order (--randomize).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import mongoose, { Types } from 'mongoose';
import { JOB_LIMITS, normalizeJobPosting } from 'portfolio-common';
import type { JobPostingInput } from 'portfolio-common';
import { env } from '../env';
import { createApp } from '../app';
import { Domain, JobPosting, User } from '../models/database';
import { CONSENT, authCookie, openRecruiterSpace } from './helpers';
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
  if (recruiter) expect(await openRecruiterSpace(id)).toBe(true);
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

/** Removes what a test created: its users, their domains and postings */
const removeTestData = async (suffix: string) => {
  const named = new RegExp(`-${suffix}(@|$)`);
  const users = (await User.find({ email: named }, '_id').lean()).map((user) => user._id);
  await JobPosting.deleteMany({ recruiter: { $in: users } });
  await Domain.deleteMany({ $or: [{ admin: { $in: users } }, { name: named }] });
  await User.deleteMany({ _id: { $in: users } });
};

let connected = false;

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  await Promise.all([User.init(), Domain.init(), JobPosting.init()]);
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
    ['DELETE', job]
  ];

  it.each(sessionRoutes)('%s %s requires a session (401)', async (method, path, body) => {
    const result = await call(method, path, { body });
    expect(result.status).toBe(401);
  });

  it('serves no job board, no public posting and no applications (404), signed in or not', async () => {
    const recruiter = await createRecruiter();
    const created = await createJob(recruiter);
    const candidate = await createCandidate();
    const id = created._id;

    const gone: [string, string, unknown?][] = [
      ['GET', '/jobs'],
      ['GET', `/jobs/${id}`],
      ['GET', `/jobs/${id}/application`],
      ['POST', `/jobs/${id}/application`, {}],
      ['DELETE', `/jobs/${id}/application`],
      ['POST', `/jobs/${id}/applicants`, { domain: candidate.domain }],
      ['DELETE', `/jobs/${id}/applicants/${UNKNOWN_ID}`]
    ];
    for (const cookie of [undefined, candidate.cookie, recruiter.cookie]) {
      for (const [method, path, body] of gone) {
        const result = await call(method, path, { body, cookie });
        expect([method, path, result.status]).toEqual([method, path, 404]);
        // Never the posting
        expect(result.text).not.toContain('Senior Backend Engineer');
      }
    }
    // The recruiter's own read has no applicants
    const detail = await call('GET', `/recruiter/jobs/${id}`, { cookie: recruiter.cookie });
    expect(detail.status).toBe(200);
    expect(detail.json()).not.toHaveProperty('applicants');
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
      ['DELETE', `/jobs/${id}`]
    ];
    for (const [method, path, body] of attempts) {
      const result = await call(method, path, { body, cookie: visitor.cookie });
      expect([method, path, result.status, result.text]).toEqual([method, path, 403, 'Create your recruiter space first']);
    }

    expect(await JobPosting.countDocuments({ recruiter: visitor.id })).toBe(0);
    const stored = await JobPosting.findById(id).lean();
    expect(stored?.title).toBe('Senior Backend Engineer');
    expect(stored?.status).toBe('open');
  });

  it('refuses the recruiter routes to a recruiter without the terms in force (422 on consent), until accepted again', async () => {
    const recruiter = await createRecruiter();
    const created = await createJob(recruiter);
    const id = created._id;
    // Accepted before the terms in force changed
    const older = { version: '2025-01-01', acceptedAt: new Date('2025-01-02'), ageConfirmationKey: 'age-v0', source: 'recruiter' };
    await User.updateOne({ _id: recruiter.id }, { $set: { legalAcceptances: [older] } });

    const attempts: [string, string, unknown?][] = [
      ['GET', '/recruiter/jobs'],
      ['GET', `/recruiter/jobs/${id}`],
      ['POST', '/jobs', sampleJob({ title: 'Another one' })],
      ['PUT', `/jobs/${id}`, sampleJob({ title: 'Changed' })],
      ['PUT', `/jobs/${id}/status`, { status: 'closed' }],
      ['DELETE', `/jobs/${id}`],
      ['GET', '/jobs/import']
    ];
    for (const [method, path, body] of attempts) {
      const result = await call(method, path, { body, cookie: recruiter.cookie });
      expect([method, path, result.status, result.json()]).toEqual([
        method,
        path,
        422,
        {
          type: 'validation',
          on: 'body',
          property: 'consent',
          message: 'Accept the terms of use in force to use your recruiter space.'
        }
      ]);
    }
    expect(await JobPosting.countDocuments({ recruiter: recruiter.id })).toBe(1);
    const stored = await JobPosting.findById(id).lean();
    expect(stored?.title).toBe('Senior Backend Engineer');
    expect(stored?.status).toBe('open');

    // A space opened before recruiters accepted the terms has none at all: the same
    await User.updateOne({ _id: recruiter.id }, { $unset: { legalAcceptances: 1 } });
    expect((await call('GET', '/recruiter/jobs', { cookie: recruiter.cookie })).json()).toMatchObject({ property: 'consent' });

    // Accepted again from the recruiter space: back in
    const accepted = await call('PUT', '/me/consent', { body: { ...CONSENT, source: 'recruiter' }, cookie: recruiter.cookie });
    expect(accepted.status).toBe(200);
    const list = await call('GET', '/recruiter/jobs', { cookie: recruiter.cookie });
    expect(list.status).toBe(200);
    expect(list.json().jobs.map((job: { _id: string }) => job._id)).toEqual([id]);
    const [acceptance] = (await User.findById(recruiter.id).lean())?.legalAcceptances ?? [];
    expect(acceptance).toMatchObject({ version: CONSENT.termsVersion, source: 'recruiter' });
  });

  it('asks an account without a recruiter space to create one first (403), whatever its terms', async () => {
    // Neither a space nor the terms: the space is what is missing first
    const user = await createUser('nothing');
    const result = await call('GET', '/recruiter/jobs', { cookie: user.cookie });
    expect([result.status, result.text]).toEqual([403, 'Create your recruiter space first']);
  });

  it('rejects ids that are not ObjectIds (422)', async () => {
    const recruiter = await createRecruiter();
    expect((await call('GET', '/recruiter/jobs/not-an-id', { cookie: recruiter.cookie })).status).toBe(422);
    expect((await call('PUT', '/jobs/not-an-id/status', { body: { status: 'open' }, cookie: recruiter.cookie })).status).toBe(422);
    expect((await call('DELETE', '/jobs/not-an-id', { cookie: recruiter.cookie })).status).toBe(422);
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
    expect(detail.json()).toEqual(created);
    const list = await call('GET', '/recruiter/jobs', { cookie: recruiter.cookie });
    expect(list.json()).toEqual({ jobs: [created] });
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

  it('deletes a posting', async () => {
    const recruiter = await createRecruiter();
    const created = await createJob(recruiter);
    const kept = await createJob(recruiter, sampleJob({ title: 'Kept' }));

    const result = await call('DELETE', `/jobs/${created._id}`, { cookie: recruiter.cookie });

    expect(result.status).toBe(200);
    expect(result.json()).toEqual({ id: created._id });
    expect(await JobPosting.exists({ _id: created._id })).toBeNull();
    // The recruiter's other posting stays
    expect(await JobPosting.exists({ _id: kept._id })).not.toBeNull();
    expect((await call('GET', `/recruiter/jobs/${created._id}`, { cookie: recruiter.cookie })).status).toBe(404);
    expect((await call('DELETE', `/jobs/${created._id}`, { cookie: recruiter.cookie })).status).toBe(404);
  });

  it("lists the recruiter's own postings, most recently updated first", async () => {
    const recruiter = await createRecruiter();
    const other = await createRecruiter('other-recruiter');
    const first = await createJob(recruiter, sampleJob({ title: 'First', status: 'draft' }));
    const second = await createJob(recruiter, sampleJob({ title: 'Second' }));
    const third = await createJob(recruiter, sampleJob({ title: 'Third', status: 'on_hold' }));
    await createJob(other, sampleJob({ title: 'Not mine' }));
    // Edited last: now the most recently updated
    await Bun.sleep(5);
    expect((await call('PUT', `/jobs/${first._id}/status`, { body: { status: 'open' }, cookie: recruiter.cookie })).status).toBe(200);

    const result = await call('GET', '/recruiter/jobs', { cookie: recruiter.cookie });

    expect(result.status).toBe(200);
    const { jobs } = result.json<{ jobs: { _id: string; title: string }[] }>();
    expect(jobs.map(({ _id, title }) => [_id, title])).toEqual([
      [first._id, 'First'],
      [third._id, 'Third'],
      [second._id, 'Second']
    ]);
    expect(jobs[1]).toEqual(third);

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
    const created = await createJob(owner);
    const id = created._id;

    const attempts: [string, string, unknown?][] = [
      ['GET', `/recruiter/jobs/${id}`],
      ['PUT', `/jobs/${id}`, sampleJob({ title: 'Taken over' })],
      ['PUT', `/jobs/${id}/status`, { status: 'closed' }],
      ['DELETE', `/jobs/${id}`]
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
    expect((await call('GET', '/recruiter/jobs', { cookie: intruder.cookie })).json()).toEqual({ jobs: [] });
  });
});
