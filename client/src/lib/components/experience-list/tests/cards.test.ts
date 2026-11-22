import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { withLocale } from 'portfolio-common';
import type {
	Experience as ExperienceModel,
	Project as ProjectModel
} from 'portfolio-api/models/database';
import { CARD_SKILLS, isSkillHighlighted, skillIndex } from '#services/filters.ts';
import Experience from '#components/Experience.svelte';
import Project from '#components/Project.svelte';

// The skill tags of a card as the server renders them: the most used on the page first, and
// beyond the first of a kind the rest behind a "+N" button, never one the page points at (it
// matches the filters, or the skill being previewed)

const month = (key: string) => new Date(`${key}-01T00:00:00.000Z`);
const NOW = new Date('2026-11-11T10:00:00.000Z');
type Catalogued = { name: string; parent?: string };
const entries = (skills: (string | Catalogued)[]) =>
	skills.map((skill) => {
		const { name, parent }: Catalogued = typeof skill === 'string' ? { name: skill } : skill;
		return {
			skill: {
				_id: `skill-${name}`,
				displayName: name,
				...(parent ? { parent: { _id: `skill-${parent}`, displayName: parent } } : {})
			},
			level: -1
		};
	});
const project = (
	name: string,
	period: [string, string],
	hard: (string | Catalogued)[],
	soft: string[] = []
) =>
	({
		_id: `project-${name}`,
		name,
		start: month(period[0]),
		end: month(period[1]),
		summary: '',
		hardSkills: entries(hard),
		softSkills: entries(soft)
	}) as unknown as ProjectModel;

const letters = (count: number, prefix = 'Tech') =>
	Array.from({ length: count }, (_, position) => `${prefix} ${String.fromCharCode(65 + position)}`);

const textOf = (markup: string) =>
	markup
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, '')
		.trim();

/** The names of the tags of a kind, in order, then the button after them when there is one */
const list = (body: string, label: string) => {
	const markup = new RegExp(`<ul[^>]*aria-label="${label}"[^>]*>([\\s\\S]*?)</ul>`).exec(body)?.[1];
	if (markup === undefined) return undefined;
	const button = /<button\b([^>]*)>([\s\S]*?)<\/button>/.exec(markup);
	return {
		tags: [
			...markup.matchAll(/<span\b[^>]*data-preview="skill:[^"]*"[^>]*>([\s\S]*?)<\/span>/g)
		].map(([, text]) => textOf(text)),
		highlighted: [...markup.matchAll(/<span\b[^>]*data-highlighted[^>]*>([\s\S]*?)<\/span>/g)].map(
			([, text]) => textOf(text)
		),
		button: button && {
			text: textOf(button[2]),
			name: /aria-label="([^"]*)"/.exec(button[1])?.[1],
			expanded: /aria-expanded="true"/.test(button[1])
		}
	};
};

