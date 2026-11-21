import { expect, request as playwrightRequest, test, type Page } from '@playwright/test';
import {
	currentDiscoveryConsent,
	discoveryRequirementMessage,
	journeyTemplate
} from 'portfolio-common';
import { NOT_PROPOSED_TO_RECRUITERS } from '../src/services/apiBodies';
import { calendarConfigured, expectMatchingMode, stubApi, type StubAnswer } from './support/api';
import { tabIntoDeck } from './support/deck';
import { jobPosting } from './support/jobs';
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

// Matching (Path 2), the candidate's side: being proposed to recruiters as an anonymous card, set at
// the end of the admin's Perfect job tab (#discovery) and mentioned by "Get started". Signed in as
// the owner of 'e2e-match' (seeded by `bun run --cwd server seed:e2e` with everything discovery asks
// for, and discovery off), this file's own candidate: no other file reads or changes it.
//
// What needs matching on (the API run with MATCHING=true, and GOOGLE_CLIENT_SECRET set to any value
// so the seeded calendar counts) is skipped, saying why, when GET /discovery answers 404; in CI each
// leg says how it runs the API (E2E_MATCHING), and an API in the other mode fails rather than skip
// (expectMatchingMode of support/api.ts). Turning discovery on goes to the API; turning it off is
// answered in the browser (DELETE /discovery/consent) until the deck test, which ends with a real
// withdrawal: it holds the next opt-in back DISCOVERY_REJOIN_DAYS, which only `seed:e2e` clears (it
// empties the consents; CI seeds before every run). So a run ends with the candidate off, and a
// run after it without `seed:e2e` stops at the opt-in, saying so. What matching off shows, and the states the
// seed cannot give (what is missing, a refused opt-in), are answered in the browser: those tests run
// with or without matching. The admin page's calendar requests that would reach Google are answered
// in the browser too (the seeded grant is a placeholder nothing sends to Google).
//
// The inbox (/opportunities): what matching off shows (nothing but "not available"), turning
// discovery off, the states that say why nothing is proposed (paused, consent ended, no portfolio,
// a deck that stops) and the answers of a job's private page are answered in the browser; the deck,
// with matching on, answers the job seeded for this candidate for real ('Senior Data Engineer (e2e
// matching)', a CDD), the e2e recruiter (through the API) answers its card, and the mutual interest
// they make is ended. A run answers that job: `seed:e2e` must run again before the next (it removes
// the matches of the seeded jobs; CI seeds before every run), or that test stops at once saying so.
// So that test is not retried (a retry would find the job answered by the attempt before it, and
// hide that attempt's failure behind a message about the seed): its first failure is the one to read.

const DOMAIN = 'e2e-match';

test.skip(!JWT_SECRET, 'Set JWT_SECRET to the API’s secret to sign in as the e2e candidate');

let session: OwnerSession;

test.beforeAll(async () => {
	session = await ownerSession(DOMAIN);
});

/** GET /discovery of a candidate who never turned it on, as the API answers it */
const OFF_STATUS = {
	state: 'off',
	enabledAt: null,
	consentExpiresAt: null,
	missing: [],
	minScore: 70,
	card: { headline: null, hiddenExperiences: [] }
};

/** The admin page's calendar requests that would ask Google, answered with nothing */
const stubCalendar = async (page: Page) => {
	await stubApi(page, 'GET', '/appointments/calendars', () => ({ json: [] }));
	await stubApi(page, 'GET', '/appointments/upcoming', () => ({ json: [] }));
};

const openAdmin = async (page: Page, tab: string) => {
	await blockGoogle(page);
	await stubCalendar(page);
	await signIn(page, session);
	await gotoHydrated(page, `/${DOMAIN}/admin?tab=${tab}`);
};

const selectedTab = (page: Page) => page.getByRole('tab', { selected: true });

/** GET /discovery of a candidate who is on, as the API answers it */
const onStatus = () => ({
	...OFF_STATUS,
	state: 'on',
	enabledAt: new Date().toISOString(),
	consentExpiresAt: new Date(Date.now() + 700 * 24 * 60 * 60_000).toISOString()
});

/** The job seeded for this candidate in matching (server/tests/seedE2e.ts) */
const MATCH_JOB_ID = '65e2e0000000000000000102';
const MATCH_JOB_TITLE = 'Senior Data Engineer (e2e matching)';

