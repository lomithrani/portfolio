import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { stubApi } from './support/api';
import { createJob, deleteJobs, jobPosting } from './support/jobs';
import {
	API_URL,
	JWT_SECRET,
	apiAs,
	blockGoogle,
	gotoHydrated,
	recruiterSession,
	reviewerSession,
	signIn,
	type OwnerSession
} from './support/owner';

// Matching (Path 2), the reviewers' page (/recruiter/reviews): the jobs a recruiter puts into
// matching wait there for one of the operator's reviewers, who reads each before it reaches any
// candidate, and approves it or rejects it with a reason. The reviewer is 'e2e.reviewer@example.com'
// (seeded by `bun run --cwd server seed:e2e`); the jobs are the e2e recruiter's, created and put
// into matching through the API by each test, named with its tag and removed afterwards (an
// interrupted run's, by the tag's prefix), and the reviewer decides on those alone: the other
// files' jobs may wait on the same page. They are freelance missions, which neither seeded
// candidate of matching accepts (their contract is a deal-breaker): approved, they are proposed to
// nobody the other files read.
//
// Anyone but a reviewer, and everyone while matching is off, reads only that the page is not
// available: those tests run with or without matching (matching off is answered in the browser).
// What needs matching on and the reviewer listed (the API run with MATCHING=true and
// MATCHING_REVIEWERS=e2e.reviewer@example.com, as CI's e2e job runs it) is skipped, saying why,
// otherwise. Google is never reached.

test.skip(!JWT_SECRET, 'Set JWT_SECRET to the API’s secret to sign in as the e2e reviewer');

/** Tags of this file: what an interrupted run left behind is removed before the tests */
const TAG_PREFIX = 'review';

let recruiter: OwnerSession;
let reviewer: OwnerSession;
let api: APIRequestContext;

test.beforeAll(async () => {
	recruiter = await recruiterSession();
	reviewer = await reviewerSession();
	api = await apiAs(recruiter);
	await deleteJobs(api, new RegExp(`\\b${TAG_PREFIX}-\\d+-[0-9a-z]+\\b`));
});

test.afterAll(async () => {
	await api?.dispose();
});

// Unique per test: names its postings, which it removes afterwards
let tag = '';
test.beforeEach(async ({ page }, testInfo) => {
	tag = `${TAG_PREFIX}-${testInfo.workerIndex}-${Date.now().toString(36)}`;
	await blockGoogle(page);
});

test.afterEach(async () => {
	await deleteJobs(api, tag);
});

const open = async (page: Page, session: OwnerSession | null) => {
	if (session) await signIn(page, session);
	await gotoHydrated(page, '/recruiter/reviews');
};

/** Whether the page scrolls sideways (the window or the page's own scroller) */
const sidewaysScroll = (page: Page) =>
	page.evaluate(() => {
		const root = document.scrollingElement;
		const main = document.getElementById('page');
		return Math.max(
			root ? root.scrollWidth - root.clientWidth : 0,
			main ? main.scrollWidth - main.clientWidth : 0
		);
	});

/** What the page shows anyone but a reviewer: not available, and nothing of what it is */
const expectNotAvailable = async (page: Page, text = 'This page is not available.') => {
	await expect(page.getByRole('heading', { level: 2, name: 'Not available' })).toBeVisible();
	await expect(page.locator('main')).toContainText(text);
	await expect(page).toHaveTitle('Not available | Portfolio');
	await expect(page.getByRole('heading', { name: 'Jobs to review' })).toHaveCount(0);
	await expect(page.locator('main')).not.toContainText(/review|matching|candidate/i);
	// The header names no space: the site's name alone
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Portfolio');
};

test('with matching off, the page says only that it is not available', async ({ page }) => {
	// The API's answer while MATCHING is off: the route is not registered
	const reads = await stubApi(page, 'GET', '/matching/reviews', () => ({
		status: 404,
		text: 'NOT_FOUND'
	}));
	await open(page, reviewer);
	await expectNotAvailable(page);
	expect(reads).toHaveLength(1);
});

