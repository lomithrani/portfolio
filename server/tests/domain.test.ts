import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { Domain } from '../models/database';
import { Types } from 'mongoose';
import { createApp } from '../app';
import {
  makeRequest,
  makeDomain,
  putWithCookie,
  postWithCookie,
  putJson,
  authCookie,
  TEST_DOMAIN_NAME,
  TEST_USER_ID,
  readJson
} from './helpers';

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp();
});

afterEach(() => {
  mock.restore();
});

describe('GET /domain/:name', () => {
  it('should return a populated domain for an existing name', async () => {
    const domain = makeDomain();
    const populate = spyOn(domain, 'populate').mockResolvedValue(domain as never);
    spyOn(domain, 'toObject').mockReturnValue({
      name: TEST_DOMAIN_NAME,
      admin: TEST_USER_ID,
      experiences: [
        {
          _id: 'exp1',
          title: 'Engineer',
          company: { name: 'Acme' },
          projects: [
            {
              name: 'Project A',
              hardSkills: [{ skill: { displayName: 'TypeScript' }, level: 5 }],
              softSkills: [{ skill: { displayName: 'Communication' }, level: 4 }],
            },
          ],
        },
      ],
    } as never);
    spyOn(Domain, 'findOne').mockResolvedValue(domain as never);

    const result = await makeRequest(app, `/domain/${TEST_DOMAIN_NAME}`);

    expect(result.status).toBe(200);
    // Skills of every experience are populated (companies are embedded)
    const populateOptions = populate.mock.calls[0][0] as unknown as {
      path: string;
      populate: { path: string }[];
    };
    expect(populateOptions.path).toBe('experiences');
    expect(populateOptions.populate.map((p) => p.path)).toEqual([
      'projects.hardSkills.skill',
      'projects.softSkills.skill'
    ]);

    const response = await readJson(result);
    expect(response.name).toBe(TEST_DOMAIN_NAME);
    // The client compares domain.admin with the logged-in user id
    expect(response.admin).toBe(TEST_USER_ID);
    expect(response.experiences).toHaveLength(1);
    expect(response.experiences[0].company.name).toBe('Acme');
    expect(response.experiences[0].projects[0].hardSkills[0].skill.displayName).toBe('TypeScript');
  });

  it('looks names up case-insensitively (names are stored lowercase)', async () => {
    const domain = makeDomain();
    spyOn(domain, 'populate').mockResolvedValue(domain as never);
    const findOne = spyOn(Domain, 'findOne').mockResolvedValue(domain as never);

    const result = await makeRequest(app, '/domain/Test.Domain');

    expect(result.status).toBe(200);
    expect(findOne).toHaveBeenCalledWith({ name: 'test.domain' });
  });

  it('should return 404 for non-existent domain', async () => {
    spyOn(Domain, 'findOne').mockResolvedValue(null as never);

    const result = await makeRequest(app, '/domain/nonexistent');

    expect(result.status).toBe(404);
    expect(await result.text()).toBe('Domain not found');
  });

  it('returns a generic 500 when the database fails', async () => {
    spyOn(Domain, 'findOne').mockRejectedValue(
      new Error('connection 3 to db-host:27017 closed (secret internals)')
    );

    const result = await makeRequest(app, `/domain/${TEST_DOMAIN_NAME}`);

    expect(result.status).toBe(500);
    expect(await result.text()).toBe('Internal Server Error');
  });
});

describe('unmatched routes', () => {
  it('should return 404 for routes that do not exist', async () => {
    const result = await makeRequest(app, '/wp-admin/setup.php');

    expect(result.status).toBe(404);
  });
});

