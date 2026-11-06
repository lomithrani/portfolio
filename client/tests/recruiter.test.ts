import { expect, test, type APIRequestContext, type Page, type Route } from '@playwright/test';
import {
	API_URL,
	JWT_SECRET,
	apiAs,
	blockGoogle,
	gotoHydrated,
	recruiterSession,
	signIn,
	toasts,
	type OwnerSession
} from './support/owner';
import { createJob, deleteJobs, listRecruiterJobs } from './support/jobs';

// The recruiter space, as the e2e recruiter (seeded by `bun run --cwd server seed:e2e`: a
// recruiter space on the free plan, no domain): the job editor, the status and public page of a
// posting, its applicants added by name, the PDF import and the account menu. GET and POST
// /jobs/import are stubbed in the browser: Claude is never called (it needs the operator's key
// and is billed); the drafts are saved for real, through POST /jobs of the e2e API. Each test
// names its postings with its own tag and removes them afterwards. The tests share the recruiter
// (with client/tests/jobs-apply.test.ts, which runs in parallel), so they run one after the other
// (as the tests of a file do by default: keep it that way) and never expect its list to be empty.

test.skip(!JWT_SECRET, 'Set JWT_SECRET to the API’s secret to sign in as the e2e recruiter');

/** Tags of this file: what an interrupted run left behind is removed before the tests */
const TAG_PREFIX = 'rec';

let session: OwnerSession;
let api: APIRequestContext;

