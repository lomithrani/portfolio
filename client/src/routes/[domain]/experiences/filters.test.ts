import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { withLocale } from 'portfolio-common';
import type { Experience } from 'portfolio-api/models/database';
import { COLLAPSED_SKILLS, type ExperienceFilters } from '#services/filters.ts';
import Filters from './Filters.svelte';
import source from './Filters.svelte?raw';
import { m } from './Filters.messages.ts';

// The filters' panel as the server renders it: folded, a fixed number of the most used skills
// (nothing is measured), the selected ones always among them, and "All N skills" only when the
// rows leave some out. What a press does (the panel expanded, the focus) is the e2e tests'.

const month = (key: string) => new Date(`${key}-01T00:00:00.000Z`);
type Catalogued = { name: string; category?: string; parent?: string };
const entry = ({ name, category, parent }: Catalogued) => ({
	skill: {
		_id: `skill-${name}`,
		displayName: name,
		...(category ? { category } : {}),
		...(parent ? { parent: { _id: `skill-${parent}`, displayName: parent } } : {})
	},
	level: -1
});
const named = (skills: (string | Catalogued)[]) =>
	skills.map((skill) => entry(typeof skill === 'string' ? { name: skill } : skill));
/** An experience of one project a list of skills, each a month shorter than the one before */
const experience = (
	title: string,
	hard: (string | Catalogued)[],
	soft: (string | Catalogued)[] = []
) =>
	({
		_id: `experience-${title}`,
		title,
		start: month('2020-01'),
		end: month('2021-12'),
		projects: [
			...hard.map((skill, position) => ({
				name: `Technical ${position}`,
				start: month('2020-01'),
				end: new Date(Date.UTC(2021, 11 - position, 1)),
				hardSkills: named([skill]),
				softSkills: []
			})),
			...soft.map((skill, position) => ({
				name: `Soft ${position}`,
				start: month('2020-01'),
				end: new Date(Date.UTC(2021, 11 - position, 1)),
				hardSkills: [],
				softSkills: named([skill])
			}))
		]
	}) as unknown as Experience;

const letters = (count: number, prefix: string) =>
	Array.from({ length: count }, (_, position) => `${prefix} ${String.fromCharCode(65 + position)}`);

const panel = (
	experiences: Experience[],
	filters: ExperienceFilters = { skills: [] },
	resultCount = experiences.length
) => render(Filters, { props: { experiences, filters, resultCount } }).body;

const decode = (text: string) =>
	text
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
/** Every skill tag of a markup: its name (the hidden parts left out), and what it shows beside it */
const tags = (body: string) =>
	[...body.matchAll(/<button\b([^>]*\bdata-preview="skill:[^>]*)>([\s\S]*?)<\/button>/g)].map(
		([, attributes, content]) => ({
			name: decode(
				content
					.replace(/<span\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, '')
					.replace(/<[^>]+>/g, ' ')
			),
			time: decode(/data-skill-time[^>]*>([\s\S]*?)<\/span>/.exec(content)?.[1] ?? ''),
			parts: decode(/data-skill-parts[^>]*>([\s\S]*?)<\/span>/.exec(content)?.[1] ?? ''),
			details: decode(/class="sr-only"[^>]*>([\s\S]*?)<\/span>/.exec(content)?.[1] ?? ''),
			pressed: /aria-pressed="true"/.test(attributes),
			describedBy: /aria-describedby="([^"]*)"/.exec(attributes)?.[1]
		})
	);
/** The markup of one of the two rows */
const row = (body: string, kind: 'hard' | 'soft') =>
	new RegExp(`data-skill-row="${kind}"[^>]*>([\\s\\S]*?</ul>)`).exec(body)?.[1] ?? '';
/** For each item of a row, whether small screens hide it */
const hiddenWhenSmall = (markup: string) =>
	[...markup.matchAll(/<li\b([^>]*)>/g)].map(([, attributes]) =>
		attributes.includes('max-md:hidden')
	);
const toggle = (body: string) =>
	/<button\b[^>]*data-skills-toggle[^>]*>[\s\S]*?<\/button>/.exec(body)?.[0];

const dotnet: Catalogued = { name: '.NET', category: 'framework' };
const core: Catalogued = { name: '.NET Core', category: 'framework', parent: '.NET' };