describe('PUT /domain/:name', () => {
  it('should reject requests without auth', async () => {
    const result = await putJson(app, `/domain/${TEST_DOMAIN_NAME}`, { theme: 'crimson' });

    expect(result.status).toBe(401);
  });

  it('should reject an expired session', async () => {
    const cookie = await authCookie(TEST_USER_ID, Math.floor(Date.now() / 1000) - 60);

    const result = await putWithCookie(app, `/domain/${TEST_DOMAIN_NAME}`, { theme: 'crimson' }, cookie);

    expect(result.status).toBe(401);
  });

  it('should update domain settings when user is admin', async () => {
    const domain = makeDomain();
    const save = spyOn(domain, 'save').mockResolvedValue(domain as never);
    spyOn(Domain, 'findOne').mockResolvedValue(domain as never);

    const body = {
      theme: 'crimson',
      headerTitle: 'John Doe',
      headerSubtitle: 'Full Stack Developer',
      defaultDarkMode: true,
    };

    const result = await putWithCookie(app, `/domain/${TEST_DOMAIN_NAME}`, body, await authCookie());

    expect(result.status).toBe(200);
    expect(save).toHaveBeenCalledTimes(1);
    const response = await readJson(result);
    expect(response).toMatchObject(body);
  });

  it('should return 403 when user is not the domain admin', async () => {
    const domain = makeDomain({ admin: new Types.ObjectId() });
    const save = spyOn(domain, 'save').mockResolvedValue(domain as never);
    spyOn(Domain, 'findOne').mockResolvedValue(domain as never);

    const result = await putWithCookie(
      app,
      `/domain/${TEST_DOMAIN_NAME}`,
      { theme: 'crimson' },
      await authCookie()
    );

    expect(result.status).toBe(403);
    expect(save).not.toHaveBeenCalled();
  });

  it('should return 404 for non-existent domain', async () => {
    spyOn(Domain, 'findOne').mockResolvedValue(null as never);

    const result = await putWithCookie(
      app,
      '/domain/nonexistent',
      { theme: 'crimson' },
      await authCookie()
    );

    expect(result.status).toBe(404);
  });

  it('should allow partial updates', async () => {
    const domain = makeDomain({ theme: 'wintry', headerTitle: 'Old Title' });
    const save = spyOn(domain, 'save').mockResolvedValue(domain as never);
    spyOn(Domain, 'findOne').mockResolvedValue(domain as never);

    const result = await putWithCookie(
      app,
      `/domain/${TEST_DOMAIN_NAME}`,
      { theme: 'cerberus' },
      await authCookie()
    );

    expect(result.status).toBe(200);
    expect(save).toHaveBeenCalledTimes(1);
    expect(domain.theme).toBe('cerberus');
    // headerTitle should remain unchanged since we didn't send it
    expect(domain.headerTitle).toBe('Old Title');
  });

  it('should reject oversized values with 422', async () => {
    const result = await putWithCookie(
      app,
      `/domain/${TEST_DOMAIN_NAME}`,
      { headerTitle: 'x'.repeat(10_000) },
      await authCookie()
    );

    expect(result.status).toBe(422);
  });
});

describe('POST /domain/claim', () => {
  it('should reject requests without auth', async () => {
    const result = await makeRequest(app, '/domain/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'new.domain' })
    });

    expect(result.status).toBe(401);
  });

  it('claims a free, valid name (normalized to lowercase)', async () => {
    spyOn(Domain, 'findOne').mockResolvedValue(null as never);
    const create = spyOn(Domain, 'create').mockImplementation(
      (async (doc: Record<string, unknown>) => new Domain(doc)) as never
    );

    const result = await postWithCookie(app, '/domain/claim', { name: ' Jane.Doe ' }, await authCookie());

    expect(result.status).toBe(200);
    expect(create).toHaveBeenCalledWith({ name: 'jane.doe', admin: TEST_USER_ID, experiences: [] });
    const response = await readJson(result);
    expect(response.name).toBe('jane.doe');
    expect(response.admin).toBe(TEST_USER_ID);
  });

  it.each([
    ['a reserved route name', 'admin'],
    ['a scanner-like file name', 'wp-login.php'],
    ['a name with spaces', 'bad name'],
    ['a name starting with a dash', '-bad'],
    ['an empty name', ''],
  ])('returns 400 for %s', async (_label, name) => {
    const findOne = spyOn(Domain, 'findOne');
    const create = spyOn(Domain, 'create');

    const result = await postWithCookie(app, '/domain/claim', { name }, await authCookie());

    expect(result.status).toBe(400);
    expect(await result.text()).toBe('Invalid domain name');
    expect(findOne).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 409 when the name is taken', async () => {
    spyOn(Domain, 'findOne').mockResolvedValueOnce(makeDomain({ name: 'jane.doe' }) as never);

    const result = await postWithCookie(app, '/domain/claim', { name: 'jane.doe' }, await authCookie());

    expect(result.status).toBe(409);
    // The client shows a specific message for this case
    expect(await result.text()).toContain('already exists');
  });

  it('returns 409 when the user already owns a domain', async () => {
    spyOn(Domain, 'findOne')
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(makeDomain() as never);

    const result = await postWithCookie(app, '/domain/claim', { name: 'jane.doe' }, await authCookie());

    expect(result.status).toBe(409);
    expect(await result.text()).toContain('already own');
  });

  it('returns 409 when a concurrent claim wins the race', async () => {
    spyOn(Domain, 'findOne').mockResolvedValue(null as never);
    spyOn(Domain, 'create').mockRejectedValue(
      Object.assign(new Error('E11000 duplicate key error collection: wf.domains index: name_1'), {
        code: 11000
      })
    );

    const result = await postWithCookie(app, '/domain/claim', { name: 'jane.doe' }, await authCookie());

    expect(result.status).toBe(409);
    expect(await result.text()).toBe('Domain already exists');
  });
});
