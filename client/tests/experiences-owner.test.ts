import {
	expect,
	request as playwrightRequest,
	test,
	type APIRequestContext,
	type Page
} from '@playwright/test';

// The owner's flows on the experiences page: add, edit, delete, discard, and the filters.
// They run against the e2e seed (`bun run --cwd server seed:e2e`): the domain 'e2e-owner' and its
// owner, kept for these tests. They sign in without Google, with a session JWT signed with the
// API's JWT_SECRET (the claims POST /login issues), and each test adds the experiences it needs
// through the API, named with its own tag, and removes them afterwards. They share the domain, so
// they run one after the other (as the tests of a file do by default: keep it that way).

const DOMAIN = 'e2e-owner';
// Same API as the web server under test (see playwright.config.ts)
const API_URL = process.env.PUBLIC_PORTFOLIO_API_URL ?? 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET;

test.skip(!JWT_SECRET, 'Set JWT_SECRET to the API’s secret to sign in as the e2e owner');

const base64url = (bytes: Uint8Array) =>
	btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

/** An HS256 session JWT ({ sub, exp }), as POST /login issues it */
const signSession = async (userId: string, exp: number) => {
	const encoder = new TextEncoder();
	const encode = (value: unknown) => base64url(encoder.encode(JSON.stringify(value)));
	const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, exp })}`;
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(JWT_SECRET),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(unsigned));
	return `${unsigned}.${base64url(new Uint8Array(signature))}`;
};

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

let ownerId = '';
let session = { token: '', exp: 0 };
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
const project = (name: string, hard: SkillName[] = [], soft: SkillName[] = []) => ({
	name,
	summary: '',
	start: '2023-01-01T00:00:00.000Z',
	end: '2023-06-01T00:00:00.000Z',
	hardSkills: hard.map((skill) => ({ name: skill, level: -1 })),
	softSkills: soft.map((skill) => ({ name: skill, level: -1 }))
});

const createExperience = async (body: {
	title: string;
	type?: string;
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
	const anonymous = await playwrightRequest.newContext();
	const domain = await anonymous.get(`${API_URL}/domain/${DOMAIN}`);
	expect(domain.ok(), `GET /domain/${DOMAIN}: run \`bun run --cwd server seed:e2e\``).toBe(true);
	ownerId = String((await domain.json()).admin);
	await anonymous.dispose();

	const exp = Math.floor(Date.now() / 1000) + 3600;
	session = { token: await signSession(ownerId, exp), exp };
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
test.beforeEach(async ({ context }, testInfo) => {
	tag = `${testInfo.workerIndex}-${Date.now().toString(36)}`;
	// Google (Sign-In script, fonts) is never reached
	await context.route(
		/^https?:\/\/([^/]*\.)?(google|gstatic|googleapis|googleusercontent)\.com\//,
		(route) => route.abort()
	);
});

test.afterEach(async () => {
	for (const experience of await listExperiences()) {
		if (experience.title.includes(tag)) await deleteExperience(experience._id);
	}
});

/** The owner's session: the auth cookie of the API and the persisted session of the client */
const signIn = async (page: Page) => {
	await page.context().addCookies([
		{
			name: 'auth',
			value: session.token,
			url: API_URL,
			httpOnly: true,
			sameSite: 'Strict',
			expires: session.exp
		}
	]);
	await page.addInitScript(
		(value) => localStorage.setItem('authenticationStore', value),
		JSON.stringify({ user: { _id: ownerId }, expires: session.exp })
	);
};

/** Navigates and waits until the page has hydrated and the session was checked with the API */
const gotoHydrated = async (page: Page, path: string) => {
	const isLogged = page.waitForResponse((response) => response.url().endsWith('/isLogged'));
	const response = await page.goto(path);
	await isLogged;
	return response;
};

const openAsOwner = async (page: Page) => {
	await signIn(page);
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
	test('narrow the list by type and skill, and keep the selection in the URL', async ({ page }) => {
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

		await filters.getByRole('button', { name: 'Professional 2' }).click();
		await expect(filters.getByRole('status')).toHaveText('2 of 3 experiences');
		await filters.getByRole('button', { name: 'Kafka', exact: true }).click();
		await expect(filters.getByRole('status')).toHaveText('1 of 3 experiences');
		await expect(headings).toHaveText([backend]);
		await expect.poll(() => new URL(page.url()).search).toBe('?skills=kafka&type=professional');

		// A shared link renders the same selection (on the server, then hydrated)
		await gotoHydrated(page, page.url());
		await expect(headings).toHaveText([backend]);
		await expect(filters.getByRole('button', { name: 'Kafka', exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(filters.getByRole('button', { name: 'Professional 1' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);

		await filters.getByRole('button', { name: 'Clear filters' }).click();
		await expect(headings).toHaveCount(3);
		await expect.poll(() => new URL(page.url()).search).toBe('');
	});
});
