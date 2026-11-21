import { expect, test, type Page, type Request, type Route } from '@playwright/test';
import { journeyTemplate } from 'portfolio-common';
import { calendarConfigured, stubApi } from './support/api';
import { dayFromToday, meetingType, slotOn, stubAppointments } from './support/appointments';
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
// with or without matching, and so is the candidate's page for recruiters of a mutual interest
// (the journey answered in the browser): its banner, the job it holds, the frozen score, ending it,
// and a share refused because a mutual interest holds the job step. The mutual interest is made for
// real, the candidate first (through the API), then the recruiter in the deck; the recruiter then
// goes through the candidate's page for recruiters (the banner, the note confirmed, the meeting
// booked: the booking routes answered in the browser), and ends it from the dashboard, after which
// that page holds nothing of it: a run answers that card and confirms that note, so `seed:e2e` must
// run again before the next (it removes the matches of the seeded jobs and the candidates' journey
// progress; CI seeds before every run), or that test stops at once saying so; it is never retried
// (`retries: 0`: a retry would find the card answered by the attempt before it, and hide that
// attempt's failure). Google is never reached.

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

/** The steps of a page for recruiters, and one of them by its name */
const journeySteps = (page: Page) => page.getByRole('list', { name: 'Hiring journey' });
const journeyStep = (page: Page, name: string) =>
	journeySteps(page)
		.getByRole('listitem')
		.filter({ has: page.getByRole('heading', { name }) });
/** The candidate's journey (the gate, seeded): its note's title */
const NOTE_TITLE = (journeyTemplate('gate')[0].config as { title: string }).title;
const JOB_LINE = `${JOB_TITLE} · E2E Matching Corp`;

/** A mutual interest made for these tests' journeys (answered in the browser) */
const INTEREST = '65e2e00000000000000000e1';

/**
 * The journey of the candidate's page for recruiters as the API answers it to the recruiter of a
 * mutual interest on JOB_ID: the note confirmed (or not), the job step holding the job (open, or on
 * hold: then waiting for it), the score frozen, the meeting to book
 */
const matchedJourney = ({
	note = 'succeeded',
	jobStatus = 'open',
	changed = false
}: { note?: 'pending' | 'succeeded'; jobStatus?: 'open' | 'on_hold'; changed?: boolean } = {}) => {
	const now = new Date().toISOString();
	return {
		steps: [
			{ id: 'note', type: 'note', status: note, config: { title: NOTE_TITLE, text: 'Hello.' } },
			{
				id: 'job',
				type: 'job',
				status: jobStatus === 'open' ? 'succeeded' : 'pending',
				view: {
					job: {
						_id: JOB_ID,
						title: JOB_TITLE,
						company: 'E2E Matching Corp',
						status: jobStatus,
						sharedAt: now
					},
					matched: true
				}
			},
			{
				id: 'job-match',
				type: 'job-match',
				status: 'succeeded',
				config: { minScore: 70 },
				view: {
					score: 100,
					minScore: 70,
					job: { _id: JOB_ID, title: JOB_TITLE },
					criteria: [{ criterion: 'pay', outcome: 'match' }],
					matched: true,
					frozenAt: now
				}
			},
			{ id: 'meeting', type: 'meeting', status: 'pending' }
		],
		match: {
			_id: INTEREST,
			job: { _id: JOB_ID, title: JOB_TITLE, company: 'E2E Matching Corp' },
			matchedAt: now,
			...(changed ? { changed: true } : {})
		}
	};
};

/** The same journey as anyone gets it: the job step to do (nothing shared) */
const journeyWithoutMatch = () => {
	const { steps } = matchedJourney();
	return {
		steps: steps.map(({ id, type, status, config }) =>
			type === 'note'
				? { id, type, status, config }
				: { id, type, status: 'pending', ...(config ? { config } : {}) }
		)
	};
};

