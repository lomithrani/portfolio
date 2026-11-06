import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { Domain, Experience, Skill } from '../models/database';
import mongoose, { Types } from 'mongoose';
import { logger } from '../services/logger';
import { createApp } from '../app';
import {
  makeDomain,
  makeExperience,
  experienceRequestBody,
  postJson,
  postWithCookie,
  putWithCookie,
  deleteWithCookie,
  authCookie,
  TEST_EXPERIENCE_ID,
  readJson
} from './helpers';

let app: ReturnType<typeof createApp>;
const skillIds = new Map<string, Types.ObjectId>();

beforeEach(() => {
  app = createApp();
  skillIds.clear();
  // Skills are shared documents found or created by name
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
  spyOn(Domain, 'findOne').mockResolvedValue(domain as never);
  // POST appends with $push; DELETE removes with $pull (filtered on the id)
  const domainUpdate = spyOn(Domain, 'updateOne').mockImplementation((async (
    filter: { experiences?: string },
    update: { $push?: { experiences: Types.ObjectId }; $pull?: { experiences: string } }
  ) => {
    if (update.$push) {
      domain.experiences.push(update.$push.experiences);
      return { matchedCount: 1, modifiedCount: 1 };
    }
    const listed = domain.experiences.some((id) => String(id) === filter.experiences);
    return { matchedCount: Number(listed), modifiedCount: Number(listed) };
  }) as never);
  const experienceDelete = spyOn(Experience, 'deleteOne').mockResolvedValue({ deletedCount: 1 } as never);
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
  return { domain, domainUpdate, experienceDelete, experienceSave, saved };
};

describe('Experience.fromRequest', () => {
  it('builds a valid document from the admin form defaults (company { name: "" })', async () => {
    const experience = await Experience.fromRequest(experienceRequestBody as never);

    // A blank company name means "no company"
    await expect(experience.validate()).resolves.toBeUndefined();
    expect(experience.company).toBeUndefined();
    expect(experience.projects[0].hardSkills[0].skill).toEqual(skillIds.get('TypeScript')!);
  });

  it('embeds the company given in the request', async () => {
    const experience = await Experience.fromRequest({
      ...experienceRequestBody,
      company: { name: ' Acme ', summary: 'Makes things', svg: '<svg/>' }
    } as never);

    await expect(experience.validate()).resolves.toBeUndefined();
    expect(experience.toObject().company).toEqual({
      name: 'Acme',
      summary: 'Makes things',
      svg: '<svg/>'
    });
  });

  it('stores location (trimmed) and the period at month precision', async () => {
    const experience = await Experience.fromRequest({
      ...experienceRequestBody,
      location: '  Paris, France ',
      start: new Date('2024-03-15T12:00:00Z'),
      projects: [{
        ...experienceRequestBody.projects[0],
        start: new Date('2024-04-20T00:00:00Z'),
        end: new Date('2024-06-30T23:00:00Z')
      }]
    } as never);

    await expect(experience.validate()).resolves.toBeUndefined();
    expect(experience.location).toBe('Paris, France');
    expect(experience.start?.toISOString()).toBe('2024-03-01T00:00:00.000Z');
    // No end: ongoing
    expect(experience.end).toBeUndefined();
    expect(experience.projects[0].start?.toISOString()).toBe('2024-04-01T00:00:00.000Z');
    expect(experience.projects[0].end?.toISOString()).toBe('2024-06-01T00:00:00.000Z');
  });

  it('leaves a blank location unset', async () => {
    const experience = await Experience.fromRequest({ ...experienceRequestBody, location: '   ' } as never);

    expect(experience.location).toBeUndefined();
    expect(experience.toObject()).not.toHaveProperty('location');
  });

  it('accepts an end in the same month as the start', async () => {
    const experience = await Experience.fromRequest({
      ...experienceRequestBody,
      start: new Date('2024-03-20T00:00:00Z'),
      end: new Date('2024-03-05T00:00:00Z')
    } as never);

    expect(experience.end?.toISOString()).toBe('2024-03-01T00:00:00.000Z');
  });

  it('looks each distinct skill name up once, ignoring case and spaces', async () => {
    const experience = await Experience.fromRequest({
      ...experienceRequestBody,
      projects: [
        {
          ...experienceRequestBody.projects[0],
          hardSkills: [{ name: 'TypeScript', level: -1 }, { name: ' typescript ', level: 50 }],
          softSkills: [{ name: 'Communication', level: -1 }]
        },
        {
          ...experienceRequestBody.projects[0],
          hardSkills: [{ name: 'TYPESCRIPT', level: -1 }, { name: 'Go', level: -1 }],
          softSkills: []
        }
      ]
    } as never);

    const calls = (Skill.findOrCreate as unknown as { mock: { calls: [string][] } }).mock.calls;
    expect(calls.map(([name]) => name)).toEqual(['TypeScript', 'Communication', 'Go']);
    // A project lists a skill once (its first level)
    expect(experience.projects[0].hardSkills.map(({ skill, level }) => [skill, level])).toEqual([
      [skillIds.get('TypeScript')!, -1]
    ]);
    expect(experience.projects[1].hardSkills.map(({ skill }) => skill)).toEqual([
      skillIds.get('TypeScript')!,
      skillIds.get('Go')!
    ]);
  });

  it('looks each distinct skill name up once', async () => {
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
    const { domain, domainUpdate, experienceSave, saved } = stubPersistence();

    const result = await postWithCookie(app, '/experiences', experienceRequestBody, await authCookie());

    expect(result.status).toBe(200);
    expect(experienceSave).toHaveBeenCalledTimes(1);
    // Appended with an atomic $push, not by saving the whole domain
    expect(domainUpdate).toHaveBeenCalledTimes(1);
    expect(domain.experiences.map(String)).toEqual([String(saved[0]._id)]);
    const response = await readJson(result);
    expect(response.title).toBe(experienceRequestBody.title);
    expect(response.company).toBeUndefined();
  });

  it('stores the company in the experience itself', async () => {
    const { saved } = stubPersistence();

    const result = await postWithCookie(
      app,
      '/experiences',
      { ...experienceRequestBody, company: { name: 'Acme', summary: 'Makes things' } },
      await authCookie()
    );

    expect(result.status).toBe(200);
    expect(saved[0].toObject().company).toEqual({ name: 'Acme', summary: 'Makes things' });
    expect((await readJson(result)).company).toEqual({ name: 'Acme', summary: 'Makes things' });
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

  it.each([
    ['an empty title', { title: '' }, 'title'],
    ['a whitespace-only title', { title: '   ' }, 'title'],
    ['an empty project name', { projects: [{ ...experienceRequestBody.projects[0], name: '' }] }, 'projects.0.name'],
    [
      'a whitespace-only project name',
      { projects: [experienceRequestBody.projects[0], { ...experienceRequestBody.projects[0], name: ' \t' }] },
      'projects.1.name'
    ],
    ['a location over the limit', { location: 'x'.repeat(201) }, 'location'],
    ['an invalid start date', { start: 'not-a-date' }, 'start'],
    ['an end month before the start month', { start: '2024-03-01', end: '2024-02-29' }, 'end'],
    [
      'a project ending before it starts',
      {
        projects: [
          experienceRequestBody.projects[0],
          { ...experienceRequestBody.projects[0], start: '2023-01-01', end: '2022-06-01' }
        ]
      },
      'projects.1.end'
    ],
  ])('answers 422 naming the field for %s, before writing anything', async (_label, fields, property) => {
    const { experienceSave, domainUpdate } = stubPersistence();

    const result = await postWithCookie(app, '/experiences', { ...experienceRequestBody, ...fields }, await authCookie());

    expect(result.status).toBe(422);
    const body = await readJson(result);
    expect(body).toMatchObject({ type: 'validation', on: 'body', property });
    expect(body.message).toBeString();
    expect(Skill.findOrCreate).not.toHaveBeenCalled();
    expect(experienceSave).not.toHaveBeenCalled();
    expect(domainUpdate).not.toHaveBeenCalled();
  });

  it('removes the new experience when its domain does not take it', async () => {
    const { experienceDelete, saved } = stubPersistence();
    spyOn(Domain, 'updateOne').mockRejectedValue(new Error('connection lost') as never);

    const result = await postWithCookie(app, '/experiences', experienceRequestBody, await authCookie());

    expect(result.status).toBe(500);
    expect(experienceDelete).toHaveBeenCalledWith({ _id: saved[0]._id });
  });

  it('removes the new experience when its domain was deleted meanwhile', async () => {
    const { experienceDelete, saved } = stubPersistence();
    spyOn(Domain, 'updateOne').mockResolvedValue({ matchedCount: 0, modifiedCount: 0 } as never);

    const result = await postWithCookie(app, '/experiences', experienceRequestBody, await authCookie());

    expect(result.status).toBe(404);
    expect(experienceDelete).toHaveBeenCalledWith({ _id: saved[0]._id });
  });
});

describe('PUT /experiences/:id', () => {
  it('should reject requests without auth', async () => {
    const result = await putWithCookie(app, `/experiences/${TEST_EXPERIENCE_ID}`, experienceRequestBody, '');

    expect(result.status).toBe(401);
  });

  it('should update an experience owned by the user', async () => {
    stubPersistence(makeDomain({ experiences: [new Types.ObjectId(TEST_EXPERIENCE_ID)] }));
    const experience = makeExperience({ company: { name: 'Acme', summary: 'Old summary' } });
    spyOn(Experience, 'findById').mockResolvedValue(experience as never);

    // The edit modal sends back the company it received, edited
    const updatedBody = {
      ...experienceRequestBody,
      title: 'Updated Title',
      company: { name: 'Acme', summary: 'New summary', _id: 'ignored', __v: 0 },
    };

    const result = await putWithCookie(app, `/experiences/${TEST_EXPERIENCE_ID}`, updatedBody, await authCookie());

    expect(result.status).toBe(200);
    expect(experience.title).toBe('Updated Title');
    expect(experience.toObject().company).toEqual({ name: 'Acme', summary: 'New summary' });
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

  it('returns 404, not a 500, when a concurrent DELETE removed the experience before it was saved', async () => {
    stubPersistence(makeDomain({ experiences: [new Types.ObjectId(TEST_EXPERIENCE_ID)] }));
    const experience = makeExperience();
    spyOn(Experience, 'findById').mockResolvedValue(experience as never);
    // What save() throws once the document is gone (another tab deleted it)
    spyOn(Experience.prototype, 'save').mockRejectedValue(
      new mongoose.Error.DocumentNotFoundError(`No document found for query "{ _id: '${TEST_EXPERIENCE_ID}' }"`) as never
    );
    const errorLog = spyOn(logger, 'error');

    const result = await putWithCookie(app, `/experiences/${TEST_EXPERIENCE_ID}`, experienceRequestBody, await authCookie());

    expect(result.status).toBe(404);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('returns 422 for an id that is not an ObjectId', async () => {
    const result = await putWithCookie(app, '/experiences/not-an-id', experienceRequestBody, await authCookie());

    expect(result.status).toBe(422);
  });

  it('returns 422 for invalid body', async () => {
    const result = await putWithCookie(app, `/experiences/${TEST_EXPERIENCE_ID}`, { title: 'Missing fields' }, await authCookie());

    expect(result.status).toBe(422);
  });

  it('sets location and period, and unsets what the request leaves out', async () => {
    stubPersistence(makeDomain({ experiences: [new Types.ObjectId(TEST_EXPERIENCE_ID)] }));
    const experience = makeExperience({
      location: 'Lyon',
      start: new Date('2020-01-01T00:00:00Z'),
      end: new Date('2021-01-01T00:00:00Z')
    });
    spyOn(Experience, 'findById').mockResolvedValue(experience as never);

    const result = await putWithCookie(
      app,
      `/experiences/${TEST_EXPERIENCE_ID}`,
      { ...experienceRequestBody, location: ' Paris ', start: '2022-09-01T00:00:00.000Z' },
      await authCookie()
    );

    expect(result.status).toBe(200);
    expect(experience.location).toBe('Paris');
    expect(experience.start?.toISOString()).toBe('2022-09-01T00:00:00.000Z');
    // Now ongoing
    expect(experience.end).toBeUndefined();
    const response = await readJson(result);
    expect(response).toMatchObject({ location: 'Paris', start: '2022-09-01T00:00:00.000Z' });
    expect(response.end).toBeUndefined();
  });

  it('answers 422 for a project ending before it starts, leaving the experience unchanged', async () => {
    const { experienceSave } = stubPersistence(makeDomain({ experiences: [new Types.ObjectId(TEST_EXPERIENCE_ID)] }));
    const experience = makeExperience();
    spyOn(Experience, 'findById').mockResolvedValue(experience as never);

    const result = await putWithCookie(
      app,
      `/experiences/${TEST_EXPERIENCE_ID}`,
      {
        ...experienceRequestBody,
        title: 'Changed',
        projects: [{ ...experienceRequestBody.projects[0], start: '2024-05-01', end: '2024-04-01' }]
      },
      await authCookie()
    );

    expect(result.status).toBe(422);
    expect(await readJson(result)).toMatchObject({ property: 'projects.0.end' });
    expect(experience.title).toBe('Software Engineer');
    expect(experienceSave).not.toHaveBeenCalled();
  });
});

describe('DELETE /experiences/:id', () => {
  const path = `/experiences/${TEST_EXPERIENCE_ID}`;

  it('rejects requests without auth', async () => {
    const result = await deleteWithCookie(app, path, '');

    expect(result.status).toBe(401);
  });

  it('unlists the experience from the domain, then deletes it', async () => {
    const otherId = new Types.ObjectId();
    const { domain, domainUpdate, experienceDelete } = stubPersistence(
      makeDomain({ experiences: [otherId, new Types.ObjectId(TEST_EXPERIENCE_ID)] })
    );

    const result = await deleteWithCookie(app, path, await authCookie());

    expect(result.status).toBe(200);
    expect(await readJson(result)).toEqual({ id: TEST_EXPERIENCE_ID });
    expect(domainUpdate).toHaveBeenCalledWith(
      { _id: domain._id, experiences: TEST_EXPERIENCE_ID },
      { $pull: { experiences: TEST_EXPERIENCE_ID } }
    );
    expect(experienceDelete).toHaveBeenCalledWith({ _id: TEST_EXPERIENCE_ID });
    // The domain was unlisted first
    expect(domainUpdate.mock.invocationCallOrder[0]).toBeLessThan(experienceDelete.mock.invocationCallOrder[0]);
  });

  it('returns 404 when the user has no domain', async () => {
    spyOn(Domain, 'findOne').mockResolvedValue(null as never);
    const experienceDelete = spyOn(Experience, 'deleteOne');

    const result = await deleteWithCookie(app, path, await authCookie());

    expect(result.status).toBe(404);
    expect(await result.text()).toBe('You do not own a domain');
    expect(experienceDelete).not.toHaveBeenCalled();
  });

  it('returns 404 when the experience is not in the user\'s domain', async () => {
    const { domainUpdate, experienceDelete } = stubPersistence(makeDomain({ experiences: [new Types.ObjectId()] }));

    const result = await deleteWithCookie(app, path, await authCookie());

    expect(result.status).toBe(404);
    expect(await result.text()).toBe('Experience not found in your domain');
    expect(domainUpdate).not.toHaveBeenCalled();
    expect(experienceDelete).not.toHaveBeenCalled();
  });

  it('returns 404 and deletes nothing when a concurrent request removed it first', async () => {
    const { experienceDelete } = stubPersistence(makeDomain({ experiences: [new Types.ObjectId(TEST_EXPERIENCE_ID)] }));
    spyOn(Domain, 'updateOne').mockResolvedValue({ matchedCount: 0, modifiedCount: 0 } as never);

    const result = await deleteWithCookie(app, path, await authCookie());

    expect(result.status).toBe(404);
    expect(experienceDelete).not.toHaveBeenCalled();
  });

  it('returns 422 for an id that is not an ObjectId', async () => {
    const result = await deleteWithCookie(app, '/experiences/not-an-id', await authCookie());

    expect(result.status).toBe(422);
    expect(await readJson(result)).toMatchObject({ type: 'validation', on: 'params', property: 'id' });
  });
});
