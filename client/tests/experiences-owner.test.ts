import {
	expect,
	request as playwrightRequest,
	test,
	type APIRequestContext,
	type Locator,
	type Page
} from '@playwright/test';
import {
	API_URL,
	JWT_SECRET,
	blockGoogle,
	gotoHydrated,
	ownerSession,
	signIn,
	type OwnerSession
} from './support/owner';

// The owner's flows on the experiences page: add, edit, delete, discard, and the filters.
// They run against the e2e seed (`bun run --cwd server seed:e2e`): the domain 'e2e-owner' and its
// owner, kept for these tests. They sign in without Google (./support/owner.ts), and each test
// adds the experiences it needs through the API, named with its own tag, and removes them
// afterwards. They share the domain, so they run one after the other (as the tests of a file do
// by default: keep it that way).

const DOMAIN = 'e2e-owner';

/** The colour painted behind an element: a project that stands out is seen, not only marked */
const background = (locator: Locator) =>
	locator.evaluate((element) => getComputedStyle(element).backgroundColor);

test.skip(!JWT_SECRET, 'Set JWT_SECRET to the API’s secret to sign in as the e2e owner');

type ListedExperience = {
	_id: string;
	title: string;
	location?: string;
	start?: string;
	end?: string;
	projects: {
		name: string;
		hardSkills: { skill: { displayName: string } }[];
	}[];
};

let session: OwnerSession;
let api: APIRequestContext;

const listExperiences = async (): Promise<ListedExperience[]> => {
	const response = await api.get(`${API_URL}/domain/${DOMAIN}`);
	expect(response.ok(), `GET /domain/${DOMAIN}: run \`bun run --cwd server seed:e2e\``).toBe(true);
	return (await response.json()).experiences ?? [];
};

const deleteExperience = async (id: string) => {
	const response = await api.delete(`${API_URL}/experiences/${id}`);
	// 404: already gone (deleted by the test itself)
	expect([200, 404]).toContain(response.status());
};

type SkillName = string;
/** A stored date: UTC midnight of the 1st of a 'YYYY-MM' month */
const month = (value: string) => `${value}-01T00:00:00.000Z`;
const project = (
	name: string,
	hard: SkillName[] = [],
	soft: SkillName[] = [],
	// Without an end: a project left open
	[start, end]: [string, string?] = ['2023-01', '2023-06']
) => ({
	name,
	summary: '',
	start: month(start),
	end: end ? month(end) : undefined,
	hardSkills: hard.map((skill) => ({ name: skill, level: -1 })),
	softSkills: soft.map((skill) => ({ name: skill, level: -1 }))
});

const createExperience = async (body: {
	title: string;
	type?: string;
	start?: string;
	end?: string;
	projects?: ReturnType<typeof project>[];
}): Promise<ListedExperience> => {
	const response = await api.post(`${API_URL}/experiences`, {
		data: {
			type: 'professional',
			summary: 'Created by an end-to-end test.',
			company: { name: 'E2E Corp' },
			start: '2022-01-01T00:00:00.000Z',
			end: '2024-01-01T00:00:00.000Z',
			projects: [],
			...body
		}
	});
	expect(response.ok(), await response.text()).toBe(true);
	return response.json();
};

test.beforeAll(async () => {
	session = await ownerSession(DOMAIN);
	api = await playwrightRequest.newContext({
		extraHTTPHeaders: { cookie: `auth=${session.token}` }
	});
	// The domain is these tests' own: start from no experiences, whatever an interrupted run left
	for (const experience of await listExperiences()) await deleteExperience(experience._id);
});

test.afterAll(async () => {
	await api?.dispose();
});

// Unique per test: names its experiences, which it removes afterwards
let tag = '';
test.beforeEach(async ({ page }, testInfo) => {
	tag = `${testInfo.workerIndex}-${Date.now().toString(36)}`;
	await blockGoogle(page);
});

test.afterEach(async () => {
	for (const experience of await listExperiences()) {
		if (experience.title.includes(tag)) await deleteExperience(experience._id);
	}
});

const openAsOwner = async (page: Page) => {
	await signIn(page, session);
	await gotoHydrated(page, `/${DOMAIN}/experiences`);
};

const card = (page: Page, title: string) =>
	page
		.locator('article')
		.filter({ has: page.getByRole('heading', { level: 2, name: title, exact: true }) });

