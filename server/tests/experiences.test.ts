import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { Company, Domain, Experience, Skill } from '../models/database';
import { Types } from 'mongoose';
import { createApp } from '../app';
import {
  makeDomain,
  makeExperience,
  experienceRequestBody,
  postJson,
  postWithCookie,
  putWithCookie,
  authCookie,
  TEST_EXPERIENCE_ID,
  readJson
} from './helpers';

let app: ReturnType<typeof createApp>;
const skillIds = new Map<string, Types.ObjectId>();

beforeEach(() => {
  app = createApp();
  skillIds.clear();
  // Skills and companies are shared documents found or created by name
  spyOn(Skill, 'findOrCreate').mockImplementation(async (name: string) => {
    if (!skillIds.has(name)) skillIds.set(name, new Types.ObjectId());
    return skillIds.get(name)!;
  });
});

afterEach(() => {
  mock.restore();
});

/** Spies Experience/Domain persistence and returns the saved experience */
const stubPersistence = (domain = makeDomain()) => {
  const domainSave = spyOn(domain, 'save').mockResolvedValue(domain as never);
  spyOn(Domain, 'findOne').mockResolvedValue(domain as never);
  const saved: InstanceType<typeof Experience>[] = [];
  const experienceSave = spyOn(Experience.prototype, 'save').mockImplementation(async function (
    this: InstanceType<typeof Experience>
  ) {
    // Run the real schema validation, as save() would
    await this.validate();
    saved.push(this);
    return this;
  } as never);
  spyOn(Experience.prototype, 'populate').mockImplementation(async function (
    this: InstanceType<typeof Experience>
  ) {
    return this;
  } as never);
  return { domain, domainSave, experienceSave, saved };
};

describe('Experience.fromRequest', () => {
  it('builds a valid document from the admin form defaults (company { name: "" })', async () => {
    spyOn(Company, 'findOrCreate').mockResolvedValue(undefined);

    const experience = await Experience.fromRequest(experienceRequestBody as never);

    // The company field is an ObjectId ref: assigning the request object to it failed
    await expect(experience.validate()).resolves.toBeUndefined();
    expect(experience.company).toBeUndefined();
    expect(experience.projects[0].hardSkills[0].skill).toEqual(skillIds.get('TypeScript')!);
  });

  it('stores the id of the found or created company', async () => {
    const companyId = new Types.ObjectId();
    const findOrCreate = spyOn(Company, 'findOrCreate').mockResolvedValue(companyId);

    const experience = await Experience.fromRequest({
      ...experienceRequestBody,
      company: { name: 'Acme' }
    } as never);

    expect(findOrCreate).toHaveBeenCalledWith({ name: 'Acme' });
    await expect(experience.validate()).resolves.toBeUndefined();
    expect(experience.company).toEqual(companyId);
  });

  it('looks each distinct skill name up once', async () => {
    spyOn(Company, 'findOrCreate').mockResolvedValue(undefined);

    await Experience.fromRequest({
      ...experienceRequestBody,
      projects: [{
        ...experienceRequestBody.projects[0],
        hardSkills: [{ name: 'Go', level: -1 }, { name: 'Go', level: -1 }]
      }]
    } as never);

    const calls = (Skill.findOrCreate as unknown as { mock: { calls: [string][] } }).mock.calls;
    expect(calls.map(([name]) => name)).toEqual(['Go', 'Communication']);
  });
});