describe("a project's skill tags", () => {
	// Ranked on the page by time: Go (2 years), Kafka (1 year), Rust (6 months)
	const page = [
		{
			projects: [
				project('Long', ['2020-01', '2021-12'], ['Go']),
				project('Middle', ['2020-01', '2020-12'], ['kafka']),
				project('Short', ['2020-01', '2020-06'], ['Rust'], ['Mentoring'])
			]
		}
	];
	const skills = skillIndex(page, NOW);
	const card = (
		props: Partial<Parameters<typeof render<typeof Project>>[1]['props']> & {
			project: ProjectModel;
		}
	) => render(Project, { props: { experienceId: 'e1', ...props } }).body;

	it('lists the most used on the page first, whatever order they were typed in', () => {
		const body = card({
			project: project(
				'Mixed',
				['2022-01', '2022-03'],
				['Rust', 'New', 'Kafka', 'Go'],
				['Mentoring']
			),
			skills
		});
		// 'New' is not ranked (the page's skills were read before it): last
		expect(list(body, 'Technical skills')?.tags).toEqual(['Go', 'Kafka', 'Rust', 'New']);
		expect(list(body, 'Soft skills')?.tags).toEqual(['Mentoring']);
		expect(list(body, 'Technical skills')?.button).toBeNull();
	});

	it("keeps the order they are stored in without the page's ranking", () => {
		const body = card({
			project: project('Mixed', ['2022-01', '2022-03'], ['Rust', 'Kafka', 'Go'])
		});
		expect(list(body, 'Technical skills')?.tags).toEqual(['Rust', 'Kafka', 'Go']);
		expect(list(body, 'Soft skills')).toBeUndefined();
	});

	it('folds the tags beyond the first behind a button that says how many', () => {
		const body = card({
			project: project('Wide', ['2022-01', '2022-03'], letters(9), letters(8, 'Soft'))
		});
		expect(list(body, 'Technical skills')).toEqual({
			tags: letters(CARD_SKILLS.shown),
			highlighted: [],
			button: { text: '+3', name: 'Show 3 more skills', expanded: false }
		});
		expect(list(body, 'Soft skills')?.button).toEqual({
			text: '+2',
			name: 'Show 2 more skills',
			expanded: false
		});
		// One tag more is shown rather than a "+1"
		const seven = card({ project: project('Seven', ['2022-01', '2022-03'], letters(7)) });
		expect(list(seven, 'Technical skills')).toMatchObject({ tags: letters(7), button: null });
	});

	it('never hides a tag that matches the filters', () => {
		const filters = { skills: ['tech h'] };
		const body = card({
			project: project('Wide', ['2022-01', '2022-03'], letters(9)),
			highlightSkill: (name) => isSkillHighlighted(filters, name)
		});
		expect(list(body, 'Technical skills')).toEqual({
			tags: [...letters(6), 'Tech H'],
			highlighted: ['Tech H'],
			button: { text: '+2', name: 'Show 2 more skills', expanded: false }
		});
	});

	it('never hides a tag of the skill being previewed, or of a skill that is part of it', () => {
		// All used as long: ranked by name, 'Zeta Core' last
		const family = [
			{
				projects: [
					project(
						'Wide',
						['2022-01', '2022-03'],
						[{ name: 'Zeta Core', parent: 'Zeta' }, ...letters(8)]
					)
				]
			}
		];
		const index = skillIndex(family, NOW);
		const [wide] = family[0].projects;
		const shown = (previewSkill: string | null) =>
			list(card({ project: wide, skills: index, previewSkill }), 'Technical skills')?.tags;
		expect(shown(null)).toEqual(letters(CARD_SKILLS.shown));
		expect(shown('zeta core')).toEqual([...letters(CARD_SKILLS.shown), 'Zeta Core']);
		expect(shown('zeta')).toEqual([...letters(CARD_SKILLS.shown), 'Zeta Core']);
		expect(shown('tech a')).toEqual(letters(CARD_SKILLS.shown));
	});

	it("names the button in the page's language", () => {
		const body = withLocale('fr', () =>
			card({ project: project('Wide', ['2022-01', '2022-03'], letters(8)) })
		);
		expect(list(body, 'Compétences techniques')?.button).toEqual({
			text: '+2',
			name: 'Afficher 2 compétences de plus',
			expanded: false
		});
	});
});

describe("an experience's card", () => {
	it("hands the page's ranking and families to its projects", () => {
		const experience = {
			_id: 'e1',
			title: 'Backend developer',
			type: 'professional',
			start: month('2020-01'),
			end: month('2021-12'),
			projects: [
				project('Long', ['2020-01', '2021-12'], ['Go', { name: '.NET Core', parent: '.NET' }]),
				project('Short', ['2021-01', '2021-06'], ['Kafka', 'Go'])
			]
		} as unknown as ExperienceModel;
		const skills = skillIndex([experience], NOW);
		const body = render(Experience, { props: { experience, skills, previewSkill: '.net' } }).body;
		// 'Go' was used the longest: first in both projects
		expect(body.indexOf('>Go<')).toBeLessThan(body.indexOf('>Kafka<'));
		const short = body.slice(body.indexOf('Short'));
		expect(short.indexOf('>Go<')).toBeLessThan(short.indexOf('>Kafka<'));
		// Previewing '.NET' outlines the project using a skill that is part of it, and only it
		expect(body.match(/data-previewed/g)).toHaveLength(1);
		expect(body.indexOf('data-previewed')).toBeLessThan(body.indexOf('Short'));
	});
});
