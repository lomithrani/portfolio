import {
	expect,
	request as playwrightRequest,
	test,
	type APIRequestContext,
	type Page,
	type Route
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

// The résumé import of the experiences page, as the owner of 'e2e-import' (seeded by
// `bun run --cwd server seed:e2e`, kept for these tests). GET and POST /experiences/import are
// stubbed in the browser: Claude is never called (it needs the operator's key and is billed).
// The drafts are saved for real, through POST /experiences of the e2e API. Each test names what
// it creates with its own tag and removes it afterwards.

const DOMAIN = 'e2e-import';

test.skip(!JWT_SECRET, 'Set JWT_SECRET to the API’s secret to sign in as the e2e owner');

type ListedExperience = {
	_id: string;
	title: string;
	type: string;
	location?: string;
	start?: string;
	end?: string;
	company?: { name: string };
	projects: { name: string; hardSkills: { skill: { displayName: string } }[] }[];
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
	expect([200, 404]).toContain(response.status());
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

type ImportStatus = { enabled: boolean; limit: number; remaining: number; resetsAt: string | null };

/**
 * Answers GET and POST /experiences/import in the browser, with the CORS headers the API would
 * send (the page and the API are on different origins). Returns the requests it answered.
 */
const stubImport = async (
	page: Page,
	{
		status,
		post = (route) => route.fulfill({ status: 500, body: 'Unexpected import' })
	}: {
		status: () => ImportStatus;
		post?: (route: Route) => Promise<void>;
	}
) => {
	const calls = { get: 0, post: [] as { file: string; fileName?: string }[] };
	await page.route(`${API_URL}/experiences/import`, async (route) => {
		const request = route.request();
		const cors = {
			'access-control-allow-origin': request.headers()['origin'] ?? '*',
			'access-control-allow-credentials': 'true'
		};
		if (request.method() === 'OPTIONS') {
			return route.fulfill({
				status: 204,
				headers: {
					...cors,
					'access-control-allow-methods': 'GET, POST',
					'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? ''
				}
			});
		}
		if (request.method() === 'GET') {
			calls.get++;
			return route.fulfill({ json: status(), headers: cors });
		}
		calls.post.push(request.postDataJSON());
		// The handler answers with CORS headers too
		return post({
			...route,
			fulfill: (options) => route.fulfill({ ...options, headers: { ...cors, ...options?.headers } })
		} as Route);
	});
	return calls;
};

const enabled = (overrides: Partial<ImportStatus> = {}): ImportStatus => ({
	enabled: true,
	limit: 3,
	remaining: 2,
	resetsAt: null,
	...overrides
});

const PDF = {
	name: 'cv.pdf',
	mimeType: 'application/pdf',
	buffer: Buffer.from('%PDF-1.4\n%e2e\n')
};

const openAsOwner = async (page: Page) => {
	await signIn(page, session);
	const status = page.waitForResponse(
		(response) =>
			response.url() === `${API_URL}/experiences/import` && response.request().method() === 'GET'
	);
	await gotoHydrated(page, `/${DOMAIN}/experiences`);
	await status;
};

const card = (page: Page, title: string) =>
	page
		.locator('article')
		.filter({ has: page.getByRole('heading', { level: 2, name: title, exact: true }) });

/** Imports the résumé (POST /experiences/import stubbed with `extraction()`), up to the review */
const importDrafts = async (page: Page) => {
	await page.getByRole('button', { name: 'Import from résumé' }).click();
	const dialog = page.getByRole('dialog', { name: 'Import from résumé' });
	await dialog.locator('input[type="file"]').setInputFiles(PDF);
	await dialog.getByRole('button', { name: 'Import résumé' }).click();
	await expect(dialog.getByRole('list', { name: 'Experiences found' })).toBeVisible();
	return dialog;
};

/** Answers POST /experiences in the browser with `status`, with the CORS headers the API sends */
const refuseSave = (route: Route, status: number, body: string) =>
	route.fulfill({
		status,
		contentType: 'text/plain',
		body,
		headers: {
			'access-control-allow-origin': route.request().headers()['origin'] ?? '*',
			'access-control-allow-credentials': 'true'
		}
	});

/** What Claude would have read in a résumé: drafts named with the test's tag */
const extraction = () => ({
	experiences: [
		{
			type: 'professional',
			title: `Staff Engineer ${tag}`,
			company: 'Globex',
			location: 'Remote',
			start: '2023-02',
			current: true,
			summary: '- Led the payments platform\n- Cut **p95** latency by 60%',
			projects: [
				{
					name: `Payments ${tag}`,
					start: '2023-02',
					current: true,
					summary: '- Event pipeline',
					hardSkills: ['typescript', 'Kafka'],
					softSkills: ['Mentoring']
				}
			]
		},
		{
			// The portfolio has it already: same title and company, other case
			type: 'professional',
			title: `platform engineer ${tag}`,
			company: 'ACME',
			start: '2020-01',
			end: '2022-12',
			current: false,
			summary: '',
			projects: []
		},
		{
			type: 'educational',
			title: `MSc Computer Science ${tag}`,
			company: 'Université Paris',
			start: '2015-09',
			end: '2017-06',
			current: false,
			summary: '',
			projects: []
		},
		{
			type: 'personal',
			title: `Side project ${tag}`,
			start: '2021-05',
			current: false,
			summary: '- A home lab',
			projects: []
		}
	],
	warnings: ['Shortened 1 text that was too long'],
	quota: { limit: 3, remaining: 1, resetsAt: '2026-12-01T10:00:00.000Z' }
});

test.describe('résumé import', () => {
	test('is not offered while the API has it off', async ({ page }) => {
		await stubImport(page, { status: () => enabled({ enabled: false, remaining: 0 }) });
		await openAsOwner(page);

		await expect(page.getByRole('button', { name: 'Add your first experience' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Import from résumé' })).toHaveCount(0);
	});

	test('reads a PDF, and adds the drafts kept ticked', async ({ page }) => {
		const existing = `Platform Engineer ${tag}`;
		const created = await api.post(`${API_URL}/experiences`, {
			data: {
				type: 'professional',
				title: existing,
				company: { name: 'Acme' },
				summary: '',
				start: '2020-01-01T00:00:00.000Z',
				end: '2022-12-01T00:00:00.000Z',
				projects: [
					{
						name: 'Platform',
						summary: '',
						hardSkills: [{ name: 'TypeScript', level: -1 }],
						softSkills: []
					}
				]
			}
		});
		expect(created.ok(), await created.text()).toBe(true);

		let answer: () => void = () => {};
		const answered = new Promise<void>((resolve) => (answer = resolve));
		const calls = await stubImport(page, {
			status: () => enabled(),
			post: async (route) => {
				await answered;
				await route.fulfill({ json: extraction() });
			}
		});
		await openAsOwner(page);

		await page.getByRole('button', { name: 'Import from résumé' }).click();
		const dialog = page.getByRole('dialog', { name: 'Import from résumé' });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText('2 of 3 imports left this month')).toBeVisible();
		await expect(dialog.getByText(/sent to Anthropic’s Claude/)).toBeVisible();

		await dialog.locator('input[type="file"]').setInputFiles(PDF);
		await expect(dialog.getByText('cv.pdf', { exact: true })).toBeVisible();
		await dialog.getByRole('button', { name: 'Import résumé' }).click();

		// Reading, until the API answers
		await expect(dialog.getByText('Reading your résumé…')).toBeVisible();
		await expect(dialog.getByText(/this can take up to 3 minutes/)).toBeVisible();
		answer();

		const drafts = dialog.getByRole('list', { name: 'Experiences found' }).getByRole('listitem');
		await expect(drafts).toHaveCount(4);
		expect(calls.post).toEqual([{ file: PDF.buffer.toString('base64'), fileName: 'cv.pdf' }]);
		await expect(dialog.getByText('Shortened 1 text that was too long')).toBeVisible();

		// The duplicate is flagged and left out; the others are ticked
		const duplicate = drafts.filter({ hasText: `platform engineer ${tag}` });
		await expect(duplicate).toContainText('Already in your portfolio');
		await expect(
			dialog.getByRole('checkbox', { name: `Include platform engineer ${tag}` })
		).not.toBeChecked();
		await expect(dialog.getByText('3 of 4 selected')).toBeVisible();
		await expect(drafts.first()).toContainText('Globex · Remote · Feb 2023 – Present');

		await dialog.getByRole('checkbox', { name: `Include Side project ${tag}` }).uncheck();
		await expect(dialog.getByText('2 of 4 selected')).toBeVisible();
		await dialog.getByRole('button', { name: 'Add 2 experiences' }).click();

		await expect(page.getByText('2 experiences added')).toBeVisible();
		await expect(dialog).toBeHidden();
		await expect(card(page, `Staff Engineer ${tag}`)).toBeVisible();
		await expect(card(page, `MSc Computer Science ${tag}`)).toBeVisible();
		await expect(card(page, `Side project ${tag}`)).toHaveCount(0);

		const saved = await listExperiences();
		expect(saved.map((experience) => experience.title).sort()).toEqual(
			[existing, `MSc Computer Science ${tag}`, `Staff Engineer ${tag}`].sort()
		);
		const staff = saved.find((experience) => experience.title === `Staff Engineer ${tag}`);
		expect(staff).toMatchObject({
			type: 'professional',
			location: 'Remote',
			company: { name: 'Globex' },
			start: '2023-02-01T00:00:00.000Z'
		});
		expect(staff?.end).toBeUndefined();
		expect(staff?.projects.map((project) => project.name)).toEqual([`Payments ${tag}`]);
		// Spelled like the portfolio's own skill
		expect(staff?.projects[0].hardSkills.map((entry) => entry.skill.displayName)).toEqual([
			'TypeScript',
			'Kafka'
		]);

		// The import is over: the next one starts from the upload
		await page.getByRole('button', { name: 'Import from résumé' }).click();
		await expect(dialog.getByRole('button', { name: 'Choose a PDF' })).toBeVisible();
	});

	test('keeps the review across a reload; Edit adds a draft through the editor', async ({
		page
	}) => {
		await stubImport(page, {
			status: () => enabled(),
			post: (route) => route.fulfill({ json: extraction() })
		});
		await openAsOwner(page);

		await page.getByRole('button', { name: 'Import from résumé' }).click();
		const dialog = page.getByRole('dialog', { name: 'Import from résumé' });
		await dialog.locator('input[type="file"]').setInputFiles(PDF);
		await dialog.getByRole('button', { name: 'Import résumé' }).click();
		const drafts = dialog.getByRole('list', { name: 'Experiences found' }).getByRole('listitem');
		await expect(drafts).toHaveCount(4);

		// A reload loses nothing: the review is kept in this browser
		await gotoHydrated(page, `/${DOMAIN}/experiences`);
		await page.getByRole('button', { name: 'Continue import' }).click();
		await expect(drafts).toHaveCount(4);

		// The side project has a start but no end: the editor asks for it
		const side = drafts.filter({ hasText: `Side project ${tag}` });
		await expect(side).toContainText('Edit before adding');
		await side.getByRole('button', { name: `Edit Side project ${tag}` }).click();
		const editor = page.getByRole('dialog', { name: 'New experience' });
		await expect(editor).toBeVisible();
		await expect(editor.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
			`Side project ${tag}`
		);
		await editor.getByLabel('Ongoing').check();
		await editor.getByRole('button', { name: 'Add experience', exact: true }).click();

		// Back to the review, the draft added
		await expect(editor).toBeHidden();
		await expect(side).toContainText('Added');
		await expect(dialog.getByRole('checkbox', { name: `Include Side project ${tag}` })).toHaveCount(
			0
		);
		const sideSaved = (await listExperiences()).find(
			(experience) => experience.title === `Side project ${tag}`
		);
		expect(sideSaved).toMatchObject({ type: 'personal', start: '2021-05-01T00:00:00.000Z' });
		expect(sideSaved?.end).toBeUndefined();

		// Discarding asks first, then forgets the rest
		await dialog.getByRole('button', { name: 'Discard import' }).click();
		await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
		await expect(dialog).toBeHidden();
		await expect(card(page, `Side project ${tag}`)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Import from résumé' })).toBeVisible();
		await gotoHydrated(page, `/${DOMAIN}/experiences`);
		await expect(page.getByRole('button', { name: 'Import from résumé' })).toBeVisible();
		expect((await listExperiences()).map((experience) => experience.title)).toEqual([
			`Side project ${tag}`
		]);
	});

	test('keeps the changes made in the editor to a draft, after a reload or an expired session', async ({
		page
	}) => {
		await stubImport(page, {
			status: () => enabled(),
			post: (route) => route.fulfill({ json: extraction() })
		});
		await openAsOwner(page);
		let dialog = await importDrafts(page);
		const editor = page.getByRole('dialog', { name: 'New experience' });
		const titleInput = editor.getByRole('textbox', { name: 'Title', exact: true });
		const draftTitle = (title: string) =>
			dialog.getByRole('heading', { level: 3, name: title, exact: true });

		// Rewritten in the editor, then the page reloads before it is saved
		await dialog.getByRole('button', { name: `Edit Staff Engineer ${tag}` }).click();
		await titleInput.fill(`Staff Engineer ${tag} rewritten`);
		await gotoHydrated(page, `/${DOMAIN}/experiences`);
		await page.getByRole('button', { name: 'Continue import' }).click();
		dialog = page.getByRole('dialog', { name: 'Import from résumé' });
		await expect(draftTitle(`Staff Engineer ${tag} rewritten`)).toBeVisible();
		await dialog.getByRole('button', { name: `Edit Staff Engineer ${tag} rewritten` }).click();
		await expect(titleInput).toHaveValue(`Staff Engineer ${tag} rewritten`);

		// Changed again, and the session has expired when it is saved: closing keeps the changes
		await titleInput.fill(`Staff Engineer ${tag} v2`);
		await page.route(`${API_URL}/experiences`, (route) =>
			route.request().method() === 'POST'
				? refuseSave(route, 401, 'Unauthorized')
				: route.fallback()
		);
		await editor.getByRole('button', { name: 'Add experience', exact: true }).click();
		await expect(editor.getByRole('alert')).toContainText('Your session expired');
		await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(editor).toBeHidden();
		await expect(draftTitle(`Staff Engineer ${tag} v2`)).toBeVisible();
		// In the review only: the editor's copy is gone
		expect(
			await page.evaluate(() =>
				Object.keys(localStorage).filter((key) => key.startsWith('experienceDraft:'))
			)
		).toEqual([]);
		const stored = await page.evaluate(() =>
			Object.entries(localStorage)
				.filter(([key]) => key.startsWith('resumeImport:'))
				.map(([, value]) => JSON.parse(value).drafts[0].form.title)
		);
		expect(stored).toEqual([`Staff Engineer ${tag} v2`]);
	});

	test('keeps the page while drafts are added; tells to retry what the server failed', async ({
		page
	}) => {
		await stubImport(page, {
			status: () => enabled(),
			post: (route) => route.fulfill({ json: extraction() })
		});
		// Each draft takes a moment; the MSc fails on the server's side once
		let failMsc = true;
		await page.route(`${API_URL}/experiences`, async (route) => {
			if (route.request().method() !== 'POST') return route.fallback();
			await new Promise((resolve) => setTimeout(resolve, 600));
			if (failMsc && route.request().postDataJSON().title.startsWith('MSc')) {
				failMsc = false;
				return refuseSave(route, 500, 'Internal Server Error');
			}
			return route.fallback();
		});
		await openAsOwner(page);
		const dialog = await importDrafts(page);
		await dialog.getByRole('checkbox', { name: `Include Side project ${tag}` }).uncheck();

		const add = dialog.getByRole('button', { name: 'Add 3 experiences' });
		await add.focus();
		await page.keyboard.press('Enter');
		await expect(dialog.getByText(/Adding \d of 3…/)).toBeVisible();
		// The button keeps the focus while it works
		await expect(dialog.getByRole('button', { name: 'Adding…' })).toBeFocused();
		// A link (here the rail's "Hire") does not leave the page meanwhile
		await page.evaluate(() =>
			document.querySelector<HTMLAnchorElement>('a[href$="/hire"]')?.click()
		);
		await expect(dialog.getByText(/Adding \d of 3…/)).toBeVisible();

		await expect(dialog.getByText('2 experiences were added.')).toBeVisible();
		await expect(dialog.getByRole('alert')).toHaveText(
			'1 experience could not be added. Try adding it again in a moment.'
		);
		expect(new URL(page.url()).pathname).toBe(`/${DOMAIN}/experiences`);
		const msc = dialog.locator('[data-import-draft]', { hasText: `MSc Computer Science ${tag}` });
		await expect(msc).toContainText('Not added: Could not add it. Try again in a moment.');

		await dialog.getByRole('button', { name: 'Add 1 experience' }).click();
		await expect(page.getByText('Experience added')).toBeVisible();
		await expect(dialog).toBeHidden();
		// The dialog gives the focus back to the button that opens it
		await expect(page.getByRole('button', { name: 'Import from résumé' })).toBeFocused();
		expect((await listExperiences()).map((experience) => experience.title).sort()).toEqual(
			[`MSc Computer Science ${tag}`, `Staff Engineer ${tag}`, `platform engineer ${tag}`].sort()
		);
	});

	test('keeps the focus where the keyboard is, from the upload to the review', async ({ page }) => {
		let answer: () => void = () => {};
		const answered = new Promise<void>((resolve) => (answer = resolve));
		await stubImport(page, {
			status: () => enabled(),
			post: async (route) => {
				await answered;
				await route.fulfill({
					json: { ...extraction(), experiences: extraction().experiences.slice(0, 1) }
				});
			}
		});
		await openAsOwner(page);

		const trigger = page.getByRole('button', { name: 'Import from résumé' });
		await trigger.focus();
		await page.keyboard.press('Enter');
		const dialog = page.getByRole('dialog', { name: 'Import from résumé' });

		// The file chooser's button is replaced by "Choose another file", which takes the focus
		const chooser = page.waitForEvent('filechooser');
		await dialog.getByRole('button', { name: 'Choose a PDF' }).focus();
		await page.keyboard.press('Enter');
		await (await chooser).setFiles(PDF);
		await expect(dialog.getByRole('button', { name: 'Choose another file' })).toBeFocused();

		// Reading: on "Cancel import"; a confirmation cancelled gives the focus back
		await dialog.getByRole('button', { name: 'Import résumé' }).focus();
		await page.keyboard.press('Enter');
		await expect(dialog.getByRole('button', { name: 'Cancel import' })).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(dialog.getByRole('button', { name: 'Keep waiting' })).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(dialog.getByRole('button', { name: 'Cancel import' })).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(dialog.getByRole('button', { name: 'Keep waiting' })).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(dialog.getByRole('button', { name: 'Cancel import' })).toBeFocused();

		answer();
		await expect(dialog.getByRole('list', { name: 'Experiences found' })).toBeVisible();
		await dialog.getByRole('button', { name: 'Discard import' }).focus();
		await page.keyboard.press('Enter');
		await expect(dialog.getByRole('button', { name: 'Keep drafts' })).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(dialog.getByRole('button', { name: 'Discard import' })).toBeFocused();

		// Through the editor and back, then closed: the focus returns to the page's button
		await dialog.getByRole('button', { name: `Edit Staff Engineer ${tag}` }).click();
		const editor = page.getByRole('dialog', { name: 'New experience' });
		await expect(editor).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(editor).toBeHidden();
		await expect(dialog.getByRole('button', { name: `Edit Staff Engineer ${tag}` })).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		await expect(page.getByRole('button', { name: 'Continue import' })).toBeFocused();

		// Adding the last draft empties the review: the new card takes the focus (the empty
		// state's buttons are gone)
		await page.getByRole('button', { name: 'Continue import' }).click();
		await dialog.getByRole('button', { name: 'Add 1 experience' }).click();
		await expect(page.getByText('Experience added')).toBeVisible();
		await expect(
			card(page, `Staff Engineer ${tag}`).getByRole('button', {
				name: `Edit Staff Engineer ${tag}`
			})
		).toBeFocused();
	});

	test('shows the API’s message when the import is refused', async ({ page }) => {
		const message =
			'You have used your 3 résumé imports for this period. You can import again from 2026-12-01 10:00 UTC';
		let status = enabled({ remaining: 1 });
		const calls = await stubImport(page, {
			status: () => status,
			post: async (route) => {
				status = enabled({ remaining: 0, resetsAt: '2026-12-01T10:00:00.000Z' });
				await route.fulfill({
					status: 429,
					contentType: 'text/plain',
					headers: { 'retry-after': '3600' },
					body: message
				});
			}
		});
		await openAsOwner(page);

		await page.getByRole('button', { name: 'Import from résumé' }).click();
		const dialog = page.getByRole('dialog', { name: 'Import from résumé' });
		await dialog.locator('input[type="file"]').setInputFiles(PDF);
		await dialog.getByRole('button', { name: 'Import résumé' }).click();

		await expect(dialog.getByRole('alert')).toHaveText(message);
		// The allowance is asked again: a failed import may count
		await expect.poll(() => calls.get).toBe(2);
		await expect(dialog.getByText('You have no imports left for now.')).toBeVisible();
		// The message says when the next import is possible: not again, in another time zone
		await expect(dialog.getByText(/You can import again from/)).toHaveCount(1);
		// The file stays picked (another error could be worth a retry), but cannot be sent
		await expect(dialog.getByRole('button', { name: 'Import résumé' })).toBeDisabled();
	});
});
