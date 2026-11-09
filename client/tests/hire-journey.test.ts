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

// The hiring journey of 'e2e-journey' (seeded by `bun run --cwd server seed:e2e`, changed by this
// file alone): its owner chooses the steps in the admin tab, and the e2e recruiter goes through
// them on the Hire page, picking one of their open job descriptions before the meeting step
// opens. No Google Calendar is connected: the meeting step says online booking is unavailable
// (the booking itself is covered by the API's tests). The recruiter is shared with the other
// recruiter files, which run in parallel: each test names its postings with its own tag and
// removes them afterwards.

test.skip(
	!JWT_SECRET,
	'Set JWT_SECRET to the API’s secret to sign in as the e2e owner and recruiter'
);

const DOMAIN = 'e2e-journey';
const TAG_PREFIX = 'journey';

let owner: OwnerSession;
let recruiter: OwnerSession;
let ownerApi: APIRequestContext;
let recruiterApi: APIRequestContext;

const setJourney = async (...types: string[]) => {
	const response = await ownerApi.put(`${API_URL}/workflow`, {
		data: { steps: types.map((type) => ({ type })) }
	});
	expect(response.ok(), await response.text()).toBe(true);
};

test.beforeAll(async () => {
	owner = await ownerSession(DOMAIN);
	recruiter = await recruiterSession();
	ownerApi = await apiAs(owner);
	recruiterApi = await apiAs(recruiter);
	await deleteJobs(recruiterApi, new RegExp(`\\b${TAG_PREFIX}-\\d+-[0-9a-z]+\\b`));
});

test.afterAll(async () => {
	// Back to the journey every portfolio starts with
	if (ownerApi) await setJourney('meeting');
	await ownerApi?.dispose();
	await recruiterApi?.dispose();
});

let tag = '';
test.beforeEach(async ({ page }, testInfo) => {
	tag = `${TAG_PREFIX}-${testInfo.workerIndex}-${Date.now().toString(36)}`;
	await blockGoogle(page);
});

test.afterEach(async () => {
	await deleteJobs(recruiterApi, tag);
});

/** A step's switch in the admin tab, clicked as a pointer does: its control covers its input */
const toggleStep = (page: Page, name: string) =>
	page
		.locator('[data-scope="switch"][data-part="root"]')
		.filter({ has: page.getByRole('checkbox', { name }) })
		.click();

/** The steps of the Hire page */
const journeySteps = (page: Page) => page.getByRole('list', { name: 'Hiring journey' });
const step = (page: Page, name: string) =>
	journeySteps(page)
		.getByRole('listitem')
		.filter({ has: page.getByRole('heading', { name }) });

