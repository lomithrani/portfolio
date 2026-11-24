import { describe, it, expect } from 'vitest';
import { projectUsesSkillFamily, rankedSkills, skillTaxonomy } from 'portfolio-common';
import type { Experience, PresentedSkill } from 'portfolio-api/models/database';
import { skillOptions } from '../filters';

// portfolio-common's catalogue helpers (common/models/skills.ts) read the experiences the API
// returns: this checks them on that type, and against what the page shows today (the filters'
// skillOptions), which they must agree with: one option per skill, under the same label, as
// technical or soft the same way. The rules themselves are tested with the API
// (server/tests/skills.test.ts).

const NOW = new Date('2026-11-11T10:00:00.000Z');
let ids = 0;
const presented = (
	displayName: string,
	more: Partial<Pick<PresentedSkill, 'category' | 'parent'>> = {}
): PresentedSkill => ({ _id: `skill-${ids++}`, displayName, ...more });

const dotnet = { _id: 'skill-dotnet', displayName: '.NET', category: 'framework' as const };

// As the server load hands them to the page: plain objects of the API's type
const experiences = [
	{
		title: 'Backend developer',
		start: new Date('2020-01-01T00:00:00.000Z'),
		end: new Date('2022-12-01T00:00:00.000Z'),
		projects: [
			{
				name: 'Billing',
				start: new Date('2020-01-01T00:00:00.000Z'),
				end: new Date('2021-06-01T00:00:00.000Z'),
				hardSkills: [
					{ skill: presented('.NET Core', { category: 'framework', parent: dotnet }), level: -1 },
					{ skill: presented('c#', { category: 'language' }), level: -1 }
				],
				softSkills: [{ skill: presented('Mentoring', { category: 'soft' }), level: -1 }]
			},
			{
				name: 'Reporting',
				start: new Date('2021-01-01T00:00:00.000Z'),
				end: new Date('2022-12-01T00:00:00.000Z'),
				hardSkills: [
					{ skill: presented('.NET Framework', { parent: dotnet }), level: -1 },
					{ skill: presented('C#', { category: 'language' }), level: -1 },
					{ skill: presented('C#', { category: 'language' }), level: -1 },
					{ skill: presented('mentoring'), level: -1 }
				],
				softSkills: [{ skill: presented('Mentoring', { category: 'soft' }), level: -1 }]
			}
		]
	}
] as unknown as Experience[];

describe('the catalogue helpers on the experiences the API returns', () => {
	it('rank the skills the filters list, under the same labels, technical or soft alike', () => {
		const ranked = rankedSkills(experiences, NOW);
		const options = skillOptions(experiences);
		const used = ranked.filter((skill) => skill.ownProjects > 0);
		const pick = (kind: 'hard' | 'soft') =>
			used
				.filter((skill) => skill.kind === kind)
				.map(({ key, label }) => ({ key, label }))
				.sort((a, b) => a.key.localeCompare(b.key));
		const sorted = (list: { key: string; label: string }[]) =>
			[...list].sort((a, b) => a.key.localeCompare(b.key));

		expect(pick('hard')).toEqual(sorted(options.hard));
		expect(pick('soft')).toEqual(sorted(options.soft));
		// Beyond them, only the parents the owner never typed
		expect(ranked.filter((skill) => skill.ownProjects === 0).map((skill) => skill.key)).toEqual([
			'.net'
		]);
	});

	it('count a family for its parent, and match its projects when it is the filter', () => {
		const taxonomy = skillTaxonomy(experiences);
		const [first] = rankedSkills(experiences, NOW, taxonomy);
		// Jan 2020 to Dec 2022, the two projects overlapping in 2021 counted once
		expect(first).toMatchObject({
			key: '.net',
			label: '.NET',
			kind: 'hard',
			months: 36,
			ownMonths: 0,
			projects: 2,
			category: 'framework',
			childKeys: ['.net framework', '.net core']
		});

		const [billing, reporting] = experiences[0].projects;
		expect(projectUsesSkillFamily(billing, '.net', taxonomy)).toBe(true);
		expect(projectUsesSkillFamily(reporting, '.net', taxonomy)).toBe(true);
		// A child matches only its own projects
		expect(projectUsesSkillFamily(billing, '.net framework', taxonomy)).toBe(false);
		expect(projectUsesSkillFamily(billing, '.net core', taxonomy)).toBe(true);
	});
});
