import {
	expect,
	request as playwrightRequest,
	test,
	type Browser,
	type Locator,
	type Page
} from '@playwright/test';
import { stubApi } from './support/api';
import {
	API_URL,
	JWT_SECRET,
	blockGoogle,
	gotoHydrated,
	ownerSession,
	signIn,
	toasts
} from './support/owner';

// The skills of a portfolio as the catalogue knows them: the filters' panel of the experiences
// page (the most used first, with their time, a family folded into the skill its skills are part
// of), a card's tags, the previews, and the suggestions of the owner's editor.
// They run against the e2e seed (`bun run --cwd server seed:e2e`): the portfolio 'e2e-skills',
// whose experiences that seed sets back on every run (E2E_SKILLS_EXPERIENCES of
// server/tests/seedE2e.ts), and the curated catalogue (server/tests/seedSkills.ts). This file only
// reads: nothing here saves an experience, so its tests run in parallel and again without a seed.

test.describe.configure({ mode: 'parallel' });

const DOMAIN = 'e2e-skills';
const PAGE = `/${DOMAIN}/experiences`;

// What the seed gives the portfolio, all in the past (the times never change with the day):
// - Lead Platform Engineer (Brightloop): Billing platform, 36 months, then Observability
//   rollout, 24 months, which has ten technical skills;
// - Software Engineer (Tidewater Labs): Legacy invoicing, 18 months, then Data pipelines, 42;
// - Open-source maintainer: CLI toolkit, 8 months, during Billing platform.
// '.NET' is never used itself: '.NET Core' (Billing, Observability) and '.NET Framework'
// (Legacy invoicing) are part of it. 'K8s' was typed on Billing platform: the catalogue shows it
// as Kubernetes. Quorvex, Facilitation and Public speaking are not in the catalogue: pending.
const EXPERIENCES = {
	lead: 'Lead Platform Engineer',
	maintainer: 'Open-source maintainer',
	engineer: 'Software Engineer'
};

/**
 * The technical skills the folded panel shows (a skill that is part of another is folded into
 * it), the most used first, each with its time as its tag reads it and as it is said in full
 */
const MOST_USED = [
	{ name: 'Git', time: '10 yrs', used: 'Used for 10 years' },
	{ name: 'Docker', time: '8 yrs', used: 'Used for 8 years 6 months' },
	{ name: 'SQL', time: '8 yrs', used: 'Used for 8 years' },
	{
		name: '.NET',
		time: '6 yrs',
		used: 'Used for 6 years 6 months, counting 2 skills that are part of it'
	},
	{ name: 'Kafka', time: '5 yrs', used: 'Used for 5 years 6 months' },
	{ name: 'C#', time: '4 yrs', used: 'Used for 4 years 6 months' },
	{ name: 'PostgreSQL', time: '3 yrs', used: 'Used for 3 years 6 months' },
	{ name: 'Kubernetes', time: '3 yrs', used: 'Used for 3 years' }
];
/** How many of them a small screen shows (COLLAPSED_SKILLS of client/src/services/filters.ts) */
const MOST_USED_SMALL = 5;
const SOFT = ['Communication', 'Leadership', 'Teamwork', 'Problem solving', 'Mentoring'];
/** Every skill of the portfolio, '.NET' included: 18 technical ones and 7 soft ones */
const TOTAL = 25;
/** The expanded panel: the catalogue's categories in its order, each the most used first */
const CATEGORIES = [
	{ key: 'language', name: 'Languages 5', skills: ['SQL', 'C#', 'TypeScript', 'Python', 'Go'] },
	{
		key: 'framework',
		name: 'Frameworks & runtimes 3',
		skills: ['.NET', '.NET Core', '.NET Framework']
	},
	{
		key: 'infrastructure',
		name: 'Cloud & infrastructure 3',
		skills: ['Docker', 'Kubernetes', 'Terraform']
	},
	{
		key: 'data',
		name: 'Data & observability 5',
		skills: ['Kafka', 'PostgreSQL', 'Grafana', 'Prometheus', 'Redis']
	},
	{ key: 'tool', name: 'Tools 1', skills: ['Git'] },
	// Not in the catalogue: no category
	{ key: 'other', name: 'Other 1', skills: ['Quorvex'] },
	{ key: 'soft', name: 'Soft skills 7', skills: [...SOFT, 'Facilitation', 'Public speaking'] }
];

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

const filtersOf = (page: Page, name = 'Filter experiences') => page.getByRole('region', { name });
const mostUsed = (page: Page) => filtersOf(page).getByRole('group', { name: 'Most used' });
const softSkills = (page: Page) => filtersOf(page).getByRole('group', { name: 'Soft skills' });
/** A skill's tag in the filters: named by the skill alone (its time is its description) */
const tag = (scope: Locator, name: string) => scope.getByRole('button', { name, exact: true });
const allSkills = (page: Page) =>
	filtersOf(page).getByRole('button', { name: `All ${TOTAL} skills`, exact: true });
const showLess = (page: Page) =>
	filtersOf(page).getByRole('button', { name: 'Show less', exact: true });
const headings = (page: Page) => page.getByRole('heading', { level: 2 });
const card = (page: Page, title: string) =>
	page
		.locator('article')
		.filter({ has: page.getByRole('heading', { level: 2, name: title, exact: true }) });
/** A project of a card, by the start of its heading (one the filters match says so after its name) */
const projectOf = (page: Page, title: string, name: string) =>
	card(page, title)
		.locator('article')
		.filter({ has: page.locator('h3').filter({ hasText: new RegExp(`^${name}`) }) });
const technicalTags = (project: Locator) =>
	project.getByRole('list', { name: 'Technical skills' }).locator('[data-preview]');
const search = (page: Page) => new URL(page.url()).searchParams;

/**
 * The names of the skill tags that show in `scope`, in the page's order: what each tag reads
 * beside its time and its "+N" (which are its description), hidden tags left out
 */