test.describe('the owner of a portfolio', () => {
	test('adds an experience once the problems the form lists are fixed', async ({ page }) => {
		const title = `Platform Engineer ${tag}`;
		await openAsOwner(page);

		// "Add your first experience" when the portfolio is empty
		await page.getByRole('button', { name: /^Add (your first )?experience$/ }).click();
		const dialog = page.getByRole('dialog', { name: 'New experience' });
		await expect(dialog).toBeVisible();

		// A start without an end, and a project without a name
		await dialog.getByLabel('Start month').first().selectOption('03');
		await dialog.getByLabel('Start year').first().selectOption('2022');
		await dialog.getByRole('button', { name: 'Add project' }).click();
		const projectItem = dialog.locator('[data-project-item]');
		await projectItem.getByLabel('Summary', { exact: true }).fill('Event pipelines.');
		await dialog.getByRole('button', { name: 'Add experience', exact: true }).click();

		await expect(dialog.getByText('Fix 3 problems before saving:')).toBeVisible();
		await expect(dialog.getByRole('link', { name: 'Title: Enter a title.' })).toBeVisible();
		await expect(
			dialog.getByRole('link', {
				name: 'End: Choose the end month, or tick “I currently work here”.'
			})
		).toBeVisible();
		await expect(
			dialog.getByRole('link', { name: 'Project 1 · Name: Enter a project name.' })
		).toBeVisible();
		const titleInput = dialog.getByRole('textbox', { name: 'Title', exact: true });
		await expect(titleInput).toBeFocused();
		await expect(titleInput).toHaveAttribute('aria-invalid', 'true');

		await titleInput.fill(title);
		await expect(titleInput).not.toHaveAttribute('aria-invalid');
		await dialog.getByLabel('Company or school').fill('Acme');
		await dialog.getByLabel('Location').fill('Remote');
		await dialog.getByLabel('I currently work here').check();
		await projectItem.getByRole('textbox', { name: 'Name', exact: true }).fill(`Ingestion ${tag}`);
		const skills = projectItem.getByLabel('Technical skills');
		await skills.fill('Kafka');
		await skills.press('Enter');
		await dialog.getByRole('button', { name: 'Add experience', exact: true }).click();

		await expect(page.getByText('Experience added')).toBeVisible();
		await expect(dialog).toBeHidden();
		const added = card(page, title);
		await expect(added).toBeVisible();
		// The empty state's button is gone with the empty state: the new card takes the focus
		await expect(added.getByRole('button', { name: `Edit ${title}` })).toBeFocused();
		await expect(added).toContainText('Acme');
		await expect(added).toContainText('Mar 2022 – Present');
		await expect(added).toContainText(`Ingestion ${tag}`);

		const saved = (await listExperiences()).find((experience) => experience.title === title);
		expect(saved).toMatchObject({ location: 'Remote', start: '2022-03-01T00:00:00.000Z' });
		expect(saved?.end).toBeUndefined();
		expect(saved?.projects.map((p) => p.name)).toEqual([`Ingestion ${tag}`]);
		expect(saved?.projects[0].hardSkills.map((s) => s.skill.displayName)).toEqual(['Kafka']);
	});

	test('edits an experience and removes one of its projects', async ({ page }) => {
		const title = `Data Engineer ${tag}`;
		const renamed = `Staff Data Engineer ${tag}`;
		await createExperience({
			title,
			projects: [project(`Alpha ${tag}`, ['Python']), project(`Beta ${tag}`, ['Spark'])]
		});
		await openAsOwner(page);

		await page.getByRole('button', { name: `Edit ${title}` }).click();
		const dialog = page.getByRole('dialog', { name: `Edit · ${title}` });
		await expect(dialog).toBeVisible();
		await dialog.getByRole('textbox', { name: 'Title', exact: true }).fill(renamed);
		await expect(dialog.getByText('Unsaved changes')).toBeVisible();

		await dialog.getByRole('button', { name: `Remove “Beta ${tag}”` }).click();
		await expect(dialog.getByText(`Removed “Beta ${tag}”.`)).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Undo' })).toBeVisible();
		await expect(dialog.locator('[data-project-item]')).toHaveCount(1);
		await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();

		await expect(page.getByText('Changes saved')).toBeVisible();
		await expect(dialog).toBeHidden();
		const edited = card(page, renamed);
		await expect(edited).toBeVisible();
		await expect(edited).toContainText(`Alpha ${tag}`);
		await expect(edited).not.toContainText(`Beta ${tag}`);
		await expect(card(page, title)).toHaveCount(0);

		const saved = (await listExperiences()).find((experience) => experience.title === renamed);
		expect(saved?.projects.map((p) => p.name)).toEqual([`Alpha ${tag}`]);
	});

	test('deletes an experience only once the deletion is confirmed', async ({ page }) => {
		const title = `Intern ${tag}`;
		const created = await createExperience({ title });
		await openAsOwner(page);

		await page.getByRole('button', { name: `Edit ${title}` }).click();
		const dialog = page.getByRole('dialog', { name: `Edit · ${title}` });
		await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
		await expect(dialog.getByText(`Delete “${title}”? This cannot be undone.`)).toBeVisible();

		// Cancel keeps it
		await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(dialog.getByText('This cannot be undone.')).toHaveCount(0);
		await expect(dialog).toBeVisible();

		await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
		await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

		await expect(page.getByText('Experience deleted')).toBeVisible();
		await expect(dialog).toBeHidden();
		await expect(card(page, title)).toHaveCount(0);
		const ids = (await listExperiences()).map((experience) => experience._id);
		expect(ids).not.toContain(created._id);
	});

	test('Escape asks before discarding unsaved changes', async ({ page }) => {
		const title = `Consultant ${tag}`;
		await createExperience({ title });
		await openAsOwner(page);
		const editButton = page.getByRole('button', { name: `Edit ${title}` });
		const dialog = page.getByRole('dialog', { name: `Edit · ${title}` });

		// Nothing changed: Escape closes at once
		await editButton.click();
		await expect(dialog).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();

		await editButton.click();
		const titleInput = dialog.getByRole('textbox', { name: 'Title', exact: true });
		await titleInput.fill(`Senior Consultant ${tag}`);
		await page.keyboard.press('Escape');
		await expect(dialog.getByText('Discard your changes?')).toBeVisible();

		// Keep editing: the change is still there
		await dialog.getByRole('button', { name: 'Keep editing' }).click();
		await expect(dialog.getByText('Discard your changes?')).toHaveCount(0);
		await expect(titleInput).toHaveValue(`Senior Consultant ${tag}`);

		await page.keyboard.press('Escape');
		await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
		await expect(dialog).toBeHidden();
		await expect(card(page, title)).toBeVisible();
		const titles = (await listExperiences()).map((experience) => experience.title);
		expect(titles).toContain(title);
		expect(titles).not.toContain(`Senior Consultant ${tag}`);

		// Discarded for good: reopening shows the saved experience, without a restored draft
		await editButton.click();
		await expect(titleInput).toHaveValue(title);
		await expect(dialog.getByText('Restored unsaved changes.')).toHaveCount(0);
	});
});