test.beforeAll(async () => {
	session = await recruiterSession();
	api = await apiAs(session);
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

const openAsRecruiter = async (page: Page, path: string) => {
	await signIn(page, session);
	await gotoHydrated(page, path);
};

/** A fact of a posting (its label, then its values) */
const fact = (page: Page, label: string) =>
	page.locator('dl > div').filter({ has: page.getByText(label, { exact: true }) });

const JOB_PAGE = /\/recruiter\/jobs\/([0-9a-f]{24})$/;

test.describe('the recruiter', () => {
	test('writes a job description, then opens it to candidates', async ({ page }) => {
		const title = `Backend engineer ${tag}`;
		await openAsRecruiter(page, '/recruiter');
		await page.getByRole('link', { name: 'New job description' }).click();
		await expect(
			page.getByRole('heading', { level: 2, name: 'New job description' })
		).toBeVisible();

		// The blank form lists what is missing, and goes to the first field
		await page.getByRole('button', { name: 'Create job description' }).click();
		await expect(page.getByText('Fix 5 problems before saving:')).toBeVisible();
		for (const problem of [
			'Job title: Title is required',
			'Description: Description is required',
			'City: City is required unless the job is fully remote',
			'Minimum pay: Minimum pay is required',
			'Maximum pay: Maximum pay is required'
		]) {
			await expect(page.getByRole('link', { name: problem })).toBeVisible();
		}
		const titleInput = page.getByRole('textbox', { name: 'Job title' });
		await expect(titleInput).toBeFocused();
		await expect(titleInput).toHaveAttribute('aria-invalid', 'true');

		// A hybrid CDD in Lyon, 39 h a week
		await titleInput.fill(title);
		await page.getByRole('textbox', { name: 'Job description' }).fill('## The job\n\nBuild APIs.');
		const workMode = page.getByRole('radiogroup', { name: 'Work mode' });
		await workMode.getByText('Hybrid', { exact: true }).click();
		await expect(workMode.getByRole('radio', { name: 'Hybrid' })).toBeChecked();
		await page.getByRole('textbox', { name: 'City', exact: true }).fill('Lyon');
		await page.getByRole('textbox', { name: 'Postal code' }).fill('69003');
		await page.getByLabel('Remote days a week').selectOption('2');
		await page.getByLabel('Contract type').selectOption('cdd');
		await page.getByRole('textbox', { name: 'Duration (months)' }).fill('12');
		await page.getByRole('textbox', { name: 'Hours per week' }).fill('39');
		await page.getByRole('textbox', { name: 'Minimum pay' }).fill('42 000');
		await page.getByRole('textbox', { name: 'Maximum pay' }).fill('50 000');
		await expect(page.getByText('Fix 5 problems before saving:')).toBeHidden();
		await expect(page.getByText('Candidates see: €42,000 – €50,000 gross per year')).toBeVisible();

		await page.getByRole('button', { name: 'Create job description' }).click();
		await expect(page).toHaveURL(JOB_PAGE);
		const id = JOB_PAGE.exec(new URL(page.url()).pathname)![1];
		await expect(toasts(page).getByText('Job description created', { exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
		await expect(fact(page, 'Location')).toContainText('Lyon (69003), France');
		await expect(fact(page, 'Location')).toContainText('Hybrid (2 days remote a week)');
		await expect(fact(page, 'Contract')).toContainText('CDD (fixed-term) · 12 months');
		await expect(fact(page, 'Working time')).toContainText('39 h/week');
		await expect(fact(page, 'Pay')).toContainText('€42,000 – €50,000 gross per year');

		// A draft: no public page yet
		await expect(page.getByText('Drafts have no public page.')).toBeVisible();
		expect((await page.request.get(`/jobs/${id}`)).status()).toBe(404);

		// Open: public, on the job board
		await page.getByRole('button', { name: 'Change status' }).click();
		await page.getByRole('menuitemradio', { name: /^Open/ }).click();
		await expect(toasts(page).getByText('Status changed to Open', { exact: true })).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'Address of the public page' })).toHaveValue(
			new URL(`/jobs/${id}`, page.url()).href
		);
		await gotoHydrated(page, '/jobs');
		await page.getByRole('link', { name: title, exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`/jobs/${id}$`));
		await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
		await expect(fact(page, 'Contract')).toContainText('CDD (fixed-term) · 12 months');
	});

	test('edits a job description, then deletes it', async ({ page }) => {
		const title = `Backend engineer ${tag}`;
		const { _id: id } = await createJob(api, { title, status: 'open' });
		expect((await page.request.get(`/jobs/${id}`)).status()).toBe(200);
		await openAsRecruiter(page, `/recruiter/jobs/${id}`);

		await page.getByRole('link', { name: 'Edit', exact: true }).click();
		await expect(
			page.getByRole('heading', { level: 2, name: 'Edit job description' })
		).toBeVisible();
		const titleInput = page.getByRole('textbox', { name: 'Job title' });
		await expect(titleInput).toHaveValue(title);
		await expect(page.getByRole('textbox', { name: 'City', exact: true })).toHaveValue('Paris');
		const newTitle = `Senior backend engineer ${tag}`;
		await titleInput.fill(newTitle);
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(page).toHaveURL(new RegExp(`/recruiter/jobs/${id}$`));
		await expect(toasts(page).getByText('Changes saved', { exact: true })).toBeVisible();
		await expect(
			page.getByRole('heading', { level: 2, name: newTitle, exact: true })
		).toBeVisible();

		// Delete, from the dashboard, once confirmed
		await gotoHydrated(page, '/recruiter');
		const list = page.getByRole('list', { name: 'Job descriptions' });
		const card = list.getByRole('listitem').filter({ hasText: newTitle });
		await expect(card).toContainText('Open');
		// Its name ends with the title (for screen readers): the only Delete of the card
		await card.getByRole('button', { name: /^Delete\b/ }).click();
		const dialog = page.getByRole('alertdialog', { name: `Delete “${newTitle}”?` });
		await expect(dialog).toContainText('This cannot be undone.');
		await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
		await expect(dialog).toBeHidden();
		await expect(toasts(page).getByText('Job description deleted', { exact: true })).toBeVisible();
		await expect(card).toHaveCount(0);
		expect((await listRecruiterJobs(api)).map((job) => job._id)).not.toContain(id);

		const response = await page.goto(`/jobs/${id}`);
		expect(response?.status()).toBe(404);
		await expect(page.getByRole('heading', { name: 'Job description not found' })).toBeVisible();
	});

	test('freezes the fields while saving, and never saves over changes made elsewhere', async ({
		page
	}) => {
		const title = `Platform engineer ${tag}`;
		const { _id: id } = await createJob(api, { title, status: 'draft' });
		await openAsRecruiter(page, `/recruiter/jobs/${id}/edit`);
		const titleInput = page.getByRole('textbox', { name: 'Job title' });
		await expect(titleInput).toHaveValue(title);

		// Published from another tab meanwhile: the editor still shows the draft
		const opened = await api.put(`${API_URL}/jobs/${id}/status`, { data: { status: 'open' } });
		expect(opened.ok()).toBe(true);
		await titleInput.fill(`${title} (typo fixed)`);
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(
			page.getByText(/^This job description was changed since you opened it/)
		).toBeVisible();
		// Nothing was overwritten: still open, still public
		const stored = await (await api.get(`${API_URL}/recruiter/jobs/${id}`)).json();
		expect([stored.status, stored.title]).toEqual(['open', title]);
		expect((await page.request.get(`/jobs/${id}`)).status()).toBe(200);

		// Reloaded: the saved posting, with the changes over it, flagged as older
		await page.getByRole('button', { name: 'Reload', exact: true }).click();
		await expect(
			page.getByText(
				'This job description was saved since you made them: check them before saving.'
			)
		).toBeVisible();
		await expect(titleInput).toHaveValue(`${title} (typo fixed)`);
		await page.getByLabel('Status').selectOption('open');

		// Saving: the fields take nothing until the answer (it would not be sent)
		await page.route(`${API_URL}/jobs/${id}`, async (route) => {
			if (route.request().method() === 'PUT') await new Promise((done) => setTimeout(done, 1500));
			await route.continue();
		});
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(page.getByRole('textbox', { name: 'Company' })).toBeDisabled();
		await expect(titleInput).toBeDisabled();
		await expect(page).toHaveURL(new RegExp(`/recruiter/jobs/${id}$`));
		const saved = await (await api.get(`${API_URL}/recruiter/jobs/${id}`)).json();
		expect([saved.status, saved.title]).toEqual(['open', `${title} (typo fixed)`]);
	});

	test('counts text typed in a list as a change, kept with the draft', async ({ page }) => {
		const title = `Site reliability engineer ${tag}`;
		const { _id: id } = await createJob(api, { title, status: 'draft' });
		await openAsRecruiter(page, `/recruiter/jobs/${id}/edit`);
		await expect(page.getByText('No changes yet')).toBeVisible();

		// Typed, Enter not pressed
		await page.getByRole('textbox', { name: 'Skills' }).fill('Rust');
		await page.getByRole('textbox', { name: 'Benefits' }).fill('Gym membership');
		await expect(page.getByText('Unsaved changes')).toBeVisible();
		await page.getByRole('link', { name: 'Cancel' }).click();
		const dialog = page.getByRole('alertdialog', { name: 'Leave without saving?' });
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: 'Leave', exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`/recruiter/jobs/${id}$`));

		// Back in the editor: the text is there, not added yet
		await gotoHydrated(page, `/recruiter/jobs/${id}/edit`);
		await expect(page.getByText('Restored your unsaved changes from this browser.')).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'Skills' })).toHaveValue('Rust');
		await expect(page.getByRole('textbox', { name: 'Benefits' })).toHaveValue('Gym membership');
		// Saved, it is added to the posting
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(page).toHaveURL(new RegExp(`/recruiter/jobs/${id}$`));
		const saved = await (await api.get(`${API_URL}/recruiter/jobs/${id}`)).json();
		expect([saved.requirements?.skills, saved.benefits]).toEqual([['Rust'], ['Gym membership']]);
	});

	test('a posting without openings keeps none through an edit', async ({ page }) => {
		const title = `Analytics engineer ${tag}`;
		const { _id: id } = await createJob(api, { title, status: 'draft', openings: undefined });
		await openAsRecruiter(page, `/recruiter/jobs/${id}/edit`);
		await expect(page.getByRole('textbox', { name: 'Openings' })).toHaveValue('');
		await expect(page.getByText('No changes yet')).toBeVisible();

		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(page).toHaveURL(new RegExp(`/recruiter/jobs/${id}$`));
		const saved = await (await api.get(`${API_URL}/recruiter/jobs/${id}`)).json();
		expect(saved).not.toHaveProperty('openings');
	});

	test('a posting deleted elsewhere is not reported as an applicant removed', async ({ page }) => {
		const job = await createJob(api, { title: `Temp posting ${tag}`, status: 'open' });
		const added = await api.post(`${API_URL}/jobs/${job._id}/applicants`, {
			data: { domain: 'e2e-applicant' }
		});
		expect(added.ok()).toBe(true);
		await openAsRecruiter(page, `/recruiter/jobs/${job._id}`);
		const applicants = page.getByRole('list', { name: 'Applicants' });
		await expect(applicants.getByRole('listitem')).toHaveCount(1);

		// Deleted from another tab
		expect((await api.delete(`${API_URL}/jobs/${job._id}`)).ok()).toBe(true);
		await applicants.getByRole('button', { name: 'Remove e2e-applicant' }).click();
		await page
			.getByRole('alertdialog', { name: 'Remove e2e-applicant?' })
			.getByRole('button', { name: 'Remove', exact: true })
			.click();

		await expect(page.getByRole('heading', { name: 'Job description not found' })).toBeVisible();
		await expect(toasts(page).getByText(/removed from the applicants/)).toHaveCount(0);
	});

	test('adds a portfolio to the applicants by its name, then removes it', async ({ page }) => {
		const job = await createJob(api, { title: `Data engineer ${tag}`, status: 'open' });
		await openAsRecruiter(page, `/recruiter/jobs/${job._id}`);
		await expect(page.getByText(/^No applicants yet\./)).toBeVisible();

		const field = page.getByRole('textbox', { name: 'Add a portfolio' });
		const add = page.getByRole('button', { name: 'Add', exact: true });
		const applicants = page.getByRole('list', { name: 'Applicants' });

		// No such portfolio: said under the field
		await field.fill(`nobody-${tag}`);
		await add.click();
		await expect(field).toHaveAttribute('aria-invalid', 'true');
		await expect(field).toHaveAccessibleDescription(
			/No portfolio is named “nobody-.+”\. Check how it is spelled\.$/
		);
		await expect(applicants).toHaveCount(0);

		await field.fill('e2e-applicant');
		await add.click();
		await expect(
			toasts(page).getByText('e2e-applicant added to the applicants', { exact: true })
		).toBeVisible();
		// The toast (bottom right) can cover the form, and stays while the pointer is over it:
		// dismissed, as a person would
		await toasts(page).getByRole('button', { name: 'Dismiss notification' }).click();
		await expect(field).not.toHaveAttribute('aria-invalid');
		await expect(field).toHaveValue('');
		await expect(applicants.getByRole('listitem')).toHaveCount(1);
		await expect(applicants).toContainText('Added by you');
		// Named by the portfolio: the candidate did not apply, their name stays theirs
		await expect(applicants).not.toContainText('Ada Applicant');
		await expect(applicants.getByRole('link', { name: /^e2e-applicant/ })).toHaveAttribute(
			'href',
			'/e2e-applicant/experiences'
		);

		// Listed once
		await field.fill('e2e-applicant');
		await add.click();
		await expect(field).toHaveAccessibleDescription(/“e2e-applicant” is already an applicant\.$/);
		await expect(applicants.getByRole('listitem')).toHaveCount(1);

		await applicants.getByRole('button', { name: 'Remove e2e-applicant' }).click();
		const dialog = page.getByRole('alertdialog', { name: 'Remove e2e-applicant?' });
		await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
		await expect(dialog).toBeHidden();
		await expect(
			toasts(page).getByText('e2e-applicant removed from the applicants', { exact: true })
		).toBeVisible();
		await expect(applicants).toHaveCount(0);
		await expect(page.getByText(/^No applicants yet\./)).toBeVisible();

		// Gone for the API too
		const detail = await api.get(`${API_URL}/recruiter/jobs/${job._id}`);
		expect((await detail.json()).applicants).toEqual([]);
	});

	test('the account menu names the recruiter space; Browse jobs opens the job board', async ({
		page
	}) => {
		await openAsRecruiter(page, '/recruiter');
		await page
			.getByRole('button', { name: 'Account menu: Rita Recruiter, Recruiter space' })
			.click();
		await expect(page.getByRole('menuitemradio', { name: /^Recruiter space/ })).toBeChecked();
		await expect(page.getByRole('menuitemradio', { name: /^Candidate space/ })).not.toBeChecked();
		// No portfolio: the candidate space offers to claim one
		await expect(page.getByRole('menuitemradio', { name: /^Candidate space/ })).toContainText(
			'Claim a portfolio'
		);

		await page.getByRole('menuitem', { name: 'Browse jobs' }).click();
		await expect(page).toHaveURL(/\/jobs$/);
		await expect(page.getByRole('heading', { level: 2, name: 'Open positions' })).toBeVisible();
	});

	test('signed out, /recruiter presents the recruiter space and asks for nothing private', async ({
		page
	}) => {
		const asked: string[] = [];
		page.on('request', (request) => {
			if (request.url().startsWith(API_URL)) asked.push(new URL(request.url()).pathname);
		});
		await gotoHydrated(page, '/recruiter');

		await expect(
			page.getByRole('heading', { level: 2, name: 'Recruit through portfolios' })
		).toBeVisible();
		await expect(page.getByText('Write clear job descriptions')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Browse open jobs' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Your job descriptions' })).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'New job description' })).toHaveCount(0);
		expect(
			asked.filter((path) => path.startsWith('/recruiter') || path === '/jobs/import')
		).toEqual([]);
	});
});

