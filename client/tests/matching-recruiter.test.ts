import { expect, test, type Page, type Request, type Route } from '@playwright/test';
import { calendarConfigured, stubApi } from './support/api';
import {
	API_URL,
	JWT_SECRET,
	apiAs,
	blockGoogle,
	gotoHydrated,
	recruiterSession,
	signIn,
	signSession,
	toasts,
	type OwnerSession
} from './support/owner';

// Matching (Path 2), the recruiter's side, as the e2e recruiter: proposing a job to candidates (the
// matching panel of its page), the anonymous cards proposed for it, answered one at a time in a
// deck (/recruiter/jobs/:id/candidates), and the mutual interests (the panel, the dashboard). The
// recruiter's job of this file is 'Staff Platform Engineer (e2e matching)' (a CDI, seeded by `bun
// run --cwd server seed:e2e` in matching and approved), proposed to one candidate, 'e2e-match-card'
// (seeded with discovery on), which only this file reads: client/tests/matching-candidate.test.ts
// has a job and a candidate of its own (a CDD, which this candidate refuses, as theirs refuses this
// CDI), so the files, running in parallel, never read what the other decides.
//
// What needs matching on (the API run with MATCHING=true, and GOOGLE_CLIENT_SECRET set to any value
// so the seeded calendar counts and the candidate is proposed) is skipped, saying why, when GET
// /me/notifications answers 404. What matching off shows (nothing of it), the terms to accept first,
// and a deck of several cards (the seed proposes one) are answered in the browser: those tests run
// with or without matching. The mutual interest is made for real, the candidate first (through the
// API), then the recruiter in the deck, and is ended: a run answers that card, so `seed:e2e` must
// run again before the next (it removes the matches of the seeded jobs; CI seeds before every run),
// or that test stops at once saying so. Google is never reached.

test.skip(!JWT_SECRET, 'Set JWT_SECRET to the API’s secret to sign in as the e2e recruiter');

/** The recruiter's job seeded in matching for this file (server/tests/seedE2e.ts) */
const JOB_ID = '65e2e0000000000000000101';
const JOB_TITLE = 'Staff Platform Engineer (e2e matching)';
/** The candidate proposed for it (seeded on), and what their card must never say */
const CANDIDATE_ID = '65e2e0000000000000000004';
const CANDIDATE_DOMAIN = 'e2e-match-card';
const NEVER_ON_CARD = [
	'Cleo',
	CANDIDATE_DOMAIN,
	'matchcard',
	'@',
	'E2E Matching Corp',
	'out of 100',
	'/100',
	'Paris',
	'ommute',
	'ravel time'
];

let session: OwnerSession;

test.beforeAll(async () => {
	session = await recruiterSession();
});