test.describe('the hiring journey', () => {
	test('the owner asks recruiters to pick a job before booking', async ({ page }) => {
		await setJourney('meeting');
		await signIn(page, owner);
		await gotoHydrated(page, `/${DOMAIN}/admin`);
		await page.getByRole('tab', { name: 'Hiring journey' }).click();

		const jobStep = page.getByRole('checkbox', { name: 'Select or create a job' });
		const meetingStep = page.getByRole('checkbox', { name: 'Book a meeting' });
		await expect(jobStep).not.toBeChecked();
		await expect(meetingStep).toBeChecked();
		await expect(page.getByText('Recruiters can book a meeting right away.')).toBeVisible();
		const save = page.getByRole('button', { name: 'Save journey' });
		await expect(save).toBeDisabled();

		// A job step with nothing after it opens nothing: it cannot be saved
		await toggleStep(page, 'Select or create a job');
		await expect(jobStep).toBeChecked();
		await toggleStep(page, 'Book a meeting');
		await expect(meetingStep).not.toBeChecked();
		await expect(page.getByRole('alert')).toContainText(
			'“Select or create a job” must come before a step it opens'
		);
		await expect(save).toBeDisabled();

		await toggleStep(page, 'Book a meeting');
		await expect(meetingStep).toBeChecked();
		await expect(
			page.getByText('Recruiters select or create a job, then book a meeting.')
		).toBeVisible();
		await save.click();
		await expect(toasts(page).getByText('Hiring journey saved')).toBeVisible();
		await expect(save).toBeDisabled();

		const saved = await ownerApi.get(`${API_URL}/workflow`);
		expect(await saved.json()).toEqual({ steps: [{ type: 'job' }, { type: 'meeting' }] });

		// Their own Hire page is a preview: nothing is locked for them
		await page.getByRole('link', { name: 'See your Hire page' }).click();
		await expect(
			page.getByText('This is your hiring journey, as recruiters see it.')
		).toBeVisible();
		await expect(step(page, 'Step 2: Book a meeting')).not.toContainText(
			'Complete the step above first.'
		);
	});

	test('a recruiter picks one of their open jobs, which opens the meeting step', async ({
		page
	}) => {
		await setJourney('job', 'meeting');
		const open = await createJob(recruiterApi, { title: `Staff engineer ${tag}`, status: 'open' });
		await createJob(recruiterApi, { title: `Data engineer ${tag}`, status: 'draft' });

		await signIn(page, recruiter);
		await gotoHydrated(page, `/${DOMAIN}/hire`);
		const jobStep = step(page, 'Step 1: Select or create a job');
		const meetingStep = step(page, 'Step 2: Book a meeting');
		await expect(meetingStep).toContainText('Complete the step above first.');

		// A draft is listed, but cannot be picked
		await expect(
			jobStep.getByRole('radio', { name: new RegExp(`Data engineer ${tag}`) })
		).toBeDisabled();
		await jobStep.getByRole('radio', { name: new RegExp(`Staff engineer ${tag}`) }).check();
		await jobStep.getByRole('button', { name: 'Continue with this job' }).click();

		await expect(toasts(page).getByText('Job picked')).toBeVisible();
		await expect(jobStep).toContainText(`Staff engineer ${tag} · E2E Corp`);
		await expect(meetingStep).toContainText('Pick a time slot that suits you.');
		// No calendar is connected to the e2e portfolio
		await expect(meetingStep).toContainText('Online booking is not available right now.');

		const journey = await recruiterApi.get(`${API_URL}/workflow/domains/${DOMAIN}`);
		expect(await journey.json()).toMatchObject({
			steps: [
				{ type: 'job', done: true },
				{ type: 'meeting', done: false }
			],
			job: { _id: open._id, status: 'open' }
		});

		// Changing the job: the step unfolds again, on the job picked
		await jobStep.getByRole('button', { name: 'Change' }).click();
		await expect(
			jobStep.getByRole('radio', { name: new RegExp(`Staff engineer ${tag}`) })
		).toBeChecked();
	});

	test('a recruiter writes the job from the journey and comes back to pick it', async ({
		page
	}) => {
		await setJourney('job', 'meeting');

		// Signed out: the step asks to sign in first
		await gotoHydrated(page, `/${DOMAIN}/hire`);
		await expect(step(page, 'Step 1: Select or create a job')).toContainText(
			'Sign in to pick the job you are hiring for.'
		);

		await signIn(page, recruiter);
		await gotoHydrated(page, `/${DOMAIN}/hire`);
		await step(page, 'Step 1: Select or create a job')
			.getByRole('link', { name: 'Write a new job description' })
			.click();
		await expect(page).toHaveURL(new RegExp(`/recruiter/jobs/new\\?journey=${DOMAIN}$`));
		await expect(page.getByRole('note')).toContainText(
			`you go back to the hiring journey of ${DOMAIN} to pick it`
		);
		await expect(page.getByRole('link', { name: 'Back to the hiring journey' })).toHaveAttribute(
			'href',
			`/${DOMAIN}/hire`
		);

		// What the editor does once the posting is created: back with it selected, the job step
		// open on it even when another job was picked before
		const picked = await createJob(recruiterApi, {
			title: `Staff engineer ${tag}`,
			status: 'open'
		});
		const pick = await recruiterApi.put(`${API_URL}/workflow/domains/${DOMAIN}/job`, {
			data: { jobId: picked._id }
		});
		expect(pick.ok(), await pick.text()).toBe(true);
		const created = await createJob(recruiterApi, {
			title: `Platform lead ${tag}`,
			status: 'open'
		});
		await gotoHydrated(page, `/${DOMAIN}/hire?job=${created._id}`);
		const jobStep = step(page, 'Step 1: Select or create a job');
		await expect(
			jobStep.getByRole('radio', { name: new RegExp(`Platform lead ${tag}`) })
		).toBeChecked();
		await jobStep.getByRole('button', { name: 'Continue with this job' }).click();
		await expect(jobStep).toContainText(`Platform lead ${tag} · E2E Corp`);
		// The address no longer selects it
		await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/hire$`));
		await jobStep.getByRole('button', { name: /Change/ }).click();
		await expect(
			jobStep.getByRole('radio', { name: new RegExp(`Platform lead ${tag}`) })
		).toBeChecked();
		await expect(
			page.getByRole('heading', { name: 'Step 1: Select or create a job' })
		).toBeFocused();
	});

	test('a portfolio with the meeting step only is the booking page, as before', async ({
		page
	}) => {
		await setJourney('meeting');
		await gotoHydrated(page, `/${DOMAIN}/hire`);
		await expect(
			page.getByRole('heading', { level: 1, name: `Book a meeting with ${DOMAIN}` })
		).toBeVisible();
		await expect(page.getByText('Online booking is not available right now.')).toBeVisible();
		await expect(journeySteps(page)).toHaveCount(0);
	});
});