// --- PDF import ---------------------------------------------------------------------------

type ImportStatus = {
	enabled: boolean;
	plan: 'free';
	limit: number;
	used: number;
	remaining: number;
	resetsAt: string | null;
};

const importStatus = (overrides: Partial<ImportStatus> = {}): ImportStatus => ({
	enabled: true,
	plan: 'free',
	limit: 3,
	used: 0,
	remaining: 3,
	resetsAt: null,
	...overrides
});

/**
 * Answers GET and POST /jobs/import in the browser, with the CORS headers the API would send
 * (the page and the API are on different origins). Returns the requests it answered.
 */
const stubJobImport = async (
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
	await page.route(`${API_URL}/jobs/import`, async (route) => {
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
		return post({
			...route,
			fulfill: (options) => route.fulfill({ ...options, headers: { ...cors, ...options?.headers } })
		} as Route);
	});
	return calls;
};

const PDF = {
	name: 'offer.pdf',
	mimeType: 'application/pdf',
	buffer: Buffer.from('%PDF-1.4\n%e2e\n')
};

/** What Claude would have read in a job description: a draft named with the test's tag */
const extraction = () => ({
	draft: {
		title: `Product designer ${tag}`,
		description: '## The job\n\nDesign the booking flow.',
		company: 'Initech',
		status: 'draft',
		openings: 2,
		location: { country: 'FR', city: 'Nantes', postalCode: '44000', workMode: 'on_site' },
		contract: { type: 'cdi', trialPeriodMonths: 3 },
		workingTime: { arrangement: 'annual_days', daysPerYear: 218, rttDaysPerYear: 10 },
		pay: { min: 50000, max: 60000, currency: 'EUR', period: 'year' },
		requirements: { seniority: 'senior', skills: ['Figma', 'User research'] }
	},
	warnings: ['The pay period was not stated: per year assumed'],
	quota: { plan: 'free', limit: 3, used: 1, remaining: 2, resetsAt: null }
});

