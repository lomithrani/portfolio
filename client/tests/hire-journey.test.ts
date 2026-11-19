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
import {
	DEFAULT_WORKFLOW_STEPS,
	LEGAL_VERSION,
	PERFECT_JOB_CRITERIA,
	journeyTemplate
} from 'portfolio-common';

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

test.describe('the admin page', () => {
	const selectedTab = (page: Page) => page.getByRole('tab', { selected: true });

	test('`?tab=` opens a tab, and the address follows the tab shown', async ({ page }) => {
		await setPerfectJob({});
		await signIn(page, owner);
		await gotoHydrated(page, `/${DOMAIN}/admin?tab=perfect-job`);
		await expect(selectedTab(page)).toHaveText('Perfect job');
		await expect(page.getByRole('heading', { name: 'Perfect job', level: 2 })).toBeVisible();

		await page.getByRole('tab', { name: 'Hiring journey' }).click();
		await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/admin\\?tab=workflows$`));
		// A reload opens on it again
		await gotoHydrated(page, `/${DOMAIN}/admin?tab=workflows`);
		await expect(selectedTab(page)).toHaveText('Hiring journey');
		// A tab that is not one: the page opens where it would without it
		await gotoHydrated(page, `/${DOMAIN}/admin?tab=nothing`);
		await expect(selectedTab(page)).toHaveText(/^Get started/);
		await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/admin\\?tab=nothing$`));
		await page.getByRole('tab', { name: 'Appearance' }).click();
		await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/admin\\?tab=appearance$`));

		// The address's other parameters stay as the tab changes (the language, here)
		await gotoHydrated(page, `/${DOMAIN}/admin?lang=fr&tab=perfect-job`);
		await expect(selectedTab(page)).toHaveText('Poste idéal');
		await page.locator('[role="tab"][data-value="workflows"]').click();
		await expect(selectedTab(page)).toHaveText('Parcours de recrutement');
		await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/admin\\?lang=fr&tab=workflows$`));
	});

	test('a perfect job starts from the essentials, which ask to be filled in', async ({ page }) => {
		await setPerfectJob({});
		await signIn(page, owner);
		await gotoHydrated(page, `/${DOMAIN}/admin?tab=perfect-job`);
		const save = page.getByRole('button', { name: 'Save perfect job' });

		await page.getByRole('button', { name: 'Start with the essentials' }).click();
		await expect(page.getByRole('button', { name: 'Start with the essentials' })).toHaveCount(0);
		// This API computes no travel times (no COMMUTE_TIMES): the cities say where the office is
		const switchOf = (name: string) => criterion(page, name).getByRole('checkbox').first();
		for (const name of ['Pay', 'Work mode', 'Location', 'Contract']) {
			await expect(switchOf(name), name).toBeChecked();
		}
		await expect(switchOf('Commute')).not.toBeChecked();
		await expect(switchOf('Work mode')).toBeFocused();
		// The pay is a deal-breaker
		await expect(
			criterion(page, 'Pay').getByRole('checkbox', { name: 'Deal-breaker' })
		).toBeChecked();
		// Nothing is saved until what they ask is filled in
		await expect(save).toBeDisabled();
		await expect(page.getByText('Work mode: Pick at least one work mode.')).toBeVisible();

		await criterion(page, 'Pay').getByLabel('Per year').fill('60 000');
		await criterion(page, 'Work mode').getByRole('checkbox', { name: 'Full remote' }).check();
		const cities = criterion(page, 'Location').getByLabel('Cities or postal codes');
		await cities.fill('Lyon');
		await cities.press('Enter');
		await criterion(page, 'Contract').getByRole('checkbox', { name: 'CDI (permanent)' }).check();
		await save.click();
		await expect(toasts(page).getByText('Perfect job saved')).toBeVisible();
		const stored = await ownerApi.get(`${API_URL}/perfect-job`);
		expect((await stored.json()).criteria).toEqual({
			pay: { importance: 5, dealBreaker: true, perYear: 60000 },
			workMode: { importance: 4, modes: ['remote'] },
			cities: { importance: 4, places: ['Lyon'] },
			contractTypes: { importance: 3, types: ['cdi'] }
		});
	});

	test('"Get started" lists what is left, and sets the gate journey in one click', async ({
		page
	}) => {
		await setPerfectJob({});
		await setJourney('meeting');
		await signIn(page, owner);
		// No tab named: the page opens on its checklist, which is not complete
		await gotoHydrated(page, `/${DOMAIN}/admin`);
		await expect(selectedTab(page)).toHaveText(/^Get started/);
		const checklist = page.getByRole('list', { name: 'Checklist' });
		const item = (id: string) => checklist.locator(`[data-item="${id}"]`);
		await expect(item('resume')).toHaveAttribute('data-state', 'toDo');
		await expect(item('perfectJob')).toHaveAttribute('data-state', 'toDo');
		// A journey saved (the meeting alone) is one the owner chose
		await expect(item('journey')).toHaveAttribute('data-state', 'done');
		await expect(item('journey')).toContainText(
			'Your page for recruiters asks nothing before the meeting. To ask for the job first:'
		);
		// Nobody can book on this site (no Google Calendar): the item does not say they can
		await expect(item('calendar')).toHaveAttribute('data-state', 'unavailable');
		await expect(item('journey')).not.toContainText('can book');
		await expect(item('share').getByRole('textbox', { name: 'Your link' })).toHaveValue(
			`http://localhost:4173/${DOMAIN}`
		);

		// The gate journey, its note changed first, and an empty perfect job is said
		const gate = item('journey').locator('[data-template="gate"]');
		await expect(gate.getByRole('list', { name: 'Its steps' }).getByRole('listitem')).toHaveText([
			'Read a note: Share the job first',
			'Select or create a job',
			'Match the perfect job',
			'Book a meeting'
		]);
		await expect(gate).toContainText('Your perfect job has no criterion yet');
		await gate.getByText('Change the note first').click();
		await gate.getByLabel('Title').fill('Before we talk');

		// A change left in the journey editor is lost too: asked first
		await page.getByRole('tab', { name: 'Hiring journey' }).click();
		await addStep(page, 'Read a note').click();
		await page.getByRole('tab', { name: /^Get started/ }).click();
		await gate.getByRole('button', { name: 'Use these steps' }).click();
		const dialog = page.getByRole('alertdialog', { name: 'Replace your steps?' });
		await expect(dialog).toContainText(
			'Recruiters read a note (“Before we talk”), select or create a job, match the perfect job, then book a meeting.'
		);
		await expect(dialog).toContainText(
			'The changes you have not saved in the Hiring journey tab are lost too.'
		);
		await dialog.getByRole('button', { name: 'Replace my steps' }).click();
		await expect(toasts(page).getByText('Steps saved')).toBeVisible();
		await expect(dialog).toHaveCount(0);
		await expect(gate).toHaveCount(0);
		// The button pressed is gone: the focus waits on the item's heading
		await expect(item('journey').getByRole('heading', { name: /^Your steps/ })).toBeFocused();
		await expect(item('journey')).toContainText(
			'Recruiters read a note, select or create a job, match the perfect job, then book a meeting.'
		);

		const saved = await ownerApi.get(`${API_URL}/workflow`);
		const { steps } = await saved.json();
		expect(steps.map(({ id, type }: { id: string; type: string }) => `${id}:${type}`)).toEqual([
			'note:note',
			'job:job',
			'job-match:job-match',
			'meeting:meeting'
		]);
		expect(steps[0].config.title).toBe('Before we talk');
		expect(steps[2].config).toEqual({ minScore: 70, showDetails: true });

		// The editor starts again from what was saved, and the item leads to it
		await item('journey').getByRole('button', { name: 'Change my steps' }).click();
		await expect(selectedTab(page)).toHaveText('Hiring journey');
		await expect(page.getByRole('tab', { name: 'Hiring journey' })).toBeFocused();
		await expect(editorSteps(page)).toHaveCount(4);
		await expect(page.getByRole('button', { name: 'Save journey' })).toBeDisabled();
	});

	test('"Get started" is read again each time it is shown, with its count on the tab', async ({
		page
	}) => {
		await setPerfectJob({});
		await setJourney('meeting');
		await signIn(page, owner);
		await gotoHydrated(page, `/${DOMAIN}/admin`);
		const checklist = page.getByRole('list', { name: 'Checklist' });
		await expect(checklist.locator('[data-item="perfectJob"]')).toHaveAttribute(
			'data-state',
			'toDo'
		);
		const badge = page.getByRole('tab', { name: /^Get started/ }).locator('[data-start-progress]');
		const count = async () => {
			const shown = await badge.locator('[aria-hidden="true"]').innerText();
			const [, done, total] = /^(\d+)\/(\d+)$/.exec(shown.trim()) ?? [];
			return { done: Number(done), total: Number(total) };
		};
		const before = await count();
		await expect(badge.locator('.sr-only')).toHaveText(`${before.done} of ${before.total} done`);

		// The pay rated elsewhere (another tab, another device): shown again, the tab says so
		await page.getByRole('tab', { name: 'Perfect job' }).click();
		await setPerfectJob({ pay: { importance: 5, dealBreaker: true, perYear: 60000 } });
		await page.getByRole('tab', { name: /^Get started/ }).click();
		await expect(checklist.locator('[data-item="perfectJob"]')).toHaveAttribute(
			'data-state',
			'done'
		);
		// The essentials left are suggested, as one list
		await expect(checklist.locator('[data-item="perfectJob"]')).toContainText(
			'You could also rate the work mode, where you work and the contract.'
		);
		await expect(badge.locator('.sr-only')).toHaveText(
			`${before.done + 1} of ${before.total} done`
		);
		expect(await count()).toEqual({ done: before.done + 1, total: before.total });

		// On a phone the row of tabs scrolls: the tab shown, and its count, are in sight
		await page.setViewportSize({ width: 390, height: 844 });
		const selected = page.getByRole('tab', { selected: true });
		await expect(selected).toHaveText(/^Get started/);
		const box = await selected.boundingBox();
		expect(box && box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box)).toBe(true);
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
		).toBe(true);
	});

	test('an expired session when "Get started" is read again keeps what the other tabs hold', async ({
		page
	}) => {
		await setPerfectJob({});
		await setJourney('meeting');
		// The first read lets the page open; the ones after it find the session expired
		let reads = 0;
		let expired = true;
		await stubApi(page, 'GET', '/me/readiness', () =>
			reads++ === 0 || !expired ? undefined : { status: 401, text: 'Unauthorized' }
		);
		await signIn(page, owner);
		await gotoHydrated(page, `/${DOMAIN}/admin`);
		await expect(selectedTab(page)).toHaveText(/^Get started/);
		const checklist = page.getByRole('list', { name: 'Checklist' });
		await expect(checklist).toBeVisible();

		// Steps and a criterion changed, not saved
		await page.getByRole('tab', { name: 'Hiring journey' }).click();
		await expect(editorSteps(page)).toHaveCount(1);
		await addStep(page, 'Read a note').click();
		await expect(editorSteps(page)).toHaveCount(2);
		await page.getByRole('tab', { name: 'Perfect job' }).click();
		const pay = page.locator('[data-criterion="pay"]');
		await pay.locator('[data-part="control"]').click();
		await expect(pay.locator('[data-importance]')).toBeVisible();

		await page.getByRole('tab', { name: /^Get started/ }).click();
		const stale = page.locator('[data-readiness-stale]');
		await expect(stale).toContainText(
			'Your session expired, so this checklist could not be updated. Sign in again in another tab, then try again.'
		);
		// Still signed in, the checklist read before still shown, every tab still there
		await expect(checklist).toBeVisible();
		await expect(page.getByText('Only the admin of this domain')).toHaveCount(0);
		await page.getByRole('tab', { name: 'Hiring journey' }).click();
		await expect(editorSteps(page)).toHaveCount(2);
		await page.getByRole('tab', { name: 'Perfect job' }).click();
		await expect(pay.locator('[data-importance]')).toBeVisible();

		// Signed in again (elsewhere): "Try again" reads it
		await page.getByRole('tab', { name: /^Get started/ }).click();
		await expect(stale).toBeVisible();
		expired = false;
		await stale.getByRole('button', { name: 'Try again' }).click();
		await expect(stale).toHaveCount(0);
		await expect(checklist).toBeVisible();
	});

	test('a journey never saved is set from "Get started" without being asked', async ({ page }) => {
		await setPerfectJob({});
		await setJourney('meeting');
		// As for a portfolio whose owner never saved a journey (the e2e one has: it is answered)
		await stubApi(page, 'GET', '/me/readiness', () => ({
			json: {
				domain: DOMAIN,
				experiences: 0,
				perfectJob: {
					criteria: 0,
					essentials: { pay: false, workMode: false, place: false, contractTypes: false }
				},
				journey: { saved: false, types: ['meeting'], blocked: false, gate: false, meeting: true },
				calendar: { configured: true, connected: false, reconnect: false, enabledSchedules: 0 }
			}
		}));
		await stubApi(page, 'GET', '/workflow', () => ({
			json: { steps: DEFAULT_WORKFLOW_STEPS, saved: false }
		}));
		// The résumé import is offered (this API has no Claude key: answered here, never called)
		await stubApi(page, 'GET', '/experiences/import', () => ({
			json: { enabled: true, limit: 3, remaining: 2, resetsAt: null }
		}));
		const dialogs: string[] = [];
		page.on('dialog', (dialog) => dialogs.push(dialog.message()));
		await signIn(page, owner);
		await gotoHydrated(page, `/${DOMAIN}/admin?tab=start`);
		const checklist = page.getByRole('list', { name: 'Checklist' });
		const journey = checklist.locator('[data-item="journey"]');
		await expect(journey).toHaveAttribute('data-state', 'toDo');
		// No experience yet: the résumé import is one click away, with where the PDF goes
		const resume = checklist.locator('[data-item="resume"]');
		await expect(resume.getByRole('link', { name: 'Upload my résumé (PDF)' })).toHaveAttribute(
			'href',
			`/${DOMAIN}/experiences?import=1`
		);
		await expect(resume).toContainText('your PDF is sent to Anthropic, in the United States');
		// The calendar is not open yet: nobody books
		await expect(journey).toContainText(
			'You have not chosen your steps yet: today your page for recruiters asks nothing before the meeting. Recruiters can book once your calendar is open. Ask for the job first, or keep the meeting alone.'
		);
		// The editor has read the journey too: it knows none was saved
		await page.getByRole('tab', { name: 'Hiring journey' }).click();
		await expect(editorSteps(page)).toHaveCount(1);
		await page.getByRole('tab', { name: /^Get started/ }).click();

		const replace = page.getByRole('alertdialog', { name: 'Replace your steps?' });
		// The session expired meanwhile: said where the steps are, the note changed is kept, and
		// the page is not signed out
		const gate = journey.locator('[data-template="gate"]');
		await gate.getByText('Change the note first').click();
		await gate.getByLabel('Title').fill('Before we talk');
		const refused = await stubApi(page, 'PUT', '/workflow', (_, index) =>
			index === 0 ? { status: 401, text: 'Unauthorized' } : undefined
		);
		await gate.getByRole('button', { name: 'Use these steps' }).click();
		await expect(journey.getByRole('alert')).toHaveText(
			'Your session expired. Sign in again in another tab, then try again.'
		);
		expect(refused).toHaveLength(1);
		await expect(replace).toHaveCount(0);
		await expect(gate.getByLabel('Title')).toHaveValue('Before we talk');
		await expect(checklist).toBeVisible();

		const storedTypes = async () =>
			((await (await ownerApi.get(`${API_URL}/workflow`)).json()).steps as { type: string }[]).map(
				({ type }) => type
			);
		// Saved as the meeting alone, the steps a new portfolio has (what is stored before differs)
		await setJourney('job', 'meeting');
		await journey.getByRole('button', { name: 'Keep the meeting alone' }).click();
		await expect(toasts(page).getByText('Steps saved').first()).toBeVisible();
		await expect(replace).toHaveCount(0);
		await expect(journey.getByRole('heading', { name: /^Your steps/ })).toBeFocused();
		await expect.poll(storedTypes).toEqual(DEFAULT_WORKFLOW_STEPS.map(({ type }) => type));
		const kept = await (await ownerApi.get(`${API_URL}/workflow`)).json();
		expect(kept.steps).toEqual(DEFAULT_WORKFLOW_STEPS);

		// Still never saved, as answered here: the gate is saved without asking either, with the
		// note changed before
		await journey.getByRole('button', { name: 'Use these steps' }).click();
		await expect.poll(storedTypes).toEqual(journeyTemplate('gate').map(({ type }) => type));
		const gateSaved = await (await ownerApi.get(`${API_URL}/workflow`)).json();
		expect(gateSaved.steps[0].config.title).toBe('Before we talk');
		await expect(replace).toHaveCount(0);
		expect(dialogs).toEqual([]);
	});
});