test.describe('filters', () => {
	test('narrow the list by skill, and keep the selection in the URL', async ({ page }) => {
		const backend = `Backend Engineer ${tag}`;
		const frontend = `Frontend Engineer ${tag}`;
		const side = `Side project ${tag}`;
		await createExperience({ title: backend, projects: [project('Streams', ['Kafka'])] });
		await createExperience({
			title: frontend,
			projects: [project('Design system', ['Svelte'], ['Leadership'])]
		});
		await createExperience({
			title: side,
			type: 'personal',
			projects: [project('Home lab', ['Kafka'])]
		});
		const headings = page.getByRole('heading', { level: 2 });
		const filters = page.getByRole('region', { name: 'Filter experiences' });

		// A visitor's view: no session needed
		await gotoHydrated(page, `/${DOMAIN}/experiences`);
		await expect(headings).toHaveText([backend, frontend, side]);
		// Skills only: no type chips
		await expect(
			filters.getByRole('button', { name: /^(All|Professional|Personal)\b/ })
		).toHaveCount(0);

		await filters.getByRole('button', { name: 'Kafka', exact: true }).click();
		await expect(filters.getByRole('status')).toHaveText('2 of 3 experiences');
		await expect(headings).toHaveText([backend, side]);
		await expect.poll(() => new URL(page.url()).search).toBe('?skills=kafka');

		// A shared link renders the same selection (on the server, then hydrated); the type
		// parameter of links from before is ignored
		await gotoHydrated(page, `/${DOMAIN}/experiences?skills=kafka&type=professional`);
		await expect(headings).toHaveText([backend, side]);
		await expect(filters.getByRole('button', { name: 'Kafka', exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);

		await filters.getByRole('button', { name: 'Clear filters' }).click();
		await expect(headings).toHaveCount(3);
		await expect.poll(() => new URL(page.url()).search).toBe('');
	});

	test('make the projects using a selected skill stand out in their card', async ({ page }) => {
		const title = `Backend Engineer ${tag}`;
		await createExperience({
			title,
			projects: [project('Streams', ['Kafka']), project('Billing', ['Go'])]
		});
		const projectOf = (name: string) =>
			card(page, title)
				.locator('article')
				.filter({ has: page.getByRole('heading', { level: 3, name }) });

		await gotoHydrated(page, `/${DOMAIN}/experiences`);
		await expect(projectOf('Streams')).not.toHaveAttribute('data-matched');
		expect(await background(projectOf('Streams'))).toBe(await background(projectOf('Billing')));

		await page
			.getByRole('region', { name: 'Filter experiences' })
			.getByRole('button', { name: 'Kafka', exact: true })
			.click();
		await expect(projectOf('Streams')).toHaveAttribute('data-matched');
		await expect(projectOf('Billing')).not.toHaveAttribute('data-matched');
		// It is tinted, the other is not
		await expect
			.poll(
				async () =>
					(await background(projectOf('Streams'))) !== (await background(projectOf('Billing')))
			)
			.toBe(true);
	});
});

test.describe('timeline view', () => {
	// Two jobs that follow one another (the first ends the month the second starts), a side
	// project during the first, and two projects of the first job that overlap
	const career = async () => {
		const first = `Backend Engineer ${tag}`;
		const second = `Staff Engineer ${tag}`;
		const side = `Side project ${tag}`;
		await createExperience({
			title: first,
			start: month('2020-01'),
			end: month('2022-03'),
			projects: [
				project('Streams', ['Kafka'], [], ['2020-01', '2021-06']),
				project('Billing', ['Go'], [], ['2021-01', '2022-03'])
			]
		});
		await createExperience({
			title: second,
			start: month('2022-03'),
			end: month('2024-01'),
			projects: [project('Platform', ['Kafka'], ['Leadership'], ['2022-03', '2023-06'])]
		});
		await createExperience({
			title: side,
			type: 'personal',
			start: month('2021-01'),
			end: month('2021-12'),
			projects: [project('Home lab', ['Svelte'], [], ['2021-01', '2021-12'])]
		});
		return { first, second, side };
	};

	const timeline = (page: Page) => page.getByRole('region', { name: 'Timeline' });
	const viewButton = (page: Page, name: 'List' | 'Timeline') =>
		page.getByRole('group', { name: 'View' }).getByRole('button', { name, exact: true });
	const experienceBar = (page: Page, title: string) =>
		timeline(page).locator('[data-timeline-experience]').filter({ hasText: title });
	const projectBar = (page: Page, name: string) =>
		timeline(page).locator('[data-timeline-project]').filter({ hasText: name });
	const laneOf = (page: Page, title: string) =>
		experienceBar(page, title).locator('xpath=..').getAttribute('data-lane');
	const boxOf = async (page: Page, name: string) => {
		const box = await projectBar(page, name).boundingBox();
		if (!box) throw new Error(`No bar for ${name}`);
		return box;
	};

	test('places the experiences over time, on lanes of their own when they overlap', async ({
		page
	}) => {
		const { first, second, side } = await career();
		// A visitor's view: no session needed
		await gotoHydrated(page, `/${DOMAIN}/experiences`);
		await expect(viewButton(page, 'List')).toHaveAttribute('aria-pressed', 'true');

		await viewButton(page, 'Timeline').click();
		await expect(timeline(page)).toBeVisible();
		await expect.poll(() => new URL(page.url()).search).toBe('?view=timeline');
		// The cards are gone: the timeline shows one once a bar is picked
		await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);

		// The jobs share the top lane, the side project that ran during the first is under them
		expect(await laneOf(page, first)).toBe('0');
		expect(await laneOf(page, second)).toBe('0');
		expect(await laneOf(page, side)).toBe('1');
		// Left to right in time
		const firstBox = await experienceBar(page, first).boundingBox();
		const secondBox = await experienceBar(page, second).boundingBox();
		expect(firstBox!.x + firstBox!.width).toBeLessThanOrEqual(secondBox!.x + 1);
		// Billing started before Streams ended: it is drawn under it, further right
		const streams = await boxOf(page, 'Streams');
		const billing = await boxOf(page, 'Billing');
		expect(billing.y).toBeGreaterThan(streams.y + streams.height - 1);
		expect(billing.x).toBeGreaterThan(streams.x);

		// A bar shows the card of its experience, at the project picked
		await projectBar(page, 'Billing').click();
		const shown = card(page, first);
		await expect(shown).toBeVisible();
		await expect(experienceBar(page, first)).toHaveAttribute('aria-pressed', 'true');
		await expect(
			shown.locator('article').filter({ has: page.getByRole('heading', { name: 'Billing' }) })
		).toHaveAttribute('data-revealed');
		await experienceBar(page, side).click();
		await expect(card(page, side)).toBeVisible();
		await expect(card(page, first)).toHaveCount(0);

		// Back to the list: every card, and a URL without the view
		await viewButton(page, 'List').click();
		await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3);
		await expect.poll(() => new URL(page.url()).search).toBe('');
	});

	test('keeps every experience and makes the projects using a selected skill bigger', async ({
		page
	}) => {
		const { first, second, side } = await career();
		// A shared link opens on the timeline, filtered (rendered on the server, then hydrated)
		await gotoHydrated(page, `/${DOMAIN}/experiences?view=timeline&skills=kafka`);
		await expect(viewButton(page, 'Timeline')).toHaveAttribute('aria-pressed', 'true');
		const filters = page.getByRole('region', { name: 'Filter experiences' });
		await expect(filters.getByRole('status')).toHaveText('2 of 3 experiences');

		// Nothing is hidden: the filter points at its projects
		for (const title of [first, second, side])
			await expect(experienceBar(page, title)).toBeVisible();
		await expect(projectBar(page, 'Streams')).toHaveAttribute('data-matched');
		await expect(projectBar(page, 'Platform')).toHaveAttribute('data-matched');
		await expect(projectBar(page, 'Billing')).not.toHaveAttribute('data-matched');
		await expect(projectBar(page, 'Home lab')).not.toHaveAttribute('data-matched');
		await expect
			.poll(
				async () => (await boxOf(page, 'Streams')).height - (await boxOf(page, 'Billing')).height
			)
			.toBeGreaterThan(4);
		// And filled, which the others are not
		const filled = async () =>
			(await background(projectBar(page, 'Streams'))) !==
			(await background(projectBar(page, 'Billing')));
		await expect.poll(filled).toBe(true);

		await filters.getByRole('button', { name: 'Clear filters' }).click();
		await expect(timeline(page).locator('[data-matched]')).toHaveCount(0);
		await expect.poll(filled).toBe(false);
		await expect
			.poll(
				async () => (await boxOf(page, 'Streams')).height - (await boxOf(page, 'Billing')).height
			)
			.toBe(0);
		// The view stays in the URL when the filters leave it
		await expect.poll(() => new URL(page.url()).search).toBe('?view=timeline');

		// The selection follows from one view to the other
		await filters.getByRole('button', { name: 'Go', exact: true }).click();
		await expect.poll(() => new URL(page.url()).search).toBe('?view=timeline&skills=go');
		await viewButton(page, 'List').click();
		await expect(page.getByRole('heading', { level: 2 })).toHaveText([first]);
		await expect.poll(() => new URL(page.url()).search).toBe('?skills=go');
	});

	test('a project left without an end stops with its experience, wherever it is shown', async ({
		page
	}) => {
		const title = `Backend Engineer ${tag}`;
		await createExperience({
			title,
			start: month('2018-01'),
			end: month('2020-12'),
			projects: [project('Left open', ['Kafka'], [], ['2019-06'])]
		});
		const preview = page.getByRole('tooltip');

		// Its card: not "Present", its experience ended
		await gotoHydrated(page, `/${DOMAIN}/experiences`);
		const shown = card(page, title).locator('article');
		await expect(shown).toContainText('Jun 2019 – Dec 2020');
		await expect(shown).not.toContainText('Present');
		// The preview of its skill
		await shown.getByText('Kafka', { exact: true }).hover();
		await expect(preview).toContainText('Jun 2019 – Dec 2020');
		await page.keyboard.press('Escape');
		await expect(preview).toHaveCount(0);

		// The timeline: its bar ends with its experience's, and is named with the same months
		await viewButton(page, 'Timeline').click();
		await expect(projectBar(page, 'Left open')).toContainText('Jun 2019 – Dec 2020');
		const bar = await boxOf(page, 'Left open');
		const whole = await experienceBar(page, title).boundingBox();
		expect(Math.abs(bar.x + bar.width - (whole!.x + whole!.width))).toBeLessThanOrEqual(1);
	});

	test('the owner edits and adds from the timeline, whose card follows what was saved', async ({
		page
	}) => {
		const title = `Data Engineer ${tag}`;
		const renamed = `Staff Data Engineer ${tag}`;
		const added = `Volunteer ${tag}`;
		await createExperience({ title, projects: [project(`Alpha ${tag}`, ['Python'])] });
		await signIn(page, session);
		await gotoHydrated(page, `/${DOMAIN}/experiences?view=timeline`);

		await experienceBar(page, title).click();
		await card(page, title)
			.getByRole('button', { name: `Edit ${title}` })
			.click();
		const dialog = page.getByRole('dialog', { name: `Edit · ${title}` });
		await dialog.getByRole('textbox', { name: 'Title', exact: true }).fill(renamed);
		await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();

		await expect(page.getByText('Changes saved')).toBeVisible();
		await expect(card(page, renamed)).toBeVisible();
		await expect(experienceBar(page, renamed)).toHaveAttribute('aria-pressed', 'true');

		// Added without dates: listed under the timeline, and shown as the card
		await page.getByRole('button', { name: 'Add experience', exact: true }).click();
		const creation = page.getByRole('dialog', { name: 'New experience' });
		await creation.getByRole('textbox', { name: 'Title', exact: true }).fill(added);
		await creation.getByRole('button', { name: 'Add experience', exact: true }).click();

		await expect(page.getByText('Experience added')).toBeVisible();
		await expect(card(page, added)).toBeVisible();
		await expect(card(page, renamed)).toHaveCount(0);
		await expect(
			timeline(page)
				.getByRole('list', { name: 'Without dates' })
				.getByRole('button', { name: added })
		).toHaveAttribute('aria-pressed', 'true');
	});
});

