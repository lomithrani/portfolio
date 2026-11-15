import { describe, it, expect } from 'vitest';
import { ExperienceType } from 'portfolio-common';
import {
	activeFilters,
	applyFilters,
	emptyFilters,
	filtersFromSearchParams,
	filtersToSearchParams,
	hasActiveFilters,
	isSkillHighlighted,
	normalizeSkill,
	experienceUsesSkill,
	projectMatchesFilters,
	skillOptions,
	toggleSkill,
	type ExperienceFilters
} from '../filters';

type Skills = { hard?: string[]; soft?: string[] };

// An experience as the API returns it (populated skills), one project per skill set
function makeExperience(
	title: string,
	type: ExperienceType,
	...projects: Skills[]
): { title: string; type: ExperienceType; projects: object[] } {
	const entries = (names: string[] = []) =>
		names.map((name) => ({ skill: { displayName: name, names: [name] }, level: 5 }));
	return {
		title,
		type,
		projects: projects.map((skills, index) => ({
			name: `Project ${index}`,
			hardSkills: entries(skills.hard),
			softSkills: entries(skills.soft)
		}))
	};
}

const filters = (skills: string[] = []): ExperienceFilters => ({ skills });

const ts = makeExperience('TS Dev', ExperienceType.Professional, {
	hard: ['TypeScript', 'Node.js'],
	soft: ['Communication']
});
const py = makeExperience('Py Dev', ExperienceType.Professional, {
	hard: ['Python', 'Django'],
	soft: ['Teamwork']
});
const msc = makeExperience(
	'MSc',
	ExperienceType.Educational,
	{ hard: ['typescript'] },
	{ hard: ['Python'], soft: ['Leadership'] }
);
const climbing = makeExperience('Climbing', ExperienceType.Leisure, { soft: ['Teamwork'] });
const all = [ts, py, msc, climbing];

describe('normalizeSkill', () => {
	it('ignores case and surrounding spaces', () => {
		expect(normalizeSkill('  TypeScript ')).toBe('typescript');
		expect(normalizeSkill('gRPC')).toBe(normalizeSkill('GRPC'));
		expect(normalizeSkill('Node.js')).toBe('node.js');
	});
});

describe('applyFilters', () => {
	it('returns every experience, in order, without filters', () => {
		expect(applyFilters(all, emptyFilters())).toEqual(all);
		expect(applyFilters([], emptyFilters())).toEqual([]);
	});

	it('matches skills ignoring case, in any project', () => {
		// 'TypeScript' and the MSc's 'typescript' are the same skill
		expect(applyFilters(all, filters(['typescript']))).toEqual([ts, msc]);
		// The MSc uses Python in its second project
		expect(applyFilters(all, filters(['python']))).toEqual([py, msc]);
	});

	it('keeps an experience having any of the selected skills (OR), technical or soft', () => {
		expect(applyFilters(all, filters(['django', 'leadership']))).toEqual([py, msc]);
		expect(applyFilters(all, filters(['teamwork']))).toEqual([py, climbing]);
	});

	it('ignores a selected skill that no experience has any more', () => {
		// An edit replaced the only 'Go': the stale selection has no chip left to clear it
		expect(applyFilters(all, filters(['go']))).toEqual(all);
		expect(applyFilters(all, filters(['go', 'django']))).toEqual([py]);
	});

	it('copes with unpopulated skills and missing projects', () => {
		const bare = { type: ExperienceType.Personal, projects: undefined };
		const unpopulated = {
			type: ExperienceType.Personal,
			projects: [{ hardSkills: [{ skill: '665f1c2e8b3a4d0012345678' }], softSkills: null }]
		};
		expect(applyFilters([bare, unpopulated, ts], filters(['typescript']))).toEqual([ts]);
	});
});

describe('activeFilters', () => {
	it('keeps what still applies, normalized and deduped', () => {
		expect(activeFilters(all, filters(['TypeScript', 'typescript', 'go', 'teamwork']))).toEqual(
			filters(['typescript', 'teamwork'])
		);
	});

	it('is empty when nothing applies', () => {
		expect(hasActiveFilters(activeFilters(all, filters(['go'])))).toBe(false);
		expect(hasActiveFilters(filters(['go']))).toBe(true);
		expect(hasActiveFilters(emptyFilters())).toBe(false);
	});
});

describe('isSkillHighlighted', () => {
	it('matches a display name ignoring case', () => {
		const selected = filters(['typescript']);
		expect(isSkillHighlighted(selected, 'TypeScript')).toBe(true);
		expect(isSkillHighlighted(selected, ' typescript')).toBe(true);
		expect(isSkillHighlighted(selected, 'JavaScript')).toBe(false);
		expect(isSkillHighlighted(emptyFilters(), 'TypeScript')).toBe(false);
	});
});

describe('projectMatchesFilters', () => {
	const [first, second] = msc.projects as Parameters<typeof projectMatchesFilters>[0][];

	it('tells the projects using any of the selected skills, technical or soft', () => {
		expect(projectMatchesFilters(first, filters(['typescript']))).toBe(true);
		expect(projectMatchesFilters(second, filters(['typescript']))).toBe(false);
		expect(projectMatchesFilters(second, filters(['typescript', 'leadership']))).toBe(true);
	});

	it('matches nothing without a selection, or without skills', () => {
		expect(projectMatchesFilters(first, emptyFilters())).toBe(false);
		expect(projectMatchesFilters({}, filters(['typescript']))).toBe(false);
		expect(
			projectMatchesFilters({ hardSkills: null, softSkills: null }, filters(['typescript']))
		).toBe(false);
	});
});

