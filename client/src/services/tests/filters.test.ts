import { describe, it, expect } from 'vitest';
import { activeSkillFilters, filterExperiences, type SkillFilters } from '../filters';
import type { Experience, Skill } from 'portfolio-api/models/database';

// Helper to build mock experience data
function makeExperience(title: string, hardSkills: string[], softSkills: string[]): Experience {
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
					level: 5
				})),
				softSkills: softSkills.map((name) => ({
					skill: { displayName: name, names: [name] } as Skill,
					level: 4
				}))
			}
		]
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
			softSkills: new Set()
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
			softSkills: new Set(['Teamwork'])
		};
		const result = filterExperiences(allExperiences, filters);
		expect(result).toHaveLength(1);
		expect(result).toContain(pyExperience);
	});

	it('should filter by both hard and soft skills (OR within categories)', () => {
		const filters: SkillFilters = {
			hardSkills: new Set(['Django']),
			softSkills: new Set(['Leadership'])
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
			softSkills: new Set()
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
			softSkills: new Set()
		};
		const result = filterExperiences(allExperiences, filters);
		// All three have either TypeScript or Python
		expect(result).toHaveLength(3);
	});
});

describe('activeSkillFilters', () => {
	it('keeps the selected skills that the experiences still use', () => {
		const filters: SkillFilters = {
			hardSkills: new Set(['TypeScript', 'Django']),
			softSkills: new Set(['Teamwork'])
		};

		expect(activeSkillFilters(allExperiences, filters)).toEqual(filters);
	});

	it('drops a selected skill that no experience uses any more', () => {
		const filters: SkillFilters = {
			hardSkills: new Set(['Go', 'Python']),
			softSkills: new Set(['Go'])
		};

		expect(activeSkillFilters(allExperiences, filters)).toEqual({
			hardSkills: new Set(['Python']),
			softSkills: new Set()
		});
	});

	it('matches a skill within its own kind only', () => {
		// 'Communication' is a soft skill: selecting it as a hard skill matches nothing
		const filters: SkillFilters = {
			hardSkills: new Set(['Communication']),
			softSkills: new Set()
		};

		expect(activeSkillFilters(allExperiences, filters).hardSkills.size).toBe(0);
	});

	it('shows every experience again once an edit removed the only selected skill', () => {
		const filters: SkillFilters = { hardSkills: new Set(['Go']), softSkills: new Set() };
		const goExperience = makeExperience('Go Dev', ['Go'], []);
		const before = [...allExperiences, goExperience];
		expect(filterExperiences(before, activeSkillFilters(before, filters))).toEqual([goExperience]);

		// The edit replaced 'Go': the stale selection has no chip left and must not hide everything
		const after = [...allExperiences, makeExperience('Go Dev', ['Rust'], [])];
		expect(filterExperiences(after, activeSkillFilters(after, filters))).toEqual(after);
	});
});