test('anyone but a reviewer reads that the page is not available, and nothing of what it is', async ({
	page
}) => {
	// A recruiter (403 with matching on, 404 with it off: the same page)
	await open(page, recruiter);
	await expectNotAvailable(page);
});

test('signed out, the page is not available, and nothing is asked', async ({ page }) => {
	const reads: string[] = [];
	page.on('request', (request) => {
		if (request.url().startsWith(`${API_URL}/matching/`)) reads.push(request.url());
	});
	await open(page, null);
	await expectNotAvailable(page, 'This page is not available without signing in.');
	expect(reads).toEqual([]);
});

test.describe('with matching on and the reviewer listed', () => {
	test.beforeEach(async () => {
		const reviewerApi = await apiAs(reviewer);
		const status = (await reviewerApi.get(`${API_URL}/matching/reviews`)).status();
		await reviewerApi.dispose();
		test.skip(
			status === 404,
			'Matching is off in the API under test (GET /matching/reviews answers 404): run it with MATCHING=true'
		);
		test.skip(
			status === 403,
			'The e2e reviewer is not a reviewer of the API under test: run it with MATCHING_REVIEWERS=e2e.reviewer@example.com'
		);
	});

	/** A freelance mission of the e2e recruiter, open, then put into matching (waiting for a review) */
	const jobInMatching = async (title: string, pay: { min: number; max: number }) => {
		const job = await createJob(api, {
			title,
			status: 'open',
			company: 'E2E Review Corp',
			description: `## The mission\n\nCreated by an end-to-end test (${tag}).`,
			location: { country: 'FR', city: 'Lyon', workMode: 'hybrid', remoteDaysPerWeek: 2 },
			contract: { type: 'freelance' },
			pay: { ...pay, currency: 'EUR', period: 'day' }
		});
		const response = await api.put(`${API_URL}/jobs/${job._id}/matching`, {
			data: { enabled: true }
		});
		expect(response.ok(), await response.text()).toBe(true);
		expect((await response.json()).matching.review.status).toBe('pending');
		return job;
	};

	const reviewOf = async (jobId: string) =>
		(await (await api.get(`${API_URL}/recruiter/jobs/${jobId}`)).json()).matching.review;

	test('a reviewer reads a job with its recruiter’s copies flagged, approves it, and rejects a copy with a reason, at 390 px', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		const title = `Platform mission ${tag}`;
		const first = await jobInMatching(title, { min: 500, max: 600 });
		// A copy of it (the same company and title) that differs in its pay
		const copy = await jobInMatching(title, { min: 550, max: 650 });

		await open(page, reviewer);
		await expect(page.getByRole('heading', { level: 2, name: 'Jobs to review' })).toBeVisible();
		await expect(page).toHaveTitle('Jobs to review | Portfolio');
		await expect(page.locator('[data-reviews-count]')).toContainText(/wait.* for a review/);

		const section = page.locator(`[data-review="${first._id}"]`);
		await expect(section.getByRole('heading', { level: 3, name: title })).toBeVisible();
		await expect(section).toContainText('E2E Review Corp');
		await expect(section).toContainText('Created by an end-to-end test');
		await expect(section.locator('[data-waiting-since]')).toContainText(
			'Waiting for a review since'
		);
		// Who is behind it: the domain of their address and their key, never their name or address
		await expect(section.locator('[data-email-domain]')).toHaveText('example.com');
		await expect(section.locator('[data-recruiter-key]')).toHaveText(/^[0-9a-f]{12}$/);
		const key = await section.locator('[data-recruiter-key]').innerText();
		await expect(page.locator(`[data-review="${copy._id}"] [data-recruiter-key]`)).toHaveText(key);
		await expect(section).not.toContainText(/Rita|e2e\.recruiter/);

		// Its copy, flagged with the terms it differs in, and a link to it on the page
		const copyThere = section.locator(`[data-other-job="${copy._id}"]`);
		await expect(copyThere).toHaveAttribute('data-near-duplicate', '');
		await expect(copyThere.locator('[data-differs-in]')).toHaveText(
			'Differs in: Minimum pay and Maximum pay'
		);
		await expect(section.locator('[data-copies-warning]')).toContainText(/is a copy of this job/);
		await copyThere.getByRole('link', { name: 'Waiting on this page' }).click();
		await expect(
			page.locator(`[data-review="${copy._id}"]`).getByRole('heading', { level: 3, name: title })
		).toBeFocused();
		expect(await sidewaysScroll(page)).toBe(0);

		// Approve, asked first
		await section.getByRole('button', { name: 'Approve' }).click();
		const dialog = page.getByRole('alertdialog', { name: 'Approve this job description?' });
		await expect(dialog).toContainText('is proposed at once to the candidates');
		await dialog.getByRole('button', { name: 'Approve' }).click();
		await expect(dialog).toHaveCount(0);
		await expect(section).toHaveCount(0);
		await expect(page.locator('[data-reviews-said]')).toHaveText(
			`Approved: ${title}. It is proposed to the candidates whose criteria it meets.`
		);
		await expect(page.locator(':focus')).toHaveAttribute('id', /^review/);
		const approved = await reviewOf(first._id);
		expect(approved.status).toBe('approved');

		// Reject the copy: a reason first (nothing is sent without one), then in the reviewer's words
		const copySection = page.locator(`[data-review="${copy._id}"]`);
		const decisions: string[] = [];
		page.on('request', (request) => {
			if (request.method() === 'PUT' && request.url().includes('/matching/reviews/'))
				decisions.push(request.url());
		});
		await copySection.getByRole('button', { name: 'Reject' }).click();
		await expect(copySection.locator('[data-reason-error]')).toHaveText(
			'Say why the job is not accepted: its recruiter reads it.'
		);
		await expect(copySection.getByLabel('Why you reject it')).toBeFocused();
		expect(decisions).toEqual([]);
		const reason = 'A copy of another job of yours with another pay: post one job per role.';
		await copySection.getByLabel('Why you reject it').fill(reason);
		await copySection.getByRole('button', { name: 'Reject' }).click();
		await expect(copySection).toHaveCount(0);
		await expect(page.locator('[data-reviews-said]')).toHaveText(
			`Rejected: ${title}. Its recruiter reads your reason.`
		);
		expect(decisions).toHaveLength(1);
		const rejected = await reviewOf(copy._id);
		expect(rejected).toMatchObject({ status: 'rejected', reason });
	});

	test('a job edited since it was read is not decided on: the page says so and shows it as it is now', async ({
		page
	}) => {
		const title = `Data mission ${tag}`;
		const job = await jobInMatching(title, { min: 500, max: 600 });

		await open(page, reviewer);
		const section = page.locator(`[data-review="${job._id}"]`);
		await expect(section).toContainText('Created by an end-to-end test');

		// The recruiter edits its description meanwhile (its terms are locked)
		const edited = await api.put(`${API_URL}/jobs/${job._id}`, {
			data: jobPosting({
				title,
				status: 'open',
				company: 'E2E Review Corp',
				description: `## The mission\n\nEdited by an end-to-end test (${tag}).`,
				location: { country: 'FR', city: 'Lyon', workMode: 'hybrid', remoteDaysPerWeek: 2 },
				contract: { type: 'freelance' },
				pay: { min: 500, max: 600, currency: 'EUR', period: 'day' }
			})
		});
		expect(edited.ok(), await edited.text()).toBe(true);

		await section.getByRole('button', { name: 'Approve' }).click();
		const dialog = page.getByRole('alertdialog', { name: 'Approve this job description?' });
		await dialog.getByRole('button', { name: 'Approve' }).click();
		await expect(dialog).toHaveCount(0);
		await expect(page.locator('[data-reviews-said]')).toHaveText(
			'This job description changed since you read it. Here it is as it is now: read it again before you decide.'
		);
		await expect(section).toContainText('Edited by an end-to-end test');
		await expect(section.getByRole('heading', { level: 3, name: title })).toBeFocused();
		expect((await reviewOf(job._id)).status).toBe('pending');
	});
});
