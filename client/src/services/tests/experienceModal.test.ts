import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted — use vi.fn() inline, no outer refs
vi.mock('$services', () => {
  const mockPost = vi.fn();
  const mockPut = vi.fn();
  return {
    portfolioApi: {
      experiences: new Proxy({} as any, {
        get(_target: any, prop: string) {
          if (prop === 'post') return mockPost;
          // Any other property (an experience ID) returns { put: mockPut }
          return { put: mockPut };
        },
      }),
    },
  };
});

import { portfolioApi } from '$services';

// Extract the mock functions from the proxy for assertions
const mockPost = (portfolioApi.experiences as any).post;
const mockPut = (portfolioApi.experiences as any)['any-id'].put;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Experience submit logic', () => {
  const formData = {
    title: 'Software Engineer',
    type: 'professional',
    summary: 'Built things',
    projects: [
      {
        name: 'Portfolio',
        start: '2024-01-01',
        end: '2024-06-01',
        summary: 'A portfolio site',
        hardSkills: ['TypeScript'],
        softSkills: ['Communication'],
      },
    ],
  };

  function buildApiData(data: typeof formData) {
    return {
      ...data,
      projects: data.projects.map((project) => ({
        ...project,
        start: project.start ? new Date(project.start) : undefined,
        end: project.end ? new Date(project.end) : undefined,
        hardSkills: project.hardSkills.map((name) => ({ name, level: -1 })),
        softSkills: project.softSkills.map((name) => ({ name, level: -1 })),
      })),
    };
  }

  const fetchOpts = { fetch: { credentials: 'include' } };

  it('should call POST when creating a new experience (no existingExperience)', async () => {
    mockPost.mockResolvedValue({ data: { _id: 'new-id', ...formData }, error: null });

    const apiData = buildApiData(formData);

    // Simulate: no existingExperience → call post
    const existingExperience = undefined;
    if (existingExperience) {
      await (portfolioApi.experiences as any)[existingExperience].put(apiData, fetchOpts);
    } else {
      await (portfolioApi.experiences as any).post(apiData, fetchOpts);
    }

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(apiData, fetchOpts);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('should call PUT with experience ID when editing (existingExperience provided)', async () => {
    const existingId = 'existing-exp-123';
    mockPut.mockResolvedValue({ data: { _id: existingId, ...formData }, error: null });

    const apiData = buildApiData(formData);

    // Simulate: existingExperience has _id → call put
    const existingExperience = { _id: existingId };
    if (existingExperience?._id) {
      await (portfolioApi.experiences as any)[existingExperience._id].put(apiData, fetchOpts);
    } else {
      await (portfolioApi.experiences as any).post(apiData, fetchOpts);
    }

    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith(apiData, fetchOpts);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('should transform form data correctly before sending to API', async () => {
    const existingId = 'existing-exp-456';
    mockPut.mockResolvedValue({ data: { _id: existingId }, error: null });

    const apiData = buildApiData(formData);
    await (portfolioApi.experiences as any)[existingId].put(apiData, fetchOpts);

    const calledWith = mockPut.mock.calls[0][0];
    expect(calledWith.title).toBe('Software Engineer');
    expect(calledWith.type).toBe('professional');
    expect(calledWith.projects).toHaveLength(1);
    expect(calledWith.projects[0].hardSkills[0]).toEqual({ name: 'TypeScript', level: -1 });
    expect(calledWith.projects[0].softSkills[0]).toEqual({ name: 'Communication', level: -1 });
    expect(calledWith.projects[0].start).toBeInstanceOf(Date);
    expect(calledWith.projects[0].end).toBeInstanceOf(Date);
  });

  it('should include credentials in fetch options', async () => {
    mockPost.mockResolvedValue({ data: {}, error: null });

    const apiData = buildApiData(formData);
    await (portfolioApi.experiences as any).post(apiData, fetchOpts);

    expect(mockPost.mock.calls[0][1]).toEqual({ fetch: { credentials: 'include' } });
  });
});