describe('the filters, folded', () => {
	const career = [
		experience('Backend', [dotnet, core, ...letters(9, 'Tech')], letters(6, 'Soft')),
		experience('Other', ['Tech A'])
	];

	it('shows a fixed number of the most used skills, each with its time', () => {
		const body = panel(career);
		const hard = tags(row(body, 'hard'));
		// '.NET Core' is folded into '.NET', which says so
		expect(hard.map((tag) => tag.name)).toEqual(['.NET', ...letters(7, 'Tech')]);
		expect(hard).toHaveLength(COLLAPSED_SKILLS.hard);
		expect(hard[0]).toMatchObject({ time: '2 yrs', parts: '+1', pressed: false });
		expect(hard[0].details).toBe('Used for 2 years, counting 1 skill that is part of it');
		expect(hard[2]).toMatchObject({ name: 'Tech B', time: '1 yr', parts: '' });
		expect(hard[2].details).toBe('Used for 1 year 9 months');
		expect(tags(row(body, 'soft')).map((tag) => tag.name)).toEqual(letters(5, 'Soft'));
		expect(decode(row(body, 'hard').replace(/<[^>]+>/g, ' '))).toMatch(/^Most used /);
		expect(decode(row(body, 'soft').replace(/<[^>]+>/g, ' '))).toMatch(/^Soft skills /);
	});

	it('describes each tag with a text of its own', () => {
		const body = panel(career);
		const all = tags(body);
		const ids = all.map((tag) => tag.describedBy);
		expect(ids.every(Boolean)).toBe(true);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(body).toContain(`id="${id}"`);
	});

	it('leaves the rest behind a button that names how many skills there are', () => {
		const body = panel(career);
		const button = toggle(body);
		expect(decode(button!.replace(/<[^>]+>/g, ' '))).toBe('All 17 skills');
		expect(button).toContain('aria-expanded="false"');
		const controlled = /aria-controls="([^"]+)"/.exec(button!)?.[1];
		expect(body).toContain(`id="${controlled}"`);
		// After the technical skills, on every screen
		expect(row(body, 'hard')).toContain('data-skills-toggle');
		expect(row(body, 'hard')).not.toContain('"md:hidden"');
		// Every skill, and their search box, only show once it is pressed
		expect(body).not.toContain('type="search"');
		expect(body).not.toContain('data-skill-group');
	});

	it('shows fewer technical skills on small screens, by CSS alone', () => {
		// The eight tags, then the button
		expect(hiddenWhenSmall(row(panel(career), 'hard'))).toEqual([
			...[false, false, false, false, false],
			...[true, true, true],
			false
		]);
	});

	it('always shows the selected skills, and says what the list is filtered by', () => {
		const body = panel(career, { skills: ['.net core', 'tech i', 'soft f', 'tech g'] }, 1);
		const hard = tags(row(body, 'hard'));
		expect(hard.map((tag) => tag.name)).toEqual([
			'.NET',
			...letters(7, 'Tech'),
			'.NET Core',
			'Tech I'
		]);
		expect(hard.filter((tag) => tag.pressed).map((tag) => tag.name)).toEqual([
			'Tech G',
			'.NET Core',
			'Tech I'
		]);
		expect(tags(row(body, 'soft')).at(-1)).toMatchObject({ name: 'Soft F', pressed: true });
		// A selected skill shows on small screens too
		expect(hiddenWhenSmall(row(body, 'hard'))).toEqual([
			...[false, false, false, false, false],
			// 'Tech G', the last of the eight, is selected
			...[true, true, false],
			...[false, false],
			false
		]);
		expect(decode(/role="status"[^>]*>([\s\S]*?)<\/p>/.exec(body)![1])).toBe('1 of 2 experiences');
		expect(decode(/data-filtered-by[^>]*>([\s\S]*?)<\/p>/.exec(body)![1])).toBe(
			'Filtered by .NET Core, Tech I, Soft F, Tech G'
		);
		expect(body).toContain('Clear filters');
	});

	it('keeps a skill folded into the one it is part of, unless it is selected itself', () => {
		const family = [experience('Few', [dotnet, core])];
		expect(tags(panel(family, { skills: ['.net'] })).map((tag) => [tag.name, tag.pressed])).toEqual(
			[['.NET', true]]
		);
		expect(
			tags(panel(family, { skills: ['.net core'] })).map((tag) => [tag.name, tag.pressed])
		).toEqual([
			['.NET', false],
			['.NET Core', true]
		]);
	});

	it('has no button when the rows hold every skill', () => {
		const few = panel([experience('Few', letters(5, 'Tech'), letters(5, 'Soft'))]);
		expect(tags(few)).toHaveLength(10);
		expect(toggle(few)).toBeUndefined();
		expect(few).not.toContain('max-md:hidden');
	});

	it('keeps the button to small screens when only they leave skills out', () => {
		const body = panel([experience('Some', letters(COLLAPSED_SKILLS.hard, 'Tech'))]);
		expect(tags(body)).toHaveLength(COLLAPSED_SKILLS.hard);
		expect(decode(toggle(body)!.replace(/<[^>]+>/g, ' '))).toBe('All 8 skills');
		expect(row(body, 'hard')).toMatch(
			/<li class="md:hidden">\s*(<!--[\s\S]*?-->)*\s*<button[^>]*data-skills-toggle/
		);
	});

	it('counts the experiences for screen readers while nothing is selected', () => {
		const body = panel(career);
		expect(decode(/role="status"[^>]*>([\s\S]*?)<\/p>/.exec(body)![1])).toBe('2 experiences');
		expect(body).not.toContain('Clear filters');
		expect(body).not.toContain('data-filtered-by');
	});

	it("is in the page's language", () => {
		const body = withLocale('fr', () => panel(career, { skills: ['tech a'] }, 2));
		expect(decode(row(body, 'hard').replace(/<[^>]+>/g, ' '))).toMatch(/^Les plus utilisées /);
		expect(decode(row(body, 'soft').replace(/<[^>]+>/g, ' '))).toMatch(/^Savoir-être /);
		expect(tags(body)[0]).toMatchObject({
			time: '2 ans',
			details: 'Utilisée pendant 2 ans, en comptant 1 compétence qui en fait partie'
		});
		expect(decode(toggle(body)!.replace(/<[^>]+>/g, ' '))).toBe('Les 17 compétences');
		expect(decode(/data-filtered-by[^>]*>([\s\S]*?)<\/p>/.exec(body)![1])).toBe('Filtre : Tech A');
	});

	it('gives the time beside a name the contrast of its tag: never an opacity', () => {
		const body = panel(career, { skills: ['tech a'] });
		const spans = [...body.matchAll(/<span\b([^>]*\bdata-skill-(?:time|parts)[^>]*)>/g)].map(
			([, attributes]) => attributes
		);
		expect(spans.length).toBeGreaterThan(3);
		for (const attributes of spans) expect(attributes).not.toMatch(/opacity/);
		// On the selected tag the time has the name's colour; on a plain one, the muted text colour
		const time = (label: string) =>
			new RegExp(
				`<button\\b[^>]*data-preview="skill:${label}"[^>]*>[\\s\\S]*?<span\\b([^>]*data-skill-time[^>]*)>`
			).exec(body)?.[1];
		expect(time('tech a')).toBeDefined();
		expect(time('tech a')).not.toContain('text-surface-700-300');
		expect(time('tech b')).toContain('text-surface-700-300');
	});

	it('says what the search found to screen readers, apart from the count of experiences', () => {
		// The open panel is not rendered on the server: read from the component itself
		const result = /<p\b[^>]*data-skill-search-result[^>]*>/.exec(source.replace(/\s+/g, ' '))?.[0];
		expect(result).toContain('aria-live="polite"');
		expect(result).not.toContain('role=');
		expect(source.match(/role="status"/g)).toHaveLength(1);
		expect(m.skillsFound(1)).toBe('1 skill found');
		expect(m.skillsFound(4)).toBe('4 skills found');
		expect(withLocale('fr', () => [m.skillsFound(1), m.skillsFound(4)])).toEqual([
			'1 compétence trouvée',
			'4 compétences trouvées'
		]);
	});

	it('renders nothing without skills', () => {
		expect(decode(panel([experience('Bare', [])]))).toBe('');
	});
});
