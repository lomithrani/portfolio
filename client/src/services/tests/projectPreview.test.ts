import { describe, it, expect } from 'vitest';
import {
	experiencePreview,
	previewTarget,
	previewedSkill,
	projectPreview,
	resolvePreview,
	skillMonths,
	skillPreview,
	skillTimeline
} from '../projectPreview';

const utc = (month: string) => new Date(`${month}-01T00:00:00.000Z`);
const NOW = new Date('2026-11-11T10:00:00.000Z');
const skills = (names: string[]) => names.map((name) => ({ skill: { displayName: name } }));

const staff = {
	_id: 'aaa',
	title: 'Staff Engineer',
	company: { name: 'Northwind' },
	location: 'Paris',
	start: utc('2022-03'),
	projects: [
		{
			name: 'Event platform',
			start: utc('2022-03'),
			end: utc('2023-08'),
			hardSkills: skills(['Kafka', 'Go']),
			softSkills: skills(['Leadership'])
		},
		{
			name: 'Assistant',
			start: utc('2025-01'),
			hardSkills: skills(['TypeScript']),
			softSkills: []
		}
	]
};
const maintainer = {
	_id: 'bbb',
	title: 'Open-source maintainer',
	projects: [
		{
			name: 'Home lab',
			hardSkills: skills(['kafka', 'KAFKA', 'Kubernetes']),
			softSkills: []
		}
	]
};
const all = [staff, maintainer];

describe('previewTarget', () => {
	it('names a skill by its key, an experience by its id, a project by its position', () => {
		expect(previewTarget.skill('  Kafka ')).toBe('skill:kafka');
		expect(previewTarget.experience('aaa')).toBe('experience:aaa');
		expect(previewTarget.project('aaa', 1)).toBe('project:aaa:1');
	});

	it('tells which skill a target names', () => {
		expect(previewedSkill('skill:kafka')).toBe('kafka');
		expect(previewedSkill('skill:iso:9001')).toBe('iso:9001');
		expect(previewedSkill('project:aaa:1')).toBeNull();
		expect(previewedSkill(null)).toBeNull();
	});
});

describe('skillPreview', () => {
	it('lists only the projects using the skill, with where and when', () => {
		expect(skillPreview(all, 'kafka')).toEqual({
			kind: 'skill',
			// The most used spelling
			title: 'Kafka',
			// Home lab's experience has no dates: it counts as a project, for no time
			caption: 'Used in 2 projects (1 year 6 months)',
			period: '',
			entries: [
				{
					name: 'Event platform',
					context: 'Staff Engineer · Northwind',
					period: 'Mar 2022 – Aug 2023'
				},
				{ name: 'Home lab', context: 'Open-source maintainer', period: '' }
			],
			skills: { hard: [], soft: [] }
		});
	});

	it('matches ignoring case, and counts one project as one', () => {
		expect(skillPreview(all, ' LEADERSHIP ')).toMatchObject({
			title: 'Leadership',
			caption: 'Used in 1 project (1 year 6 months)',
			entries: [{ name: 'Event platform' }]
		});
	});

	it('is nothing for a skill no project uses', () => {
		expect(skillPreview(all, 'cobol')).toBeUndefined();
	});
});

