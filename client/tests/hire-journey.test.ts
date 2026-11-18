import { expect, test, type APIRequestContext, type Page, type Request } from '@playwright/test';
import {
	API_URL,
	E2E_CANDIDATE_ID,
	JWT_SECRET,
	apiAs,
	blockGoogle,
	candidateSession,
	gotoHydrated,
	ownerSession,
	recruiterSession,
	signIn,
	toasts,
	type OwnerSession
} from './support/owner';
import { stubAddressSearch } from './support/addresses';
import { TERMS_REQUIRED, stubApi } from './support/api';
import { createJob, deleteJobs } from './support/jobs';
import { LEGAL_VERSION, PERFECT_JOB_CRITERIA } from 'portfolio-common';

// The hiring journey of 'e2e-journey' (seeded by `bun run --cwd server seed:e2e`, changed by this
// file alone): its owner adds, sets and orders the steps in the admin tab, and the e2e recruiter
// goes through them on the Hire page (a note to read and confirm, one of their open job
// descriptions to pick, which is scored against the owner's perfect job) before the meeting step
// opens. No Google Calendar is connected: the
// meeting step says online booking is unavailable (the booking itself is covered by the API's
// tests). The recruiter is shared with the other recruiter files, which run in parallel: each
// test names its postings with its own tag and removes them afterwards. The e2e candidate (no
// recruiter space, no acceptance of the terms) opens a recruiter space from the job step, with the
// requests that would change it answered in the browser, so it stays that way.

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

/**
 * Replaces the journey with one step per type, each under its type's name. What the recruiter
 * did on a step that is not in it goes with the step: every test starts from a journey of its own
 */
const setJourney = async (...types: string[]) => {
	const response = await ownerApi.put(`${API_URL}/workflow`, {
		data: { steps: types.map((type) => ({ id: type, type })) }
	});
	expect(response.ok(), await response.text()).toBe(true);
};

/** Replaces the journey with these steps, each with its settings */
const setSteps = async (...steps: { id: string; type: string; config?: object }[]) => {
	const response = await ownerApi.put(`${API_URL}/workflow`, { data: { steps } });
	expect(response.ok(), await response.text()).toBe(true);
};

/** Replaces the owner's perfect job, which the job match step scores jobs against */
const setPerfectJob = async (criteria: object) => {
	const response = await ownerApi.put(`${API_URL}/perfect-job`, { data: { criteria } });
	expect(response.ok(), await response.text()).toBe(true);
};

