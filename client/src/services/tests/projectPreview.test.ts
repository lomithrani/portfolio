import { describe, it, expect } from 'vitest';
import {
	experiencePreview,
	previewTarget,
	previewedSkill,
	projectPreview,
	resolvePreview,
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
			caption: 'Used in 2 projects',
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
			caption: 'Used in 1 project',
			entries: [{ name: 'Event platform' }]
		});
	});

	it('is nothing for a skill no project uses', () => {
		expect(skillPreview(all, 'cobol')).toBeUndefined();
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
