import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { E2E_MATCHING, expectMatchingMode, stubApi } from './support/api';
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
// Anyone but a reviewer, anyone signed out, and everyone while matching is off, reads only that
// the page is not available: those tests run with or without matching (matching off is answered in
// the browser), and so do the page's states answered in the browser (a failed read, nothing
// waiting, a decision refused, a session expired). What needs matching on and the reviewer listed
// (the API run with MATCHING=true and MATCHING_REVIEWERS=e2e.reviewer@example.com, as the `on` leg
// of CI's e2e job runs it) is skipped, saying why, otherwise; in CI, matching off or the reviewer
// refused under the `on` leg, or matching answering under the `off` leg, fails rather than skip
// (E2E_MATCHING, expectMatchingMode of support/api.ts).
// Google is never reached.

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
const expectNotAvailable = async (page: Page) => {
	await expect(page.getByRole('heading', { level: 2, name: 'Not available' })).toBeVisible();
	await expect(page.locator('main')).toContainText('This page is not available.');
	// Nothing says signing in would open it
	await expect(page.locator('main')).not.toContainText(/sign(ing)? in/i);
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
	await expectNotAvailable(page);
	expect(reads).toEqual([]);
});

// --- The page's states, the API answered in the browser (with or without matching) ------------

const STUB_ID = '65e2e0000000000000000301';
const STUB_COPY_ID = '65e2e0000000000000000302';
const AT = '2026-11-20T10:00:00.000Z';

/** A job waiting for a review, as GET /matching/reviews lists it */
const stubEntry = (
	_id: string,
	fields: { title?: string; status?: string; description?: string; version?: string } = {}
) => ({
	job: {
		_id,
		title: fields.title ?? 'Stubbed platform mission',
		company: 'E2E Review Corp',
		description: fields.description ?? '## The mission\n\nAnswered in the browser.',
		status: fields.status ?? 'open',
		createdAt: AT,
		updatedAt: AT,
		publishedAt: AT,
		location: { country: 'FR', city: 'Lyon', workMode: 'hybrid', remoteDaysPerWeek: 2 },
		contract: { type: 'freelance' },
		pay: { min: 500, max: 600, currency: 'EUR', period: 'day' }
	},
	recruiter: { emailDomain: 'example.com', key: 'a1b2c3d4e5f6' },
	otherJobs: [],
	matchingSince: AT,
	review: { status: 'pending', requestedAt: AT, reviewedAt: null, reason: null },
	version: fields.version ?? 'v1'
});

test('a failed first read says only that the page could not be loaded, and Try again reads it', async ({
	page
}) => {
	const reads = await stubApi(page, 'GET', '/matching/reviews', (_request, index) =>
		index === 0 ? { status: 500, text: 'Oops' } : { json: { jobs: [stubEntry(STUB_ID)] } }
	);
	await open(page, reviewer);
	await expect(
		page.getByRole('heading', { level: 2, name: 'This page could not be loaded' })
	).toBeVisible();
	await expect(page.locator('main')).not.toContainText(/review|matching|candidate/i);
	await page.getByRole('button', { name: 'Try again' }).click();
	await expect(page.getByRole('heading', { level: 2, name: 'Jobs to review' })).toBeFocused();
	await expect(page.locator(`[data-review="${STUB_ID}"]`)).toContainText('Answered in the browser');
	expect(reads).toHaveLength(2);
});

test('nothing waiting: the page says so, with no count and no email promised', async ({ page }) => {
	await stubApi(page, 'GET', '/matching/reviews', () => ({ json: { jobs: [] } }));
	await open(page, reviewer);
	await expect(page.getByRole('heading', { level: 2, name: 'Nothing to review' })).toBeVisible();
	await expect(page.locator('main')).toContainText('No email tells you: check again later.');
	await expect(page.locator('[data-reviews-count]')).toHaveCount(0);
	await expect(page.locator('[data-review]')).toHaveCount(0);
});

test('a decision on a job no longer waiting says so, the focus on it, and the list is read again', async ({
	page
}) => {
	const reads = await stubApi(page, 'GET', '/matching/reviews', (_request, index) => ({
		json: { jobs: index === 0 ? [stubEntry(STUB_ID)] : [] }
	}));
	const decisions = await stubApi(page, 'PUT', `/matching/reviews/${STUB_ID}`, () => ({
		status: 404,
		text: 'Job posting not found'
	}));
	await open(page, reviewer);
	const section = page.locator(`[data-review="${STUB_ID}"]`);
	await section.getByRole('button', { name: 'Approve' }).click();
	const dialog = page.getByRole('alertdialog', { name: 'Approve this job description?' });
	await dialog.getByRole('button', { name: 'Approve' }).click();
	await expect(dialog).toHaveCount(0);
	const notice = page.locator('[data-reviews-notice]');
	await expect(notice).toHaveText(
		'Your decision was not saved: this job description no longer waits for a review. Its recruiter no longer asks to propose it to candidates, or deleted it.'
	);
	await expect(notice).toBeFocused();
	await expect(section).toHaveCount(0);
	await expect(page.getByRole('heading', { level: 2, name: 'Nothing to review' })).toBeVisible();
	expect(decisions).toHaveLength(1);
	expect(reads).toHaveLength(2);
});