test.describe('the hiring journey', () => {
	test('the owner asks recruiters to pick a job before booking', async ({ page }) => {
		await setJourney('meeting');
		await openEditor(page);

		await expect(editorSteps(page)).toHaveCount(1);
		await expect(editorStep(page, 'Step 1: Book a meeting')).toBeVisible();
		await expect(
			page.getByText('Recruiters can book a meeting right away.', { exact: true })
		).toBeVisible();
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
			],
			saved: true
		});

		// Their own page for recruiters is a preview: nothing is locked for them, and the job step,
		// which asks nothing of them, says what it asks of recruiters
		await page.getByRole('link', { name: 'See your page for recruiters' }).click();
		await expect(
			page.getByRole('heading', { level: 1, name: `Propose a role to ${DOMAIN}` })
		).toBeVisible();
		await expect(page.getByText('This is your page for recruiters, as they see it.')).toBeVisible();
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

		// Its note leads back to the steps, in the admin's Hiring journey tab
		const change = page
			.locator('[data-owner-note]')
			.getByRole('link', { name: 'Change the steps' });
		await expect(change).toHaveAttribute('href', `/${DOMAIN}/admin?tab=workflows`);
		await change.click();
		await expect(page.getByRole('tab', { name: 'Hiring journey', selected: true })).toBeVisible();
		await expect(editorSteps(page)).toHaveCount(2);
		// A job asked for, but not scored before the meeting: "Get started" says so
		await page.getByRole('tab', { name: /^Get started/ }).click();
		await expect(
			page.getByRole('list', { name: 'Checklist' }).locator('[data-item="journey"]')
		).toContainText(
			'Recruiters select or create a job, then book a meeting. A job is asked for, but it is not scored against what you want before the meeting. To score it first:'
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
			],
			saved: true
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
		await page.getByRole('link', { name: 'See your page for recruiters' }).click();
		// The address names the tab shown
		await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/admin\\?tab=workflows$`));
		await expect(note.getByLabel('Title')).toHaveValue('2027-01-01');

		await page.getByRole('button', { name: 'Save journey' }).click();
		await expect(toasts(page).getByText('Hiring journey saved')).toBeVisible();
		await expect(note.getByLabel('Title')).toHaveValue('2027-01-01');
		await expect(page.getByRole('button', { name: 'Save journey' })).toBeDisabled();

		// Saved: nothing to ask. Visitors read the title as written
		await page.getByRole('link', { name: 'See your page for recruiters' }).click();
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
			page.getByText(
				'Your page for recruiters offers nothing: recruiters are asked to reach out directly.'
			)
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
		expect(await saved.json()).toEqual({ steps: [], saved: true });

		await page.getByRole('link', { name: 'See your page for recruiters' }).click();
		await expect(
			page.getByRole('heading', { level: 1, name: `Propose a role to ${DOMAIN}` })
		).toBeVisible();
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
		// Each choice shows its pay, and the day it was opened: a duplicate keeps its title
		const openChoice = jobStep.locator('label', { hasText: `Staff engineer ${tag}` });
		await expect(openChoice).toContainText('€45,000 – €55,000 gross per year');
		await expect(openChoice).toContainText(/Opened \d{1,2} \w+ \d{4}/);
		await expect(jobStep.locator('label', { hasText: `Data engineer ${tag}` })).not.toContainText(
			'Opened'
		);
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
		// Created open: asked first, since its terms lock then
		const confirm = page.getByRole('alertdialog', { name: 'Open this job description?' });
		await expect(confirm).toContainText(
			'Once open, the pay and the conditions of this job are locked'
		);
		await confirm.getByRole('button', { name: 'Open', exact: true }).click();
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
		await page
			.getByRole('alertdialog', { name: 'Open this job description?' })
			.getByRole('button', { name: 'Open', exact: true })
			.click();

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
		// How the pay asked matches: by where it falls in the job's range
		await expect(pay).toContainText(
			'A job matches when what you ask is at most 90% of the way up its pay range (at most its pay, when the pay is fixed), partly when it is in the top 10% of the range, a little up to 10% over the top, and not at all further over.'
		);
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
			],
			saved: true
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
		// How the pay asked matches: by where it falls in the job's range
		await expect(pay).toContainText(
			'A job matches when what you ask is at most 90% of the way up its pay range (at most its pay, when the pay is fixed), partly when it is in the top 10% of the range, a little up to 10% over the top, and not at all further over.'
		);
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
		// Opened to be picked, its terms are locked: a new version of them is a copy, which comes back
		// here once created
		await expect(
			matchStep.getByRole('link', { name: 'Duplicate this job description' })
		).toHaveAttribute('href', `/recruiter/jobs/new?duplicate=${onSite._id}&journey=${DOMAIN}`);
		await expect(matchStep).toContainText(
			'Its pay and conditions have been locked since it was opened, but a new job description that states more can score higher'
		);
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
		// Titled with neutral words, whatever the journey leads to, and saying what it offers
		await expect(page).toHaveTitle(`Propose a role to ${DOMAIN}`);
		await expect(
			page.getByRole('heading', { level: 1, name: `Propose a role to ${DOMAIN}` })
		).toBeVisible();
		await expect(
			page.getByText(
				"Pick a time slot that suits you — you'll receive a calendar invitation by email."
			)
		).toBeVisible();
		await expect(page.getByText('Online booking is not available right now.')).toBeVisible();
		await expect(journeySteps(page)).toHaveCount(0);
		// Before the booking: how long it takes, and that it needs no account
		const before = page.getByRole('region', { name: 'Before you start' });
		await expect(before).toContainText('About 2 minutes');
		await expect(before).toContainText('Nothing to prepare, and no account needed.');
		await expect(before.getByRole('list', { name: 'What each step asks' })).toHaveCount(0);
	});

	test('the page is rendered on the server: without JavaScript it says what each step asks', async ({
		browser
	}) => {
		await setSteps(
			{
				id: 'note',
				type: 'note',
				config: { title: 'Before you book', text: 'I only take **remote** roles.' }
			},
			{ id: 'job', type: 'job' },
			{ id: 'job-match', type: 'job-match', config: { minScore: 70, showDetails: true } },
			{ id: 'meeting', type: 'meeting' }
		);
		// What the server sends: what a page without JavaScript, or a link preview, gets
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await blockGoogle(page);
		await page.goto(`/${DOMAIN}/hire`);

		await expect(
			page.getByRole('heading', { level: 1, name: `Propose a role to ${DOMAIN}` })
		).toBeVisible();
		await expect(
			page.getByText(`${DOMAIN} asks recruiters to complete 3 steps first.`)
		).toBeVisible();
		// Before they start: what each step asks (the steps after the first are locked below), what
		// to have at hand, how long it takes, and what happens then
		const before = page.getByRole('region', { name: 'Before you start' });
		await expect(
			before.getByRole('list', { name: 'What each step asks' }).getByRole('listitem')
		).toHaveText([
			new RegExp(`Before you book\\s*Read ${DOMAIN}'s note, then confirm that you have read it\\.`),
			new RegExp(
				`Select or create a job\\s*Pick one of your open job descriptions, or write a new one: ${DOMAIN} sees it in the meeting invitation\\.`
			),
			new RegExp(
				`Match the perfect job\\s*Your job is scored out of 100 against what ${DOMAIN} is looking for: you see your score, never what they ask for\\. At least 70 opens the next step\\.`
			),
			/Book a meeting\s*Pick a time slot, then give your name and email address\./
		]);
		await expect(before).toContainText('About 8 minutes');
		await expect(before.getByRole('definition').getByRole('listitem')).toHaveText([
			'A Google account, to sign in',
			'The job description and its pay range, or its PDF where import is offered'
		]);
		await expect(before).toContainText(
			`Once you book, you receive a calendar invitation by email, and the meeting goes into ${DOMAIN}'s calendar.`
		);
		// The steps, as anyone signed out stands in them: the note to read first, the rest locked
		await expect(journeySteps(page).getByRole('listitem')).toHaveCount(4);
		await expect(step(page, 'Step 1: Before you book').locator('strong')).toHaveText('remote');
		await expect(step(page, 'Step 2: Select or create a job (locked)')).toContainText(
			'Complete the step above first.'
		);
		await expect(step(page, 'Step 4: Book a meeting (locked)')).toContainText(
			'Complete the steps above first.'
		);
		// Said in a <noscript>, which a browser shows with its scripts turned off (Playwright only
		// stops them from running: the page's markup is read instead)
		const noScript = (text: string) =>
			new RegExp(`<noscript>(?:(?!</noscript>).)*${text}(?:(?!</noscript>).)*</noscript>`, 's');
		expect(await page.content()).toMatch(
			noScript('Turn on JavaScript in your browser to go through the steps\\.')
		);
		await expect(page.getByText(/Loading/)).toHaveCount(0);
		// Described with its steps, for a shared link too
		const description = `Propose a role to ${DOMAIN} on their page for recruiters: read a note, select or create a job, match the perfect job, then book a meeting, in about 8 minutes.`;
		await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', description);
		await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
			'content',
			description
		);
		// Only what the steps show anyone: the owner's other settings stay out of the page
		expect(await page.content()).not.toContain('showDetails');

		await page.goto(`/${DOMAIN}/hire?lang=fr`);
		const avant = page.getByRole('region', { name: 'Avant de commencer' });
		await expect(avant).toContainText('8 minutes environ');
		await expect(avant).toContainText('Un compte Google, pour vous connecter');
		await expect(avant).toContainText(
			`Votre offre est notée sur 100 par rapport à ce que recherche ${DOMAIN}\u00a0: vous voyez son résultat, jamais ce qui est demandé.`
		);
		expect(await page.content()).toMatch(
			noScript('Activez JavaScript dans votre navigateur pour suivre les étapes\\.')
		);
		await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
			'content',
			`Proposez un poste à ${DOMAIN} sur sa page recruteurs\u00a0: lire une note, choisir ou créer une offre, correspondre au poste idéal, puis réserver un rendez-vous, en 8 minutes environ.`
		);

		// The booking page: the meeting types load in the browser, without a word on the first paint
		// (back in English: the French link saved the language)
		await setJourney('meeting');
		await page.goto(`/${DOMAIN}/hire?lang=en`);
		await expect(
			page.getByText(
				"Pick a time slot that suits you — you'll receive a calendar invitation by email."
			)
		).toBeVisible();
		await expect(page.getByRole('region', { name: 'Before you start' })).toContainText(
			'Nothing to prepare, and no account needed.'
		);
		await expect(page.getByRole('status').getByText('Loading availability…')).toHaveClass(
			/\bsr-only\b/
		);
		await expect(page.locator('meta[name="description"]')).toHaveAttribute(
			'content',
			`Propose a role to ${DOMAIN} on their page for recruiters: book a meeting, in about 2 minutes.`
		);
		await context.close();
	});
});
