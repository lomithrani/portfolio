import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { Domain } from '../models/database';
import { createApp } from '../app';
import { makeRequest, TEST_DOMAIN_NAME, testDomain } from './helpers';

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp();
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

  it('should return error for non-existent domain', async () => {
    Domain.findOne = mock(() => Promise.resolve(null)) as any;

    const result = await makeRequest(app, '/domain/nonexistent');

    expect(result.status).not.toBe(200);
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