test('a decision refused as changed whose list cannot be read again says both next to the button, the list and the reason kept', async ({
	page
}) => {
	await stubApi(page, 'GET', '/matching/reviews', (_request, index) =>
		index === 0 ? { json: { jobs: [stubEntry(STUB_ID)] } } : { status: 500, text: 'Oops' }
	);
	await stubApi(page, 'PUT', `/matching/reviews/${STUB_ID}`, () => ({
		status: 409,
		text: 'This job posting was changed since you opened it'
	}));
	await open(page, reviewer);
	const section = page.locator(`[data-review="${STUB_ID}"]`);
	const reason = 'Copies of one job with another pay.';
	await section.getByLabel('Why you reject it').fill(reason);
	await section.getByRole('button', { name: 'Reject' }).click();
	await expect(section.getByRole('alert')).toHaveText(
		'Your decision was not saved: this job description changed since you read it. The list could not be read again: check again, then read the job as it is now before you decide.'
	);
	await expect(section.getByLabel('Why you reject it')).toHaveValue(reason);
	await expect(section).toContainText('Answered in the browser');
});

test('a job changed since it was read is shown as it is now, said under its title', async ({
	page
}) => {
	await stubApi(page, 'GET', '/matching/reviews', (_request, index) => ({
		json: {
			jobs: [
				stubEntry(STUB_COPY_ID, { title: 'Another mission' }),
				index === 0
					? stubEntry(STUB_ID)
					: stubEntry(STUB_ID, { description: 'Edited meanwhile.', version: 'v2' })
			]
		}
	}));
	await stubApi(page, 'PUT', `/matching/reviews/${STUB_ID}`, () => ({
		status: 409,
		text: 'This job posting was changed since you opened it'
	}));
	await open(page, reviewer);
	const section = page.locator(`[data-review="${STUB_ID}"]`);
	await section.getByLabel('Why you reject it').fill('Another pay.');
	await section.getByRole('button', { name: 'Reject' }).click();
	const said =
		'Your decision was not saved: this job description changed since you read it. Here it is as it is now: read it again before you decide.';
	await expect(section.locator('[data-review-notice]')).toHaveText(said);
	await expect(page.locator('[data-reviews-said]')).toHaveText(said);
	await expect(section).toContainText('Edited meanwhile.');
	await expect(
		section.getByRole('heading', { level: 3, name: 'Stubbed platform mission' })
	).toBeFocused();
	// What the reviewer typed stays; the notice goes with their next decision
	await expect(section.getByLabel('Why you reject it')).toHaveValue('Another pay.');
});

test('a session that expires keeps the page and what was typed, and says so next to the button', async ({
	page
}) => {
	await stubApi(page, 'GET', '/matching/reviews', () => ({ json: { jobs: [stubEntry(STUB_ID)] } }));
	await stubApi(page, 'PUT', `/matching/reviews/${STUB_ID}`, () => ({
		status: 401,
		text: 'Unauthorized'
	}));
	await open(page, reviewer);
	const section = page.locator(`[data-review="${STUB_ID}"]`);
	await section.getByLabel('Why you reject it').fill('A copy of another job.');
	await section.getByRole('button', { name: 'Reject' }).click();
	await expect(section.getByRole('alert')).toHaveText(
		'Your session expired: your decision was not saved. What you wrote is still here: sign in again in another tab, then try again.'
	);
	await expect(section.getByLabel('Why you reject it')).toHaveValue('A copy of another job.');
	await expect(page.getByRole('heading', { level: 2, name: 'Jobs to review' })).toBeVisible();
});

test('Check again that fails keeps the list and says so', async ({ page }) => {
	await stubApi(page, 'GET', '/matching/reviews', (_request, index) =>
		index === 0 ? { json: { jobs: [stubEntry(STUB_ID)] } } : { status: 500, text: 'Oops' }
	);
	await open(page, reviewer);
	await page.getByRole('button', { name: 'Check again' }).click();
	await expect(page.locator('[data-reviews-said]')).toHaveText(
		'The list could not be checked again: it is the one read before. Try again.'
	);
	await expect(page.locator(`[data-review="${STUB_ID}"]`)).toBeVisible();
});

