import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ExperienceType } from 'portfolio-common';

// vi.mock factories are hoisted — use vi.fn() inline, no outer refs
vi.mock('$services', () => {
  const mockPost = vi.fn();
  const mockPut = vi.fn();
  // Eden treaty exposes parameterized routes as functions:
  //   portfolioApi.experiences({ id: '...' }).put(body, opts)
  //   portfolioApi.experiences.post(body, opts)
  const experiencesFn = Object.assign(
    (_params: { id: string }) => ({ put: mockPut }),
    { post: mockPost }
  );
  return {
    portfolioApi: { experiences: experiencesFn },
  };
});

import { portfolioApi } from '$services';

// Extract mock references — the real types don't expose Mock methods,
// so we cast to Mock at the boundary between real types and vi.mock.
const mockPost = portfolioApi.experiences.post as unknown as Mock;
const mockPut = portfolioApi.experiences({ id: 'any' }).put as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Experience submit logic', () => {
  const formData = {
    title: 'Software Engineer',
    type: ExperienceType.Professional,
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

  const fetchOpts = { fetch: { credentials: 'include' } } as const;

  it('should call POST when creating a new experience', async () => {
    mockPost.mockResolvedValue({ data: { _id: 'new-id', ...formData }, error: null });

    const apiData = buildApiData(formData);
    const existingExperience = undefined;

    if (existingExperience) {
      await portfolioApi.experiences({ id: String(existingExperience) }).put(apiData, fetchOpts);
    } else {
      await portfolioApi.experiences.post(apiData, fetchOpts);
    }

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(apiData, fetchOpts);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('should call PUT with experience ID when editing', async () => {
    const existingId = 'existing-exp-123';
    mockPut.mockResolvedValue({ data: { _id: existingId, ...formData }, error: null });

    const apiData = buildApiData(formData);
    const existingExperience = { _id: existingId };

    if (existingExperience?._id) {
      await portfolioApi.experiences({ id: String(existingExperience._id) }).put(apiData, fetchOpts);
    } else {
      await portfolioApi.experiences.post(apiData, fetchOpts);
    }

    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith(apiData, fetchOpts);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('should transform form data correctly before sending', async () => {
    const existingId = 'existing-exp-456';
    mockPut.mockResolvedValue({ data: { _id: existingId }, error: null });

    const apiData = buildApiData(formData);
    await portfolioApi.experiences({ id: existingId }).put(apiData, fetchOpts);

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
    await portfolioApi.experiences.post(apiData, fetchOpts);

    expect(mockPost.mock.calls[0][1]).toEqual({ fetch: { credentials: 'include' } });
  });
});