/** The recruiter's submit on a step of the journey, as the Hire page sends it */
const submitStep = async (stepId: string, input: unknown) => {
	const response = await recruiterApi.post(
		`${API_URL}/workflow/domains/${DOMAIN}/steps/${stepId}`,
		{ data: { input } }
	);
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
	// Back to the journey every portfolio starts with, and to a perfect job without criteria
	if (ownerApi) await setJourney('meeting');
	if (ownerApi) await setPerfectJob({});
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

/** The steps of the Hire page */
const journeySteps = (page: Page) => page.getByRole('list', { name: 'Hiring journey' });
const step = (page: Page, name: string) =>
	journeySteps(page)
		.getByRole('listitem')
		.filter({ has: page.getByRole('heading', { name }) });

/** The steps of the admin tab's editor */
const editorSteps = (page: Page) => page.getByRole('list', { name: 'Steps' }).getByRole('listitem');
const editorStep = (page: Page, name: string) =>
	editorSteps(page).filter({ has: page.getByRole('heading', { name }) });
const addStep = (page: Page, label: string) =>
	page.getByRole('button', { name: `Add step: ${label}` });

/** A criterion of the admin tab "Perfect job" */
const criterion = (page: Page, name: string) => page.getByRole('group', { name, exact: true });

const openEditor = async (page: Page) => {
	await signIn(page, owner);
	await gotoHydrated(page, `/${DOMAIN}/admin`);
	await page.getByRole('tab', { name: 'Hiring journey' }).click();
	await expect(editorSteps(page).first()).toBeVisible();
};

// A route of the API answered in the browser (page.route) is another origin's: the answer needs
// the CORS headers the API would send, and its preflight an answer too
const cors = (request: Request) => ({
	'access-control-allow-origin': request.headers()['origin'] ?? '*',
	'access-control-allow-credentials': 'true'
});
const preflight = (request: Request) => ({
	status: 204,
	headers: {
		...cors(request),
		'access-control-allow-methods': 'GET, POST',
		'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? ''
	}
});

test.describe('the hiring journey', () => {
	test('the owner asks recruiters to pick a job before booking', async ({ page }) => {
		await setJourney('meeting');
		await openEditor(page);

		await expect(editorSteps(page)).toHaveCount(1);
		await expect(editorStep(page, 'Step 1: Book a meeting')).toBeVisible();
		await expect(page.getByText('Recruiters can book a meeting right away.')).toBeVisible();
		const save = page.getByRole('button', { name: 'Save journey' });
		await expect(save).toBeDisabled();
		// One meeting step per journey: no second one can be added, and the page says why
		await expect(addStep(page, 'Book a meeting')).toBeDisabled();
		await expect(addStep(page, 'Book a meeting')).toHaveAccessibleDescription(
			'Already in your journey: it can be used only once.'
		);

		// A step that only opens others is added before the step the journey leads to
		await addStep(page, 'Select or create a job').click();
		await expect(editorSteps(page)).toHaveCount(2);
		await expect(
			page.getByRole('heading', { name: 'Step 1: Select or create a job' })
		).toBeFocused();
		await expect(editorStep(page, 'Step 2: Book a meeting')).toBeVisible();
		await expect(
			page.getByText('Recruiters select or create a job, then book a meeting.')
		).toBeVisible();

		// Moved after it, the job step opens nothing: the journey cannot be saved, and says why at
		// the step. The focus follows the step moved
		const jobStep = editorStep(page, 'Select or create a job');
		await jobStep.getByRole('button', { name: /^Move down/ }).click();
		await expect(editorStep(page, 'Step 2: Select or create a job')).toBeVisible();
		await expect(jobStep.getByRole('button', { name: /^Move down/ })).toBeDisabled();
		await expect(jobStep.getByRole('button', { name: /^Move up/ })).toBeFocused();
		await expect(jobStep).toContainText(
			'“Select or create a job” must come before a step it opens'
		);
		await expect(
			page.getByText('Step 2 (Select or create a job): “Select or create a job” must come before')
		).toBeVisible();
		await expect(save).toBeDisabled();

		await page.keyboard.press('Enter');
		await expect(editorStep(page, 'Step 1: Select or create a job')).toBeVisible();
		await expect(jobStep.getByRole('button', { name: /^Move down/ })).toBeFocused();
		await expect(
			page.getByText('Recruiters select or create a job, then book a meeting.')
		).toBeVisible();
		await save.click();
		await expect(toasts(page).getByText('Hiring journey saved')).toBeVisible();
		await expect(save).toBeDisabled();

		const saved = await ownerApi.get(`${API_URL}/workflow`);
		expect(await saved.json()).toEqual({
			steps: [
				{ id: 'job', type: 'job', config: {} },
				{ id: 'meeting', type: 'meeting', config: {} }
			]
		});

		// Their own Hire page is a preview: nothing is locked for them, and the job step, which
		// asks nothing of them, says what it asks of recruiters
		await page.getByRole('link', { name: 'See your Hire page' }).click();
		await expect(
			page.getByText('This is your hiring journey, as recruiters see it.')
		).toBeVisible();
		await expect(step(page, 'Step 1: Select or create a job')).toContainText(
			'Recruiters pick one of their open job descriptions'
		);
		await expect(step(page, 'Step 1: Select or create a job').getByRole('button')).toHaveCount(0);
		await expect(step(page, 'Step 2: Book a meeting')).not.toContainText(
			'Complete the step above first.'
		);
		await expect(step(page, 'Step 2: Book a meeting')).toContainText(
			'Online booking is not available right now.'
		);
	});

	test('the owner writes a note recruiters confirm before they pick a job and book', async ({
		page,
		browser
	}) => {
		await setJourney('job', 'meeting');
		await createJob(recruiterApi, { title: `Staff engineer ${tag}`, status: 'open' });
		await openEditor(page);

		// A new note has nothing to read yet: the editor says what is missing, at the note
		await addStep(page, 'Read a note').click();
		await expect(page.getByRole('heading', { name: 'Step 2: Read a note' })).toBeFocused();
		const note = editorStep(page, 'Read a note');
		const save = page.getByRole('button', { name: 'Save journey' });
		await expect(note).toContainText('Give the note a title.');
		await expect(page.getByText('Step 2 (Read a note): Give the note a title.')).toBeVisible();
		await expect(save).toBeDisabled();

		await note.getByLabel('Title').fill('Before you book');
		await expect(note).toContainText('Write the note recruiters will read.');
		await expect(note.getByLabel('Note', { exact: true })).toHaveAttribute('aria-invalid', 'true');
		await note
			.getByLabel('Note', { exact: true })
			.fill('I only take **remote** roles.\n\n<script>alert(1)</script>');
		await expect(note.getByLabel('Note', { exact: true })).not.toHaveAttribute('aria-invalid');

		// Above the job step: the button it was moved with is at its end, the focus stays on the note
		await note.getByRole('button', { name: 'Move up Read a note: Before you book' }).click();
		await expect(editorStep(page, 'Step 1: Read a note')).toBeVisible();
		await expect(
			note.getByRole('button', { name: 'Move down Read a note: Before you book' })
		).toBeFocused();
		await expect(
			page.getByText(
				'Recruiters read a note (“Before you book”), select or create a job, then book a meeting.'
			)
		).toBeVisible();
		await save.click();
		await expect(toasts(page).getByText('Hiring journey saved')).toBeVisible();

		const saved = await ownerApi.get(`${API_URL}/workflow`);
		expect(await saved.json()).toEqual({
			steps: [
				{
					id: 'note',
					type: 'note',
					config: {
						title: 'Before you book',
						text: 'I only take **remote** roles.\n\n<script>alert(1)</script>'
					}
				},
				{ id: 'job', type: 'job', config: {} },
				{ id: 'meeting', type: 'meeting', config: {} }
			]
		});

		// The recruiter, in a browser of their own
		const context = await browser.newContext();
		const visitor = await context.newPage();
		await blockGoogle(visitor);
		await signIn(visitor, recruiter);
		await gotoHydrated(visitor, `/${DOMAIN}/hire`);
		await expect(
			visitor.getByText(`${DOMAIN} asks recruiters to complete 2 steps first.`)
		).toBeVisible();
		const noteStep = step(visitor, 'Step 1: Before you book');
		const jobStep = step(visitor, 'Step 2: Select or create a job');
		const meetingStep = step(visitor, 'Step 3: Book a meeting');
		await expect(jobStep).toContainText('Complete the step above first.');
		await expect(meetingStep).toContainText('Complete the steps above first.');

		// The note is Markdown, and its HTML is text
		await expect(noteStep.locator('strong')).toHaveText('remote');
		await expect(noteStep).toContainText('<script>alert(1)</script>');
		await noteStep.getByRole('button', { name: 'I have read this' }).click();
		await expect(noteStep).toContainText('You have read this note.');
		await expect(
			visitor.getByRole('heading', { name: 'Step 2: Select or create a job' })
		).toBeFocused();
		await expect(meetingStep).toContainText('Complete the steps above first.');

		await jobStep.getByRole('radio', { name: new RegExp(`Staff engineer ${tag}`) }).check();
		await jobStep.getByRole('button', { name: 'Continue with this job' }).click();
		await expect(toasts(visitor).getByText('Job picked')).toBeVisible();
		await expect(visitor.getByRole('heading', { name: 'Step 3: Book a meeting' })).toBeFocused();
		await expect(meetingStep).toContainText('Online booking is not available right now.');

		// Once confirmed, the note stays readable
		await noteStep.getByRole('button', { name: 'Open Before you book' }).click();
		await expect(noteStep.locator('strong')).toHaveText('remote');
		await expect(noteStep.getByRole('button', { name: 'I have read this' })).toHaveCount(0);

		const journey = await recruiterApi.get(`${API_URL}/workflow/domains/${DOMAIN}`);
		expect(await journey.json()).toMatchObject({
			steps: [
				{ id: 'note', status: 'succeeded', config: { title: 'Before you book' } },
				{ id: 'job', status: 'succeeded' },
				{ id: 'meeting', status: 'pending' }
			]
		});
		await context.close();
	});

	test('unsaved steps are kept when leaving is declined; a title that looks like a date stays text', async ({
		page
	}) => {
		await setJourney('meeting');
		await openEditor(page);
		await addStep(page, 'Read a note').click();
		const note = editorStep(page, 'Read a note');
		// Eden Treaty would read this title back as a Date
		await note.getByLabel('Title').fill('2027-01-01');
		await note.getByLabel('Note', { exact: true }).fill('Start date.');

		// The link next to Save leaves the page: asked first, and declined
		page.once('dialog', (dialog) => {
			expect(dialog.message()).toContain('Leave without saving your hiring journey?');
			void dialog.dismiss();
		});
		await page.getByRole('link', { name: 'See your Hire page' }).click();
		await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/admin$`));
		await expect(note.getByLabel('Title')).toHaveValue('2027-01-01');

		await page.getByRole('button', { name: 'Save journey' }).click();
		await expect(toasts(page).getByText('Hiring journey saved')).toBeVisible();
		await expect(note.getByLabel('Title')).toHaveValue('2027-01-01');
		await expect(page.getByRole('button', { name: 'Save journey' })).toBeDisabled();

		// Saved: nothing to ask. Visitors read the title as written
		await page.getByRole('link', { name: 'See your Hire page' }).click();
		await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/hire$`));
		await expect(page.getByRole('heading', { name: 'Step 1: 2027-01-01' })).toBeVisible();
	});

	test('what the API refuses is said at the step; a journey without steps closes the page', async ({
		page
	}) => {
		await setJourney('job', 'meeting');
		await openEditor(page);
		const save = page.getByRole('button', { name: 'Save journey' });

		await addStep(page, 'Read a note').click();
		const note = editorStep(page, 'Read a note');
		await note.getByLabel('Title').fill('Before you book');
		await note.getByLabel('Note', { exact: true }).fill('Remote only.');

		// A rule this page does not know yet: the API's answer is shown like the page's own checks
		await page.route(`${API_URL}/workflow`, (route) => {
			const request = route.request();
			if (request.method() !== 'PUT') return route.fallback();
			return route.fulfill({
				status: 422,
				json: {
					type: 'validation',
					on: 'body',
					property: 'steps.1.config.title',
					message: 'This title cannot be used.'
				},
				headers: {
					'access-control-allow-origin': request.headers()['origin'] ?? '*',
					'access-control-allow-credentials': 'true'
				}
			});
		});
		await save.click();
		await expect(note).toContainText('This title cannot be used.');
		await expect(note.getByLabel('Title')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.getByText('Step 2 (Read a note): This title cannot be used.')).toBeVisible();
		await expect(save).toBeDisabled();
		await page.unroute(`${API_URL}/workflow`);
		// Until the journey is changed
		await note.getByLabel('Title').fill('Before you book a slot');
		await expect(note.getByLabel('Title')).not.toHaveAttribute('aria-invalid');
		await expect(save).toBeEnabled();

		// Removing a step moves the focus to the one that took its place, else the one before
		await note.getByRole('button', { name: 'Remove Read a note: Before you book a slot' }).click();
		await expect(page.getByRole('heading', { name: 'Step 2: Book a meeting' })).toBeFocused();
		await editorStep(page, 'Book a meeting')
			.getByRole('button', { name: /^Remove/ })
			.click();
		await expect(
			page.getByRole('heading', { name: 'Step 1: Select or create a job' })
		).toBeFocused();
		await expect(save).toBeDisabled();
		await editorStep(page, 'Select or create a job')
			.getByRole('button', { name: /^Remove/ })
			.click();
		await expect(page.getByRole('heading', { name: 'Add a step' })).toBeFocused();
		await expect(page.getByText('Your journey has no step.')).toBeVisible();
		await expect(
			page.getByText('Your Hire page offers nothing: recruiters are asked to reach out directly.')
		).toBeVisible();

		// Undo brings the saved journey back; removed again, the empty journey can be saved
		await page.getByRole('button', { name: 'Undo changes' }).click();
		await expect(editorSteps(page)).toHaveCount(2);
		await expect(save).toBeDisabled();
		for (const name of ['Book a meeting', 'Select or create a job']) {
			await editorStep(page, name)
				.getByRole('button', { name: /^Remove/ })
				.click();
		}
		await save.click();
		await expect(toasts(page).getByText('Hiring journey saved')).toBeVisible();
		const saved = await ownerApi.get(`${API_URL}/workflow`);
		expect(await saved.json()).toEqual({ steps: [] });

		await page.getByRole('link', { name: 'See your Hire page' }).click();
		await expect(page.getByRole('heading', { level: 1, name: `Hire ${DOMAIN}` })).toBeVisible();
		await expect(
			page.getByText('Online booking is not available right now. Please reach out directly.')
		).toBeVisible();
		await expect(journeySteps(page)).toHaveCount(0);
	});

	test("a phone meeting shows the candidate's number, and asks the recruiter for none of theirs", async ({
		page
	}) => {
		await setJourney('meeting');
		// Answered in the browser: no Google Calendar is connected here
		const day = (offset: number) =>
			new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
		const date = day(1);
		const slot = { start: `${date}T08:00:00.000Z`, end: `${date}T09:00:00.000Z` };
		const schedule = {
			id: '65e2e00000000000000000aa',
			title: `Phone screen ${tag}`,
			description: null,
			durationMinutes: 60,
			minNoticeHours: 0,
			maxAdvanceDays: 30,
			timezone: 'Europe/Paris',
			locationType: 'phone',
			locationDetails: '+33 1 23 45 67 89',
			availability: [
				{ dayOfWeek: new Date(date).getUTCDay(), startTime: '09:00', endTime: '10:00' }
			]
		};
		const booked: Record<string, unknown>[] = [];
		await page.route(`${API_URL}/appointments/**`, async (route) => {
			const request = route.request();
			const headers = cors(request);
			if (request.method() === 'OPTIONS') return route.fulfill(preflight(request));
			const { pathname } = new URL(request.url());
			if (pathname.endsWith(`/domains/${DOMAIN}/schedules`)) {
				return route.fulfill({ json: [schedule], headers });
			}
			if (pathname.endsWith('/available-dates')) {
				return route.fulfill({
					json: { horizon: { first: day(0), last: day(30) }, dates: [date] },
					headers
				});
			}
			if (pathname.endsWith('/available-slots')) return route.fulfill({ json: [slot], headers });
			if (pathname.endsWith('/book')) {
				booked.push(request.postDataJSON());
				const json = {
					booked: true,
					start: slot.start,
					end: slot.end,
					meetLink: null,
					eventLink: null
				};
				return route.fulfill({ json, headers });
			}
			return route.continue();
		});
		await signIn(page, recruiter);
		await gotoHydrated(page, `/${DOMAIN}/hire`);

		// The candidate's number shows before booking
		await expect(page.getByText('Phone call · +33 1 23 45 67 89')).toBeVisible();
		const cell = page.locator(`[role="button"][data-value="${date}"]`);
		if (!(await cell.isVisible()))
			await page.getByRole('button', { name: /next/i }).first().click();
		await cell.click();
		await page
			.getByRole('button', { name: /^\d{1,2}:\d{2}/ })
			.first()
			.click();

		// The recruiter calls the candidate: the form asks for no number of theirs
		await expect(page.getByLabel('Your email *')).toBeVisible();
		await expect(page.getByRole('textbox', { name: /phone/i })).toHaveCount(0);
		await page.getByRole('button', { name: 'Confirm booking' }).click();
		await expect.poll(() => booked.length).toBe(1);
		expect(booked[0]).toMatchObject({ scheduleId: schedule.id, startTime: slot.start });
		expect(booked[0]).not.toHaveProperty('phone');
	});

	test('the owner suggests a step they miss, sent to the project as a feature request', async ({
		page
	}) => {
		await setJourney('meeting');
		const SUGGESTIONS = `${API_URL}/workflow/step-suggestions`;
		const section = page.getByRole('region', { name: 'Missing a step?' });

		// This API has no GitHub token: it takes no suggestion, and the editor does not offer any
		const answered = page.waitForResponse(
			(response) => response.url() === SUGGESTIONS && response.request().method() === 'GET'
		);
		await openEditor(page);
		expect(await (await answered).json()).toEqual({ enabled: false });
		await expect(section).toHaveCount(0);

		// With one (answered in the browser: no issue is ever filed on GitHub)
		const sent: unknown[] = [];
		await page.route(SUGGESTIONS, async (route) => {
			const request = route.request();
			const headers = cors(request);
			if (request.method() === 'OPTIONS') return route.fulfill(preflight(request));
			if (request.method() === 'GET') return route.fulfill({ json: { enabled: true }, headers });
			sent.push(request.postDataJSON());
			return sent.length === 1
				? route.fulfill({
						status: 429,
						contentType: 'text/plain',
						body: 'You can send 3 suggestions a day: try again tomorrow',
						headers
					})
				: route.fulfill({ json: { created: true }, headers });
		});
		await openEditor(page);
		await expect(section).toBeVisible();
		const open = section.getByRole('button', { name: 'Suggest a step' });
		await open.click();
		const name = section.getByLabel('Name of the step');
		await expect(name).toBeFocused();
		await expect(section.getByText('on GitHub, which others can read')).toBeVisible();

		// The rules are checked before anything is sent, and said at the field
		const send = section.getByRole('button', { name: 'Send suggestion' });
		await send.click();
		await expect(name).toBeFocused();
		await expect(name).toHaveAccessibleDescription('Give the step a name.');
		await name.fill('  Share the salary range ');
		await send.click();
		const description = section.getByLabel('What would a recruiter do on it?');
		await expect(description).toBeFocused();
		await expect(section.getByText('Say what a recruiter would do on this step.')).toBeVisible();
		expect(sent).toEqual([]);

		// What the API refuses is said as it words it, and the text is kept
		await description.fill('They give the range of the job before they can book.');
		await send.click();
		await expect(section.getByRole('alert')).toHaveText(
			'You can send 3 suggestions a day: try again tomorrow'
		);
		// The focus goes to what went wrong: the button it was on was disabled while sending
		await expect(section.getByRole('alert')).toBeFocused();
		await expect(description).toHaveValue('They give the range of the job before they can book.');

		await section.getByLabel('Why would it help you?').fill('It saves a call.');
		await send.click();
		await expect(toasts(page).getByText('Suggestion sent')).toBeVisible();
		const suggestion = {
			name: 'Share the salary range',
			description: 'They give the range of the job before they can book.'
		};
		expect(sent).toEqual([suggestion, { ...suggestion, reason: 'It saves a call.' }]);
		// The form closes, empty for the next one, and the journey itself did not change
		await expect(open).toBeFocused();
		await open.click();
		await expect(name).toHaveValue('');
		await section.getByRole('button', { name: 'Cancel' }).click();
		await expect(name).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Save journey' })).toBeDisabled();
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
				{
					id: 'job',
					type: 'job',
					status: 'succeeded',
					view: { job: { _id: open._id, status: 'open' } }
				},
				{ id: 'meeting', type: 'meeting', status: 'pending' }
			]
		});

		// Changing the job: the step unfolds again, on the job picked
		await jobStep.getByRole('button', { name: 'Change' }).click();
		await expect(
			jobStep.getByRole('radio', { name: new RegExp(`Staff engineer ${tag}`) })
		).toBeChecked();
	});

	test('an account without a recruiter space ticks the age and terms box to create it from the job step', async ({
		page
	}) => {
		await setJourney('job', 'meeting');
		const candidate = await candidateSession();
		const opened = await stubApi(page, 'PUT', '/me/mode', () => ({
			json: {
				user: {
					_id: E2E_CANDIDATE_ID,
					email: 'e2e.candidate@example.com',
					activeMode: 'recruiter',
					recruiter: true,
					termsVersion: LEGAL_VERSION
				}
			}
		}));
		await stubApi(page, 'GET', '/recruiter/jobs', () => ({ json: { jobs: [] } }));

		await signIn(page, candidate);
		await gotoHydrated(page, `/${DOMAIN}/hire`);
		const jobStep = step(page, 'Step 1: Select or create a job');
		await expect(jobStep).toContainText('Your job descriptions live in a recruiter space.');
		await expect(
			jobStep.getByRole('link', { name: /what they ask of recruiters/ })
		).toHaveAttribute('href', '/legal/terms#recruiters');

		// Not without the box
		await jobStep.getByRole('button', { name: 'Create my recruiter space' }).click();
		await expect(
			jobStep.getByText(
				'Tick the box to confirm your age and accept the terms before you create your recruiter space.'
			)
		).toBeVisible();
		expect(opened).toHaveLength(0);

		await jobStep.getByRole('checkbox', { name: /at least 16 years old/ }).check();
		await jobStep.getByRole('button', { name: 'Create my recruiter space' }).click();

		await expect(jobStep).toContainText('You have no job description yet.');
		expect(opened.map((request) => request.postDataJSON())).toEqual([
			{ mode: 'recruiter', consent: { termsVersion: LEGAL_VERSION, ageConfirmed: true } }
		]);
	});

	test('a recruiter who has not accepted the terms in force accepts them on the job step', async ({
		page
	}) => {
		await setJourney('job', 'meeting');
		await createJob(recruiterApi, { title: `Staff engineer ${tag}`, status: 'open' });
		// An acceptance older than the terms in force, refused until accepted again (answered in the
		// browser: the e2e recruiter's acceptance is never changed)
		const user = {
			_id: recruiter.ownerId,
			email: 'e2e.recruiter@example.com',
			activeMode: 'recruiter',
			recruiter: true,
			termsVersion: '2025-01-01'
		};
		await stubApi(page, 'GET', '/isLogged', () => ({
			json: { logged: true, user, expires: recruiter.exp }
		}));
		let accepted = false;
		await stubApi(page, 'GET', '/recruiter/jobs', () => (accepted ? undefined : TERMS_REQUIRED));
		const acceptances = await stubApi(page, 'PUT', '/me/consent', () => {
			accepted = true;
			return { json: { user: { ...user, termsVersion: LEGAL_VERSION } } };
		});

		await signIn(page, recruiter);
		await gotoHydrated(page, `/${DOMAIN}/hire`);
		const jobStep = step(page, 'Step 1: Select or create a job');
		const terms = jobStep.locator('[data-terms-acceptance]');
		await expect(terms.getByRole('heading', { level: 3, name: 'Terms of use' })).toBeVisible();
		await expect(terms).toContainText('accept them to keep using your recruiter space');

		await terms.getByRole('checkbox', { name: /at least 16 years old/ }).check();
		await terms.getByRole('button', { name: 'Accept the terms' }).click();

		await expect(
			jobStep.getByRole('radio', { name: new RegExp(`Staff engineer ${tag}`) })
		).toBeVisible();
		expect(acceptances.map((request) => request.postDataJSON())).toEqual([
			{ termsVersion: LEGAL_VERSION, ageConfirmed: true, source: 'recruiter' }
		]);
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

		// A job is already picked: the step is done, and still leads to the editor
		const picked = await createJob(recruiterApi, {
			title: `Staff engineer ${tag}`,
			status: 'open'
		});
		await submitStep('job', { jobId: picked._id });
		await signIn(page, recruiter);
		await gotoHydrated(page, `/${DOMAIN}/hire`);
		const jobStep = step(page, 'Step 1: Select or create a job');
		const meetingStep = step(page, 'Step 2: Book a meeting');
		const radio = (title: string) => jobStep.getByRole('radio', { name: new RegExp(title) });
		await jobStep.getByRole('button', { name: /Change/ }).click();
		await jobStep.getByRole('link', { name: 'Write a new job description' }).click();
		await expect(page).toHaveURL(new RegExp(`/recruiter/jobs/new\\?journey=${DOMAIN}$`));
		await expect(page.getByRole('note')).toContainText(
			`you go back to the hiring journey of ${DOMAIN} to pick it`
		);
		await expect(page.getByRole('link', { name: 'Back to the hiring journey' })).toHaveAttribute(
			'href',
			`/${DOMAIN}/hire`
		);

		// Written in the editor, open: once created, the editor goes back to the journey with it
		// selected, the job step open on it although another job was picked before
		await page.getByRole('textbox', { name: 'Job title' }).fill(`Platform lead ${tag}`);
		await page.getByRole('textbox', { name: 'Company' }).fill('E2E Corp');
		await page.getByLabel('Status', { exact: true }).selectOption('open');
		await page.getByRole('textbox', { name: 'Job description' }).fill('## The job\n\nLead it.');
		await page.getByRole('textbox', { name: 'City', exact: true }).fill('Paris');
		await page.getByRole('textbox', { name: 'Minimum pay' }).fill('60 000');
		await page.getByRole('textbox', { name: 'Maximum pay' }).fill('70 000');
		await page.getByRole('button', { name: 'Create job description' }).click();
		await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/hire\\?job=[0-9a-f]{24}$`));
		await expect(toasts(page).getByText('Job description created', { exact: true })).toBeVisible();
		await expect(radio(`Platform lead ${tag}`)).toBeChecked();

		// Another job picked than the one the address asked for: on to the meeting step, and the
		// address selects nothing any more
		await radio(`Staff engineer ${tag}`).check();
		await jobStep.getByRole('button', { name: 'Continue with this job' }).click();
		await expect(jobStep).toContainText(`Staff engineer ${tag} · E2E Corp`);
		await expect(meetingStep).toContainText('Online booking is not available right now.');
		await expect(radio(`Platform lead ${tag}`)).toHaveCount(0);
		await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/hire$`));

		// Change opens the job step on the job picked, and moves the focus there
		await jobStep.getByRole('button', { name: /Change/ }).click();
		await expect(radio(`Staff engineer ${tag}`)).toBeChecked();
		await expect(
			page.getByRole('heading', { name: 'Step 1: Select or create a job' })
		).toBeFocused();

		// Picking the new job then works the same
		await radio(`Platform lead ${tag}`).check();
		await jobStep.getByRole('button', { name: 'Continue with this job' }).click();
		await expect(jobStep).toContainText(`Platform lead ${tag} · E2E Corp`);
		await expect(meetingStep).toContainText('Online booking is not available right now.');
	});

	test('a recruiter imports the job from a PDF in the journey and comes back to pick it', async ({
		page
	}) => {
		await setJourney('job', 'meeting');
		// GET and POST /jobs/import answered in the browser: Claude is never called
		let imports = 0;
		await page.route(`${API_URL}/jobs/import`, async (route) => {
			const request = route.request();
			const headers = cors(request);
			if (request.method() === 'OPTIONS') return route.fulfill(preflight(request));
			const quota = {
				plan: 'free',
				limit: 3,
				used: imports,
				remaining: 3 - imports,
				resetsAt: null
			};
			if (request.method() === 'GET') {
				return route.fulfill({ json: { enabled: true, ...quota }, headers });
			}
			imports += 1;
			return route.fulfill({
				json: {
					draft: {
						title: `Product designer ${tag}`,
						description: '## The job\n\nDesign the booking flow.',
						company: 'Initech',
						status: 'draft',
						location: { country: 'FR', city: 'Nantes', workMode: 'on_site' },
						contract: { type: 'cdi' },
						workingTime: { arrangement: 'weekly_hours', hoursPerWeek: 35 },
						pay: { min: 50000, max: 60000, currency: 'EUR', period: 'year' }
					},
					warnings: [],
					quota: { ...quota, used: imports, remaining: 3 - imports }
				},
				headers
			});
		});

		await signIn(page, recruiter);
		await gotoHydrated(page, `/${DOMAIN}/hire`);
		const jobStep = step(page, 'Step 1: Select or create a job');
		await expect(jobStep.getByText('3 of 3 free imports left.')).toBeVisible();
		await jobStep.getByRole('button', { name: 'Import from PDF' }).click();
		const dialog = page.getByRole('dialog', { name: 'Import a job description' });
		await dialog.locator('input[type="file"]').setInputFiles({
			name: 'offer.pdf',
			mimeType: 'application/pdf',
			buffer: Buffer.from('%PDF-1.4\n%e2e\n')
		});
		await dialog.getByRole('button', { name: 'Import', exact: true }).click();

		// The editor opens on the draft, and still knows the journey it came from
		await expect(page).toHaveURL(new RegExp(`/recruiter/jobs/new\\?journey=${DOMAIN}&import=1$`));
		await expect(page.getByRole('textbox', { name: 'Job title' })).toHaveValue(
			`Product designer ${tag}`
		);
		await expect(
			page.getByText(`you go back to the hiring journey of ${DOMAIN} to pick it`)
		).toBeVisible();
		await page.getByLabel('Status', { exact: true }).selectOption('open');
		await page.getByRole('button', { name: 'Create job description' }).click();

		await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/hire\\?job=[0-9a-f]{24}$`));
		await expect(
			jobStep.getByRole('radio', { name: new RegExp(`Product designer ${tag}`) })
		).toBeChecked();
		await jobStep.getByRole('button', { name: 'Continue with this job' }).click();
		await expect(jobStep).toContainText(`Product designer ${tag} · Initech`);
	});

	test('the owner rates what they look for in a job, and asks jobs for a minimum score', async ({
		page
	}) => {
		await setPerfectJob({});
		await setJourney('job', 'meeting');
		await signIn(page, owner);
		await gotoHydrated(page, `/${DOMAIN}/admin`);
		await page.getByRole('tab', { name: 'Perfect job' }).click();

		await expect(
			page.getByText('No criterion yet: nothing is asked of a job, so every job scores 100.')
		).toBeVisible();
		const save = page.getByRole('button', { name: 'Save perfect job' });
		await expect(save).toBeDisabled();

		// A criterion switched on says what it still needs, and nothing can be saved until then
		const workMode = criterion(page, 'Work mode');
		await workMode.getByText('Work mode', { exact: true }).click();
		await expect(workMode.getByText('Pick at least one work mode.')).toBeVisible();
		await expect(page.getByText('Work mode: Pick at least one work mode.')).toBeVisible();
		await expect(save).toBeDisabled();
		await workMode.getByRole('checkbox', { name: 'Full remote' }).check();
		await workMode.getByRole('checkbox', { name: 'Hybrid' }).check();
		await workMode.getByLabel('Remote days a week in a hybrid job, at least').selectOption('3');
		await workMode.getByRole('radio', { name: '5: Essential' }).check();
		await workMode.getByRole('checkbox', { name: 'Deal-breaker' }).check();
		await expect(workMode.locator('[data-importance]')).toHaveText(
			'Essential · counts for 100% of the score'
		);

		// A list takes several items at once, each once
		const skills = criterion(page, 'Skills');
		await skills.getByText('Skills', { exact: true }).click();
		const skillInput = skills.getByLabel('Skills you want to use');
		await skillInput.fill('TypeScript, Svelte, typescript');
		await skillInput.press('Enter');
		await expect(
			skills.getByRole('list', { name: 'Skills you want to use added' }).getByRole('listitem')
		).toHaveText(['TypeScript', 'Svelte']);
		await expect(workMode.locator('[data-importance]')).toHaveText(
			'Essential · counts for 63% of the score'
		);
		await expect(skills.locator('[data-importance]')).toHaveText(
			'Important · counts for 38% of the score'
		);

		// A number that is not one is said at its field
		const pay = criterion(page, 'Pay');
		await pay.getByText('Pay', { exact: true }).click();
		await pay.getByLabel('Per year').fill('a lot');
		await expect(
			pay.getByText('Pay per year must be a whole number of euros, above 0.')
		).toBeVisible();
		await expect(save).toBeDisabled();
		await pay.getByLabel('Per year').fill('70 000');
		await pay.getByRole('radio', { name: '4: Very important' }).check();

		await expect(
			page.getByText(
				'A job is scored on 3 criteria: work mode, pay and skills. One of them is a deal-breaker.'
			)
		).toBeVisible();
		await save.click();
		await expect(toasts(page).getByText('Perfect job saved')).toBeVisible();
		await expect(save).toBeDisabled();
		const stored = await ownerApi.get(`${API_URL}/perfect-job`);
		expect(await stored.json()).toEqual({
			// This API computes no travel times (no COMMUTE_TIMES)
			commute: { enabled: false, modes: [] },
			criteria: {
				workMode: {
					importance: 5,
					dealBreaker: true,
					modes: ['hybrid', 'remote'],
					minRemoteDays: 3
				},
				pay: { importance: 4, perYear: 70000 },
				skills: { importance: 3, names: ['TypeScript', 'Svelte'] }
			}
		});

		// The tab leads to the journey, where the step that uses the score is added and set
		await page.getByRole('button', { name: 'hiring journey' }).click();
		await expect(editorSteps(page).first()).toBeVisible();
		await addStep(page, 'Match the perfect job').click();
		const match = editorStep(page, 'Step 2: Match the perfect job');
		await expect(match).toContainText('Scored on the 3 criteria of your perfect job');
		const minimum = match.getByLabel('Minimum score');
		await expect(minimum).toHaveValue('70');
		await minimum.fill('');
		await expect(match).toContainText('The minimum score is a whole number from 0 to 100.');
		await expect(page.getByRole('button', { name: 'Save journey' })).toBeDisabled();
		await minimum.fill('60');
		await match.getByRole('checkbox', { name: /^Show recruiters/ }).check();
		// Moved above the job it scores, it has nothing to score
		await match.getByRole('button', { name: /^Move up/ }).click();
		await expect(editorStep(page, 'Step 1: Match the perfect job')).toContainText(
			'works on what recruiters did in “Select or create a job”: move it below that step.'
		);
		await editorStep(page, 'Match the perfect job')
			.getByRole('button', { name: /^Move down/ })
			.click();
		await expect(
			page.getByText(
				'Recruiters select or create a job, match the perfect job, then book a meeting.'
			)
		).toBeVisible();
		await page.getByRole('button', { name: 'Save journey' }).click();
		await expect(toasts(page).getByText('Hiring journey saved')).toBeVisible();
		const saved = await ownerApi.get(`${API_URL}/workflow`);
		expect(await saved.json()).toEqual({
			steps: [
				{ id: 'job', type: 'job', config: {} },
				{ id: 'job-match', type: 'job-match', config: { minScore: 60, showDetails: true } },
				{ id: 'meeting', type: 'meeting', config: {} }
			]
		});

		// Anyone is told the minimum, and nothing of the criteria
		const journey = await (await ownerApi.get(`${API_URL}/workflow/domains/${DOMAIN}`)).json();
		expect(journey.steps[1]).toEqual({
			id: 'job-match',
			type: 'job-match',
			status: 'pending',
			config: { minScore: 60 }
		});
	});

	test('switching criteria on down the page keeps the page in sight', async ({ page }) => {
		// A switch's input is hidden and absolutely positioned: placed outside the page's scroll
		// container, it stayed where the page was before it scrolled, and focusing it (pressing a
		// switch further down) scrolled the rail and the page away, leaving the header alone
		await setPerfectJob({});
		await signIn(page, owner);
		await gotoHydrated(page, `/${DOMAIN}/admin`);
		await page.getByRole('tab', { name: 'Perfect job' }).click();
		const cards = page.locator('[data-criterion]');
		await expect(cards).toHaveCount(PERFECT_JOB_CRITERIA.length);

		for (const card of await cards.all()) {
			const name = await card.getAttribute('data-criterion');
			// This API computes no travel times (no COMMUTE_TIMES): the commute cannot be switched on
			if (name === 'commute') continue;
			await card.locator('[data-part="control"]').click();
			await expect(card.locator('[data-importance]'), `${name} is on`).toBeVisible();
			// Only the page scrolls: the box around it and the rail stays put
			expect(
				await page.locator('#page').evaluate((main) => main.parentElement?.scrollTop),
				`after ${name}`
			).toBe(0);
			// The tabs stick to the top of the page, and the criterion just pressed is on screen
			await expect(page.getByRole('tablist'), `after ${name}`).toBeInViewport({ ratio: 1 });
			await expect(card, `after ${name}`).toBeInViewport();
		}
	});

	test('unsaved criteria: the language switch asks before reloading the page', async ({ page }) => {
		await setPerfectJob({});
		await signIn(page, owner);
		await gotoHydrated(page, `/${DOMAIN}/admin`);
		await page.getByRole('tab', { name: 'Perfect job' }).click();
		await criterion(page, 'Pay').getByText('Pay', { exact: true }).click();

		// The language switch is in the rail, a link that reloads the page. It used to be ignored
		await page.getByRole('button', { name: 'Open sidebar' }).click();
		const languageSwitch = page.locator('aside a[data-language-switch]');
		const asked: string[] = [];
		page.once('dialog', (dialog) => {
			asked.push(dialog.message());
			return dialog.dismiss();
		});
		await languageSwitch.click();
		await expect
			.poll(() => asked)
			.toEqual(['Leave without saving your perfect job? Your changes will be lost.']);
		await expect(page).not.toHaveURL(/lang=fr/);
		await expect(criterion(page, 'Pay').locator('[data-importance]')).toBeVisible();

		// Accepted: the page reloads in the other language, asked once
		page.once('dialog', (dialog) => {
			asked.push(dialog.message());
			return dialog.accept();
		});
		await languageSwitch.click();
		await expect(page).toHaveURL(/lang=fr/);
		expect(asked).toHaveLength(2);
		await expect(page.getByRole('tab', { name: 'Poste idéal' })).toBeVisible();
	});

	test('an expired session on save keeps what was typed, and says so', async ({ page }) => {
		await setPerfectJob({});
		await signIn(page, owner);
		await gotoHydrated(page, `/${DOMAIN}/admin`);
		await page.getByRole('tab', { name: 'Perfect job' }).click();
		const pay = criterion(page, 'Pay');
		await pay.getByText('Pay', { exact: true }).click();
		await pay.getByLabel('Per year').fill('70 000');

		// The save is answered 401: the tab is not signed out from under the owner
		await page.route(`${API_URL}/perfect-job`, (route) => {
			const request = route.request();
			if (request.method() === 'OPTIONS') {
				return route.fulfill({
					...preflight(request),
					headers: { ...preflight(request).headers, 'access-control-allow-methods': 'GET, PUT' }
				});
			}
			if (request.method() === 'PUT') {
				return route.fulfill({
					status: 401,
					json: { message: 'Unauthorized' },
					headers: cors(request)
				});
			}
			return route.fallback();
		});
		await page.getByRole('button', { name: 'Save perfect job' }).click();
		await expect(page.getByRole('alert')).toHaveText(
			'Your session expired. Your changes are still here: sign in again in another tab, then save.'
		);
		await expect(pay.getByLabel('Per year')).toHaveValue('70 000');
		await expect(page.getByRole('button', { name: 'Save perfect job' })).toBeEnabled();
		expect(await (await ownerApi.get(`${API_URL}/perfect-job`)).json()).toMatchObject({
			criteria: {}
		});
	});

	test('the commute is offered only where the site computes travel times, and finds the address on save', async ({
		page
	}) => {
		await setPerfectJob({});
		await signIn(page, owner);
		await gotoHydrated(page, `/${DOMAIN}/admin`);
		await page.getByRole('tab', { name: 'Perfect job' }).click();

		// This API computes none (no COMMUTE_TIMES): the criterion says so, and cannot be switched on
		const commute = criterion(page, 'Commute');
		await expect(commute).toContainText('This site does not compute travel times');
		await expect(commute.getByRole('checkbox', { name: /^Commute/ })).toBeDisabled();

		// A site that computes them, answered in the browser: no map service is called
		const HOME = { label: '10 Rue de la République 69001 Lyon', lat: 45.7655, lon: 4.8358 };
		const sent: { criteria: Record<string, unknown> }[] = [];
		await page.route(`${API_URL}/perfect-job`, (route) => {
			const request = route.request();
			const headers = cors(request);
			const travelTimes = { enabled: true, modes: ['bike', 'car', 'walk'] };
			if (request.method() === 'OPTIONS') {
				return route.fulfill({
					...preflight(request),
					headers: { ...preflight(request).headers, 'access-control-allow-methods': 'GET, PUT' }
				});
			}
			if (request.method() === 'GET') {
				return route.fulfill({ json: { criteria: {}, commute: travelTimes }, headers });
			}
			sent.push(request.postDataJSON());
			const asked = sent.at(-1)!.criteria.commute as { from: string };
			return /nowhere/i.test(asked.from)
				? route.fulfill({
						status: 422,
						json: {
							type: 'validation',
							on: 'body',
							property: 'criteria.commute.from',
							message: 'This address was not found. Check it, or give a town or a place nearby.'
						},
						headers
					})
				: route.fulfill({
						json: { criteria: { commute: { ...asked, place: HOME } }, commute: travelTimes },
						headers
					});
		});
		const searched = await stubAddressSearch(page, {
			search: (sent) =>
				/rep/i.test(sent.q ?? '')
					? [
							{
								label: '10 Rue de la République 69001 Lyon',
								kind: 'housenumber',
								street: '10 Rue de la République',
								postalCode: '69001',
								city: 'Lyon'
							},
							{
								label: '10 Rue de la République 69100 Villeurbanne',
								kind: 'housenumber',
								street: '10 Rue de la République',
								postalCode: '69100',
								city: 'Villeurbanne'
							}
						]
					: []
		});
		await page.reload();
		await page.getByRole('tab', { name: 'Perfect job' }).click();
		await commute.getByText('Commute', { exact: true }).click();
		await expect(page.getByText('Commute: Give the address you would travel from.')).toBeVisible();

		const from = commute.getByRole('combobox', { name: 'Where you travel from' });
		await from.fill('Nowhere at all');
		// Nothing like it on the map: said under the field, which keeps what was typed
		await expect(commute.locator('[data-address-notice]')).toContainText(
			'No address found for what you typed.'
		);
		await from.press('Escape');
		// Public transport is not offered by this site: said, and not to pick
		await expect(commute.getByRole('checkbox', { name: /^Public transport/ })).toBeDisabled();
		await expect(commute).toContainText('Public transport (not available on this site)');
		await commute.getByRole('checkbox', { name: 'Bike' }).check();
		await commute.getByRole('checkbox', { name: 'Car' }).check();
		await commute.getByRole('textbox', { name: 'Hours a week' }).fill('5');
		await expect(commute.locator('[data-budget]')).toContainText(
			'That is 30 minutes each way for a job at the office every day, or 2 h 30 each way for a job you go to once a week.'
		);
		await commute.getByRole('textbox', { name: 'Minutes a week' }).fill('a few');
		await expect(commute).toContainText(
			'Give the travel time you accept a week, from 10 minutes to 50 hours.'
		);
		await commute.getByRole('textbox', { name: 'Minutes a week' }).fill('');

		// An address the map does not know is said at the field, and nothing is lost
		const save = page.getByRole('button', { name: 'Save perfect job' });
		await save.click();
		await expect(from).toHaveAccessibleDescription(
			'This address was not found. Check it, or give a town or a place nearby.'
		);
		// Typed, the address is searched: the one picked is kept as the map writes it
		await from.fill('10 rue de la rep');
		const options = commute.getByRole('listbox', { name: 'Suggestions' }).getByRole('option');
		await expect(options).toHaveText([
			'10 Rue de la République 69001 Lyon',
			'10 Rue de la République 69100 Villeurbanne'
		]);
		expect(searched.search.at(-1)?.q).toBe('10 rue de la rep');
		await options.first().click();
		await expect(from).toHaveValue('10 Rue de la République 69001 Lyon');
		await expect(options).toHaveCount(0);
		await save.click();
		await expect(toasts(page).getByText('Perfect job saved')).toBeVisible();
		await expect(commute.locator('[data-place]')).toHaveText(
			'Found: 10 Rue de la République 69001 Lyon.'
		);
		// The place is the API's to find: the page sends the address, the modes and the minutes
		expect(sent.at(-1)).toEqual({
			criteria: {
				commute: {
					importance: 3,
					from: '10 Rue de la République 69001 Lyon',
					modes: ['bike', 'car'],
					maxMinutesPerWeek: 300
				}
			}
		});
		// Another address is not found yet: it is looked up on the next save. Escape before the pause
		// in typing is over: nothing is searched, no list opens
		const searches = searched.search.length;
		await from.fill('Gare Part-Dieu, Lyon');
		await from.press('Escape');
		await page.waitForTimeout(500);
		expect(searched.search).toHaveLength(searches);
		await expect(commute.locator('[data-address-suggestions]')).toBeHidden();
		await expect(commute.locator('[data-place]')).toHaveCount(0);
		await page.getByRole('button', { name: 'Undo changes' }).click();
	});

	test('a recruiter books once their job scores enough against the perfect job', async ({
		page
	}) => {
		await setPerfectJob({
			seniority: { importance: 2, levels: ['senior', 'lead'] },
			workMode: { importance: 5, modes: ['remote'] },
			contractTypes: { importance: 3, types: ['cdi'] }
		});
		await setSteps(
			{ id: 'job', type: 'job' },
			{ id: 'job-match', type: 'job-match', config: { minScore: 60, showDetails: true } },
			{ id: 'meeting', type: 'meeting' }
		);
		const onSite = await createJob(recruiterApi, {
			title: `On site engineer ${tag}`,
			status: 'open'
		});
		await createJob(recruiterApi, {
			title: `Remote engineer ${tag}`,
			status: 'open',
			location: { country: 'FR', workMode: 'remote' },
			requirements: { seniority: 'senior' }
		});

		await signIn(page, recruiter);
		await gotoHydrated(page, `/${DOMAIN}/hire`);
		const jobStep = step(page, 'Step 1: Select or create a job');
		const matchStep = step(page, 'Step 2: Match the perfect job');
		const meetingStep = step(page, 'Step 3: Book a meeting');
		await expect(matchStep).toContainText('Complete the step above first.');

		// A CDI on site, with no seniority stated: only the contract matches (3 of 10)
		await jobStep.getByRole('radio', { name: new RegExp(`On site engineer ${tag}`) }).check();
		await jobStep.getByRole('button', { name: 'Continue with this job' }).click();
		await expect(matchStep).toContainText(
			`On site engineer ${tag} scores 30 out of 100: at least 60 is needed.`
		);
		await expect(
			page.getByRole('heading', { name: 'Step 2: Match the perfect job (not passed)' })
		).toBeFocused();
		const details = matchStep.getByRole('listitem');
		await expect(details).toHaveText([
			/Seniority · Not stated in your job description/,
			/Work mode · Does not match/,
			/Contract · Matches/
		]);
		// What the owner asks for is never told
		await expect(matchStep).not.toContainText(/remote|lead|cdi/i);
		await expect(
			matchStep.getByRole('link', { name: 'Edit this job description' })
		).toHaveAttribute('href', `/recruiter/jobs/${onSite._id}/edit`);
		await expect(meetingStep).toContainText('Complete the steps above first.');
		await expect(meetingStep.getByRole('button')).toHaveCount(0);

		// Another job of theirs, which matches everything: the meeting step opens
		await jobStep.getByRole('button', { name: 'Change' }).click();
		await jobStep.getByRole('radio', { name: new RegExp(`Remote engineer ${tag}`) }).check();
		await jobStep.getByRole('button', { name: 'Continue with this job' }).click();
		await expect(matchStep).toContainText(`Remote engineer ${tag} scores 100 out of 100.`);
		await expect(meetingStep).toContainText('Pick a time slot that suits you.');

		// The owner asks for more: the same job is checked again, and does not pass anymore
		await setPerfectJob({
			workMode: { importance: 5, modes: ['remote'] },
			contractTypes: { importance: 5, dealBreaker: true, types: ['freelance'] }
		});
		await matchStep.getByRole('button', { name: 'Open' }).click();
		await expect(matchStep).toContainText('close enough');
		await page.reload();
		await expect(matchStep).toContainText(
			`Remote engineer ${tag} scores 0 out of 100: at least 60 is needed.`
		);
		await expect(matchStep.getByText('Deal-breaker', { exact: true })).toBeVisible();
		await expect(meetingStep).toContainText('Complete the steps above first.');
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