/** The account menu, opened */
const openAccountMenu = async (page: Page) => {
	await page.locator('[data-account-menu]').click();
	return page.getByRole('menu');
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
const discovery = (page: Page) => page.locator('[data-discovery]');

test('with matching off, nothing of it shows on the admin page, and nothing errors', async ({
	page
}) => {
	// The API's answer while MATCHING is off: its routes are not registered
	const reads = await stubApi(page, 'GET', '/discovery', () => ({
		status: 404,
		text: 'Not Found'
	}));
	await openAdmin(page, 'perfect-job');
	await expect(page.getByRole('button', { name: 'Save perfect job' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Be found by recruiters' })).toHaveCount(0);
	await expect(discovery(page)).toHaveCount(0);
	await expect(page.getByRole('alert')).toHaveCount(0);

	await page.getByRole('tab', { name: /^Get started/ }).click();
	await expect(page.getByRole('list', { name: 'Checklist' })).toBeVisible();
	await expect(page.locator('[data-item="discovery"]')).toHaveCount(0);
	await expect(page.getByText('Be found by recruiters')).toHaveCount(0);
	// Off for the page's life: shown again, or back in view, nothing asks again
	await page.getByRole('tab', { name: 'Perfect job' }).click();
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await expect(page.getByRole('button', { name: 'Save perfect job' })).toBeVisible();
	expect(reads).toHaveLength(1);
	await expect(discovery(page)).toHaveCount(0);
});

test('a read that fails shows nothing of it (matching may be off), and the next one does', async ({
	page
}) => {
	// No answer, then an error (a network drop, a 502 during a deploy), then the status
	const answers = ['abort', 'error', 'status'];
	const reads: string[] = [];
	await page.route(`${API_URL}/discovery`, async (route) => {
		if (route.request().method() !== 'GET') return route.fallback();
		const answer = answers[reads.length] ?? 'status';
		reads.push(answer);
		if (answer === 'abort') return route.abort();
		if (answer === 'error') return route.fulfill({ status: 502, body: 'Bad gateway' });
		return route.fulfill({ json: OFF_STATUS });
	});
	await openAdmin(page, 'perfect-job');
	await expect(page.getByRole('button', { name: 'Save perfect job' })).toBeVisible();
	await expect.poll(() => reads.length).toBe(1);
	await expect(discovery(page)).toHaveCount(0);
	await expect(page.getByRole('alert')).toHaveCount(0);

	// Shown again: asked again, failed again, still nothing
	await page.getByRole('tab', { name: /^Get started/ }).click();
	await expect(page.getByRole('list', { name: 'Checklist' })).toBeVisible();
	await expect.poll(() => reads.length).toBe(2);
	await expect(page.locator('[data-item="discovery"]')).toHaveCount(0);
	await expect(page.getByRole('alert')).toHaveCount(0);

	// Answered at last: its settings show
	await page.getByRole('tab', { name: 'Perfect job' }).click();
	await expect(discovery(page)).toHaveAttribute('data-state', 'off');
	expect(reads).toEqual(['abort', 'error', 'status']);
});

test('what is missing leads to what fixes it, the journey’s steps added and left to save', async ({
	page
}) => {
	await stubApi(page, 'GET', '/discovery', () => ({
		json: { ...OFF_STATUS, minScore: null, missing: ['journey', 'calendar'] }
	}));
	// A journey never saved: the meeting alone
	await stubApi(page, 'GET', '/workflow', () => ({
		json: { steps: [{ id: 'meeting', type: 'meeting', config: {} }], saved: false }
	}));
	const saves = await stubApi(page, 'PUT', '/workflow', () => ({ status: 500, text: 'Not here' }));
	await page.setViewportSize({ width: 390, height: 844 });
	await openAdmin(page, 'perfect-job');

	const section = discovery(page);
	await expect(section).toHaveAttribute('data-state', 'off');
	const checklist = section.locator('[data-discovery-checklist]');
	await expect(checklist.getByRole('heading', { name: 'Before you turn it on' })).toBeVisible();
	await expect(checklist.locator('[data-requirement]')).toHaveText([
		/Your hiring journey must ask for the job, get it scored, then lead to a meeting\./,
		/Connect Google Calendar, so recruiters can book a meeting\./
	]);
	// Nothing can be turned on while something is missing, and it says why
	const turnOn = section.getByRole('button', { name: 'Make me visible to recruiters' });
	await expect(turnOn).toBeDisabled();
	await expect(section.getByText('Set what is missing above first.')).toBeVisible();
	// At 390 px nothing runs past the page
	const overflow = await page.evaluate(() => {
		const main = document.getElementById('page');
		return main ? main.scrollWidth - main.clientWidth : 0;
	});
	expect(overflow).toBe(0);

	// The calendar's settings: the Appointments tab
	await checklist.getByRole('button', { name: 'Open my calendar settings' }).click();
	await expect(selectedTab(page)).toHaveText('Appointments');

	// The journey's missing steps: added in the Hiring journey tab, as changes to save
	await page.getByRole('tab', { name: 'Perfect job' }).click();
	await checklist.getByRole('button', { name: 'Add the missing steps' }).click();
	await expect(selectedTab(page)).toHaveText('Hiring journey');
	const steps = page.getByRole('list', { name: 'Steps' });
	await expect(steps.getByRole('heading', { level: 3 })).toHaveText([
		/Select or create a job$/,
		/Get the job scored$/,
		/Book a meeting$/
	]);
	await expect(steps.getByRole('heading', { name: /Select or create a job/ })).toBeFocused();
	await expect(toasts(page)).toContainText(
		'Added: Select or create a job and Get the job scored. Check their settings, then save your journey to keep them.'
	);
	await expect(page.getByRole('button', { name: 'Save journey' })).toBeEnabled();
	expect(saves).toHaveLength(0);
});

test('while visible, the journey and calendar tabs say what pauses it, and read discovery again once changed', async ({
	page
}) => {
	let status: Record<string, unknown> = onStatus();
	const reads = await stubApi(page, 'GET', '/discovery', () => ({ json: status }));
	await stubApi(page, 'GET', '/workflow', () => ({
		json: { steps: journeyTemplate('gate'), saved: true }
	}));
	const saves = await stubApi(page, 'PUT', '/workflow', (request) => ({
		json: { steps: request.postDataJSON().steps, saved: true }
	}));
	// The calendar connected with a meeting type that has hours, answered in the browser: neither
	// the seeded grant nor Google is ever asked
	const schedule = {
		_id: '65e2e00000000000000000aa',
		title: 'Intro call',
		durationMinutes: 30,
		bufferMinutes: 0,
		minNoticeHours: 24,
		maxAdvanceDays: 30,
		timezone: 'Europe/Paris',
		calendarId: 'primary',
		locationType: 'google_meet',
		availability: [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }],
		enabled: true
	};
	await stubApi(page, 'GET', '/appointments/calendar-status', () => ({
		json: {
			configured: true,
			connected: true,
			connectedAt: new Date().toISOString(),
			revokedAt: null
		}
	}));
	await stubApi(page, 'GET', '/appointments/schedules', () => ({ json: [schedule] }));
	const deletes = await stubApi(page, 'DELETE', `/appointments/schedules/${schedule._id}`, () => ({
		json: { deleted: true }
	}));
	const disconnects = await stubApi(page, 'POST', '/appointments/disconnect', () => ({
		json: { disconnected: true }
	}));
	await openAdmin(page, 'workflows');
	const pausing =
		'Saving this journey pauses being visible to recruiters, until your journey asks for the job, scores it and leads to a meeting again.';
	const warning = page.locator('[data-pauses-discovery]').filter({ visible: true });
	const save = page.getByRole('button', { name: 'Save journey' });
	const steps = page.getByRole('list', { name: 'Steps' });
	const removeScore = () =>
		steps
			.getByRole('listitem')
			.filter({ has: page.getByRole('heading', { name: /Get the job scored/ }) })
			.getByRole('button', { name: 'Remove' })
			.click();
	await expect(steps.getByRole('heading', { level: 3 })).toHaveCount(4);
	await expect(warning).toHaveCount(0);

	// The score taken out: saving would pause it, said beside Save and with it
	await removeScore();
	await expect(warning).toHaveText(pausing);
	await expect(save).toHaveAccessibleDescription(pausing);
	await page.getByRole('button', { name: 'Undo changes' }).click();
	await expect(warning).toHaveCount(0);
	await expect(save).not.toHaveAccessibleDescription(pausing);

	// Saved anyway: discovery is read again (what it asks changed)
	await removeScore();
	let before = reads.length;
	await save.click();
	await expect.poll(() => saves.length).toBe(1);
	await expect.poll(() => reads.length).toBeGreaterThan(before);

	// The calendar: what pauses it said with Disconnect; a meeting type deleted, then the calendar
	// disconnected, each read discovery again
	await page.getByRole('tab', { name: 'Appointments' }).click();
	const calendarPausing =
		'You are visible to recruiters: disconnecting your calendar, or leaving no meeting type turned on with hours, pauses that until your calendar is connected and a meeting type is turned on with hours.';
	await expect(warning).toHaveText(calendarPausing);
	const disconnect = page.getByRole('button', { name: 'Disconnect' });
	await expect(disconnect).toHaveAccessibleDescription(calendarPausing);
	before = reads.length;
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect.poll(() => deletes.length).toBe(1);
	await expect.poll(() => reads.length).toBeGreaterThan(before);
	before = reads.length;
	await disconnect.click();
	await expect.poll(() => disconnects.length).toBe(1);
	await expect.poll(() => reads.length).toBeGreaterThan(before);

	// Not visible (paused already): neither tab warns
	status = { ...onStatus(), state: 'paused', missing: ['schedule'] };
	await gotoHydrated(page, `/${DOMAIN}/admin?tab=workflows`);
	await expect(steps.getByRole('heading', { level: 3 })).toHaveCount(4);
	await removeScore();
	await expect(save).toBeEnabled();
	await expect(warning).toHaveCount(0);
	await page.getByRole('tab', { name: 'Appointments' }).click();
	await expect(disconnect).toBeVisible();
	await expect(warning).toHaveCount(0);
});

test('a refused opt-in says from when it can be turned on again', async ({ page }) => {
	await stubApi(page, 'GET', '/discovery', () => ({ json: OFF_STATUS }));
	const optIns = await stubApi(page, 'POST', '/discovery/consent', () => ({
		status: 429,
		text: 'You can make yourself visible to recruiters again 7 days after you stopped.',
		headers: {
			'retry-after': String(3 * 24 * 60 * 60),
			'access-control-expose-headers': 'Retry-After'
		}
	}));
	await openAdmin(page, 'perfect-job');
	const section = discovery(page);
	const consent = section.locator('[data-discovery-consent]');

	// Not ticked: said at the box, nothing sent
	await consent.getByRole('button', { name: 'Make me visible to recruiters' }).click();
	await expect(
		consent.getByText('Confirm that you are at least 18 and want to be proposed to recruiters.')
	).toBeVisible();
	await expect(consent.getByRole('checkbox')).toBeFocused();
	expect(optIns).toHaveLength(0);

	await consent.getByRole('checkbox').check();
	const turnOn = consent.getByRole('button', { name: 'Make me visible to recruiters' });
	await turnOn.click();
	// The request reaches its stub a moment after the click
	await expect.poll(() => optIns.length).toBe(1);
	expect(optIns[0].postDataJSON()).toEqual({
		consent: { termsVersion: expect.any(String), adultConfirmed: true }
	});
	// Said beside the button, read out, and the button keeps the focus (it cannot be used now)
	const wait = consent.getByText(/^You can turn it on again from /);
	await expect(wait).toBeVisible();
	await expect(consent.locator('[aria-live="polite"]')).toContainText(
		'You can turn it on again from'
	);
	await expect(turnOn).toBeDisabled();
	await expect(turnOn).toBeFocused();
	await expect(turnOn).toHaveAccessibleDescription(/^You can turn it on again from /);
	// Pressed again: nothing sent
	await page.keyboard.press('Enter');
	expect(optIns).toHaveLength(1);
});

test('the card’s changes not saved hold the opt-in back, and leaving asks first', async ({
	page
}) => {
	await stubApi(page, 'GET', '/discovery', () => ({ json: OFF_STATUS }));
	const optIns = await stubApi(page, 'POST', '/discovery/consent', () => ({ json: onStatus() }));
	await openAdmin(page, 'perfect-job');
	const section = discovery(page);
	const card = section.locator('[data-discovery-card]');
	const consent = section.locator('[data-discovery-consent]');
	const turnOn = consent.getByRole('button', { name: 'Make me visible to recruiters' });
	await expect(turnOn).not.toBeDisabled();

	// An experience left out, not saved: recruiters would read the card saved
	await card.getByRole('checkbox').first().uncheck();
	await expect(turnOn).toBeDisabled();
	await expect(consent.getByText('Save or undo the changes to your card first.')).toBeVisible();
	await consent.getByRole('checkbox').check();
	await turnOn.focus();
	await page.keyboard.press('Enter');
	expect(optIns).toHaveLength(0);

	// Leaving the page asks first; staying keeps the change
	let asked = '';
	page.once('dialog', (dialog) => {
		asked = dialog.message();
		void dialog.dismiss();
	});
	const menu = await openAccountMenu(page);
	await menu.getByRole('menuitem', { name: 'Account & privacy' }).click();
	await expect
		.poll(() => asked)
		.toBe('Leave without saving your anonymous card? Your changes will be lost.');
	await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/admin`));

	// Undone: it can be turned on again
	await card.getByRole('button', { name: 'Undo changes' }).click();
	await expect(turnOn).not.toBeDisabled();
});

test('a save reads the card first: changed from another window meanwhile, nothing is sent unseen', async ({
	page
}) => {
	let saved: { headline: string | null; hiddenExperiences: string[] } = OFF_STATUS.card;
	await stubApi(page, 'GET', '/discovery', () => ({ json: { ...OFF_STATUS, card: saved } }));
	const saves = await stubApi(page, 'PUT', '/discovery', (request) => {
		saved = request.postDataJSON().card;
		return { json: { ...OFF_STATUS, card: saved } };
	});
	await openAdmin(page, 'perfect-job');
	const card = discovery(page).locator('[data-discovery-card]');
	const first = card.locator('[data-experience]').first();
	const experience = (await first.getAttribute('data-experience'))!;
	await expect(first.getByRole('checkbox')).toBeChecked();

	// The headline changed here; meanwhile, from another device, that experience was left out (this
	// window stayed in view: nothing read the card again)
	await card.getByRole('textbox').fill('Platform engineer, distributed systems');
	saved = { headline: null, hiddenExperiences: [experience] };
	await card.getByRole('button', { name: 'Save my card' }).click();

	// Read first: nothing sent, the form shows the card saved with this window's change on top
	await expect(card.locator('[data-card-changed-elsewhere]')).toContainText(
		'Your card was changed from another window or device meanwhile'
	);
	expect(saves).toHaveLength(0);
	await expect(first.getByRole('checkbox')).not.toBeChecked();
	await expect(card.getByRole('textbox')).toHaveValue('Platform engineer, distributed systems');

	// Saved once checked: the experience left out elsewhere stays out
	await card.getByRole('button', { name: 'Save my card' }).click();
	await expect.poll(() => saves.length).toBe(1);
	expect(saves[0].postDataJSON().card).toEqual({
		headline: 'Platform engineer, distributed systems',
		hiddenExperiences: [experience]
	});
	await expect(card.locator('[data-card-changed-elsewhere]')).toHaveCount(0);
});

test('with matching off, the inbox is not available and the account menu has no Opportunities', async ({
	page
}) => {
	// The API's answers while MATCHING is off: its routes are not registered
	await stubApi(page, 'GET', '/discovery', () => ({ status: 404, text: 'NOT_FOUND' }));
	await stubApi(page, 'GET', '/me/notifications', () => ({ status: 404, text: 'NOT_FOUND' }));
	await blockGoogle(page);
	await signIn(page, session);
	await gotoHydrated(page, '/opportunities');

	// The words of every page of matching not available (the reviewers' page, a job's candidates)
	await expect(page.getByRole('heading', { name: 'Not available' })).toBeVisible();
	await expect(page.getByText('This page is not available.')).toBeVisible();
	// The header and the tab name nothing of matching either
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Portfolio');
	await expect(page).toHaveTitle('Not available | Portfolio');
	await expect(page.getByRole('tab')).toHaveCount(0);
	await expect(page.getByRole('alert')).toHaveCount(0);
	// Nothing of matching in the account menu either: no item, no badge
	const menu = await openAccountMenu(page);
	await expect(menu.getByRole('menuitem', { name: /Share your link/ })).toBeVisible();
	await expect(menu.getByRole('menuitem', { name: /Opportunities/ })).toHaveCount(0);
	await expect(page.locator('[data-unseen-dot]')).toHaveCount(0);
});

test('turned off, the inbox says the candidate is not visible and leads to the settings', async ({
	page
}) => {
	let on = true;
	await stubApi(page, 'GET', '/discovery', () => ({ json: on ? onStatus() : OFF_STATUS }));
	const withdrawals = await stubApi(page, 'DELETE', '/discovery/consent', () => {
		on = false;
		return { json: OFF_STATUS };
	});
	// Matching is on, nothing unseen
	await stubApi(page, 'GET', '/me/notifications', () => ({
		json: { mutualInterests: { candidate: 0, recruiter: 0 } }
	}));
	await openAdmin(page, 'perfect-job');

	const section = discovery(page);
	await expect(section).toHaveAttribute('data-state', 'on');
	await section.getByRole('button', { name: 'Stop being visible' }).click();
	await page
		.getByRole('alertdialog', { name: 'Stop being visible to recruiters?' })
		.getByRole('button', { name: 'Stop being visible' })
		.click();
	await expect(toasts(page)).toContainText('You are no longer visible to recruiters');
	expect(withdrawals).toHaveLength(1);

	// The account menu leads to the inbox, which says why nothing is proposed
	const menu = await openAccountMenu(page);
	await menu.getByRole('menuitem', { name: 'Opportunities' }).click();
	await expect(page).toHaveURL(/\/opportunities$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Opportunities');
	await expect(page.getByRole('tab', { name: 'To review', selected: true })).toBeVisible();
	await expect(
		page.getByRole('heading', { name: 'You are not visible to recruiters' })
	).toBeVisible();
	await expect(page.getByText(/your name and your portfolio stay hidden/)).toBeVisible();
	await expect(page.getByText(/email/i)).toHaveCount(0);

	// Its settings, at the end of the Perfect job tab, their heading focused
	await page.getByRole('link', { name: 'Open the settings' }).click();
	await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/admin\\?tab=perfect-job#discovery$`));
	await expect(selectedTab(page)).toHaveText('Perfect job');
	await expect(
		discovery(page).getByRole('heading', { name: 'Be found by recruiters', level: 3 })
	).toBeFocused();
});

/** Matching on, nothing unseen, as GET /me/notifications answers it */
const stubNotifications = (page: Page) =>
	stubApi(page, 'GET', '/me/notifications', () => ({
		json: { mutualInterests: { candidate: 0, recruiter: 0 } }
	}));

const DAY = 24 * 60 * 60_000;

test('the inbox says why nothing is proposed, when the consent ends, and why a deck stopped', async ({
	page
}) => {
	const settings = `/${DOMAIN}/admin?tab=perfect-job#discovery`;
	// Paused: two requirements went missing since it was turned on
	let status: Record<string, unknown> = { ...onStatus(), missing: ['calendar', 'schedule'] };
	await stubApi(page, 'GET', '/discovery', () => ({ json: status }));
	await stubNotifications(page);
	let feed: StubAnswer = { status: 403, text: 'You are not proposed to recruiters now' };
	// A read is held on its way while the test says so
	let held: Promise<void> = Promise.resolve();
	let release = () => {};
	const hold = () => {
		held = new Promise((resolve) => (release = resolve));
	};
	const reads = await stubApi(page, 'GET', '/opportunities', async () => {
		await held;
		return feed;
	});
	await blockGoogle(page);
	await signIn(page, session);
	await gotoHydrated(page, '/opportunities');

	await expect(
		page.getByRole('heading', { name: 'Paused: no recruiter sees your card' })
	).toBeVisible();
	await expect(
		page.getByText(
			'Some things you need to be visible to recruiters have gone missing since you turned visibility on:'
		)
	).toBeVisible();
	await expect(page.locator('[data-missing] li')).toHaveText([
		discoveryRequirementMessage('calendar'),
		discoveryRequirementMessage('schedule')
	]);
	await expect(page.getByRole('link', { name: 'Open the settings' })).toHaveAttribute(
		'href',
		settings
	);
	await expect(page.getByText(/email/i)).toHaveCount(0);
	// No deck: nothing proposed is read
	expect(reads).toHaveLength(0);

	// The consent ended
	status = {
		...OFF_STATUS,
		state: 'lapsed',
		enabledAt: new Date(Date.now() - 740 * DAY).toISOString(),
		consentExpiresAt: new Date(Date.now() - 10 * DAY).toISOString()
	};
	await gotoHydrated(page, '/opportunities');
	await expect(
		page.getByRole('heading', { name: 'Your consent to be visible to recruiters has ended' })
	).toBeVisible();
	await expect(
		page.getByText(
			'Give it again to be proposed to recruiters and to see the jobs that meet your criteria here.'
		)
	).toBeVisible();
	await expect(page.getByRole('link', { name: 'Open the settings' })).toHaveAttribute(
		'href',
		settings
	);

	// Without a portfolio, discovery asks for one first
	status = { ...OFF_STATUS, missing: ['portfolio', 'terms'] };
	await gotoHydrated(page, '/opportunities');
	await expect(page.getByRole('heading', { name: 'Create your portfolio first' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Create your portfolio' })).toHaveAttribute(
		'href',
		'/#create'
	);
	expect(reads).toHaveLength(0);

	// On, its consent in its last days (no email says it: the inbox does), and the deck stops: the
	// API no longer proposes the candidate, though discovery still says on
	const expires = new Date(Date.now() + 10 * DAY);
	const enabled = new Date(expires);
	enabled.setUTCMonth(enabled.getUTCMonth() - 24);
	status = {
		...onStatus(),
		enabledAt: enabled.toISOString(),
		consentExpiresAt: expires.toISOString()
	};
	await gotoHydrated(page, '/opportunities');
	const ends = page.locator('[data-consent-ends]');
	await expect(ends).toContainText('Your consent to be visible to recruiters ends on');
	await expect(ends.getByRole('link', { name: 'its settings' })).toHaveAttribute('href', settings);
	const stopped = page.getByRole('heading', { name: 'Could not go on' });
	await expect(stopped).toBeFocused();
	await expect(
		page.getByText('You are not proposed to recruiters right now, so no job is proposed to you.')
	).toBeVisible();

	// Try again: the deck reads again, and what it shows takes the focus the Retry had
	feed = { json: { jobs: [], more: false, next: null, pending: false } };
	await page.getByRole('button', { name: 'Try again' }).click();
	await expect(page.getByRole('heading', { name: 'Nothing to review right now' })).toBeFocused();
	await expect(
		page.getByText(
			'No open job that meets your criteria and your minimum score is waiting for your answer right now.',
			{ exact: false }
		)
	).toBeVisible();
	await expect(page.getByText(/email/i)).toHaveCount(0);

	// Travel times still being computed, no job yet: said in place of "nothing to review", which a
	// job may contradict in a moment; Check again reads from the start, the focus on what it shows
	feed = { json: { jobs: [], more: false, next: null, pending: true } };
	await gotoHydrated(page, '/opportunities');
	await expect(
		page.getByRole('heading', { name: 'Travel times are still being computed' })
	).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Nothing to review right now' })).toHaveCount(0);
	// Its block, Check again with it, goes while the feed is read: the focus on what says so,
	// never on the page's body, then on what the read shows (still computed: said again)
	hold();
	await page.getByRole('button', { name: 'Check again' }).click();
	const loading = page.getByText('Loading the jobs proposed to you…');
	await expect(loading).toBeFocused();
	release();
	await expect(
		page.getByRole('heading', { name: 'Travel times are still being computed' })
	).toBeFocused();
	feed = { json: { jobs: [], more: false, next: null, pending: false } };
	await page.getByRole('button', { name: 'Check again' }).click();
	await expect(page.getByRole('heading', { name: 'Nothing to review right now' })).toBeFocused();
	await expect(page.getByRole('button', { name: 'Check again' })).toHaveCount(0);

	// A read that fails: the deck's Retry goes while it reads again, the focus the same way
	feed = { status: 503, text: '' };
	await gotoHydrated(page, '/opportunities');
	const retry = page.getByRole('button', { name: 'Try again' });
	await expect(retry).toBeVisible();
	hold();
	feed = { json: { jobs: [], more: false, next: null, pending: false } };
	await retry.click();
	await expect(loading).toBeFocused();
	release();
	await expect(page.getByRole('heading', { name: 'Nothing to review right now' })).toBeFocused();
});

test('a job’s private page: an answer that replaces another offers no Undo, a refusal says why, an end keeps the focus', async ({
	page
}) => {
	const JOB = '65e2e00000000000000000f1';
	const MATCH = '65e2e00000000000000000f2';
	const job = {
		_id: JOB,
		...jobPosting({ title: 'Platform Engineer (stubbed)', status: 'open' }),
		publishedAt: '2026-11-02T09:00:00.000Z',
		createdAt: '2026-11-01T09:00:00.000Z',
		updatedAt: '2026-11-02T09:00:00.000Z'
	};
	const interest = {
		_id: MATCH,
		matchedAt: '2026-11-20T10:00:00.000Z',
		changedAt: null,
		endedAt: null,
		endReason: null
	};
	const ended = { ...interest, endedAt: new Date().toISOString(), endReason: 'candidate' };
	let shared: StubAnswer = {
		json: {
			job,
			access: 'feed',
			jobMatch: { score: 86, minScore: 70, criteria: [] },
			interested: false,
			// Answered in the deck before: an answer here replaces it, it is never the first
			decision: 'interested'
		}
	};
	await stubApi(page, 'GET', '/opportunities/jobs/*', () => shared);
	let decision: StubAnswer = { json: { decision: 'pass', match: null } };
	const decisions = await stubApi(page, 'PUT', '/opportunities/jobs/*/decision', () => decision);
	await stubNotifications(page);
	await stubApi(page, 'PUT', '/matches/*/seen', () => ({ json: {} }));
	const ends = await stubApi(page, 'POST', '/matches/*/end', () => ({
		json: {
			...ended,
			side: 'candidate',
			seen: true,
			job: null,
			score: 86,
			minScore: 70,
			criteria: []
		}
	}));
	await blockGoogle(page);
	await signIn(page, session);
	await gotoHydrated(page, `/opportunities/${JOB}`);

	const answer = page.locator('[data-feed-answer]');
	await expect(answer.locator('[data-answer]')).toHaveText(
		'This job interests you: its recruiter sees it.'
	);
	// A double click: one answer, Pass (both answers stay where they are, the one given pressed, so
	// the second click never lands on Interested)
	await answer.getByRole('button', { name: 'Pass' }).dblclick();
	await expect(answer.locator('[data-answer]')).toHaveText('You passed this job.');
	await expect(answer.locator('[data-answer]')).toBeFocused();
	await expect(answer.getByRole('button', { name: 'Pass' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(answer.getByRole('button', { name: 'Interested' })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	expect(decisions.map((request) => request.postDataJSON())).toEqual([{ decision: 'pass' }]);
	// Not the first answer on the job: the API would refuse its undo, so none is offered
	await expect(answer.getByRole('button', { name: 'Undo' })).toHaveCount(0);
	// The answer given, pressed again once saved: nothing is sent (checked once the next answer
	// landed, below)
	await answer.getByRole('button', { name: 'Pass' }).click();
	await expect(answer.locator('[data-answer]')).toHaveText('You passed this job.');
	await expect(answer.getByRole('button', { name: 'Pass' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);

	// No longer proposed: the page reads the job again, says why, and takes the focus there
	decision = { status: 404, text: 'Job posting not found' };
	shared = { status: 404, text: 'Job posting not found' };
	await answer.getByRole('button', { name: 'Interested' }).click();
	const notShared = page.getByRole('heading', {
		name: 'This job description is not shared with you'
	});
	await expect(notShared).toBeFocused();
	await expect(page.locator('[data-gone-reason]')).toHaveText(
		'This job is no longer proposed to you.'
	);
	// Two answers sent in all: the double click's one, then Interested (never the pressed Pass again)
	expect(decisions.map((request) => request.postDataJSON())).toEqual([
		{ decision: 'pass' },
		{ decision: 'interested' }
	]);
	await expect(page.getByRole('link', { name: 'Back to your opportunities' })).toHaveAttribute(
		'href',
		'/opportunities'
	);

	// A mutual interest going on, ended here: what it shows next keeps the focus
	shared = { json: { job, access: 'match', match: interest } };
	await gotoHydrated(page, `/opportunities/${JOB}`);
	const panel = page.locator('[data-shared-interest]');
	await expect(panel.getByRole('heading', { name: "You're both interested" })).toBeVisible();
	await panel.getByRole('button', { name: 'End it' }).click();
	shared = { json: { job, access: 'match', match: ended } };
	await page
		.getByRole('alertdialog', { name: 'End this mutual interest?' })
		.getByRole('button', { name: 'End it' })
		.click();
	await expect(page.getByRole('heading', { name: 'Mutual interest ended' })).toBeFocused();
	await expect(panel.locator('[data-interest-state]')).toHaveText('You ended it');
	await expect(panel.getByRole('button', { name: 'End it' })).toHaveCount(0);
	expect(ends).toHaveLength(1);
});

test.describe('with matching on', () => {
	test.beforeAll(async () => {
		const api = await playwrightRequest.newContext({
			extraHTTPHeaders: { cookie: `auth=${session.token}` }
		});
		const status = (await api.get(`${API_URL}/discovery`)).status();
		// The seeded calendar (a placeholder grant) counts only on a site that takes Google Calendar
		const calendar = status === 404 || (await calendarConfigured(api));
		await api.dispose();
		// In CI, the leg's mode: a skip there would hide that matching was never tested
		expectMatchingMode({ matching: status !== 404, calendar });
		test.skip(
			status === 404,
			'Matching is off in the API under test (GET /discovery answers 404): run it with MATCHING=true'
		);
		test.skip(
			!calendar,
			'Google Calendar is not configured in the API under test, so the seeded calendar does not count: set GOOGLE_CLIENT_SECRET to any value'
		);
	});

	test('the candidate previews their card, sets it, turns discovery on, then off', async ({
		page
	}) => {
		const api = await apiAs(session);
		// The card as seeded, whatever a run before (or its retry) left
		const cleared = await api.put(`${API_URL}/discovery`, {
			data: { card: { headline: null, hiddenExperiences: [] } }
		});
		expect(cleared.ok(), await cleared.text()).toBe(true);
		const before = await (await api.get(`${API_URL}/discovery`)).json();
		// A run before turned it on, and seed:e2e did not run since (it sets it back off)
		expect(['off', 'on'], 'Run `bun run --cwd server seed:e2e` again').toContain(before.state);
		expect(before.missing, 'e2e-match has all discovery asks for (seed:e2e)').toEqual([]);
		// Turning it off is answered in the browser: no withdrawal holds the next opt-in back
		await stubApi(page, 'DELETE', '/discovery/consent', () => ({ json: OFF_STATUS }));

		// "Get started" mentions it, apart from the checklist, and leads to its settings
		await openAdmin(page, 'start');
		const item = page.locator('[data-item="discovery"]');
		await expect(item.getByRole('heading', { name: 'Be found by recruiters' })).toBeVisible();
		await expect(item).toContainText('Optional');
		await item.getByRole('button', { name: 'Open the settings' }).click();
		await expect(selectedTab(page)).toHaveText('Perfect job');
		const section = discovery(page);
		await expect(
			section.getByRole('heading', { name: 'Be found by recruiters', level: 3 })
		).toBeFocused();
		await expect(section).toContainText(
			'only when it scores at least 70 out of 100 against your criteria, with no deal-breaker missed'
		);

		// The card as recruiters read it: anonymous without a headline, the role, never the name or
		// the portfolio
		await section.getByRole('button', { name: 'Preview my card' }).click();
		const preview = page.getByRole('dialog', { name: 'Your anonymous card' });
		await expect(
			preview.getByRole('heading', {
				name: 'Anonymous candidate (Backend engineer)',
				level: 3,
				exact: true
			})
		).toBeVisible();
		await expect(preview.getByRole('listitem').filter({ hasText: 'Backend engineer' })).toHaveCount(
			1
		);
		await expect(preview.locator('[data-preview-outcomes]')).toHaveText(
			'Beside your card, recruiters read how their job does on: Work mode, Contract and Pay. Never what you ask for, your commute or where you want to work.'
		);
		await expect(preview.locator('[data-preview-also]')).toHaveText(
			'Recruiters also read that their job reaches your minimum score, and whether you said you are interested in it.'
		);
		for (const identity of ['Mia', 'Match', DOMAIN]) {
			await expect(preview).not.toContainText(identity);
		}
		await preview.getByRole('button', { name: 'Close' }).click();
		await expect(preview).toHaveCount(0);

		// A headline that says who they are: refused by the API, said on the field
		const card = section.locator('[data-discovery-card]');
		const headline = card.getByLabel(/^Headline/);
		await headline.fill('Mia Match, backend engineer');
		await card.getByRole('button', { name: 'Save my card' }).click();
		await expect(headline).toHaveAttribute('aria-invalid', 'true');
		await expect(card).toContainText('Leave your name, the title and address of your portfolio');
		await expect(card.getByRole('button', { name: 'Save my card' })).toBeDisabled();
		await headline.fill('Backend engineer, data platforms');
		await card.getByRole('button', { name: 'Save my card' }).click();
		await expect(toasts(page)).toContainText('Card saved');
		await expect(headline).not.toHaveAttribute('aria-invalid');

		// An experience left out: the preview says so, and the card no longer shows it
		await card.getByRole('checkbox', { name: /Backend engineer/ }).uncheck();
		await card.getByRole('button', { name: 'Save my card' }).click();
		await expect(card.getByRole('button', { name: 'Save my card' })).toBeDisabled();
		await section.getByRole('button', { name: 'Preview my card' }).click();
		await expect(preview.getByRole('heading', { level: 3 }).first()).toHaveText(
			'Backend engineer, data platforms'
		);
		await expect(preview.locator('[data-withheld]')).toContainText(
			'Backend engineer: you left it out.'
		);
		await preview.getByRole('button', { name: 'Close' }).click();
		await card.getByRole('checkbox', { name: /Backend engineer/ }).check();
		await card.getByRole('button', { name: 'Save my card' }).click();
		await expect(card.getByRole('button', { name: 'Save my card' })).toBeDisabled();

		// Turning it on: the box of its own, then the API
		if (before.state === 'off') {
			await expect(section).toHaveAttribute('data-state', 'off');
			const consent = section.locator('[data-discovery-consent]');
			await consent.getByRole('checkbox').check();
			const optIn = page.waitForResponse(
				(response) =>
					response.url() === `${API_URL}/discovery/consent` &&
					response.request().method() === 'POST'
			);
			await consent.getByRole('button', { name: 'Make me visible to recruiters' }).click();
			expect(
				(await optIn).status(),
				'A run before withdrew for real (held back DISCOVERY_REJOIN_DAYS): run `bun run --cwd server seed:e2e` again'
			).not.toBe(429);
			// Its toast may wait behind the card's (three at most on screen, each for 5 s, held while
			// the pointer rests on them)
			await page.mouse.move(0, 0);
			await expect(toasts(page)).toContainText('You are visible to recruiters', {
				timeout: 15_000
			});
		}
		await expect(section).toHaveAttribute('data-state', 'on');
		await expect(section.locator('[data-discovery-state]')).toHaveText('On');
		await expect(section).toContainText(/Visible to recruiters since \d+\s\w+\s\d{4}\./);
		await expect(section.locator('[data-discovery-consent]')).toHaveCount(0);
		const now = await (await api.get(`${API_URL}/discovery`)).json();
		expect(now.state).toBe('on');
		await page.getByRole('tab', { name: /^Get started/ }).click();
		await expect(item).toContainText('Your anonymous card has been proposed to recruiters since');
		await expect(item.getByRole('link', { name: 'Open your opportunities' })).toHaveAttribute(
			'href',
			'/opportunities'
		);

		// Turning it off asks first, and says when it can be turned on again
		await item.getByRole('button', { name: 'Open the settings' }).click();
		await section.getByRole('button', { name: 'Stop being visible' }).click();
		const confirm = page.getByRole('alertdialog', { name: 'Stop being visible to recruiters?' });
		await expect(confirm).toContainText('You can turn it on again 7 days after you turn it off.');
		await expect(confirm).toContainText('except where you are both interested');
		await confirm.getByRole('button', { name: 'Stop being visible' }).click();
		await expect(confirm).toHaveCount(0);
		await expect(toasts(page)).toContainText('You are no longer visible to recruiters');
		await expect(section).toHaveAttribute('data-state', 'off');
		await expect(section).toContainText(/You can turn it on again from /);

		// The card's headline set back
		const reset = await api.put(`${API_URL}/discovery`, {
			data: { card: { headline: null, hiddenExperiences: [] } }
		});
		expect(reset.ok(), await reset.text()).toBe(true);
		await api.dispose();
	});

	test.describe('the deck, for real', () => {
		// The seeded job answered by an attempt stays answered (only seed:e2e sets it back): a retry
		// could never pass, and would hide this attempt's failure
		test.describe.configure({ retries: 0 });

		test('the deck at 390 px with the keyboard, the private page, then a mutual interest, ended', async ({
			page
		}) => {
			test.setTimeout(120_000);
			const api = await apiAs(session);
			// Proposed to recruiters: turned on by the test above, or here when it ran alone
			const before = await (await api.get(`${API_URL}/discovery`)).json();
			if (before.state === 'off') {
				const optIn = await api.post(`${API_URL}/discovery/consent`, {
					data: { consent: currentDiscoveryConsent() }
				});
				expect(
					optIn.ok(),
					`A run before withdrew for real (held back DISCOVERY_REJOIN_DAYS): run \`bun run --cwd server seed:e2e\` again. ${await optIn.text()}`
				).toBe(true);
			}
			const feed = await (await api.get(`${API_URL}/opportunities`)).json();
			expect(
				feed.jobs.map((entry: { job: { _id: string } }) => entry.job._id),
				'A run before answered the seeded job (this test is never retried): run `bun run --cwd server seed:e2e` again'
			).toContain(MATCH_JOB_ID);

			await page.setViewportSize({ width: 390, height: 844 });
			await blockGoogle(page);
			await signIn(page, session);
			await gotoHydrated(page, '/opportunities');
			const deck = page.getByRole('region', { name: 'Jobs proposed to you' });
			const cardHeading = deck.getByRole('heading', { level: 2, name: MATCH_JOB_TITLE });
			await expect(cardHeading).toBeVisible();
			await expect(deck.getByRole('button', { name: 'Pass' })).toBeVisible();
			await expect(deck.getByRole('button', { name: 'Interested' })).toBeVisible();
			expect(await sidewaysScroll(page)).toBe(0);

			// The keyboard alone: into the deck, then its shortcuts
			const intoDeck = () => tabIntoDeck(page, deck);
			const said = deck.locator('[aria-live="polite"]');
			await intoDeck();
			await page.keyboard.press('ArrowLeft');
			await expect(said).toHaveText(`You passed ${MATCH_JOB_TITLE}.`);
			const empty = deck.getByRole('heading', { name: 'Nothing to review right now' });
			await expect(empty).toBeFocused();
			await expect(deck.getByRole('button', { name: 'Undo' })).toBeVisible();
			await page.keyboard.press('z');
			await expect(said).toHaveText(`Undone: ${MATCH_JOB_TITLE} is back.`);
			await expect(cardHeading).toBeFocused();
			expect(await sidewaysScroll(page)).toBe(0);

			// The private page from the card: the score, nothing answered yet
			await deck.getByRole('link', { name: 'Open the job' }).click();
			await expect(page).toHaveURL(new RegExp(`/opportunities/${MATCH_JOB_ID}$`));
			const answer = page.locator('[data-feed-answer]');
			await expect(answer.getByRole('heading', { name: 'Proposed to you' })).toBeVisible();
			await expect(answer).toContainText('Your minimum score: 70');
			await expect(answer.locator('[data-answer]')).toHaveText(/^Does this job interest you\?/);
			await expect(page.getByRole('heading', { level: 2, name: MATCH_JOB_TITLE })).toBeVisible();
			await expect(page.getByText(/the candidates it is proposed to/)).toBeVisible();
			expect(await sidewaysScroll(page)).toBe(0);

			// Back to the deck: Interested, with the keyboard. Answered again after an undo, it is final
			await page.goBack();
			await expect(cardHeading).toBeVisible();
			await intoDeck();
			await page.keyboard.press('ArrowRight');
			await expect(said).toHaveText(`${MATCH_JOB_TITLE} interests you: its recruiter sees it.`);
			await expect(empty).toBeFocused();
			await page.keyboard.press('z');
			await expect(said).toHaveText('This answer can no longer be undone.');
			await expect(deck.getByRole('button', { name: 'Undo' })).toHaveCount(0);

			// The private page says the answer given, and offers to change it
			await gotoHydrated(page, `/opportunities/${MATCH_JOB_ID}`);
			await expect(answer.locator('[data-answer]')).toHaveText(
				'This job interests you: its recruiter sees it.'
			);
			await expect(answer.getByRole('button', { name: 'Pass' })).toBeVisible();

			// The recruiter is interested in the candidate of the card: both are interested now
			const recruiter = await apiAs(await recruiterSession());
			const cards = await (
				await recruiter.get(`${API_URL}/recruiter/jobs/${MATCH_JOB_ID}/candidates`)
			).json();
			expect(cards.cards, 'The candidate is proposed for the seeded job').toHaveLength(1);
			expect(cards.cards[0].interested).toBe(true);
			const decided = await recruiter.put(
				`${API_URL}/recruiter/jobs/${MATCH_JOB_ID}/candidates/decision`,
				{ data: { token: cards.cards[0].token, decision: 'interested' } }
			);
			expect(decided.ok(), await decided.text()).toBe(true);
			expect((await decided.json()).match).not.toBeNull();
			await recruiter.dispose();

			// The account menu says it, and so does the view of mutual interests
			await gotoHydrated(page, '/opportunities');
			const trigger = page.locator('[data-account-menu]');
			await expect(trigger).toHaveAccessibleName(/, 1 new mutual interest$/);
			await expect(page.locator('[data-unseen-dot]')).toBeVisible();
			// The menu's Opportunities leads to the view that shows what its badge counts
			const menu = await openAccountMenu(page);
			await expect(menu.getByRole('menuitem', { name: /^Opportunities/ })).toHaveAttribute(
				'href',
				'/opportunities?view=interests'
			);
			await page.keyboard.press('Escape');
			await expect(menu).toBeHidden();
			const interestsTab = page.getByRole('tab', { name: /^Mutual interests/ });
			await expect(interestsTab).toContainText('1 new');
			await interestsTab.click();
			await expect(page).toHaveURL(/\/opportunities\?view=interests$/);
			const item = page.locator('[data-interest]').first();
			await expect(item.getByRole('heading', { name: MATCH_JOB_TITLE })).toBeVisible();
			await expect(item.locator('[data-interest-state]')).toHaveText('Going on');
			await expect(item.locator('[data-interest-new]')).toHaveText('New');
			// Shown: seen, so no longer counted
			await expect(trigger).not.toHaveAccessibleName(/new mutual interest/);
			await expect(interestsTab).not.toContainText('1 new');
			expect(await sidewaysScroll(page)).toBe(0);

			// Ended by the candidate, asked first
			await item.getByRole('button', { name: 'End it' }).click();
			const confirm = page.getByRole('alertdialog', { name: 'End this mutual interest?' });
			await expect(confirm).toContainText('You cannot undo this.');
			await confirm.getByRole('button', { name: 'End it' }).click();
			await expect(confirm).toHaveCount(0);
			await expect(toasts(page)).toContainText('Mutual interest ended');
			await expect(item.locator('[data-interest-state]')).toHaveText('You ended it');
			await expect(item.getByRole('button', { name: 'End it' })).toHaveCount(0);
			await expect(item.getByRole('heading', { name: MATCH_JOB_TITLE })).toBeFocused();

			// Its private page: the version they said yes to, and that it ended
			await item.getByRole('link', { name: 'Open the job' }).click();
			const shared = page.locator('[data-shared-interest]');
			await expect(shared.getByRole('heading', { name: 'Mutual interest ended' })).toBeVisible();
			await expect(shared.locator('[data-interest-state]')).toHaveText('You ended it');
			await expect(page.locator('[data-feed-answer]')).toHaveCount(0);

			// Stop being visible, for real: out of every list at once (the API answers the feed 403),
			// and the inbox says why. A run so ends with the candidate off (`seed:e2e` sets it back)
			await stubCalendar(page);
			await gotoHydrated(page, `/${DOMAIN}/admin?tab=perfect-job`);
			const settings = discovery(page);
			await expect(settings).toHaveAttribute('data-state', 'on');
			await settings.getByRole('button', { name: 'Stop being visible' }).click();
			await page
				.getByRole('alertdialog', { name: 'Stop being visible to recruiters?' })
				.getByRole('button', { name: 'Stop being visible' })
				.click();
			await expect(toasts(page)).toContainText('You are no longer visible to recruiters');
			await expect(settings).toHaveAttribute('data-state', 'off');
			const feedAfter = await api.get(`${API_URL}/opportunities`);
			expect(feedAfter.status()).toBe(403);
			expect((await feedAfter.text()).trim()).toBe(NOT_PROPOSED_TO_RECRUITERS);
			await gotoHydrated(page, '/opportunities');
			await expect(
				page.getByRole('heading', { name: 'You are not visible to recruiters' })
			).toBeVisible();
			await api.dispose();
		});
	});
});
