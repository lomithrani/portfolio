import { describe, it, expect } from 'vitest';
import { filterExperiences, type SkillFilters } from '../filters';
import type { Experience, Skill } from 'portfolio-api/models/database';

// Helper to build mock experience data
function makeExperience(
  title: string,
  hardSkills: string[],
  softSkills: string[]
): Experience {
  return {
    title,
    type: 'professional',
    summary: 'test',
    projects: [
      {
        name: 'Project',
        summary: 'test',
        hardSkills: hardSkills.map((name) => ({
          skill: { displayName: name, names: [name] } as Skill,
          level: 5,
        })),
        softSkills: softSkills.map((name) => ({
          skill: { displayName: name, names: [name] } as Skill,
          level: 4,
        })),
      },
    ],
  } as unknown as Experience;
}

const tsExperience = makeExperience('TS Dev', ['TypeScript', 'Node.js'], ['Communication']);
const pyExperience = makeExperience('Py Dev', ['Python', 'Django'], ['Teamwork']);
const fullStackExperience = makeExperience('Full Stack', ['TypeScript', 'Python'], ['Leadership']);
const allExperiences = [tsExperience, pyExperience, fullStackExperience];

function emptyFilters(): SkillFilters {
  return { softSkills: new Set(), hardSkills: new Set() };
}

describe('filterExperiences', () => {
  it('should return all experiences when no filters are active', () => {
    const result = filterExperiences(allExperiences, emptyFilters());
    expect(result).toEqual(allExperiences);
    expect(result).toHaveLength(3);
  });

  it('should filter by hard skill', () => {
    const filters: SkillFilters = {
      hardSkills: new Set(['TypeScript']),
      softSkills: new Set(),
    };
    const result = filterExperiences(allExperiences, filters);
    expect(result).toHaveLength(2);
    expect(result).toContain(tsExperience);
    expect(result).toContain(fullStackExperience);
    expect(result).not.toContain(pyExperience);
  });

  it('should filter by soft skill', () => {
    const filters: SkillFilters = {
      hardSkills: new Set(),
      softSkills: new Set(['Teamwork']),
    };
    const result = filterExperiences(allExperiences, filters);
    expect(result).toHaveLength(1);
    expect(result).toContain(pyExperience);
  });

  it('should filter by both hard and soft skills (OR within categories)', () => {
    const filters: SkillFilters = {
      hardSkills: new Set(['Django']),
      softSkills: new Set(['Leadership']),
    };
    const result = filterExperiences(allExperiences, filters);
    // Django matches pyExperience, Leadership matches fullStackExperience
    expect(result).toHaveLength(2);
    expect(result).toContain(pyExperience);
    expect(result).toContain(fullStackExperience);
  });

  it('should return empty array when no experiences match filter', () => {
    const filters: SkillFilters = {
      hardSkills: new Set(['Rust']),
      softSkills: new Set(),
    };
    const result = filterExperiences(allExperiences, filters);
    expect(result).toHaveLength(0);
  });

  it('should handle empty experiences array', () => {
    const result = filterExperiences([], emptyFilters());
    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  it('should handle multiple hard skill filters', () => {
    const filters: SkillFilters = {
      hardSkills: new Set(['TypeScript', 'Python']),
      softSkills: new Set(),
    };
    const result = filterExperiences(allExperiences, filters);
    // All three have either TypeScript or Python
    expect(result).toHaveLength(3);
  });
});
