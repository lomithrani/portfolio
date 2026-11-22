import { describe, it, expect } from 'vitest';
import { ExperienceType } from 'portfolio-common';
import {
	CARD_SKILLS,
	COLLAPSED_SKILLS,
	activeFilters,
	applyFilters,
	collapsedSkills,
	emptyFilters,
	filtersFromSearchParams,
	filtersToSearchParams,
	foldSkills,
	hasActiveFilters,
	isSkillHighlighted,
	isSoftSkill,
	normalizeSkill,
	experienceUsesSkill,
	orderSkillsByRank,
	projectMatchesFilters,
	skillGroups,
	skillIndex,
	skillMatchesKey,
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

// ---------------------------------------------------------------------------------------------
// Families (a skill can be part of another) and the ranking the panel and the cards go by

const NOW = new Date('2026-11-11T10:00:00.000Z');
const month = (key: string) => new Date(`${key}-01T00:00:00.000Z`);

type Catalogued = { name: string; category?: string; parent?: string };
/** A skill as the API presents it: its canonical name, its category, the skill it is part of */
const presented = ({ name, category, parent }: Catalogued) => ({
	skill: {
		_id: `skill-${normalizeSkill(name)}`,
		displayName: name,
		...(category ? { category } : {}),
		...(parent ? { parent: { _id: `skill-${normalizeSkill(parent)}`, displayName: parent } } : {})
	},
	level: -1
});
const project = (
	name: string,
	period: [string, string],
	hard: (string | Catalogued)[],
	soft: (string | Catalogued)[] = []
) => ({
	name,
	start: month(period[0]),
	end: month(period[1]),
	hardSkills: hard.map((skill) => presented(typeof skill === 'string' ? { name: skill } : skill)),
	softSkills: soft.map((skill) => presented(typeof skill === 'string' ? { name: skill } : skill))
});
const job = (
	title: string,
	period: [string, string],
	...projects: ReturnType<typeof project>[]
) => ({
	title,
	start: month(period[0]),
	end: month(period[1]),
	projects
});

const core: Catalogued = { name: '.NET Core', category: 'framework', parent: '.NET' };
const wpf: Catalogued = { name: 'WPF', category: 'framework', parent: '.NET' };
const csharp: Catalogued = { name: 'C#', category: 'language' };
const kafka: Catalogued = { name: 'Kafka', category: 'data' };
const mentoring: Catalogued = { name: 'Mentoring', category: 'soft' };

// '.NET' itself is never used: only skills that are part of it are
const backend = job(
	'Backend developer',
	['2018-01', '2021-12'],
	project('Billing', ['2018-01', '2019-12'], [core, csharp], [mentoring]),
	project('Reporting', ['2020-01', '2021-12'], [wpf, csharp])
);
const streaming = job(
	'Data engineer',
	['2022-01', '2022-06'],
	project('Streams', ['2022-01', '2022-06'], [kafka, 'Grafana'], ['Curiosity'])
);
const careers = [backend, streaming];
const index = skillIndex(careers, NOW);

describe('skillIndex', () => {
	it('ranks every skill once by time used, a family under the skill it is part of', () => {
		expect(index.ranked.map((skill) => [skill.key, skill.months])).toEqual([
			// Both of its family's projects, each month once
			['.net', 48],
			['c#', 48],
			['.net core', 24],
			['mentoring', 24],
			['wpf', 24],
			['curiosity', 6],
			['grafana', 6],
			['kafka', 6]
		]);
		expect(index.byKey.get('.net')).toMatchObject({
			label: '.NET',
			childKeys: ['.net core', 'wpf'],
			ownProjects: 0
		});
		expect(index.rank.get('c#')).toBe(1);
		expect(index.taxonomy.get('wpf')?.parentKey).toBe('.net');
	});
});

describe('filtering by a skill that others are part of', () => {
	const taxonomy = index.taxonomy;

	it('keeps the experiences using it or a skill that is part of it', () => {
		expect(applyFilters(careers, filters(['.net']))).toEqual([backend]);
		expect(applyFilters(careers, filters(['.net']), taxonomy)).toEqual([backend]);
		// A skill that is part of another matches only itself
		const wpfOnly = job(
			'WPF',
			['2023-01', '2023-02'],
			project('UI', ['2023-01', '2023-02'], [wpf])
		);
		expect(applyFilters([backend, streaming, wpfOnly], filters(['.net core']))).toEqual([backend]);
		expect(applyFilters([streaming, wpfOnly], filters(['.net']))).toEqual([wpfOnly]);
	});

	it('keeps a selected skill that only others are part of', () => {
		expect(activeFilters(careers, filters(['.NET', 'go']))).toEqual(filters(['.net']));
	});

	it('matches the projects and the tags of its family', () => {
		const [billing, reporting] = backend.projects;
		expect(projectMatchesFilters(billing, filters(['.net']), taxonomy)).toBe(true);
		expect(projectMatchesFilters(reporting, filters(['.net core']), taxonomy)).toBe(false);
		expect(projectMatchesFilters(streaming.projects[0], filters(['.net']), taxonomy)).toBe(false);
		// Without the taxonomy each skill matches alone
		expect(projectMatchesFilters(billing, filters(['.net']))).toBe(false);

		expect(isSkillHighlighted(filters(['.net']), '.NET Core', taxonomy)).toBe(true);
		expect(isSkillHighlighted(filters(['.net']), 'C#', taxonomy)).toBe(false);
		expect(isSkillHighlighted(filters(['.net core']), '.NET', taxonomy)).toBe(false);
		expect(isSkillHighlighted(filters(['.net core']), 'WPF', taxonomy)).toBe(false);
		expect(skillMatchesKey(' wpf ', '.net', taxonomy)).toBe(true);
		expect(skillMatchesKey('WPF', '.net')).toBe(false);

		expect(experienceUsesSkill(backend, '.net', taxonomy)).toBe(true);
		expect(experienceUsesSkill(streaming, '.net', taxonomy)).toBe(false);
		expect(experienceUsesSkill(backend, '.net')).toBe(false);
	});
});

describe('isSoftSkill', () => {
	it('goes by the category when there is one, else by how the owner listed the skill', () => {
		expect(isSoftSkill({ kind: 'hard', category: 'soft' })).toBe(true);
		expect(isSoftSkill({ kind: 'soft', category: 'practice' })).toBe(false);
		expect(isSoftSkill({ kind: 'soft' })).toBe(true);
		expect(isSoftSkill({ kind: 'hard' })).toBe(false);
	});
});

describe('collapsedSkills', () => {
	const names = (chips: { skill: { label: string } }[]) => chips.map(({ skill }) => skill.label);

	it('lists the most used technical and soft skills, a family folded into its skill', () => {
		const rows = collapsedSkills(index);
		expect(names(rows.hard)).toEqual(['.NET', 'C#', 'Grafana', 'Kafka']);
		expect(names(rows.soft)).toEqual(['Mentoring', 'Curiosity']);
		expect(rows.total).toBe(8);
		// '.NET Core' and 'WPF' are behind "All 8 skills"
		expect(rows.more).toBe('always');
	});

	it('always shows the selected skills, those the rows leave out last', () => {
		const rows = collapsedSkills(index, ['wpf', 'kafka', 'gone']);
		expect(names(rows.hard)).toEqual(['.NET', 'C#', 'Grafana', 'Kafka', 'WPF']);
		expect(rows.hard.every((chip) => chip.small)).toBe(true);
	});

	it('keeps fixed counts, fewer technical skills on small screens', () => {
		const many = [
			job(
				'Polyglot',
				['2020-01', '2020-12'],
				...Array.from({ length: 12 }, (_, position) =>
					// Each a month shorter than the one before: ranked in this order
					project(
						`P${position}`,
						['2020-01', `2020-${String(12 - position).padStart(2, '0')}`],
						[`Tech ${String.fromCharCode(65 + position)}`],
						[`Soft ${String.fromCharCode(65 + position)}`]
					)
				)
			)
		];
		const wide = skillIndex(many, NOW);
		const rows = collapsedSkills(wide, ['tech g', 'tech l', 'soft k']);
		expect(rows.hard).toHaveLength(COLLAPSED_SKILLS.hard + 1);
		expect(rows.soft).toHaveLength(COLLAPSED_SKILLS.soft + 1);
		expect(names(rows.hard).at(-1)).toBe('Tech L');
		expect(names(rows.soft).at(-1)).toBe('Soft K');
		// Small screens: the first five, and the selected ones wherever they stand
		expect(rows.hard.map((chip) => chip.small)).toEqual([
			true,
			true,
			true,
			true,
			true,
			false,
			true,
			false,
			true
		]);
		expect(rows.more).toBe('always');
		expect(rows.total).toBe(24);
	});

	it('says when the rows hold every skill', () => {
		const few = (count: number) =>
			skillIndex(
				[
					job(
						'Few',
						['2020-01', '2020-12'],
						project(
							'One',
							['2020-01', '2020-12'],
							Array.from({ length: count }, (_, position) => `Tech ${position}`),
							['Listening']
						)
					)
				],
				NOW
			);
		expect(collapsedSkills(few(COLLAPSED_SKILLS.hardSmall)).more).toBe('never');
		// They fit a wide screen's row, not a small screen's
		expect(collapsedSkills(few(COLLAPSED_SKILLS.hard)).more).toBe('small');
		expect(collapsedSkills(few(COLLAPSED_SKILLS.hard + 1)).more).toBe('always');
		expect(collapsedSkills(skillIndex([], NOW))).toEqual({
			hard: [],
			soft: [],
			more: 'never',
			total: 0
		});
	});
});

describe('skillGroups', () => {
	const shape = (groups: ReturnType<typeof skillGroups>) =>
		groups.groups.map((group) => [
			group.category ?? group.kind,
			group.count,
			group.families.map((family) =>
				family.children.length > 0
					? [family.skill.label, ...family.children.map((child) => child.label)]
					: family.skill.label
			)
		]);

	it("groups by category in the catalogue's order, families together, soft skills last", () => {
		const groups = skillGroups(index);
		expect(groups.categorized).toBe(true);
		expect(groups.count).toBe(8);
		expect(shape(groups)).toEqual([
			['language', 1, ['C#']],
			// '.NET' is only named by the skills that are part of it: under their category
			['framework', 3, [['.NET', '.NET Core', 'WPF']]],
			['data', 1, ['Kafka']],
			// Without a category: with "Other", before the soft skills
			['other', 1, ['Grafana']],
			// 'Curiosity' has no category: soft as its owner listed it
			['soft', 2, ['Mentoring', 'Curiosity']]
		]);
	});

	it('lists a family under the category of its skill, whatever those of its parts', () => {
		const azure = { name: 'Azure', category: 'infrastructure' };
		const cosmos = { name: 'Cosmos DB', category: 'data', parent: 'Azure' };
		const cloud = skillIndex(
			[
				job(
					'Cloud',
					['2020-01', '2020-12'],
					project('Move', ['2020-01', '2020-12'], [azure, cosmos])
				)
			],
			NOW
		);
		expect(shape(skillGroups(cloud))).toEqual([['infrastructure', 2, [['Azure', 'Cosmos DB']]]]);
	});

	it('is two lists, technical then soft, when no skill has a category', () => {
		const plain = skillIndex(
			[
				job(
					'Plain',
					['2020-01', '2021-12'],
					project('Short', ['2020-01', '2020-03'], ['Go'], ['Teamwork']),
					project('Long', ['2020-01', '2021-12'], ['Kafka'])
				)
			],
			NOW
		);
		const groups = skillGroups(plain);
		expect(groups.categorized).toBe(false);
		expect(groups.groups.map((group) => group.category)).toEqual([undefined, undefined]);
		expect(shape(groups)).toEqual([
			['hard', 2, ['Kafka', 'Go']],
			['soft', 1, ['Teamwork']]
		]);
	});

	it('keeps the skills whose label holds the search, ignoring case', () => {
		expect(shape(skillGroups(index, ' NET '))).toEqual([['framework', 2, [['.NET', '.NET Core']]]]);
		// A skill that matches without the skill it is part of is listed alone, in its place
		expect(shape(skillGroups(index, 'wpf'))).toEqual([['framework', 1, ['WPF']]]);
		expect(skillGroups(index, 'cobol')).toEqual({ categorized: true, groups: [], count: 0 });
	});

	it('searches ignoring accents, however they were typed, and takes a pattern literally', () => {
		const french = skillIndex(
			[
				job(
					'Conseil',
					['2020-01', '2021-12'],
					project('Mission', ['2020-01', '2021-12'], ['C#', '.NET'], ['Négociation', 'Sécurité'])
				)
			],
			NOW
		);
		const found = (query: string) =>
			skillGroups(french, query).groups.flatMap((group) =>
				group.families.map((family) => family.skill.label)
			);
		for (const query of ['neg', 'nég', 'NÉG', 'ne\u0301g', 'NEGOCIATION']) {
			expect(found(query)).toEqual(['Négociation']);
		}
		expect(found('securite')).toEqual(['Sécurité']);
		// Signs are not accents: they still tell skills apart
		expect(found('c#')).toEqual(['C#']);
		expect(found('.net')).toEqual(['.NET']);
		for (const pattern of ['(', '[a-z', '\\', '.*']) expect(found(pattern)).toEqual([]);
	});
});

describe('orderSkillsByRank', () => {
	it('lists the most used on the page first, and keeps the order of what it does not rank', () => {
		const tags = ['Kafka', 'Unknown', 'c#', 'WPF', 'Other'].map((displayName) => ({ displayName }));
		expect(orderSkillsByRank(tags, index.rank).map((tag) => tag.displayName)).toEqual([
			'c#',
			'WPF',
			'Kafka',
			'Unknown',
			'Other'
		]);
		// The list it is given is not changed
		expect(tags[0].displayName).toBe('Kafka');
	});
});

describe('foldSkills', () => {
	const tags = (count: number) => Array.from({ length: count }, (_, position) => position);

	it('shows every tag up to the limit, and one more rather than a "+1"', () => {
		expect(foldSkills(tags(CARD_SKILLS.shown))).toEqual({ shown: tags(6), hidden: [] });
		expect(foldSkills(tags(CARD_SKILLS.shown + 1))).toEqual({ shown: tags(7), hidden: [] });
	});

	it('folds the rest behind the button', () => {
		expect(foldSkills(tags(9))).toEqual({ shown: tags(6), hidden: [6, 7, 8] });
	});

	it('never hides a pinned tag', () => {
		expect(foldSkills(tags(9), (tag) => tag === 7)).toEqual({
			shown: [0, 1, 2, 3, 4, 5, 7],
			hidden: [6, 8]
		});
		expect(foldSkills(tags(8), (tag) => tag >= 6)).toEqual({ shown: tags(8), hidden: [] });
	});
});