describe('skillMonths', () => {
	const job = (projects: object[], start = '2020-01', end: string | null = '2022-12') => ({
		_id: 'job',
		title: 'Job',
		start: utc(start),
		end: end ? utc(end) : undefined,
		projects
	});
	const go = (name: string, start?: string, end?: string) => ({
		name,
		start: start ? utc(start) : undefined,
		end: end ? utc(end) : undefined,
		hardSkills: skills(['Go']),
		softSkills: []
	});

	it('adds up the months of the projects using the skill, the last month included', () => {
		const experiences = [job([go('One', '2020-01', '2020-03'), go('Two', '2021-06', '2021-07')])];

		expect(skillMonths(experiences, 'go', NOW)).toBe(5);
		expect(skillPreview(experiences, 'go', NOW)?.caption).toBe('Used in 2 projects (5 months)');
	});

	it('counts a month once, however many projects ran that month', () => {
		const experiences = [
			job([
				go('Long', '2020-01', '2020-12'),
				go('Inside', '2020-03', '2020-05'),
				go('Across', '2020-11', '2021-02')
			])
		];

		// Jan 2020 to Feb 2021
		expect(skillMonths(experiences, 'go', NOW)).toBe(14);
		expect(skillPreview(experiences, 'go', NOW)?.caption).toBe(
			'Used in 3 projects (1 year 2 months)'
		);
	});

	it('runs an ongoing project to the current month', () => {
		const experiences = [job([go('Ongoing', '2021-10')], '2021-10', null)];

		// Oct 2021 to Nov 2026
		expect(skillPreview(experiences, 'go', NOW)?.caption).toBe(
			'Used in 1 project (5 years 2 months)'
		);
	});

	it("gives a project without dates its experience's", () => {
		expect(skillMonths([job([go('Undated')])], 'go', NOW)).toBe(36);
	});

	it('counts nothing after the current month', () => {
		// Planned to Jun 2028: Sep 2025 to Nov 2026 so far
		const degree = [job([go('Thesis', '2025-09', '2028-06')], '2025-09', '2028-06')];
		expect(skillPreview(degree, 'go', NOW)?.caption).toBe('Used in 1 project (1 year 3 months)');

		// Not started yet: a project, no time
		const planned = [job([go('Next', '2027-03')], '2026-01', null)];
		expect(skillMonths(planned, 'go', NOW)).toBe(0);
		expect(skillPreview(planned, 'go', NOW)?.caption).toBe('Used in 1 project');
	});

	it('leaves the time out when no project can be placed', () => {
		expect(skillMonths(all, 'kubernetes', NOW)).toBe(0);
		expect(skillPreview(all, 'kubernetes', NOW)?.caption).toBe('Used in 1 project');
	});
});

describe('projectPreview', () => {
	it('gives where the project was done, when, and its skills', () => {
		expect(projectPreview(staff, 0, NOW)).toEqual({
			kind: 'project',
			title: 'Event platform',
			caption: 'Staff Engineer · Northwind',
			period: 'Mar 2022 – Aug 2023 · 1 yr 6 mos',
			entries: [],
			skills: { hard: ['Kafka', 'Go'], soft: ['Leadership'] }
		});
	});

	it('counts an ongoing project up to now, and leaves out dates it does not have', () => {
		expect(projectPreview(staff, 1, NOW)?.period).toBe('Jan 2025 – Present · 1 yr 11 mos');
		expect(projectPreview(maintainer, 0, NOW)?.period).toBe('');
	});

	it('stops a project without an end with its experience, when that one ended', () => {
		const ended = {
			_id: 'ccc',
			title: 'Backend Engineer',
			start: utc('2018-01'),
			end: utc('2020-12'),
			projects: [
				{ name: 'Left open', start: utc('2019-06'), hardSkills: skills(['Go']), softSkills: [] }
			]
		};

		expect(projectPreview(ended, 0, NOW)?.period).toBe('Jun 2019 – Dec 2020 · 1 yr 7 mos');
		expect(experiencePreview(ended, NOW).entries[0].period).toBe('Jun 2019 – Dec 2020');
		expect(skillPreview([ended], 'go')?.entries[0].period).toBe('Jun 2019 – Dec 2020');
	});

	it('is nothing for a position without a project', () => {
		expect(projectPreview(staff, 5, NOW)).toBeUndefined();
	});
});