test.describe("the timeline's zoom", () => {
	const scroller = (page: Page) => page.locator('[data-timeline-scroller]');
	const widthOf = async (locator: Locator) => (await locator.boundingBox())?.width ?? 0;
	/** Whether the whole axis is in sight: nothing to scroll sideways */
	const fits = (page: Page) =>
		scroller(page).evaluate((element) => element.scrollWidth <= element.clientWidth);

	test('opens close enough to read the shortest project, and zooms with the wheel and the buttons', async ({
		page
	}) => {
		const title = `Backend Engineer ${tag}`;
		await createExperience({
			title,
			start: month('2019-01'),
			end: month('2023-12'),
			projects: [
				project('Platform', ['Go'], [], ['2019-01', '2023-06']),
				project('Sprint', ['Kafka'], [], ['2023-11', '2023-12'])
			]
		});
		const region = page.getByRole('region', { name: 'Timeline' });
		const sprint = region.locator('[data-timeline-project]').filter({ hasText: 'Sprint' });
		const ticks = region.locator('[data-timeline-tick]');
		const zoomOut = region.getByRole('button', { name: 'Zoom out' });
		const zoomIn = region.getByRole('button', { name: 'Zoom in' });

		await gotoHydrated(page, `/${DOMAIN}/experiences?view=timeline`);
		// Two months, 120 px: the five years scroll sideways, opened on the most recent months
		await expect.poll(() => widthOf(sprint)).toBeGreaterThan(117);
		expect(await widthOf(sprint)).toBeLessThan(123);
		expect(await fits(page)).toBe(false);
		await expect(sprint).toBeInViewport();
		// Months are named at this zoom
		await expect(ticks.filter({ hasText: 'Oct 2023' })).toHaveCount(1);

		// The wheel, once the pointer was moved over the timeline: out, around the pointer
		const box = (await scroller(page).boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.wheel(0, 200);
		await expect.poll(() => widthOf(sprint)).toBeLessThan(100);
		const afterWheel = await widthOf(sprint);
		// And back in
		await page.mouse.wheel(0, -400);
		await expect.poll(() => widthOf(sprint)).toBeGreaterThan(afterWheel + 20);

		// The buttons, down to the whole axis in sight: fewer months are named, and nothing is
		// further out
		await expect(zoomOut).toBeEnabled();
		while (await zoomOut.isEnabled()) await zoomOut.click();
		expect(await fits(page)).toBe(true);
		await expect(ticks.filter({ hasText: 'Oct 2023' })).toHaveCount(0);
		await expect(ticks.filter({ hasText: /^2019$/ })).toHaveCount(1);
		await expect(ticks.filter({ hasText: /^2023$/ })).toHaveCount(1);
		await zoomIn.click();
		expect(await fits(page)).toBe(false);
		await expect(zoomOut).toBeEnabled();
	});

	test('opens on its last bar, however long the axis runs after it', async ({ page }) => {
		const title = `Backend Engineer ${tag}`;
		// Ended in February: the axis goes on to the end of that year, ten months at 120 px each
		await createExperience({
			title,
			start: month('2019-01'),
			end: month('2023-02'),
			projects: [
				project('Platform', ['Go'], [], ['2019-01', '2022-12']),
				project('Handover', ['Go'], [], ['2023-02', '2023-02'])
			]
		});
		const handover = page.locator('[data-timeline-project]').filter({ hasText: 'Handover' });

		await page.setViewportSize({ width: 390, height: 844 });
		await gotoHydrated(page, `/${DOMAIN}/experiences?view=timeline`);
		await expect.poll(() => widthOf(handover)).toBeGreaterThan(117);
		await expect(handover).toBeInViewport({ ratio: 1 });
		expect(await fits(page)).toBe(false);
	});

	test('keeps the month at the left edge when a save changes the zoom it opens with', async ({
		page
	}) => {
		const title = `Backend Engineer ${tag}`;
		// The one-month Spike makes a month 120 px wide; without it, the two-month Sprint: 60 px
		await createExperience({
			title,
			start: month('2019-01'),
			end: month('2023-12'),
			projects: [
				project('Platform', ['Go'], [], ['2019-01', '2023-06']),
				project(`Spike ${tag}`, ['Go'], [], ['2021-03', '2021-03']),
				project('Sprint', ['Kafka'], [], ['2023-11', '2023-12'])
			]
		});
		const sprint = page.locator('[data-timeline-project]').filter({ hasText: 'Sprint' });
		/** Months between the axis' start and the scroller's left edge */
		const monthAtLeft = () =>
			scroller(page).evaluate((element) => {
				const track = element.querySelector('[data-timeline-track]')!.getBoundingClientRect();
				return ((element.getBoundingClientRect().left - track.left) / track.width) * 60;
			});

		await signIn(page, session);
		await gotoHydrated(page, `/${DOMAIN}/experiences?view=timeline`);
		await expect.poll(() => widthOf(sprint)).toBeGreaterThan(237);
		await scroller(page).evaluate((element) => (element.scrollLeft = 2400));

		await page.locator('[data-timeline-experience]').filter({ hasText: title }).click();
		await card(page, title)
			.getByRole('button', { name: `Edit ${title}` })
			.click();
		const dialog = page.getByRole('dialog', { name: `Edit · ${title}` });
		await dialog.getByRole('button', { name: `Remove “Spike ${tag}”` }).click();
		// Read here: pressing the bar may have scrolled the timeline to it
		const before = await monthAtLeft();
		expect(before).toBeGreaterThan(6);
		await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
		await expect(page.getByText('Changes saved')).toBeVisible();

		// Every month is half as wide, and the same one is at the left edge
		await expect.poll(() => widthOf(sprint)).toBeLessThan(123);
		expect(Math.abs((await monthAtLeft()) - before)).toBeLessThan(0.5);
	});

	test('follows a pinch on a touch screen', async ({ browser }) => {
		const title = `Backend Engineer ${tag}`;
		await createExperience({
			title,
			start: month('2019-01'),
			end: month('2023-12'),
			projects: [project('Sprint', ['Kafka'], [], ['2023-11', '2023-12'])]
		});
		const context = await browser.newContext({
			viewport: { width: 390, height: 844 },
			isMobile: true,
			hasTouch: true
		});
		const page = await context.newPage();
		await blockGoogle(page);
		const sprint = page.locator('[data-timeline-project]').filter({ hasText: 'Sprint' });

		await gotoHydrated(page, `/${DOMAIN}/experiences?view=timeline`);
		await expect.poll(() => widthOf(sprint)).toBeGreaterThan(117);

		// Two fingers closing in to a third of their spread: the timeline zooms out, not the page
		const box = (await scroller(page).boundingBox())!;
		const cdp = await context.newCDPSession(page);
		const middle = box.x + box.width / 2;
		const fingers = (type: 'touchStart' | 'touchMove', spread: number) =>
			cdp.send('Input.dispatchTouchEvent', {
				type,
				touchPoints: [
					{ x: middle - spread, y: box.y + 60, id: 1 },
					{ x: middle + spread, y: box.y + 60, id: 2 }
				]
			});
		await fingers('touchStart', 120);
		for (const spread of [100, 80, 60, 40]) await fingers('touchMove', spread);
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

		await expect.poll(() => widthOf(sprint)).toBeLessThan(45);
		expect(await widthOf(sprint)).toBeGreaterThan(35);
		expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
		await context.close();
	});
});

test.describe('the floating corner of the page', () => {
	test("offers visitors to hire the owner, and the owner their own page's heading", async ({
		page
	}) => {
		const title = `Backend Engineer ${tag}`;
		// A card taller than a short screen: the page scrolls
		await createExperience({
			title,
			projects: ['Streams', 'Billing', 'Platform', 'Tooling'].map((name) => project(name, ['Go']))
		});
		const hire = page.getByRole('link', { name: 'Hire me' });
		const views = page.getByRole('group', { name: 'View' });

		// A visitor: no heading, the view switch and "Hire me" in the corner, in both views
		await gotoHydrated(page, `/${DOMAIN}/experiences`);
		await expect(card(page, title)).toBeVisible();
		await expect(page.getByRole('heading', { level: 2, name: 'Experiences' })).toHaveCount(0);
		await expect(hire).toBeVisible();
		await expect(views).toBeVisible();
		// The corner stays in sight at the end of the page, clear of the last card
		await card(page, title).scrollIntoViewIfNeeded();
		await expect(hire).toBeInViewport();
		// At the end of the page it covers nothing of the last card, on a wide screen as on the
		// narrowest phone, where it stays one row
		const dock = page.locator('[data-page-dock]');
		for (const size of [
			{ width: 1280, height: 500 },
			{ width: 320, height: 568 }
		]) {
			await page.setViewportSize(size);
			await page
				.locator('#page')
				.evaluate((main) => main.scrollTo({ top: main.scrollHeight, behavior: 'instant' }));
			const corner = (await dock.boundingBox())!;
			const last = (await card(page, title).boundingBox())!;
			expect(corner.height).toBeLessThan(60);
			expect(last.y + last.height).toBeLessThanOrEqual(corner.y);
			// Its buttons keep their names where the view switch shows icons alone
			await expect(views.getByRole('button', { name: 'Timeline', exact: true })).toBeVisible();
		}
		await page.setViewportSize({ width: 1280, height: 720 });
		await views.getByRole('button', { name: 'Timeline', exact: true }).click();
		await expect(hire).toBeVisible();
		await hire.click();
		await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/hire$`));

		// The owner: their heading and buttons, the view switch, and no "Hire me"
		await openAsOwner(page);
		await expect(page.getByRole('heading', { level: 2, name: 'Experiences' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Add experience', exact: true })).toBeVisible();
		await expect(views).toBeVisible();
		await expect(hire).toHaveCount(0);
		// On a phone, once their buttons have scrolled away: "Add experience" joins the corner,
		// on the view switch's row
		await page.setViewportSize({ width: 390, height: 600 });
		await page
			.locator('#page')
			.evaluate((main) => main.scrollTo({ top: main.scrollHeight, behavior: 'instant' }));
		const add = page.locator('[data-add-fab]');
		await expect(add).toBeVisible();
		await expect(add).toHaveAccessibleName('Add experience');
		expect((await dock.boundingBox())!.height).toBeLessThan(60);
	});
});

test.describe('hovering a skill tag', () => {
	test('previews only the projects using it, in the list and on the timeline', async ({ page }) => {
		const first = `Backend Engineer ${tag}`;
		const second = `Staff Engineer ${tag}`;
		await createExperience({
			title: first,
			start: month('2020-01'),
			end: month('2022-02'),
			projects: [
				project('Streams', ['Kafka'], [], ['2020-01', '2021-06']),
				project('Billing', ['Go'], [], ['2021-01', '2022-02'])
			]
		});
		await createExperience({
			title: second,
			start: month('2022-03'),
			end: month('2024-01'),
			projects: [project('Platform', ['Kafka'], ['Leadership'], ['2022-03', '2023-06'])]
		});
		const preview = page.getByRole('tooltip');
		const filters = page.getByRole('region', { name: 'Filter experiences' });
		const kafka = filters.getByRole('button', { name: 'Kafka', exact: true });

		await gotoHydrated(page, `/${DOMAIN}/experiences`);
		await expect(preview).toHaveCount(0);

		// The list: a tag of a card
		await card(page, first).getByText('Kafka', { exact: true }).hover();
		await expect(preview).toBeVisible();
		await expect(preview).toContainText('Kafka');
		// With the time they add up to: Jan 2020 to Jun 2021, then Mar 2022 to Jun 2023
		await expect(preview).toContainText('Used in 2 projects (2 years 10 months)');
		await expect(preview.getByRole('listitem')).toHaveText([/Platform/, /Streams/]);
		await expect(preview).toContainText(`${first} · E2E Corp`);
		await expect(preview).toContainText('Jan 2020 – Jun 2021');
		await expect(preview).not.toContainText('Billing');
		// Escape closes it
		await page.keyboard.press('Escape');
		await expect(preview).toHaveCount(0);

		// The filters' tags, with the keyboard too: the tag is described by its preview
		await filters.getByRole('button', { name: 'Go', exact: true }).focus();
		await page.keyboard.press('Tab');
		await expect(kafka).toBeFocused();
		await expect(preview).toBeVisible();
		await expect(preview).toContainText('Used in 2 projects');
		await expect(kafka).toHaveAttribute('aria-describedby', (await preview.getAttribute('id'))!);
		// Pressing the tag filters, and gets its preview out of the way
		await page.keyboard.press('Enter');
		await expect(kafka).toHaveAttribute('aria-pressed', 'true');
		await expect(preview).toHaveCount(0);
		await page.keyboard.press('Enter');

		// A tag also points at its projects in the cards, and the other cards step back
		await filters.getByRole('button', { name: 'Leadership', exact: true }).hover();
		await expect(preview).toContainText('Used in 1 project');
		await expect(preview.locator('[data-preview-timeline]')).toHaveCount(0);
		await expect(page.locator('article[data-previewed]')).toHaveText([/Platform/]);
		await expect(card(page, first)).toHaveAttribute('data-muted');
		await expect(card(page, second)).not.toHaveAttribute('data-muted');
		await expect
			.poll(() => card(page, first).evaluate((element) => getComputedStyle(element).opacity))
			.toBe('0.5');
		await page.keyboard.press('Escape');
		await expect(preview).toHaveCount(0);
		await expect(page.locator('[data-muted], [data-previewed]')).toHaveCount(0);
		// Nothing steps back when the filters hide every card that has the skill
		await filters.getByRole('button', { name: 'Go', exact: true }).click();
		await expect(page.getByRole('heading', { level: 2 })).toHaveText([first]);
		await filters.getByRole('button', { name: 'Leadership', exact: true }).hover();
		await expect(preview).toContainText('Used in 1 project');
		await expect(page.locator('[data-muted], article[data-previewed]')).toHaveCount(0);
		await filters.getByRole('button', { name: 'Clear filters' }).click();
		await expect(page.getByRole('heading', { level: 2 })).toHaveCount(2);

		// The timeline: the preview is a small timeline of the skill's projects alone, and they
		// are outlined on the page's
		await page
			.getByRole('group', { name: 'View' })
			.getByRole('button', { name: 'Timeline' })
			.click();
		const bars = page.getByRole('region', { name: 'Timeline' }).locator('[data-timeline-project]');
		await expect(bars).toHaveCount(3);
		await filters.getByRole('button', { name: 'Leadership', exact: true }).hover();
		await expect(preview).toContainText('Used in 1 project');
		await expect(preview.getByRole('listitem')).toHaveText([/Platform/]);
		await expect(bars.and(page.locator('[data-previewed]'))).toHaveText([/Platform/]);
		const miniBars = preview.locator('[data-preview-timeline] [data-preview-bar]');
		await expect(miniBars).toHaveCount(1);
		// One bar a project, the earliest first and further left
		await kafka.hover();
		await expect(preview.getByRole('listitem')).toHaveText([/Streams/, /Platform/]);
		await expect(miniBars).toHaveCount(2);
		const earlier = await miniBars.nth(0).boundingBox();
		const later = await miniBars.nth(1).boundingBox();
		expect(earlier!.x + earlier!.width).toBeLessThanOrEqual(later!.x + 1);
		await expect(bars.and(page.locator('[data-previewed]'))).toHaveText([/Streams/, /Platform/]);
		await page.keyboard.press('Escape');
		await expect(preview).toHaveCount(0);

		// A tag inside the card under the timeline keeps the list: the small timeline is the
		// filters' tags'
		await bars.filter({ hasText: 'Streams' }).click();
		await card(page, first).getByText('Kafka', { exact: true }).hover();
		await expect(preview.getByRole('listitem')).toHaveText([/Platform/, /Streams/]);
		await expect(preview.locator('[data-preview-timeline]')).toHaveCount(0);
		await expect(bars.and(page.locator('[data-previewed]'))).toHaveText([/Streams/, /Platform/]);

		await page.keyboard.press('Escape');
		await expect(preview).toHaveCount(0);

		// A bar previews its own project: where, when and its skills
		await bars.filter({ hasText: 'Billing' }).hover();
		await expect(preview).toContainText('Billing');
		await expect(preview).toContainText(`${first} · E2E Corp`);
		await expect(preview).toContainText('Jan 2021 – Feb 2022 · 1 yr 2 mos');
		await expect(preview.getByRole('list', { name: 'Skills' })).toHaveText('Go');
		await expect(page.locator('[data-previewed]')).toHaveCount(0);

		// Moving away closes it
		await page.getByRole('heading', { level: 1 }).hover();
		await expect(preview).toHaveCount(0);
	});

	test('a preview opened with the keyboard closes once its tag is scrolled away', async ({
		page
	}) => {
		const first = `Backend Engineer ${tag}`;
		const second = `Designer ${tag}`;
		// Cards taller than a short screen: the page scrolls
		await createExperience({
			title: first,
			projects: ['Streams', 'Billing', 'Platform', 'Tooling'].map((name) =>
				project(name, ['Kafka'])
			)
		});
		await createExperience({
			title: second,
			start: month('2020-01'),
			end: month('2021-12'),
			projects: [project('Brand', ['Figma'])]
		});
		const preview = page.getByRole('tooltip');
		const filters = page.getByRole('region', { name: 'Filter experiences' });

		await page.setViewportSize({ width: 1280, height: 500 });
		await gotoHydrated(page, `/${DOMAIN}/experiences`);
		await filters.getByRole('button', { name: 'Figma', exact: true }).focus();
		await page.keyboard.press('Tab');
		await expect(filters.getByRole('button', { name: 'Kafka', exact: true })).toBeFocused();
		await expect(preview).toBeVisible();
		await expect(card(page, second)).toHaveAttribute('data-muted');

		// The tag keeps the focus and leaves the screen: no preview, and nothing stays dimmed
		await page
			.locator('#page')
			.evaluate((main) => main.scrollTo({ top: main.scrollHeight, behavior: 'instant' }));
		await expect(preview).toHaveCount(0);
		await expect(page.locator('[data-muted]')).toHaveCount(0);
	});

	test('a tap on a tag of a card shows the preview on a touch screen', async ({ browser }) => {
		const title = `Backend Engineer ${tag}`;
		await createExperience({ title, projects: [project('Streams', ['Kafka'])] });
		const context = await browser.newContext({
			hasTouch: true,
			viewport: { width: 390, height: 844 }
		});
		const page = await context.newPage();
		await blockGoogle(page);
		const preview = page.getByRole('tooltip');

		await gotoHydrated(page, `/${DOMAIN}/experiences`);
		await card(page, title).getByText('Kafka', { exact: true }).tap();
		await expect(preview).toBeVisible();
		await expect(preview).toContainText('Used in 1 project');
		// It fits the screen
		const box = await preview.boundingBox();
		expect(box!.x).toBeGreaterThanOrEqual(0);
		expect(box!.x + box!.width).toBeLessThanOrEqual(390);

		// A tap elsewhere closes it
		await page.getByRole('heading', { level: 2, name: title }).tap();
		await expect(preview).toHaveCount(0);
		await context.close();
	});
});