const openImport = async (page: Page) => {
	await page.getByRole('button', { name: 'Import from PDF' }).click();
	const dialog = page.getByRole('dialog', { name: 'Import a job description' });
	await expect(dialog).toBeVisible();
	return dialog;
};

test.describe('job description import', () => {
	test('reads a PDF into the editor, and the draft is saved as a posting', async ({ page }) => {
		const title = `Product designer ${tag}`;
		const calls = await stubJobImport(page, {
			status: () => importStatus(),
			post: (route) => route.fulfill({ json: extraction() })
		});
		await openAsRecruiter(page, '/recruiter');

		await expect(page.getByText('3 of 3 free imports left')).toBeVisible();
		const dialog = await openImport(page);
		await expect(dialog.getByText('3 of 3 free imports left.')).toBeVisible();
		await expect(dialog.getByText(/sent to Anthropic’s Claude/)).toBeVisible();
		await dialog.locator('input[type="file"]').setInputFiles(PDF);
		await expect(dialog.getByText('offer.pdf', { exact: true })).toBeVisible();
		await expect(
			dialog.getByText(
				'This import uses 1 of your 3 free imports left, even if you discard the draft.'
			)
		).toBeVisible();
		await dialog.getByRole('button', { name: 'Import', exact: true }).click();

		// The editor, prefilled from the draft, with what to check
		await expect(page).toHaveURL(/\/recruiter\/jobs\/new\?import=1$/);
		expect(calls.post).toEqual([{ file: PDF.buffer.toString('base64'), fileName: 'offer.pdf' }]);
		await expect(toasts(page).getByText('Job description imported', { exact: true })).toBeVisible();
		const banner = page.getByRole('region', {
			name: 'Imported from offer.pdf: check every field before saving.'
		});
		await expect(banner.getByRole('listitem')).toHaveText([
			'The pay period was not stated: per year assumed'
		]);
		await expect(page.getByRole('textbox', { name: 'Job title' })).toHaveValue(title);
		await expect(page.getByRole('textbox', { name: 'City', exact: true })).toHaveValue('Nantes');
		await expect(page.getByRole('textbox', { name: 'Days per year', exact: true })).toHaveValue(
			'218'
		);
		await expect(page.getByRole('textbox', { name: 'Minimum pay' })).toHaveValue('50000');

		await page.getByRole('button', { name: 'Create job description' }).click();
		await expect(page).toHaveURL(JOB_PAGE);
		await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
		await expect(fact(page, 'Contract')).toContainText('CDI (permanent)');
		await expect(fact(page, 'Working time')).toContainText(
			'218 days a year (forfait jours: counted in days worked, no weekly hours) · 10 RTT days (extra days off a year)'
		);
		await expect(fact(page, 'Pay')).toContainText('€50,000 – €60,000 gross per year');
		const saved = (await listRecruiterJobs(api)).filter((job) => job.title === title);
		expect(saved).toEqual([expect.objectContaining({ status: 'draft' })]);

		// Saved: the import is no longer waiting on the dashboard
		await gotoHydrated(page, '/recruiter');
		await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
		await expect(page.getByText(/but have not created the posting yet/)).toHaveCount(0);
	});

	test('once the free imports are used, says so and offers no import', async ({ page }) => {
		const calls = await stubJobImport(page, {
			status: () => importStatus({ used: 3, remaining: 0 })
		});
		await openAsRecruiter(page, '/recruiter');

		await expect(
			page.getByText('You have used your 3 free imports. Paid plans are coming soon.')
		).toBeVisible();
		await expect(page.getByRole('button', { name: 'Import from PDF' })).toBeDisabled();
		expect(calls.post).toEqual([]);
	});

	test('shows the API’s message when the plan refuses the import (402)', async ({ page }) => {
		const message =
			'You have used the 3 job description imports included in the free plan. Paid plans are coming soon.';
		let status = importStatus({ used: 2, remaining: 1 });
		const calls = await stubJobImport(page, {
			status: () => status,
			post: async (route) => {
				status = importStatus({ used: 3, remaining: 0 });
				await route.fulfill({ status: 402, contentType: 'text/plain', body: message });
			}
		});
		await openAsRecruiter(page, '/recruiter');

		await expect(page.getByText('1 of 3 free imports left')).toBeVisible();
		const dialog = await openImport(page);
		await dialog.locator('input[type="file"]').setInputFiles(PDF);
		await dialog.getByRole('button', { name: 'Import', exact: true }).click();

		await expect(dialog.getByRole('alert')).toHaveText(message);
		// The allowance is asked again: a failed import may count
		await expect.poll(() => calls.get).toBe(2);
		await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
		await expect(page).toHaveURL(/\/recruiter$/);

		await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(dialog).toBeHidden();
		await expect(
			page.getByText('You have used your 3 free imports. Paid plans are coming soon.')
		).toBeVisible();
		await expect(page.getByRole('button', { name: 'Import from PDF' })).toBeDisabled();
	});
});