describe('skillTimeline', () => {
	/** A month as the timeline counts them: months since year 0 */
	const m = (month: string) => {
		const [year, number] = month.split('-').map(Number);
		return year * 12 + number - 1;
	};

	it('places only the projects using the skill, on an axis of whole years around them', () => {
		expect(skillTimeline(all, 'KAFKA ', NOW)).toEqual({
			start: m('2022-01'),
			end: m('2024-01'),
			years: [
				{ year: 2022, month: m('2022-01'), labelled: true },
				{ year: 2023, month: m('2023-01'), labelled: true }
			],
			today: undefined,
			bars: [
				{
					name: 'Event platform',
					context: 'Staff Engineer · Northwind',
					period: 'Mar 2022 – Aug 2023',
					span: { start: m('2022-03'), end: m('2023-09') },
					ongoing: false,
					undated: false
				}
			],
			// Its experience has no dates: it cannot be placed
			undated: [{ name: 'Home lab', context: 'Open-source maintainer', period: '' }]
		});
	});

	it('runs an ongoing project to the current month, which it marks', () => {
		const timeline = skillTimeline(all, 'typescript', NOW);
		expect(timeline?.bars).toMatchObject([
			{ name: 'Assistant', ongoing: true, span: { start: m('2025-01'), end: m('2026-12') } }
		]);
		expect(timeline?.today).toBe(m('2026-12'));

		// In December the current month ends the axis: the mark is on its last line
		const december = skillTimeline(all, 'typescript', new Date('2026-12-15T10:00:00.000Z'));
		expect(december?.today).toBe(m('2027-01'));
		expect(december?.end).toBe(m('2027-01'));
	});

	it('lists the earliest first, whatever the order of the experiences', () => {
		const earlier = {
			_id: 'ddd',
			title: 'Backend Engineer',
			start: utc('2015-01'),
			end: utc('2021-12'),
			projects: [
				{ name: 'Later', start: utc('2019-01'), end: utc('2019-06'), hardSkills: skills(['Go']) },
				{ name: 'First', start: utc('2015-03'), end: utc('2016-02'), hardSkills: skills(['go']) },
				{ name: 'Other', start: utc('2017-01'), end: utc('2017-06'), hardSkills: skills(['PHP']) }
			]
		};
		const timeline = skillTimeline([staff, earlier], 'go', NOW);

		expect(timeline?.bars.map((bar) => bar.name)).toEqual(['First', 'Later', 'Event platform']);
		// A few labels only: it is small (2015 to 2023 inclusive, every 2 years)
		expect(timeline?.years.filter((year) => year.labelled).map((year) => year.year)).toEqual([
			2016, 2018, 2020, 2022
		]);
	});

	it('is nothing when no project using the skill can be placed', () => {
		expect(skillTimeline(all, 'kubernetes', NOW)).toBeUndefined();
		expect(skillTimeline(all, 'cobol', NOW)).toBeUndefined();
	});
});

describe('experiencePreview', () => {
	it('gives where, when, and the names of the projects', () => {
		expect(experiencePreview(staff, NOW)).toEqual({
			kind: 'experience',
			title: 'Staff Engineer',
			caption: 'Northwind · Paris',
			period: 'Mar 2022 – Present · 4 yrs 9 mos',
			entries: [
				{ name: 'Event platform', context: '', period: 'Mar 2022 – Aug 2023' },
				{ name: 'Assistant', context: '', period: 'Jan 2025 – Present' }
			],
			skills: { hard: [], soft: [] }
		});
	});

	it('leaves out what an experience does not have', () => {
		expect(experiencePreview(maintainer, NOW)).toMatchObject({ caption: '', period: '' });
	});
});

describe('resolvePreview', () => {
	it('finds what a target names', () => {
		expect(resolvePreview(all, 'skill:go', NOW)?.title).toBe('Go');
		expect(resolvePreview(all, 'experience:bbb', NOW)?.title).toBe('Open-source maintainer');
		expect(resolvePreview(all, 'project:aaa:1', NOW)?.title).toBe('Assistant');
	});

	it('is nothing for what is gone or not a target', () => {
		for (const target of [
			'skill:cobol',
			'experience:zzz',
			'project:zzz:0',
			'project:aaa:9',
			'project:aaa:x',
			'project:aaa',
			'other:aaa',
			'aaa',
			''
		]) {
			expect(resolvePreview(all, target, NOW), target).toBeUndefined();
		}
	});
});