test('a job on hold is approved without a promise that it reaches candidates now', async ({
	page
}) => {
	await stubApi(page, 'GET', '/matching/reviews', (_request, index) => ({
		json: { jobs: index === 0 ? [stubEntry(STUB_ID, { status: 'on_hold' })] : [] }
	}));
	await stubApi(page, 'PUT', `/matching/reviews/${STUB_ID}`, () => ({
		json: stubEntry(STUB_ID, { status: 'on_hold' })
	}));
	await open(page, reviewer);
	const section = page.locator(`[data-review="${STUB_ID}"]`);
	await expect(section.locator('[data-review-on-hold]')).toBeVisible();
	await section.getByRole('button', { name: 'Approve' }).click();
	const dialog = page.getByRole('alertdialog', { name: 'Approve this job description?' });
	await expect(dialog).toContainText(
		'Stubbed platform mission is on hold: once approved, it is proposed to the candidates whose criteria it meets only when its recruiter opens it again'
	);
	await expect(dialog).toContainText('You cannot take this back on this page');
	await dialog.getByRole('button', { name: 'Approve' }).click();
	await expect(page.locator('[data-reviews-said]')).toHaveText(
		'Approved: Stubbed platform mission. It is on hold: it can be proposed to candidates once its recruiter opens it again.'
	);
	await expect(page.getByRole('heading', { level: 2, name: 'Nothing to review' })).toBeFocused();
});

test('a full read says more wait after the jobs shown', async ({ page }) => {
	// As many as one read lists (MATCHING_LIMITS.reviewsPerRead)
	const jobs = Array.from({ length: 100 }, (_, index) =>
		stubEntry(`65e2e0000000000000${String(400000 + index)}`, { title: `Mission ${index}` })
	);
	await stubApi(page, 'GET', '/matching/reviews', () => ({ json: { jobs } }));
	await open(page, reviewer);
	await expect(page.locator('[data-reviews-count]')).toHaveText(
		'These 100 job descriptions have waited longest, the oldest first, and more wait after them: they show here when the list is read again, once you decide these or when you check again.'
	);
});

test.describe('with matching on and the reviewer listed', () => {
	test.beforeEach(async () => {
		const reviewerApi = await apiAs(reviewer);
		const status = (await reviewerApi.get(`${API_URL}/matching/reviews`)).status();
		await reviewerApi.dispose();
		// In CI, the leg's mode: matching off under `on` (a 404), or the e2e reviewer refused (a 403),
		// is a failure there, never a skip
		expectMatchingMode({ matching: status !== 404 });
		if (E2E_MATCHING === 'on') {
			expect(status, 'GET /matching/reviews as the e2e reviewer').toBe(200);
		}
		test.skip(
			status === 404,
			'Matching is off in the API under test (GET /matching/reviews answers 404): run it with MATCHING=true'
		);
		test.skip(
			status === 403,
			'The e2e reviewer is not a reviewer of the API under test: run it with MATCHING_REVIEWERS=e2e.reviewer@example.com, after `bun run --cwd server seed:e2e` (which seeds that account)'
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
		await expect(dialog).toContainText(
			`Once approved, ${title} is proposed to the candidates whose criteria it meets, while it stays open and its recruiter has accepted the terms in force.`
		);
		await dialog.getByRole('button', { name: 'Approve' }).click();
		await expect(dialog).toHaveCount(0);
		await expect(section).toHaveCount(0);
		await expect(page.locator('[data-reviews-said]')).toHaveText(
			`Approved: ${title}. It can now be proposed to the candidates whose criteria it meets.`
		);
		// The focus on the next job's title (another job's, not a fallback of the page)
		const focused = page.locator(':focus');
		await expect(focused).toHaveAttribute('id', /^review-[0-9a-f]{24}$/);
		await expect(focused).not.toHaveAttribute('id', `review-${first._id}`);
		await expect(page.locator('[data-review] h3:focus')).toHaveCount(1);
		const approved = await reviewOf(first._id);
		expect(approved.status).toBe('approved');
		// The copy's list of other jobs reads the approval just saved
		await expect(
			page.locator(`[data-review="${copy._id}"] [data-other-job="${first._id}"]`)
		).toContainText('Approved');

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
		const said =
			'Your decision was not saved: this job description changed since you read it. Here it is as it is now: read it again before you decide.';
		await expect(page.locator('[data-reviews-said]')).toHaveText(said);
		await expect(section.locator('[data-review-notice]')).toHaveText(said);
		await expect(section).toContainText('Edited by an end-to-end test');
		await expect(section.getByRole('heading', { level: 3, name: title })).toBeFocused();
		expect((await reviewOf(job._id)).status).toBe('pending');
	});
});