const openAsRecruiter = async (page: Page, path: string) => {
	await blockGoogle(page);
	await signIn(page, session);
	await gotoHydrated(page, path);
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

/** Answers a recruiter route with the API's own answer, its `matching` changed by `change` */
const withMatching = async (
	page: Page,
	path: string,
	change: (posting: Record<string, unknown>) => void
) =>
	page.route(`${API_URL}${path}`, async (route: Route) => {
		if (route.request().method() !== 'GET') return route.fallback();
		const response = await route.fetch();
		const json = await response.json();
		for (const posting of Array.isArray(json.jobs) ? json.jobs : [json]) change(posting);
		await route.fulfill({ response, json });
	});

const approved = () => {
	const now = new Date().toISOString();
	return {
		enabledAt: now,
		review: { status: 'approved', requestedAt: now, reviewedAt: now, reason: null }
	};
};

/** An anonymous card as the recruiter's feed answers it */
const card = (token: string, title: string, interested = false) => ({
	token,
	card: {
		headline: null,
		experienceMonths: 50,
		roles: [{ title, months: 50, current: true }],
		skills: [{ name: 'Kubernetes', months: 30 }]
	},
	outcomes: [{ criterion: 'pay', outcome: 'match' }],
	interested
});

const TOKEN_A = 'a'.repeat(40);
const TOKEN_B = 'b'.repeat(40);

test('with matching off, nothing of it shows on the recruiter pages, and nothing errors', async ({
	page
}) => {
	// The API's answers while MATCHING is off: the routes are not registered, the postings carry
	// no `matching`
	await stubApi(page, 'GET', '/me/notifications', () => ({ status: 404, text: 'NOT_FOUND' }));
	await stubApi(page, 'GET', '/matches**', () => ({ status: 404, text: 'NOT_FOUND' }));
	await withMatching(page, '/recruiter/jobs', (posting) => delete posting.matching);
	await withMatching(page, `/recruiter/jobs/${JOB_ID}`, (posting) => delete posting.matching);

	await openAsRecruiter(page, `/recruiter/jobs/${JOB_ID}`);
	await expect(page.getByRole('heading', { level: 2, name: JOB_TITLE })).toBeVisible();
	await expect(page.locator('[data-matching-panel]')).toHaveCount(0);
	await expect(page.getByText('Propose to candidates')).toHaveCount(0);

	await gotoHydrated(page, '/recruiter');
	await expect(page.getByRole('heading', { name: 'Your job descriptions' })).toBeVisible();
	await expect(page.locator('[data-recruiter-matches]')).toHaveCount(0);
	await expect(page.locator('[data-job-matching]')).toHaveCount(0);
	await expect(page.getByRole('alert')).toHaveCount(0);

	// The editor offers no choice for a job created open
	await gotoHydrated(page, '/recruiter/jobs/new');
	await page.getByLabel('Status', { exact: true }).selectOption('open');
	await expect(page.locator('[data-matching-choice]')).toHaveCount(0);
	await expect(page.locator('[data-matching-later]')).toHaveCount(0);

	// The candidates page says only that it is not available
	await gotoHydrated(page, `/recruiter/jobs/${JOB_ID}/candidates`);
	await expect(page.getByRole('heading', { name: 'Not available' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Interested' })).toHaveCount(0);
});

test('the deck answers one card at a time with the keyboard, undoes the first answer, at 390 px', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await withMatching(page, `/recruiter/jobs/${JOB_ID}`, (posting) => {
		posting.matching = approved();
	});
	// One card per read: the next once the one shown is answered (the deck never counts them)
	let answered = false;
	const reads = await stubApi(page, 'GET', `/recruiter/jobs/${JOB_ID}/candidates`, () => ({
		json: answered
			? { cards: [card(TOKEN_B, 'Data engineer')], more: false }
			: { cards: [card(TOKEN_A, 'Platform engineer', true)], more: true }
	}));
	const decisions = await stubApi(
		page,
		'PUT',
		`/recruiter/jobs/${JOB_ID}/candidates/decision`,
		(request) => {
			answered = true;
			return { json: { decision: request.postDataJSON().decision, match: null } };
		}
	);
	const undos = await stubApi(
		page,
		'DELETE',
		`/recruiter/jobs/${JOB_ID}/candidates/decision`,
		() => ({
			json: { decision: null, match: null }
		})
	);
	await openAsRecruiter(page, `/recruiter/jobs/${JOB_ID}/candidates`);

	const deck = page.getByRole('region', { name: 'Candidates to review' });
	await expect(deck.getByRole('heading', { name: 'Platform engineer' })).toBeVisible();
	await expect(deck).toContainText('Interested in your job');
	await expect(deck).toContainText("Your job reaches this candidate's minimum score.");
	await expect(deck).toContainText('More candidates after this one.');
	expect(await sidewaysScroll(page)).toBe(0);

	// Buttons first; the keys while the focus is in the deck
	await deck.getByRole('button', { name: 'Pass' }).focus();
	await page.keyboard.press('ArrowLeft');
	const said = deck.locator('[aria-live="polite"]');
	await expect(said).toHaveText('You passed this candidate.');
	await expect(deck.getByRole('heading', { name: 'Data engineer' })).toBeFocused();
	await expect(deck).toContainText('No other candidate for now.');
	// The token goes in the body, never in the address
	expect(decisions.map((request) => request.postDataJSON())).toEqual([
		{ token: TOKEN_A, decision: 'pass' }
	]);
	expect(decisions.every((request) => !request.url().includes(TOKEN_A))).toBe(true);
	expect(reads).toHaveLength(2);

	// Undo, with the token of the card answered (kept in memory): the card is back on top
	await page.keyboard.press('z');
	await expect(said).toHaveText('Undone: the candidate is back.');
	await expect(deck.getByRole('heading', { name: 'Platform engineer' })).toBeFocused();
	expect(undos.map((request) => request.postDataJSON())).toEqual([{ token: TOKEN_A }]);
	// Answered again after an undo, it is final: Undo is gone
	await page.keyboard.press('ArrowRight');
	await expect(said).toHaveText('This candidate interests you: they see it beside your job.');
	await expect(deck.getByRole('button', { name: 'Undo' })).toHaveCount(0);
	expect(await sidewaysScroll(page)).toBe(0);
	// Nothing of the deck is kept in this browser
	expect(
		await page.evaluate(() =>
			Object.keys(localStorage).filter((key) => /token|candidate|decision/i.test(key))
		)
	).toEqual([]);
});

test('a recruiter who has not accepted the terms in force accepts them, then the deck starts', async ({
	page
}) => {
	await withMatching(page, `/recruiter/jobs/${JOB_ID}`, (posting) => {
		posting.matching = approved();
	});
	let accepted = false;
	await stubApi(page, 'GET', `/recruiter/jobs/${JOB_ID}/candidates`, () =>
		accepted
			? { json: { cards: [], more: false } }
			: {
					status: 422,
					json: {
						type: 'validation',
						on: 'body',
						property: 'consent',
						message: 'Accept the terms of use in force to use your recruiter space.'
					}
				}
	);
	await stubApi(page, 'PUT', '/me/consent', (request: Request) => {
		accepted = true;
		return { json: { user: { _id: session.ownerId, recruiter: true, ...request.postDataJSON() } } };
	});
	await openAsRecruiter(page, `/recruiter/jobs/${JOB_ID}/candidates`);

	const terms = page.locator('[data-terms-acceptance]');
	await expect(terms.getByRole('heading', { level: 2, name: 'Terms of use' })).toBeVisible();
	await terms.getByRole('checkbox', { name: /at least 16 years old/ }).check();
	await terms.getByRole('button', { name: 'Accept the terms' }).click();

	// Then the deck: nothing to answer now, said honestly (no count, no email)
	const empty = page.locator('[data-deck-empty]');
	await expect(
		empty.getByRole('heading', { name: 'No candidate to review right now' })
	).toBeVisible();
	await expect(empty).not.toContainText(/e-?mail/i);
});

test('the account menu marks the recruiter space while mutual interests are not seen, never with a number', async ({
	page
}) => {
	await stubApi(page, 'GET', '/me/notifications', () => ({
		json: { mutualInterests: { candidate: 0, recruiter: 2 } }
	}));
	await openAsRecruiter(page, '/recruiter');
	const trigger = page.locator('[data-account-menu]');
	await expect(trigger).toHaveAccessibleName(/, new mutual interests in your recruiter space$/);
	await expect(page.locator('[data-unseen-dot]')).toBeVisible();
	await trigger.click();
	const item = page.getByRole('menuitemradio', { name: /^Recruiter space/ });
	await expect(item.locator('[data-recruiter-new]')).toBeVisible();
	await expect(item).toHaveAccessibleName(/New mutual interests/);
	await expect(item).not.toContainText('2');
});

test.describe('with matching on', () => {
	test.beforeAll(async () => {
		const api = await apiAs(session);
		const status = (await api.get(`${API_URL}/me/notifications`)).status();
		const candidate = await apiAs({
			ownerId: CANDIDATE_ID,
			exp: 0,
			token: await signSession(CANDIDATE_ID, Math.floor(Date.now() / 1000) + 3600)
		});
		// The seeded calendar (a placeholder grant) counts only on a site that takes Google Calendar
		const calendar = status === 404 || (await calendarConfigured(candidate));
		await api.dispose();
		await candidate.dispose();
		test.skip(
			status === 404,
			'Matching is off in the API under test (GET /me/notifications answers 404): run it with MATCHING=true'
		);
		test.skip(
			!calendar,
			'Google Calendar is not configured in the API under test, so the seeded candidate is not proposed: set GOOGLE_CLIENT_SECRET to any value'
		);
	});

	test('the recruiter reads an anonymous card, both are interested, the portfolio is revealed, and they end it', async ({
		page
	}) => {
		const recruiter = await apiAs(session);
		const before = await (
			await recruiter.get(`${API_URL}/matches?side=recruiter&job=${JOB_ID}`)
		).json();
		expect(
			before.matches,
			'A run before answered the seeded card: run `bun run --cwd server seed:e2e` again'
		).toEqual([]);
		await recruiter.dispose();

		// The candidate says first that the job interests them (through the API)
		const candidate = await apiAs({
			ownerId: CANDIDATE_ID,
			exp: 0,
			token: await signSession(CANDIDATE_ID, Math.floor(Date.now() / 1000) + 3600)
		});
		const interested = await candidate.put(`${API_URL}/opportunities/jobs/${JOB_ID}/decision`, {
			data: { decision: 'interested' }
		});
		expect(interested.ok(), await interested.text()).toBe(true);
		await candidate.dispose();

		// The job's page: proposed, candidates to review, never how many
		await openAsRecruiter(page, `/recruiter/jobs/${JOB_ID}`);
		const panel = page.locator('[data-matching-panel]');
		await expect(panel.getByRole('heading', { name: 'Propose to candidates' })).toBeVisible();
		await expect(
			panel.getByRole('checkbox', { name: /Propose this job to candidates/ })
		).toBeChecked();
		await expect(panel.locator('[data-matching-state]')).toContainText('Proposed to candidates');
		await expect(panel.locator('[data-candidates-waiting="some"]')).toContainText(
			'Candidates to review'
		);
		await expect(panel).toContainText('No mutual interest on this job yet.');
		await panel.getByRole('link', { name: 'Review candidates' }).click();
		await expect(page).toHaveURL(new RegExp(`/recruiter/jobs/${JOB_ID}/candidates$`));

		// The anonymous card: the role, never a name, an address, a company, a place, a score or a commute
		const deck = page.getByRole('region', { name: 'Candidates to review' });
		const shown = deck.locator('article').first();
		await expect(shown.getByRole('heading', { name: 'Platform engineer' })).toBeVisible();
		await expect(shown).toContainText('Interested in your job');
		const text = await shown.innerText();
		for (const word of NEVER_ON_CARD) expect(text, word).not.toContain(word);
		await expect(deck).toContainText('No other candidate for now.');

		// Interested, with the keyboard: both are interested, the portfolio is revealed
		await deck.getByRole('button', { name: 'Interested' }).focus();
		await page.keyboard.press('ArrowRight');
		const moment = deck.getByRole('heading', { name: "You're both interested" });
		await expect(moment).toBeFocused();
		await expect(deck).toContainText(CANDIDATE_DOMAIN);
		await expect(
			deck.getByRole('link', { name: 'Go to their page for recruiters' })
		).toHaveAttribute('href', `/${CANDIDATE_DOMAIN}/hire`);
		await deck.getByRole('button', { name: 'Keep going' }).click();
		await expect(
			page.getByRole('heading', { name: 'No candidate to review right now' })
		).toBeFocused();

		// The dashboard lists it, with the portfolio and its page for recruiters
		await gotoHydrated(page, '/recruiter');
		const item = page
			.locator('[data-recruiter-matches="all"] [data-recruiter-interest]')
			.filter({ hasText: JOB_TITLE })
			.filter({ hasText: CANDIDATE_DOMAIN });
		await expect(item.locator('[data-interest-state]')).toHaveText('Going on');
		await expect(
			item.getByRole('link', { name: 'Go to their page for recruiters' })
		).toHaveAttribute('href', `/${CANDIDATE_DOMAIN}/hire`);
		await expect(page.locator(`[data-job-card="${JOB_ID}"] [data-job-matching]`)).toHaveText(
			'Proposed to candidates'
		);

		// Ended by the recruiter, asked first
		await item.getByRole('button', { name: 'End it' }).click();
		const confirm = page.getByRole('alertdialog', { name: 'End this mutual interest?' });
		await expect(confirm).toContainText('You cannot undo this.');
		await confirm.getByRole('button', { name: 'End it' }).click();
		await expect(confirm).toHaveCount(0);
		await expect(toasts(page)).toContainText('Mutual interest ended');
		await expect(item.locator('[data-interest-state]')).toHaveText('You ended it');
		await expect(item.getByRole('button', { name: 'End it' })).toHaveCount(0);

		// The job's page lists it too, ended; nobody waits for an answer anymore
		await gotoHydrated(page, `/recruiter/jobs/${JOB_ID}`);
		await expect(panel.locator('[data-recruiter-interest]')).toContainText('You ended it');
		await expect(panel.locator('[data-candidates-waiting="none"]')).toContainText(
			'No candidate to review right now.'
		);
	});
});
