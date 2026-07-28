import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { Domain, User } from '../models/database';
import { Types } from 'mongoose';
import { createApp } from '../app';
import {
  makeRequest,
  putWithCookie,
  putJson,
  loginAndGetCookie,
  testUser,
  testDomain,
  TEST_DOMAIN_NAME,
  TEST_USER_ID,
} from './helpers';

let app: ReturnType<typeof createApp>;
let originalFetch: typeof global.fetch;

beforeEach(() => {
  originalFetch = global.fetch;
  app = createApp();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('GET /domain/:name', () => {
  it('should return a populated domain for an existing name', async () => {
    const populatedDomain = {
      ...testDomain,
      experiences: [
        {
          _id: 'exp1',
          title: 'Engineer',
          projects: [
            {
              name: 'Project A',
              hardSkills: [{ skill: { displayName: 'TypeScript' }, level: 5 }],
              softSkills: [{ skill: { displayName: 'Communication' }, level: 4 }],
            },
          ],
        },
      ],
      toObject: () => ({
        name: TEST_DOMAIN_NAME,
        experiences: [
          {
            _id: 'exp1',
            title: 'Engineer',
            projects: [
              {
                name: 'Project A',
                hardSkills: [{ skill: { displayName: 'TypeScript' }, level: 5 }],
                softSkills: [{ skill: { displayName: 'Communication' }, level: 4 }],
              },
            ],
          },
        ],
      }),
    };

    populatedDomain.populate = mock(() => Promise.resolve(populatedDomain));

    Domain.findOne = mock(() => Promise.resolve(populatedDomain)) as any;

    const result = await makeRequest(app, `/domain/${TEST_DOMAIN_NAME}`);

    expect(result.status).toBe(200);

    const response = await result.json();
    expect(response.name).toBe(TEST_DOMAIN_NAME);
    expect(response.experiences).toBeArray();
    expect(response.experiences).toHaveLength(1);
    expect(response.experiences[0].title).toBe('Engineer');
    expect(response.experiences[0].projects[0].hardSkills[0].skill.displayName).toBe('TypeScript');
  });

  it('should return 404 for non-existent domain', async () => {
    Domain.findOne = mock(() => Promise.resolve(null)) as any;

    const result = await makeRequest(app, '/domain/nonexistent');

    expect(result.status).toBe(404);
  });

  it('should return domain with empty experiences', async () => {
    const emptyDomain = {
      ...testDomain,
      experiences: [],
      populate: mock(function (this: any) { return Promise.resolve(this); }),
      toObject: () => ({ name: TEST_DOMAIN_NAME, experiences: [] }),
    };

    Domain.findOne = mock(() => Promise.resolve(emptyDomain)) as any;

    const result = await makeRequest(app, `/domain/${TEST_DOMAIN_NAME}`);

    expect(result.status).toBe(200);
    const response = await result.json();
    expect(response.experiences).toBeArray();
    expect(response.experiences).toHaveLength(0);
  });
});

describe('unmatched routes', () => {
  it('should return 404 for routes that do not exist', async () => {
    const result = await makeRequest(app, '/wp-admin/setup.php');

    expect(result.status).toBe(404);
  });
});

describe('PUT /domain/:name', () => {
  beforeEach(() => {
    User.findOneAndUpdate = mock(() => Promise.resolve(testUser)) as any;
    User.findById = mock(() => Promise.resolve(testUser)) as any;
  });

  it('should reject requests without auth', async () => {
    const result = await putJson(app, `/domain/${TEST_DOMAIN_NAME}`, { theme: 'crimson' });

    expect(result.status).toBe(401);
  });

  it('should update domain settings when user is admin', async () => {
    const cookie = await loginAndGetCookie(app);

    const saveMock = mock(() => Promise.resolve());
    const updatedFields: Record<string, any> = {};

    const mockDomain = {
      ...testDomain,
      admin: new Types.ObjectId(TEST_USER_ID),
      save: saveMock,
      toObject: () => ({
        ...testDomain,
        theme: updatedFields.theme,
        headerTitle: updatedFields.headerTitle,
        headerSubtitle: updatedFields.headerSubtitle,
        defaultDarkMode: updatedFields.defaultDarkMode,
      }),
    };

    // Use a proxy to track field assignments
    const domainProxy = new Proxy(mockDomain, {
      set(target: any, prop, value) {
        updatedFields[prop as string] = value;
        target[prop] = value;
        return true;
      },
    });

    Domain.findOne = mock(() => Promise.resolve(domainProxy)) as any;

    const body = {
      theme: 'crimson',
      headerTitle: 'John Doe',
      headerSubtitle: 'Full Stack Developer',
      defaultDarkMode: true,
    };

    const result = await putWithCookie(app, `/domain/${TEST_DOMAIN_NAME}`, body, cookie);

    expect(result.status).toBe(200);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(updatedFields.theme).toBe('crimson');
    expect(updatedFields.headerTitle).toBe('John Doe');
    expect(updatedFields.headerSubtitle).toBe('Full Stack Developer');
    expect(updatedFields.defaultDarkMode).toBe(true);
  });

  it('should reject when user is not the domain admin', async () => {
    const cookie = await loginAndGetCookie(app);

    const differentAdminId = new Types.ObjectId();

    Domain.findOne = mock(() =>
      Promise.resolve({
        ...testDomain,
        admin: differentAdminId,
        save: mock(() => Promise.resolve()),
        toObject: () => testDomain,
      })
    ) as any;

    const result = await putWithCookie(
      app,
      `/domain/${TEST_DOMAIN_NAME}`,
      { theme: 'crimson' },
      cookie
    );

    expect(result.status).not.toBe(200);
  });

  it('should return 404 for non-existent domain', async () => {
    const cookie = await loginAndGetCookie(app);

    Domain.findOne = mock(() => Promise.resolve(null)) as any;

    const result = await putWithCookie(
      app,
      '/domain/nonexistent',
      { theme: 'crimson' },
      cookie
    );

    expect(result.status).toBe(404);
  });

  it('should allow partial updates', async () => {
    const cookie = await loginAndGetCookie(app);

    const saveMock = mock(() => Promise.resolve());

    const mockDomain = {
      ...testDomain,
      admin: new Types.ObjectId(TEST_USER_ID),
      theme: 'wintry',
      headerTitle: 'Old Title',
      save: saveMock,
      toObject: () => ({ ...testDomain, theme: 'cerberus', headerTitle: 'Old Title' }),
    };

    Domain.findOne = mock(() => Promise.resolve(mockDomain)) as any;

    const result = await putWithCookie(
      app,
      `/domain/${TEST_DOMAIN_NAME}`,
      { theme: 'cerberus' },
      cookie
    );

    expect(result.status).toBe(200);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(mockDomain.theme).toBe('cerberus');
    // headerTitle should remain unchanged since we didn't send it
    expect(mockDomain.headerTitle).toBe('Old Title');
  });
});