test('with matching off, nothing of it shows on the recruiter pages, and nothing errors', async ({
	page
}) => {
	// The API's answers while MATCHING is off: the routes are not registered, the postings carry
	// no `matching`
	await stubApi(page, 'GET', '/me/notifications', () => ({ status: 404, text: 'NOT_FOUND' }));
	const interestReads = await stubApi(page, 'GET', '/matches**', () => ({
		status: 404,
		text: 'NOT_FOUND'
	}));
	await withMatching(page, '/recruiter/jobs', (posting) => delete posting.matching);
	await withMatching(page, `/recruiter/jobs/${JOB_ID}`, (posting) => delete posting.matching);

	await openAsRecruiter(page, `/recruiter/jobs/${JOB_ID}`);
	await expect(page.getByRole('heading', { level: 2, name: JOB_TITLE })).toBeVisible();
	await expect(page.locator('[data-matching-panel]')).toHaveCount(0);
	await expect(page.getByText('Propose to candidates')).toHaveCount(0);

	// The dashboard never shows, nor asks for, the mutual interests: not even a heading or a
	// placeholder while the answer is on its way (they wait for matching to be known on)
	await gotoHydrated(page, '/recruiter');
	await expect(page.getByRole('heading', { name: 'Your job descriptions' })).toBeVisible();
	await expect(page.locator('[data-recruiter-matches]')).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Mutual interests' })).toHaveCount(0);
	await expect(page.locator('[data-job-matching]')).toHaveCount(0);
	await expect(page.getByRole('alert')).toHaveCount(0);
	expect(interestReads).toHaveLength(0);

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

test('a mutual interest not seen is said new, marked seen once shown, and the menu’s mark goes', async ({
	page
}) => {
	const INTEREST = '65e2e00000000000000000e1';
	let seen = false;
	await stubApi(page, 'GET', '/me/notifications', () => ({
		json: { mutualInterests: { candidate: 0, recruiter: seen ? 0 : 1 } }
	}));
	const now = new Date().toISOString();
	await stubApi(page, 'GET', '/matches**', (request) =>
		new URL(request.url()).searchParams.get('side') === 'recruiter'
			? {
					json: {
						matches: [
							{
								_id: INTEREST,
								side: 'recruiter',
								matchedAt: now,
								changedAt: null,
								endedAt: null,
								endReason: null,
								seen: false,
								job: {
									_id: JOB_ID,
									title: JOB_TITLE,
									company: 'E2E Matching Corp',
									status: 'open'
								},
								candidate: { domain: CANDIDATE_DOMAIN, title: null }
							}
						],
						next: null
					}
				}
			: undefined
	);
	const marked = await stubApi(page, 'PUT', `/matches/${INTEREST}/seen`, () => {
		seen = true;
		return { json: { ok: true } };
	});
	await openAsRecruiter(page, '/recruiter');

	const item = page.locator(`[data-recruiter-interest="${INTEREST}"]`);
	await expect(item.locator('[data-interest-new]')).toHaveText('New');
	await expect.poll(() => marked.length).toBe(1);
	// The counts read again once it was marked: the recruiter space is no longer marked new
	const trigger = page.locator('[data-account-menu]');
	await expect(trigger).not.toHaveAccessibleName(/new mutual interests/);
	await expect(page.locator('[data-unseen-dot]')).toHaveCount(0);
	await trigger.click();
	const space = page.getByRole('menuitemradio', { name: /^Recruiter space/ });
	await expect(space).toBeVisible();
	await expect(space.locator('[data-recruiter-new]')).toHaveCount(0);
	await page.keyboard.press('Escape');
	// Still said new until read again
	await expect(item.locator('[data-interest-new]')).toHaveText('New');
	expect(marked).toHaveLength(1);
});

test.describe("the candidate's page for recruiters of a mutual interest", () => {
	test('the banner, the job it holds, the frozen score, the address ignored, and ending it, at 390 px', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		let ended = false;
		const journeyReads = await stubApi(
			page,
			'GET',
			`/workflow/domains/${CANDIDATE_DOMAIN}`,
			() => ({
				json: ended ? journeyWithoutMatch() : matchedJourney({ changed: true })
			})
		);
		const seen = await stubApi(page, 'PUT', `/matches/${INTEREST}/seen`, () => ({
			json: { ok: true }
		}));
		const ends = await stubApi(page, 'POST', `/matches/${INTEREST}/end`, () => {
			ended = true;
			const now = new Date().toISOString();
			return {
				json: {
					_id: INTEREST,
					side: 'recruiter',
					matchedAt: now,
					changedAt: null,
					endedAt: now,
					endReason: 'recruiter',
					seen: true,
					job: { _id: JOB_ID, title: JOB_TITLE, company: 'E2E Matching Corp', status: 'open' },
					candidate: { domain: CANDIDATE_DOMAIN, title: null }
				}
			};
		});
		await stubAppointments(page, CANDIDATE_DOMAIN);
		// The address asks for another job: the step holding the job of the mutual interest takes none
		await openAsRecruiter(page, `/${CANDIDATE_DOMAIN}/hire?job=${'f'.repeat(24)}`);

		const banner = page.locator(`[data-match-banner="${INTEREST}"]`);
		await expect(banner.getByRole('heading', { name: "You're both interested" })).toBeVisible();
		await expect(banner).toContainText(
			`You and ${CANDIDATE_DOMAIN} have both been interested in ${JOB_LINE} since`
		);
		await expect(banner.getByRole('link', { name: JOB_LINE })).toHaveAttribute(
			'href',
			`/recruiter/jobs/${JOB_ID}`
		);
		await expect(banner).toContainText(
			'This page holds that job for you: you cannot share another here while your mutual interest lasts.'
		);
		await expect(banner).toContainText(
			`The job description was edited since: ${CANDIDATE_DOMAIN} keeps the version they said yes to.`
		);
		await expect(banner).toContainText('Nothing else is asked of you: pick a time slot below.');
		// Never a bare "match" (it names the score), never an email promised: the names aside
		const said = (await banner.innerText())
			.replaceAll(CANDIDATE_DOMAIN, '')
			.replaceAll(JOB_LINE, '');
		expect(said).not.toMatch(/\bmatch(ed)?\b|e-?mail/i);
		// It takes the place of what to prepare: the recruiter came through matching
		await expect(page.getByRole('heading', { name: 'Before you start' })).toHaveCount(0);
		// Shown, it is marked seen
		await expect.poll(() => seen.length).toBe(1);

		// The job step is done with that job, and only shows it: no list to pick another, nothing to
		// change, whatever the address asked
		const job = journeyStep(page, 'Select or create a job');
		await expect(job).toContainText(`${JOB_LINE}: the job you are both interested in.`);
		await expect(page.locator('[data-matched-job]')).toHaveCount(0);
		await expect(job.getByRole('button', { name: /^Change/ })).toHaveCount(0);
		await job.getByRole('button', { name: /^Open/ }).click();
		const held = job.locator('[data-matched-job]');
		await expect(held).toContainText(
			'This step holds that job while your mutual interest lasts: you cannot share another here.'
		);
		await expect(held.getByRole('link', { name: JOB_LINE })).toHaveAttribute(
			'href',
			`/recruiter/jobs/${JOB_ID}`
		);
		await expect(job.getByText('Your job descriptions')).toHaveCount(0);
		await expect(job.getByRole('button', { name: 'Continue with this job' })).toHaveCount(0);

		// The score is the one it had then: nothing to check again or duplicate
		const score = journeyStep(page, 'Get the job scored');
		await expect(score).toContainText(
			`${JOB_TITLE} scored 100 out of 100 when you were both interested.`
		);
		await score.getByRole('button', { name: /^Open/ }).click();
		await expect(score.locator('[data-frozen-score]')).toContainText(
			'Score when you were both interested, on'
		);
		await expect(score.getByRole('button', { name: 'Check again' })).toHaveCount(0);
		await expect(score.getByRole('link', { name: 'Duplicate this job description' })).toHaveCount(
			0
		);
		expect(await sidewaysScroll(page)).toBe(0);

		// Ended from the banner, asked first: the page holds nothing of it any more, the job step is to
		// do again, as for anyone
		await banner.getByRole('button', { name: 'End it' }).click();
		const confirm = page.getByRole('alertdialog', { name: 'End this mutual interest?' });
		await expect(confirm).toContainText('This page will no longer hold your job for you');
		await confirm.getByRole('button', { name: 'End it' }).click();
		await expect(confirm).toHaveCount(0);
		await expect(toasts(page)).toContainText('Mutual interest ended');
		await expect(banner).toHaveCount(0);
		await expect(job).toContainText('Pick the job you are hiring for, or write it.');
		await expect(job.getByRole('heading', { name: /Select or create a job/ })).toBeFocused();
		expect(ends).toHaveLength(1);
		expect(journeyReads.length).toBeGreaterThanOrEqual(2);
	});

	test('a job of a mutual interest on hold: the step waits for it, with no other job to pick', async ({
		page
	}) => {
		await stubApi(page, 'GET', `/workflow/domains/${CANDIDATE_DOMAIN}`, () => ({
			json: matchedJourney({ jobStatus: 'on_hold' })
		}));
		await stubApi(page, 'PUT', `/matches/${INTEREST}/seen`, () => ({ json: { ok: true } }));
		await stubAppointments(page, CANDIDATE_DOMAIN);
		await openAsRecruiter(page, `/${CANDIDATE_DOMAIN}/hire`);

		const banner = page.locator('[data-match-banner]');
		await expect(banner).toContainText(
			'This page holds your job only while it is open and you have accepted the terms of use in force: the job step below says what is missing.'
		);
		await expect(banner).not.toContainText('time slot');
		// The job step, the first to do, says what brings the job back: open it again
		const job = journeyStep(page, 'Select or create a job');
		await expect(job).toContainText(
			`${JOB_TITLE} is on hold now: this page holds it again once you open it again.`
		);
		const held = job.locator('[data-matched-job]');
		await expect(held).toContainText('The steps after this one wait until it is open again.');
		await expect(held.getByRole('link', { name: 'Change its status' })).toHaveAttribute(
			'href',
			`/recruiter/jobs/${JOB_ID}`
		);
		await expect(job.getByText('Your job descriptions')).toHaveCount(0);
		// The meeting waits for it
		await expect(journeyStep(page, 'Book a meeting')).toContainText(
			'Complete the steps above first.'
		);
	});

	test('a share refused because a mutual interest holds the job step is said, and the page shows that job', async ({
		page
	}) => {
		let matched = false;
		await stubApi(page, 'GET', `/workflow/domains/${CANDIDATE_DOMAIN}`, () => ({
			json: matched ? matchedJourney() : journeyWithoutMatch()
		}));
		await stubApi(page, 'PUT', `/matches/${INTEREST}/seen`, () => ({ json: { ok: true } }));
		// The mutual interest was made since the page loaded (the API answers its 409)
		const shares = await stubApi(
			page,
			'POST',
			`/workflow/domains/${CANDIDATE_DOMAIN}/steps/job`,
			() => {
				matched = true;
				return {
					status: 409,
					text: 'This step holds the job you are both interested in'
				};
			}
		);
		await stubAppointments(page, CANDIDATE_DOMAIN);
		await openAsRecruiter(page, `/${CANDIDATE_DOMAIN}/hire`);

		// The recruiter's own jobs (read from the API): the seeded job of this file is open
		const job = journeyStep(page, 'Select or create a job');
		await job.getByRole('radio', { name: new RegExp(JOB_TITLE.replace(/[()]/g, '\\$&')) }).check();
		await job.getByRole('button', { name: 'Continue with this job' }).click();
		await expect(toasts(page)).toContainText(
			'This step now holds the job you are both interested in: you cannot share another while your mutual interest lasts.'
		);
		await expect(page.locator('[data-match-banner]')).toBeVisible();
		await expect(job).toContainText(`${JOB_LINE}: the job you are both interested in.`);
		expect(shares).toHaveLength(1);
	});
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

	// The seeded card answered by an attempt stays answered (only seed:e2e sets it back): a retry
	// could never pass, and would hide this attempt's failure
	test.describe.configure({ retries: 0 });

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
		const pageLink = item.getByRole('link', { name: 'Go to their page for recruiters' });
		await expect(pageLink).toHaveAttribute('href', `/${CANDIDATE_DOMAIN}/hire`);
		await expect(page.locator(`[data-job-card="${JOB_ID}"] [data-job-matching]`)).toHaveText(
			'Proposed to candidates'
		);

		// Their page for recruiters holds the job: the banner, the job step done with it, the score
		// frozen, the note still theirs to confirm, then the meeting. The booking routes are answered
		// in the browser (Google is never asked)
		const date = dayFromToday(1);
		const slot = slotOn(date);
		const schedule = meetingType({
			availability: [
				{ dayOfWeek: new Date(date).getUTCDay(), startTime: '09:00', endTime: '10:00' }
			]
		});
		const booked = await stubAppointments(page, CANDIDATE_DOMAIN, {
			schedules: [schedule],
			dates: [date],
			horizonDays: 30,
			slots: [slot]
		});
		await pageLink.click();
		await expect(page).toHaveURL(new RegExp(`/${CANDIDATE_DOMAIN}/hire$`));
		const banner = page.locator('[data-match-banner]');
		await expect(banner.getByRole('heading', { name: "You're both interested" })).toBeVisible();
		await expect(banner).toContainText(
			`You and ${CANDIDATE_DOMAIN} have both been interested in ${JOB_LINE} since`
		);
		await expect(banner).toContainText(
			`Still to do before the meeting: read a note (“${NOTE_TITLE}”).`
		);
		await expect(journeyStep(page, 'Select or create a job')).toContainText(
			`${JOB_LINE}: the job you are both interested in.`
		);
		await expect(journeyStep(page, 'Get the job scored')).toContainText(
			/scored \d+ out of 100 when you were both interested\./
		);
		const note = journeyStep(page, NOTE_TITLE);
		await note.getByRole('button', { name: 'I have read this' }).click();
		// Only the meeting is left
		await expect(banner).toContainText('Nothing else is asked of you: pick a time slot below.');
		// The calendar first (its month is the horizon's first): the date may be in the next one
		await expect(page.getByRole('application', { name: 'Pick a date' })).toBeVisible();
		const cell = page.locator(`[role="button"][data-value="${date}"]`);
		if (!(await cell.isVisible()))
			await page.getByRole('button', { name: /next/i }).first().click();
		await cell.click();
		await page
			.getByRole('button', { name: /^\d{1,2}:\d{2}/ })
			.first()
			.click();
		await page.getByRole('button', { name: 'Confirm booking' }).click();
		await expect.poll(() => booked.length).toBe(1);
		expect(booked[0]).toMatchObject({ scheduleId: schedule.id, startTime: slot.start });
		await expect(page.getByRole('heading', { name: /You're booked/ })).toBeVisible();
		expect(booked).toHaveLength(1);

		// Ended by the recruiter from the dashboard, asked first
		await gotoHydrated(page, '/recruiter');
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

		// Their page for recruiters holds nothing of it any more: no banner, the job step is to do
		// again, as for anyone (the note stays confirmed)
		await gotoHydrated(page, `/${CANDIDATE_DOMAIN}/hire`);
		await expect(journeyStep(page, 'Select or create a job')).toContainText(
			'Pick the job you are hiring for, or write it.'
		);
		await expect(page.locator('[data-match-banner]')).toHaveCount(0);
		await expect(journeyStep(page, NOTE_TITLE)).toContainText('You have read this note.');
	});
});