describe('POST /experiences', () => {
  it('should reject requests without auth', async () => {
    const result = await postJson(app, '/experiences', experienceRequestBody);

    expect(result.status).toBe(401);
  });

  it('creates an experience from the admin form body', async () => {
    spyOn(Company, 'findOrCreate').mockResolvedValue(undefined);
    const { domain, domainSave, experienceSave, saved } = stubPersistence();

    const result = await postWithCookie(app, '/experiences', experienceRequestBody, await authCookie());

    expect(result.status).toBe(200);
    expect(experienceSave).toHaveBeenCalledTimes(1);
    expect(domainSave).toHaveBeenCalledTimes(1);
    expect(domain.experiences.map(String)).toEqual([String(saved[0]._id)]);
    const response = await readJson(result);
    expect(response.title).toBe(experienceRequestBody.title);
    expect(response.company).toBeUndefined();
  });

  it('links the experience to a company found or created by name', async () => {
    const companyId = new Types.ObjectId();
    spyOn(Company, 'findOrCreate').mockResolvedValue(companyId);
    const { saved } = stubPersistence();

    const result = await postWithCookie(
      app,
      '/experiences',
      { ...experienceRequestBody, company: { name: 'Acme' } },
      await authCookie()
    );

    expect(result.status).toBe(200);
    expect(saved[0].company).toEqual(companyId);
  });

  it('returns 404 when the user has no domain', async () => {
    spyOn(Domain, 'findOne').mockResolvedValue(null as never);

    const result = await postWithCookie(app, '/experiences', experienceRequestBody, await authCookie());

    expect(result.status).toBe(404);
    expect(await result.text()).toBe('You do not own a domain');
  });

  it('returns 422 for invalid body (missing required fields)', async () => {
    const result = await postWithCookie(app, '/experiences', { title: 'Missing fields' }, await authCookie());

    expect(result.status).toBe(422);
    const response = await readJson(result);
    expect(response.type).toBe('validation');
    // The submitted value and schema samples are not echoed back
    expect(response.found).toBeUndefined();
    expect(response.expected).toBeUndefined();
  });

  it('returns 422 when the schema rejects the document (empty title)', async () => {
    spyOn(Company, 'findOrCreate').mockResolvedValue(undefined);
    stubPersistence();

    const result = await postWithCookie(
      app,
      '/experiences',
      { ...experienceRequestBody, title: '' },
      await authCookie()
    );

    expect(result.status).toBe(422);
  });

  it('rejects oversized fields with 422', async () => {
    const result = await postWithCookie(
      app,
      '/experiences',
      { ...experienceRequestBody, icon: 'data:image/png;base64,' + 'A'.repeat(100_000) },
      await authCookie()
    );

    expect(result.status).toBe(422);
  });
});

describe('PUT /experiences/:id', () => {
  it('should reject requests without auth', async () => {
    const result = await putWithCookie(app, `/experiences/${TEST_EXPERIENCE_ID}`, experienceRequestBody, '');

    expect(result.status).toBe(401);
  });

  it('should update an experience owned by the user', async () => {
    const companyId = new Types.ObjectId();
    spyOn(Company, 'findOrCreate').mockResolvedValue(companyId);
    stubPersistence(makeDomain({ experiences: [new Types.ObjectId(TEST_EXPERIENCE_ID)] }));
    const experience = makeExperience();
    spyOn(Experience, 'findById').mockResolvedValue(experience as never);

    // The edit modal sends back the populated company it received
    const updatedBody = {
      ...experienceRequestBody,
      title: 'Updated Title',
      company: { _id: companyId.toString(), name: 'Acme', __v: 0 },
    };

    const result = await putWithCookie(app, `/experiences/${TEST_EXPERIENCE_ID}`, updatedBody, await authCookie());

    expect(result.status).toBe(200);
    expect(experience.title).toBe('Updated Title');
    expect(experience.company).toEqual(companyId);
    expect(experience.projects[0].hardSkills[0].skill).toEqual(skillIds.get('TypeScript')!);
  });

  it('returns 404 when the user has no domain', async () => {
    spyOn(Domain, 'findOne').mockResolvedValue(null as never);

    const result = await putWithCookie(app, `/experiences/${TEST_EXPERIENCE_ID}`, experienceRequestBody, await authCookie());

    expect(result.status).toBe(404);
  });

  it('returns 404 when the experience is not in the user\'s domain', async () => {
    spyOn(Domain, 'findOne').mockResolvedValue(
      makeDomain({ experiences: [new Types.ObjectId()] }) as never
    );
    const findById = spyOn(Experience, 'findById');

    const result = await putWithCookie(app, `/experiences/${TEST_EXPERIENCE_ID}`, experienceRequestBody, await authCookie());

    expect(result.status).toBe(404);
    expect(findById).not.toHaveBeenCalled();
  });

  it('returns 404 when the experience is not found in DB', async () => {
    spyOn(Domain, 'findOne').mockResolvedValue(
      makeDomain({ experiences: [new Types.ObjectId(TEST_EXPERIENCE_ID)] }) as never
    );
    spyOn(Experience, 'findById').mockResolvedValue(null as never);

    const result = await putWithCookie(app, `/experiences/${TEST_EXPERIENCE_ID}`, experienceRequestBody, await authCookie());

    expect(result.status).toBe(404);
  });

  it('returns 422 for an id that is not an ObjectId', async () => {
    const result = await putWithCookie(app, '/experiences/not-an-id', experienceRequestBody, await authCookie());

    expect(result.status).toBe(422);
  });

  it('returns 422 for invalid body', async () => {
    const result = await putWithCookie(app, `/experiences/${TEST_EXPERIENCE_ID}`, { title: 'Missing fields' }, await authCookie());

    expect(result.status).toBe(422);
  });
});