describe('experienceUsesSkill', () => {
	const experience = {
		projects: [
			{ hardSkills: [{ skill: { displayName: 'Kafka' } }], softSkills: [] },
			{ hardSkills: [], softSkills: [{ skill: { displayName: 'Leadership' } }] }
		]
	};

	it('tells whether a project of the experience uses the skill, technical or soft', () => {
		expect(experienceUsesSkill(experience, 'kafka')).toBe(true);
		expect(experienceUsesSkill(experience, ' LEADERSHIP ')).toBe(true);
		expect(experienceUsesSkill(experience, 'go')).toBe(false);
		expect(experienceUsesSkill({ projects: null }, 'kafka')).toBe(false);
	});
});

describe('skillOptions', () => {
	it('lists each skill once, labelled with its most used spelling, sorted', () => {
		const typescriptFan = makeExperience('Fan', ExperienceType.Personal, {
			hard: ['typescript', 'node.js']
		});
		expect(skillOptions([ts, msc, typescriptFan, py]).hard).toEqual([
			{ key: 'django', label: 'Django' },
			// 'Node.js' first seen, 'node.js' as often: the first seen wins
			{ key: 'node.js', label: 'Node.js' },
			{ key: 'python', label: 'Python' },
			// 'typescript' used twice, 'TypeScript' once
			{ key: 'typescript', label: 'typescript' }
		]);
	});

	it('keeps the first seen spelling on a tie', () => {
		const lower = makeExperience('Lower', ExperienceType.Personal, { hard: ['grpc'] });
		const mixed = makeExperience('Mixed', ExperienceType.Personal, { hard: ['gRPC'] });
		expect(skillOptions([mixed, lower]).hard).toEqual([{ key: 'grpc', label: 'gRPC' }]);
		expect(skillOptions([lower, mixed]).hard).toEqual([{ key: 'grpc', label: 'grpc' }]);
	});

	it('separates technical and soft skills', () => {
		expect(skillOptions(all).soft).toEqual([
			{ key: 'communication', label: 'Communication' },
			{ key: 'leadership', label: 'Leadership' },
			{ key: 'teamwork', label: 'Teamwork' }
		]);
	});

	it('lists a skill used as both kinds once, under the kind it is used most as', () => {
		const softly = makeExperience('Soft', ExperienceType.Personal, { soft: ['Mentoring'] });
		const twice = makeExperience('Twice', ExperienceType.Personal, { soft: ['mentoring'] });
		const hardly = makeExperience('Hard', ExperienceType.Personal, { hard: ['Mentoring'] });
		expect(skillOptions([softly, twice, hardly])).toEqual({
			hard: [],
			soft: [{ key: 'mentoring', label: 'Mentoring' }]
		});
		// A tie goes to technical
		expect(skillOptions([softly, hardly])).toEqual({
			hard: [{ key: 'mentoring', label: 'Mentoring' }],
			soft: []
		});
	});

	it('skips blank and unpopulated skills', () => {
		const odd = {
			type: ExperienceType.Personal,
			projects: [
				{
					hardSkills: [{ skill: { displayName: '  ' } }, { skill: 'an-object-id' }],
					softSkills: []
				}
			]
		};
		expect(skillOptions([odd])).toEqual({ hard: [], soft: [] });
		expect(skillOptions([])).toEqual({ hard: [], soft: [] });
	});
});

describe('toggleSkill', () => {
	it('adds a skill last and removes it again', () => {
		const once = toggleSkill(filters(['python']), 'TypeScript');
		expect(once).toEqual(filters(['python', 'typescript']));
		expect(toggleSkill(once, 'typescript ')).toEqual(filters(['python']));
	});

	it('does not change the filters it is given', () => {
		const selected = filters(['python']);
		toggleSkill(selected, 'python');
		expect(selected).toEqual(filters(['python']));
	});
});

describe('search params', () => {
	it('reads one parameter per skill, and ignores the type parameter of older links', () => {
		const params = new URLSearchParams(
			'skills=TypeScript&skills=%20kafka&skills=typescript&skills=&type=professional'
		);
		expect(filtersFromSearchParams(params)).toEqual(filters(['typescript', 'kafka']));
		expect(filtersFromSearchParams(new URLSearchParams())).toEqual(emptyFilters());
	});

	it('writes the filters and keeps the other parameters', () => {
		const base = new URLSearchParams('skills=old&tab=projects&type=leisure');
		const params = filtersToSearchParams(filters(['typescript', 'node.js']), base);
		// The type parameter of older links is dropped
		expect(params.toString()).toBe('tab=projects&skills=typescript&skills=node.js');
		// The base is not modified
		expect(base.toString()).toBe('skills=old&tab=projects&type=leisure');
		expect(filtersToSearchParams(emptyFilters(), base).toString()).toBe('tab=projects');
	});

	it('round-trips, including names with commas, spaces and symbols', () => {
		const selected = filters(['c, c++', 'ci/cd', 'node.js', 'a&b=c', 'déploiement']);
		const url = new URL('https://example.com/louis.gentil/experiences');
		url.search = filtersToSearchParams(selected, url.searchParams).toString();
		expect(filtersFromSearchParams(new URL(url.href).searchParams)).toEqual(selected);
	});
});
