import { expect, test, type APIRequestContext, type Page, type Request } from '@playwright/test';
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
// file alone): its owner adds, sets and orders the steps in the admin tab, and the e2e recruiter
// goes through them on the Hire page (a note to read and confirm, one of their open job
// descriptions to pick) before the meeting step opens. No Google Calendar is connected: the
// meeting step says online booking is unavailable (the booking itself is covered by the API's
// tests). The recruiter is shared with the other recruiter files, which run in parallel: each
// test names its postings with its own tag and removes them afterwards.

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