const tagNames = (scope: Locator) =>
	scope.locator('button[data-preview]').evaluateAll((buttons) =>
		buttons
			.filter((button) => button.getClientRects().length > 0)
			.map((button) => {
				const copy = button.cloneNode(true) as HTMLElement;
				for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
				return (copy.textContent ?? '').trim();
			})
	);

/** Those names, once the page shows them (a press or a text typed is followed by a render) */
const expectTags = (scope: Locator, names: string[], message?: string) =>
	expect.poll(() => tagNames(scope), message).toEqual(names);

/** Whether nothing of the page is wider than the screen: neither the document nor the page's scroller */
const fitsTheScreen = (page: Page) =>
	page.evaluate(() => {
		const main = document.querySelector('#page');
		return (
			document.documentElement.scrollWidth <= window.innerWidth &&
			(!main || main.scrollWidth <= main.clientWidth)
		);
	});

test.beforeEach(async ({ page }) => {
	await blockGoogle(page);
});

test.describe('the skills a portfolio is filtered by', () => {
	test('folded, the panel shows the most used skills first, with their time', async ({ page }) => {
		await page.setViewportSize(DESKTOP);
		await gotoHydrated(page, PAGE);
		await expect(headings(page)).toHaveText([
			EXPERIENCES.lead,
			EXPERIENCES.maintainer,
			EXPERIENCES.engineer
		]);

		// The technical skills used the longest, then the soft ones: by time, never by name
		await expectTags(
			mostUsed(page),
			MOST_USED.map(({ name }) => name)
		);
		await expectTags(softSkills(page), SOFT);
		for (const { name, time, used } of MOST_USED) {
			const skill = tag(mostUsed(page), name);
			await expect(skill.locator('[data-skill-time]')).toHaveText(time);
			// In full for screen readers, as the tag's description
			await expect(skill).toHaveAccessibleDescription(used);
			await expect(skill).toHaveAttribute('aria-pressed', 'false');
		}
		// 'K8s' as its owner typed it is the catalogue's Kubernetes
		await expect(filtersOf(page).getByText('K8s')).toHaveCount(0);

		// A skill that others are part of counts their time, and says how many they are
		await expect(tag(mostUsed(page), '.NET').locator('[data-skill-parts]')).toHaveText('+2');
		await expect(filtersOf(page).locator('[data-skill-parts]')).toHaveCount(1);
		// They stay folded into it
		await expect(tag(filtersOf(page), '.NET Core')).toHaveCount(0);

		// Every skill is one press away, at the end of the first row
		const toggle = allSkills(page);
		await expect(toggle).toBeVisible();
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await expect(mostUsed(page).getByRole('button').last()).toHaveText(`All ${TOTAL} skills`);
		await expect(filtersOf(page).getByRole('searchbox')).toHaveCount(0);
		// Nothing is filtered: the count is for screen readers alone
		await expect(filtersOf(page).getByRole('status')).toHaveText('3 experiences');
		await expect(filtersOf(page).getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
		expect(await fitsTheScreen(page)).toBe(true);
	});

	test('on a phone it shows fewer technical skills, and nothing runs off the screen', async ({
		page
	}) => {
		await page.setViewportSize(PHONE);
		await gotoHydrated(page, PAGE);

		await expectTags(
			mostUsed(page),
			MOST_USED.slice(0, MOST_USED_SMALL).map(({ name }) => name)
		);
		// The rest is hidden, to assistive technology too
		await expect(mostUsed(page).getByRole('button')).toHaveCount(MOST_USED_SMALL + 1);
		await expectTags(softSkills(page), SOFT);
		await expect(tag(mostUsed(page), '.NET').locator('[data-skill-parts]')).toHaveText('+2');
		await expect(tag(mostUsed(page), 'Git').locator('[data-skill-time]')).toHaveText('10 yrs');
		await expect(allSkills(page)).toBeVisible();
		await expect(allSkills(page)).toHaveAttribute('aria-expanded', 'false');
		expect(await fitsTheScreen(page)).toBe(true);

		// Every tag is inside the panel, which is inside the screen
		const panel = (await filtersOf(page).boundingBox())!;
		expect(panel.x).toBeGreaterThanOrEqual(0);
		expect(panel.x + panel.width).toBeLessThanOrEqual(PHONE.width);
		for (const button of await filtersOf(page).getByRole('button').all()) {
			const box = (await button.boundingBox())!;
			expect(box.x, await button.innerText()).toBeGreaterThanOrEqual(panel.x);
			expect(box.x + box.width, await button.innerText()).toBeLessThanOrEqual(
				panel.x + panel.width + 0.5
			);
		}

		// Unfolded, every skill and the search still fit
		await allSkills(page).click();
		await expect(showLess(page)).toBeFocused();
		await expect(filtersOf(page).locator('button[data-preview]')).toHaveCount(TOTAL);
		expect(await fitsTheScreen(page)).toBe(true);
	});

	test('"All skills" unfolds them in place, by category, with a search, and "Show less" folds them again', async ({
		page
	}) => {
		await page.setViewportSize(DESKTOP);
		await gotoHydrated(page, PAGE);
		const filters = filtersOf(page);
		const groups = filters.locator('[data-skill-group]');

		// With the keyboard: the focus stays on the button, which now folds
		await allSkills(page).focus();
		await page.keyboard.press('Enter');
		await expect(showLess(page)).toBeFocused();
		await expect(showLess(page)).toHaveAttribute('aria-expanded', 'true');
		await expect(allSkills(page)).toHaveCount(0);
		await expect(filters).toHaveAttribute('data-skills-expanded');
		// The button names what it shows and hides
		const controlled = await showLess(page).getAttribute('aria-controls');
		await expect(page.locator(`[id="${controlled}"]`)).toHaveRole('group');

		// Every skill once, under the catalogue's categories in its order (soft skills last, those
		// it does not know right before), each the most used first
		await expect(groups).toHaveCount(CATEGORIES.length);
		for (const [index, category] of CATEGORIES.entries()) {
			const group = groups.nth(index);
			await expect(group).toHaveAttribute('data-skill-group', category.key);
			await expect(group).toHaveAccessibleName(category.name);
			await expectTags(group, category.skills, category.name);
		}
		await expect(filters.locator('button[data-preview]')).toHaveCount(TOTAL);
		await expect(filters.getByText('Sorted by time used')).toBeVisible();
		await expect(
			tag(groups.nth(0), 'Go').locator('[data-skill-time]'),
			'months, under a year'
		).toHaveText('8 mos');

		// A skill is drawn with the skills that are part of it, as one list
		const family = filters.getByRole('list', { name: '.NET and the skills that are part of it' });
		await expectTags(family, ['.NET', '.NET Core', '.NET Framework']);
		await expect(filters.locator('[data-skill-family]')).toHaveCount(1);
		// The count is said by the list here, not on the tag
		await expect(filters.locator('[data-skill-parts]')).toHaveCount(0);
		await expect(tag(family, '.NET Core')).toHaveAccessibleDescription('Used for 5 years');
		await expect(tag(family, '.NET Framework')).toHaveAccessibleDescription(
			'Used for 1 year 6 months'
		);

		// The search narrows them down, whatever the case
		const box = filters.getByRole('searchbox', { name: 'Search skills' });
		await expect(box).toHaveAttribute('placeholder', `Search ${TOTAL} skills`);
		await box.fill('KAF');
		await expectTags(filters, ['Kafka']);
		// What it found is said to screen readers, apart from the count of experiences
		const found = filters.locator('[data-skill-search-result]');
		await expect(found).toHaveAttribute('aria-live', 'polite');
		await expect(found).toHaveText('1 skill found');
		await expect(groups).toHaveCount(1);
		await expect(groups).toHaveAccessibleName('Data & observability 1');
		// A skill that matches while the skill it is part of does not is listed alone
		await box.fill('core');
		await expectTags(filters, ['.NET Core']);
		await expect(filters.locator('[data-skill-family]')).toHaveCount(0);
		await box.fill('.net');
		await expectTags(filters, ['.NET', '.NET Core', '.NET Framework']);
		await expect(filters.locator('[data-skill-family]')).toHaveCount(1);
		// No match: said, with what was typed
		await box.fill('  cobol ');
		await expect(filters.getByText('No skill matches “cobol”.')).toBeVisible();
		await expect(found).toHaveText('No skill matches “cobol”.');
		await expect(filters.locator('button[data-preview]')).toHaveCount(0);
		await expect(groups).toHaveCount(0);
		// The page's experiences are not what the search filters
		await expect(headings(page)).toHaveCount(3);

		// "Show less": the most used again, the search gone and forgotten, the focus on the button
		// that took its place
		await showLess(page).click();
		await expect(allSkills(page)).toBeFocused();
		await expect(allSkills(page)).toHaveAttribute('aria-expanded', 'false');
		await expect(filters.getByRole('searchbox')).toHaveCount(0);
		await expect(filters).not.toHaveAttribute('data-skills-expanded');
		await expectTags(
			mostUsed(page),
			MOST_USED.map(({ name }) => name)
		);
		await allSkills(page).click();
		await expect(box).toHaveValue('');
		await expect(filters.locator('button[data-preview]')).toHaveCount(TOTAL);
	});

	test('a skill that others are part of keeps their experiences; one of them matches only itself', async ({
		page
	}) => {
		await page.setViewportSize(DESKTOP);
		await gotoHydrated(page, PAGE);
		const filters = filtersOf(page);
		const status = filters.getByRole('status');
		const filteredBy = filters.locator('[data-filtered-by]');

		// '.NET' itself is on no project: its filter keeps the experiences of '.NET Core' and of
		// '.NET Framework'
		await tag(mostUsed(page), '.NET').click();
		await expect(tag(mostUsed(page), '.NET')).toHaveAttribute('aria-pressed', 'true');
		await expect(status).toHaveText('2 of 3 experiences');
		await expect(filteredBy).toHaveText('Filtered by .NET');
		await expect(headings(page)).toHaveText([EXPERIENCES.lead, EXPERIENCES.engineer]);
		await expect.poll(() => search(page).getAll('skills')).toEqual(['.net']);
		// Their projects stand out in their cards, their tags too
		for (const [title, name] of [
			[EXPERIENCES.lead, 'Billing platform'],
			[EXPERIENCES.lead, 'Observability rollout'],
			[EXPERIENCES.engineer, 'Legacy invoicing']
		]) {
			await expect(projectOf(page, title, name), name).toHaveAttribute('data-matched');
		}
		await expect(projectOf(page, EXPERIENCES.engineer, 'Data pipelines')).not.toHaveAttribute(
			'data-matched'
		);
		await expect(page.locator('article [data-highlighted]')).toHaveText([
			'.NET Core',
			'.NET Core',
			'.NET Framework'
		]);
		// Unfolded, the skills that are part of it are marked as matching with it, not as pressed
		await allSkills(page).click();
		for (const name of ['.NET Core', '.NET Framework']) {
			await expect(tag(filters, name)).toHaveAttribute('data-included');
			await expect(tag(filters, name)).toHaveAttribute('aria-pressed', 'false');
		}

		// One of them alone: only its own experience, and the other skill of the family is no match
		await tag(filters, '.NET').click();
		await expect(status).toHaveText('3 experiences');
		await expect.poll(() => search(page).getAll('skills')).toEqual([]);
		await tag(filters, '.NET Framework').click();
		await expect(status).toHaveText('1 of 3 experiences');
		await expect(filteredBy).toHaveText('Filtered by .NET Framework');
		await expect(headings(page)).toHaveText([EXPERIENCES.engineer]);
		await expect.poll(() => search(page).getAll('skills')).toEqual(['.net framework']);
		await expect(projectOf(page, EXPERIENCES.engineer, 'Legacy invoicing')).toHaveAttribute(
			'data-matched'
		);
		await expect(page.locator('article [data-highlighted]')).toHaveText(['.NET Framework']);
		await expect(tag(filters, '.NET')).toHaveAttribute('aria-pressed', 'false');
		await expect(tag(filters, '.NET')).not.toHaveAttribute('data-included');

		// Folded again, the selected skill stays in sight although it is folded into '.NET'
		await showLess(page).click();
		await expectTags(mostUsed(page), [...MOST_USED.map(({ name }) => name), '.NET Framework']);
		await expect(tag(mostUsed(page), '.NET Framework')).toHaveAttribute('aria-pressed', 'true');

		// A shared link renders the same selection (on the server, then hydrated), both skills
		await gotoHydrated(page, `${PAGE}?skills=.net&skills=go`);
		await expect(status).toHaveText('3 of 3 experiences');
		await expect(filteredBy).toHaveText('Filtered by .NET, Go');
		await filters.getByRole('button', { name: 'Clear filters' }).click();
		await expect(status).toHaveText('3 experiences');
		await expect.poll(() => search(page).toString()).toBe('');
		// The panel keeps the focus, not the page's body
		await expect(filters).toBeFocused();
	});

	test('the timeline marks the projects of a whole family', async ({ page }) => {
		await page.setViewportSize(DESKTOP);
		await gotoHydrated(page, `${PAGE}?view=timeline&skills=.net`);
		const bar = (name: string) =>
			page
				.getByRole('region', { name: 'Timeline' })
				.locator('[data-timeline-project]')
				.filter({ hasText: name });

		await expect(filtersOf(page).getByRole('status')).toHaveText('2 of 3 experiences');
		for (const name of ['Billing platform', 'Observability rollout', 'Legacy invoicing']) {
			await expect(bar(name), name).toHaveAttribute('data-matched');
		}
		for (const name of ['Data pipelines', 'CLI toolkit']) {
			await expect(bar(name), name).not.toHaveAttribute('data-matched');
		}

		// One skill of the family: its own project alone
		await tag(mostUsed(page), '.NET').click();
		await allSkills(page).click();
		await tag(filtersOf(page), '.NET Framework').click();
		await expect(bar('Legacy invoicing')).toHaveAttribute('data-matched');
		for (const name of ['Billing platform', 'Observability rollout', 'Data pipelines']) {
			await expect(bar(name), name).not.toHaveAttribute('data-matched');
		}
		await expect.poll(() => search(page).toString()).toBe('view=timeline&skills=.net+framework');
	});

	test('a selected skill that is not among the most used stays in sight while folded', async ({
		page
	}) => {
		// Go is the technical skill used the least: far beyond what the row shows, on any screen
		for (const { viewport, shown } of [
			{ viewport: DESKTOP, shown: MOST_USED.length },
			{ viewport: PHONE, shown: MOST_USED_SMALL }
		]) {
			await page.setViewportSize(viewport);
			await gotoHydrated(page, `${PAGE}?skills=go&skills=public+speaking`);
			const label = `at ${viewport.width} px`;
			await expectTags(
				mostUsed(page),
				[...MOST_USED.slice(0, shown).map(({ name }) => name), 'Go'],
				label
			);
			await expectTags(softSkills(page), [...SOFT, 'Public speaking'], label);
			await expect(tag(mostUsed(page), 'Go')).toHaveAttribute('aria-pressed', 'true');
			await expect(tag(mostUsed(page), 'Go').locator('[data-skill-time]')).toHaveText('8 mos');
			await expect(filtersOf(page).getByRole('status')).toHaveText('1 of 3 experiences');
			await expect(headings(page)).toHaveText([EXPERIENCES.maintainer]);
			expect(await fitsTheScreen(page), label).toBe(true);
		}

		// Unselected, it leaves the row: the focus goes to "All skills", not back to the page's body
		await tag(softSkills(page), 'Public speaking').click();
		await expectTags(softSkills(page), SOFT);
		await expect(allSkills(page)).toBeFocused();
		await expect.poll(() => search(page).getAll('skills')).toEqual(['go']);
		// One of the most used, selected on a phone, is not shown twice
		await tag(mostUsed(page), 'Kafka').click();
		await expectTags(mostUsed(page), [
			...MOST_USED.slice(0, MOST_USED_SMALL).map(({ name }) => name),
			'Go'
		]);
		await page.setViewportSize(DESKTOP);
		await tag(mostUsed(page), 'Kubernetes').click();
		await page.setViewportSize(PHONE);
		await expectTags(mostUsed(page), [
			...MOST_USED.slice(0, MOST_USED_SMALL).map(({ name }) => name),
			'Kubernetes',
			'Go'
		]);
	});
});

test.describe("a card's skills", () => {
	test('are listed the most used first, the rest behind "+N" until it is pressed', async ({
		page
	}) => {
		await page.setViewportSize(DESKTOP);
		await gotoHydrated(page, PAGE);
		const project = projectOf(page, EXPERIENCES.lead, 'Observability rollout');
		const technical = project.getByRole('list', { name: 'Technical skills' });
		const more = project.getByRole('button', { name: 'Show 4 more skills', exact: true });
		// Its ten technical skills, the most used on the page first (not as they were typed)
		const first = ['Git', 'Docker', 'Kafka', '.NET Core', 'Quorvex', 'Grafana'];
		const folded = ['Prometheus', 'Redis', 'Terraform', 'TypeScript'];

		await expect(technicalTags(project)).toHaveText(first);
		await expect(more).toHaveText('+4');
		await expect(more).toHaveAttribute('aria-expanded', 'false');
		// The folded ones are not in the page at all
		for (const name of folded) await expect(technical.getByText(name)).toHaveCount(0);
		// Its three soft skills fit: no button
		await expect(project.getByRole('list', { name: 'Soft skills' }).locator('li')).toHaveText([
			'Communication',
			'Leadership',
			'Facilitation'
		]);
		await expect(project.locator('[data-more-skills]')).toHaveCount(1);
		// A project with as many tags as a card shows has no button either
		await expect(
			projectOf(page, EXPERIENCES.lead, 'Billing platform').locator('[data-more-skills]')
		).toHaveCount(0);
		// 'K8s' as typed is shown as the skill it stands for
		await expect(technicalTags(projectOf(page, EXPERIENCES.lead, 'Billing platform'))).toHaveText([
			'Git',
			'Docker',
			'SQL',
			'.NET Core',
			'C#',
			'Kubernetes'
		]);

		// Pressed with the keyboard: they show in place, and the button folds them again
		await more.focus();
		await page.keyboard.press('Enter');
		await expect(technicalTags(project)).toHaveText([...first, ...folded]);
		const fewer = project.getByRole('button', { name: 'Fewer skills', exact: true });
		await expect(fewer).toBeFocused();
		await expect(fewer).toHaveAttribute('aria-expanded', 'true');
		await page.keyboard.press('Enter');
		await expect(technicalTags(project)).toHaveText(first);
		await expect(more).toBeFocused();
	});

	test('never fold away a tag the page is filtered by', async ({ page }) => {
		await page.setViewportSize(DESKTOP);
		// TypeScript is the last of the project's tags, behind "+4" without the filter
		await gotoHydrated(page, `${PAGE}?skills=typescript`);
		const project = projectOf(page, EXPERIENCES.lead, 'Observability rollout');

		await expect(headings(page)).toHaveText([EXPERIENCES.lead]);
		await expect(technicalTags(project)).toHaveText([
			'Git',
			'Docker',
			'Kafka',
			'.NET Core',
			'Quorvex',
			'Grafana',
			'TypeScript'
		]);
		await expect(project.locator('[data-highlighted]')).toHaveText(['TypeScript']);
		await expect(project).toHaveAttribute('data-matched');
		await expect(
			project.getByRole('button', { name: 'Show 3 more skills', exact: true })
		).toHaveText('+3');
		// The filter's own tag shows in the folded panel too
		await expect(tag(mostUsed(page), 'TypeScript')).toHaveAttribute('aria-pressed', 'true');

		// Without the filter it folds again
		await filtersOf(page).getByRole('button', { name: 'Clear filters' }).click();
		await expect(technicalTags(project)).toHaveCount(6);
		await expect(
			project.getByRole('button', { name: 'Show 4 more skills', exact: true })
		).toBeVisible();
	});

	test('on a phone the tags and their "+N" stay inside the card', async ({ page }) => {
		await page.setViewportSize(PHONE);
		await gotoHydrated(page, PAGE);
		const project = projectOf(page, EXPERIENCES.lead, 'Observability rollout');

		await project.getByRole('button', { name: 'Show 4 more skills', exact: true }).click();
		await expect(technicalTags(project)).toHaveCount(10);
		expect(await fitsTheScreen(page)).toBe(true);
	});
});

test.describe('the preview of a skill', () => {
	test('of a skill that others are part of counts its family, and says so', async ({ page }) => {
		await page.setViewportSize(DESKTOP);
		await gotoHydrated(page, PAGE);
		const preview = page.getByRole('tooltip');
		const net = tag(mostUsed(page), '.NET');

		// With the keyboard: the tag before it, then Tab
		await tag(mostUsed(page), 'SQL').focus();
		await page.keyboard.press('Tab');
		await expect(net).toBeFocused();
		await expect(preview).toBeVisible();
		await expect(preview).toContainText('.NET');
		// The projects of '.NET Core' and '.NET Framework', and their months, each once
		await expect(preview).toContainText('Used in 3 projects (6 years 6 months)');
		await expect(preview.locator('[data-preview-family]')).toHaveText(
			'Counts the skills that are part of it: .NET Core, .NET Framework'
		);
		await expect(preview.getByRole('listitem')).toHaveText([
			/Billing platform/,
			/Observability rollout/,
			/Legacy invoicing/
		]);
		// The preview describes the tag while it shows, in place of its time
		await expect(net).toHaveAttribute('aria-describedby', (await preview.getAttribute('id'))!);
		// And points at the family's projects on the page, the card that has none stepping back
		await expect(page.locator('article[data-previewed]')).toHaveText([
			/Billing platform/,
			/Observability rollout/,
			/Legacy invoicing/
		]);
		await expect(card(page, EXPERIENCES.maintainer)).toHaveAttribute('data-muted');
		await expect(card(page, EXPERIENCES.lead)).not.toHaveAttribute('data-muted');

		// Closed, the tag is described by its time again
		await page.keyboard.press('Escape');
		await expect(preview).toHaveCount(0);
		await expect(net).toHaveAccessibleDescription(MOST_USED[3].used);
		await expect(page.locator('[data-muted], [data-previewed]')).toHaveCount(0);

		// A skill of the family, on a card: its own projects alone, and no family to count
		await card(page, EXPERIENCES.engineer).getByText('.NET Framework', { exact: true }).hover();
		await expect(preview).toContainText('Used in 1 project (1 year 6 months)');
		await expect(preview.locator('[data-preview-family]')).toHaveCount(0);
		await expect(preview.getByRole('listitem')).toHaveText([/Legacy invoicing/]);
	});
});

test.describe('in French', () => {
	test('the panel reads in French, folded and unfolded', async ({ page }) => {
		await page.setViewportSize(DESKTOP);
		await gotoHydrated(page, `${PAGE}?lang=fr`);
		const filters = filtersOf(page, 'Filtrer les expériences');
		const most = filters.getByRole('group', { name: 'Les plus utilisées' });
		const soft = filters.getByRole('group', { name: 'Savoir-être' });

		// The same skills, in the same order: names are not translated, times are
		await expectTags(
			most,
			MOST_USED.map(({ name }) => name)
		);
		await expectTags(soft, SOFT);
		await expect(tag(most, 'Git').locator('[data-skill-time]')).toHaveText('10 ans');
		await expect(tag(most, 'Git')).toHaveAccessibleDescription('Utilisée pendant 10 ans');
		await expect(tag(most, '.NET')).toHaveAccessibleDescription(
			'Utilisée pendant 6 ans 6 mois, en comptant 2 compétences qui en font partie'
		);
		await expect(filters.getByRole('status')).toHaveText('3 expériences');

		const all = filters.getByRole('button', { name: `Les ${TOTAL} compétences`, exact: true });
		await expect(all).toHaveAttribute('aria-expanded', 'false');
		await all.click();
		const less = filters.getByRole('button', { name: 'Voir moins', exact: true });
		await expect(less).toBeFocused();
		await expect(less).toHaveAttribute('aria-expanded', 'true');
		await expect(
			filters.getByRole('searchbox', { name: 'Rechercher une compétence' })
		).toHaveAttribute('placeholder', `Rechercher parmi ${TOTAL} compétences`);
		await expect(filters.getByText("Triées par durée d'utilisation")).toBeVisible();
		const groups = filters.locator('[data-skill-group]');
		for (const [index, name] of [
			'Langages 5',
			'Frameworks et runtimes 3',
			'Cloud et infrastructure 3',
			'Données et observabilité 5',
			'Outils 1',
			'Autres 1',
			'Savoir-être 7'
		].entries()) {
			await expect(groups.nth(index)).toHaveAccessibleName(name);
		}
		await expect(
			filters.getByRole('list', { name: '.NET et les compétences qui en font partie' })
		).toBeVisible();
		await expect(tag(groups.nth(0), 'Go').locator('[data-skill-time]')).toHaveText('8 mois');
		await filters.getByRole('searchbox').fill('cobol');
		await expect(filters.getByText('Aucune compétence ne correspond à « cobol ».')).toBeVisible();
		await filters.getByRole('searchbox').fill('');

		// Filtering, and a card's "+N"
		await tag(filters, '.NET').click();
		await expect(filters.getByRole('status')).toHaveText('2 sur 3 expériences');
		await expect(filters.locator('[data-filtered-by]')).toHaveText('Filtre : .NET');
		await expect(filters.getByRole('button', { name: 'Effacer les filtres' })).toBeVisible();
		const project = projectOf(page, EXPERIENCES.lead, 'Observability rollout');
		const more = project.getByRole('button', {
			name: 'Afficher 4 compétences de plus',
			exact: true
		});
		await expect(more).toHaveText('+4');
		await more.click();
		await expect(
			project.getByRole('button', { name: 'Moins de compétences', exact: true })
		).toHaveAttribute('aria-expanded', 'true');
		await expect(
			project.getByRole('list', { name: 'Compétences techniques' }).locator('[data-preview]')
		).toHaveCount(10);
	});
});

test.describe('before the page hydrates', () => {
	/** A page that stays as the server rendered it */
	const withoutScripts = async (browser: Browser, viewport: { width: number; height: number }) => {
		const context = await browser.newContext({ javaScriptEnabled: false, viewport });
		const page = await context.newPage();
		await blockGoogle(page);
		return { context, page };
	};

	test('the server renders the folded panel, as many skills as the screen shows', async ({
		browser
	}) => {
		for (const { viewport, shown } of [
			{ viewport: DESKTOP, shown: MOST_USED.length },
			{ viewport: PHONE, shown: MOST_USED_SMALL }
		]) {
			const { context, page } = await withoutScripts(browser, viewport);
			const label = `at ${viewport.width} px`;
			await page.goto(PAGE);

			// The rows need no measuring: fixed numbers of skills, fewer on a phone by CSS alone
			await expectTags(
				mostUsed(page),
				MOST_USED.slice(0, shown).map(({ name }) => name),
				label
			);
			await expectTags(softSkills(page), SOFT, label);
			await expect(tag(mostUsed(page), 'Git').locator('[data-skill-time]')).toHaveText('10 yrs');
			await expect(tag(mostUsed(page), '.NET').locator('[data-skill-parts]')).toHaveText('+2');
			await expect(tag(mostUsed(page), '.NET')).toHaveAccessibleDescription(MOST_USED[3].used);
			await expect(allSkills(page)).toBeVisible();
			await expect(allSkills(page)).toHaveAttribute('aria-expanded', 'false');
			await expect(filtersOf(page).getByRole('searchbox')).toHaveCount(0);
			// The cards too: their tags the most used first, the rest behind "+4"
			const project = projectOf(page, EXPERIENCES.lead, 'Observability rollout');
			await expect(technicalTags(project)).toHaveCount(6);
			await expect(project.getByRole('button', { name: 'Show 4 more skills' })).toHaveText('+4');
			expect(await fitsTheScreen(page), label).toBe(true);
			await context.close();
		}
	});

	test('the server renders a shared selection: a family filtered by, a skill beyond the most used', async ({
		browser,
		request
	}) => {
		const { context, page } = await withoutScripts(browser, PHONE);
		await page.goto(`${PAGE}?skills=.net&skills=go`);

		await expectTags(mostUsed(page), [
			...MOST_USED.slice(0, MOST_USED_SMALL).map(({ name }) => name),
			'Go'
		]);
		await expect(tag(mostUsed(page), '.NET')).toHaveAttribute('aria-pressed', 'true');
		await expect(tag(mostUsed(page), 'Go')).toHaveAttribute('aria-pressed', 'true');
		await expect(filtersOf(page).getByRole('status')).toHaveText('3 of 3 experiences');
		await expect(filtersOf(page).locator('[data-filtered-by]')).toHaveText('Filtered by .NET, Go');
		await expect(
			projectOf(page, EXPERIENCES.engineer, 'Legacy invoicing'),
			'a project of the family'
		).toHaveAttribute('data-matched');
		await context.close();

		// The HTML a crawler or a link preview reads holds the panel, folded: the skills beyond the
		// most used are not in it
		const html = await (await request.get(`${PAGE}?skills=.net`)).text();
		expect(html).toContain(`All ${TOTAL} skills`);
		expect(html).toContain('data-skill-row="hard"');
		expect(html).toContain('data-skill-row="soft"');
		expect(html).toContain('data-preview="skill:.net"');
		expect(html).toContain('data-preview="skill:kubernetes"');
		expect(html).not.toContain('data-skill-group');
		expect(html).not.toContain('type="search"');
		const french = await (await request.get(`${PAGE}?lang=fr`)).text();
		expect(french).toContain(`Les ${TOTAL} compétences`);
		expect(french).toContain('Les plus utilisées');
	});
});

test.describe('the owner types a skill in the editor', () => {
	test.skip(!JWT_SECRET, 'Set JWT_SECRET to the API’s secret to sign in as the e2e owner');

	/** A name another account typed, which the catalogue has not recognised (seedE2e.ts) */
	const FOREIGN_PENDING = 'Zentrafuge';
	const SEARCH = `${API_URL}/skills/search`;

	/**
	 * The editor of a new experience, with a project, signed in as the owner. Nothing is saved: the
	 * test ends with the dialog open, and the draft the editor keeps is this browser context's
	 */
	const openProject = async (page: Page) => {
		await signIn(page, await ownerSession(DOMAIN));
		await page.setViewportSize(DESKTOP);
		await gotoHydrated(page, PAGE);
		await page.getByRole('button', { name: 'Add experience', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'New experience' });
		await dialog.getByRole('button', { name: 'Add project' }).click();
		const project = dialog.locator('[data-project-item]');
		const field = project.getByRole('combobox', { name: 'Technical skills' });
		await expect(field).toHaveAttribute('aria-expanded', 'false');
		return {
			dialog,
			project,
			field,
			/** The suggestions under a skills field (the month and year selects have options too) */
			options: project.locator('[data-skill-suggestions]').getByRole('option'),
			/** The tags the field holds */
			tags: project.locator('[data-scope="tags-input"][data-part="item-text"]')
		};
	};

	/** The answer of the API's search for what was typed (the field asks after a pause) */
	const searched = (page: Page, q: string) =>
		page.waitForResponse(
			(response) =>
				response.url().startsWith(SEARCH) && new URL(response.url()).searchParams.get('q') === q
		);

	test('another spelling suggests the skill it stands for; the arrows and Enter pick it, Escape closes the list alone', async ({
		page
	}) => {
		const { dialog, field, options, tags } = await openProject(page);

		// 'k8' is the start of 'K8s', which the catalogue knows as Kubernetes
		const answer = searched(page, 'k8');
		await field.pressSequentially('k8');
		expect((await (await answer).json()).skills).toEqual([
			{ name: 'Kubernetes', category: 'infrastructure', alias: 'K8s' }
		]);
		const kubernetes = options.filter({ hasText: 'Kubernetes' });
		await expect(kubernetes).toHaveCount(1);
		await expect(kubernetes).toHaveAccessibleName(
			'Kubernetes, also known as K8s, Cloud & infrastructure'
		);
		await expect(kubernetes).toContainText('K8s');
		await expect(kubernetes).toHaveAttribute('data-skill-option', 'catalogue');
		await expect(field).toHaveAttribute('aria-expanded', 'true');
		const list = dialog.getByRole('listbox', { name: 'Suggestions' });
		await expect(list).toHaveCount(1);
		await expect(field).toHaveAttribute('aria-controls', (await list.getAttribute('id'))!);
		// Nothing is picked until an arrow says so: Enter would add what is typed
		await expect(field).not.toHaveAttribute('aria-activedescendant');
		await expect(kubernetes).toHaveAttribute('aria-selected', 'false');

		// The keyboard stays in the field
		await page.keyboard.press('ArrowDown');
		await expect(kubernetes).toHaveAttribute('aria-selected', 'true');
		await expect(field).toHaveAttribute(
			'aria-activedescendant',
			(await kubernetes.getAttribute('id'))!
		);
		await expect(field).toBeFocused();
		await page.keyboard.press('Enter');
		// The skill, not the spelling typed
		await expect(tags).toHaveText(['Kubernetes']);
		await expect(field).toHaveValue('');
		await expect(field).toBeFocused();
		await expect(field).toHaveAttribute('aria-expanded', 'false');
		await expect(options).toHaveCount(0);

		// Escape closes the list, and only the list: the dialog stays, with what was typed
		const next = searched(page, 'kub');
		await field.pressSequentially('kub');
		await next;
		// Picked already: not suggested again
		await expect(options.filter({ hasText: 'Kubernetes' })).toHaveCount(0);
		await field.fill('');
		const react = searched(page, 'reac');
		await field.pressSequentially('reac');
		await react;
		await expect(options).toHaveText([/React/]);
		await page.keyboard.press('Escape');
		await expect(options).toHaveCount(0);
		await expect(field).toHaveAttribute('aria-expanded', 'false');
		await expect(dialog).toBeVisible();
		await expect(field).toHaveValue('reac');
		await expect(field).toBeFocused();
		// An arrow opens it again
		await page.keyboard.press('ArrowDown');
		await expect(options).toHaveText([/React/]);
		await expect(options).toHaveAttribute('aria-selected', 'true');
		// Closed, Escape is the dialog's again: it asks before it drops the changes
		await page.keyboard.press('Escape');
		await expect(options).toHaveCount(0);
		await expect(dialog.getByText('Discard your changes?')).toHaveCount(0);
		await field.fill('');
		await page.keyboard.press('Escape');
		await expect(dialog.getByText('Discard your changes?')).toBeVisible();
		await dialog.getByRole('button', { name: 'Keep editing' }).click();
		await expect(tags).toHaveText(['Kubernetes']);
	});

	test('their own skills come first, then the catalogue’s; a name the catalogue has not recognised is theirs alone', async ({
		page
	}) => {
		const { field, options, tags } = await openProject(page);

		// Their own at once, before the catalogue answers
		const answer = searched(page, 'do');
		await field.pressSequentially('do');
		await expect(options.first()).toHaveAccessibleName('Docker, on your portfolio');
		await expect(options.first()).toHaveAttribute('data-skill-option', 'own');
		await expect(options.first()).toContainText('On your portfolio');
		// The catalogue has Docker too, first of what it answers
		const found = ((await (await answer).json()).skills as { name: string }[]).map(
			({ name }) => name
		);
		expect(found.slice(0, 2)).toEqual(['Docker', 'Domain-driven design']);
		// Then the catalogue's, each skill once: Docker is not listed again
		await expect(options.filter({ hasText: 'Docker' })).toHaveCount(1);
		await expect(options.nth(1)).toHaveAccessibleName('Domain-driven design, Practices & domains');
		await expect(options.nth(1)).toHaveAttribute('data-skill-option', 'catalogue');
		await expect(options.locator('nth=0')).toHaveAttribute('data-skill-option', 'own');
		// The pointer picks too, and the focus stays in the field
		await options.nth(1).click();
		await expect(tags).toHaveText(['Domain-driven design']);
		await expect(field).toBeFocused();
		await expect(field).toHaveValue('');

		// A skill they use that the catalogue has too is theirs: once, as their own
		const core = searched(page, '.net c');
		await field.pressSequentially('.net c');
		expect((await (await core).json()).skills).toEqual([
			{ name: '.NET Core', category: 'framework', parent: '.NET' }
		]);
		await expect(options).toHaveCount(1);
		await expect(options).toHaveAccessibleName('.NET Core, on your portfolio');
		await field.fill('');
		// A skill of the catalogue says its category and the skill it is part of
		const ubuntu = searched(page, 'ubun');
		await field.pressSequentially('ubun');
		await ubuntu;
		await expect(options).toHaveAccessibleName('Ubuntu, Cloud & infrastructure, part of Linux');
		await expect(options).toContainText('Part of Linux');
		await field.fill('');

		// Quorvex is on their portfolio and not in the catalogue: suggested as theirs, the search
		// answering nothing for it
		const own = searched(page, 'quor');
		await field.pressSequentially('quor');
		expect((await (await own).json()).skills).toEqual([]);
		await expect(options).toHaveCount(1);
		await expect(options).toHaveAccessibleName('Quorvex, on your portfolio');
		await field.fill('');

		// A name another account typed, not recognised either: never suggested, whole or in part
		for (const typed of [FOREIGN_PENDING.slice(0, 5), FOREIGN_PENDING]) {
			const foreign = searched(page, typed);
			await field.pressSequentially(typed);
			expect((await (await foreign).json()).skills, typed).toEqual([]);
			await expect(options).toHaveCount(0);
			await expect(field).toHaveAttribute('aria-expanded', 'false');
			await field.fill('');
		}
		// Any name can still be typed and entered
		await field.pressSequentially('Elixir');
		await page.keyboard.press('Enter');
		await expect(tags).toHaveText(['Domain-driven design', 'Elixir']);
	});

	test('a search that is refused, then fails, leaves the field working, without a word', async ({
		page
	}) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(String(error)));
		// The catalogue is refused (too many searches, asked again a second later), then fails
		const searches = await stubApi(page, 'GET', '/skills/search*', (_request, index) =>
			index === 0
				? {
						status: 429,
						text: 'Too many searches: try again in 1 minute',
						headers: { 'retry-after': '1', 'access-control-expose-headers': 'Retry-After' }
					}
				: { status: 500, text: 'Internal Server Error' }
		);
		const { dialog, field, options, tags } = await openProject(page);
		const quiet = async () => {
			await expect(toasts(page).getByRole('status')).toHaveCount(0);
			await expect(dialog.getByRole('alert')).toHaveCount(0);
			await expect(dialog).toBeVisible();
		};

		// Refused: their own skills are suggested all the same
		await field.pressSequentially('do');
		await expect.poll(() => searches.length).toBe(1);
		await expect(options).toHaveCount(1);
		await expect(options).toHaveAccessibleName('Docker, on your portfolio');
		await quiet();
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('Enter');
		await expect(tags).toHaveText(['Docker']);

		// Asked again once the wait the refusal gave is over, and failing this time
		await page.waitForTimeout(1200);
		await field.pressSequentially('pos');
		await expect.poll(() => searches.length).toBe(2);
		await expect(options.filter({ hasText: 'PostgreSQL' })).toHaveAccessibleName(
			'PostgreSQL, on your portfolio'
		);
		await quiet();
		// What is typed is entered as typed
		await field.fill('');
		await field.pressSequentially('Elixir');
		await page.keyboard.press('Enter');
		await field.pressSequentially('cobol,');
		await expect(tags).toHaveText(['Docker', 'Elixir', 'cobol']);
		await expect(field).toHaveValue('');
		await quiet();
		// The field does not ask again right after a failure
		await page.waitForTimeout(600);
		expect(searches).toHaveLength(2);
		expect(searches.map((request) => new URL(request.url()).searchParams.get('q'))).toEqual([
			'do',
			'pos'
		]);
		expect(errors).toEqual([]);
	});

	test('the search is for signed-in accounts, and answers nothing of a name not recognised', async () => {
		const anonymous = await playwrightRequest.newContext();
		expect((await anonymous.get(`${SEARCH}?q=kube`)).status()).toBe(401);
		await anonymous.dispose();

		const session = await ownerSession(DOMAIN);
		const owner = await playwrightRequest.newContext({
			extraHTTPHeaders: { cookie: `auth=${session.token}` }
		});
		const skillsFor = async (q: string) => {
			const response = await owner.get(SEARCH, { params: { q } });
			expect(response.status(), q).toBe(200);
			return (await response.json()).skills as { name: string }[];
		};
		expect(await skillsFor('K8S')).toEqual([
			{ name: 'Kubernetes', category: 'infrastructure', alias: 'K8s' }
		]);
		expect(await skillsFor('.net framework')).toEqual([
			{ name: '.NET Framework', category: 'framework', parent: '.NET' }
		]);
		// Pending names: the owner's own, and another account's
		for (const pending of ['Quorvex', 'Facilitation', FOREIGN_PENDING]) {
			expect(await skillsFor(pending), pending).toEqual([]);
		}
		await owner.dispose();
	});
});
