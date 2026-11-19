import { expect, test, type Locator, type Page } from '@playwright/test';
import { stubApi, type StubAnswer } from './support/api';
import {
	API_URL,
	JWT_SECRET,
	blockGoogle,
	gotoHydrated,
	ownerSession,
	signIn,
	type OwnerSession
} from './support/owner';

// The owner's share kit: the account menu's "Share your link", the admin's Share tab (the link,
// the reply to a recruiter and the LinkedIn text, in English or in French whatever the page's
// language, what the owner asks for added only once ticked, the page for recruiters named only
// once recruiters can book there and get through it) and "Copy your link" on their page for
// recruiters, whose title the server writes in both languages. They sign in as the owner of
// 'e2e-share-kit' (seeded by `bun run --cwd server seed:e2e`, kept for these tests), and answer in
// the browser what the owner set up (GET /me/readiness) and their perfect job (GET /perfect-job):
// the portfolio stays as seeded.

const DOMAIN = 'e2e-share-kit';
const LINK = `http://localhost:4173/${DOMAIN}`;
const PAGE = `${LINK}/hire`;

test.skip(!JWT_SECRET, 'Set JWT_SECRET to the API’s secret to sign in as the e2e owner');

let session: OwnerSession;

test.beforeAll(async () => {
	session = await ownerSession(DOMAIN);
});

/** A calendar recruiters can book in: connected, with a meeting type turned on */
const OPEN_CALENDAR = { configured: true, connected: true, reconnect: false, enabledSchedules: 1 };

const GATE_JOURNEY = {
	saved: true,
	types: ['note', 'job', 'job-match', 'meeting'],
	blocked: false,
	gate: true,
	meeting: true
};
const MEETING_JOURNEY = {
	saved: false,
	types: ['meeting'],
	blocked: false,
	gate: false,
	meeting: true
};
/** A step of a type this version does not have, before the meeting: nobody gets through */
const BLOCKED_JOURNEY = {
	saved: true,
	types: ['job', 'gone', 'meeting'],
	blocked: true,
	gate: false,
	meeting: false
};

type Setup = {
	/** The gate journey (the default), else the meeting alone */
	gate?: boolean;
	/** Another journey than those two */
	journey?: typeof GATE_JOURNEY;
	/** The calendar open by default */
	calendar?: typeof OPEN_CALENDAR;
	/** How many criteria the perfect job rates */
	criteria?: number;
	/** The answer of each read of the readiness (`index`: how many came before), else the above */
	readinessAnswer?: (index: number) => StubAnswer;
};

/** What the owner set up (GET /me/readiness) */
const readiness = ({ gate = true, journey, calendar = OPEN_CALENDAR, criteria = 4 }: Setup) => ({
	domain: DOMAIN,
	experiences: 2,
	perfectJob: {
		criteria,
		essentials: {
			pay: criteria > 0,
			workMode: criteria > 0,
			place: criteria > 0,
			contractTypes: criteria > 0
		}
	},
	journey: journey ?? (gate ? GATE_JOURNEY : MEETING_JOURNEY),
	calendar
});

/** The owner's perfect job (GET /perfect-job): the facts the kit can add, and a commute */
const PERFECT_JOB = {
	criteria: {
		pay: { importance: 5, dealBreaker: true, perYear: 65000 },
		workMode: { importance: 4, modes: ['hybrid'], minRemoteDays: 2 },
		cities: { importance: 3, places: ['Paris', 'Lyon'] },
		contractTypes: { importance: 3, types: ['cdi', 'freelance'] },
		commute: {
			importance: 4,
			from: '12 rue Secrète, Paris',
			modes: ['transit'],
			maxMinutesPerWeek: 300
		}
	},
	commute: { enabled: true, modes: ['transit', 'bike', 'car', 'walk'], transit: 'here' }
};

/** Signs in as the owner, their readiness and perfect job answered here: returns their reads */
const openAsOwner = async (
	page: Page,
	setup: Setup = {},
	perfectJob: (index: number) => StubAnswer = () => ({ json: PERFECT_JOB })
) => {
	await blockGoogle(page);
	await signIn(page, session);
	const readinessReads = await stubApi(
		page,
		'GET',
		'/me/readiness',
		(_, index) => setup.readinessAnswer?.(index) ?? { json: readiness(setup) }
	);
	const perfectJobReads = await stubApi(page, 'GET', '/perfect-job', (_, index) =>
		perfectJob(index)
	);
	return { readinessReads, perfectJobReads };
};

const shareTab = (page: Page) => page.getByRole('tabpanel', { name: 'Share' });
const reply = (page: Page, language = 'English') =>
	shareTab(page).getByRole('textbox', { name: `Your reply, in ${language}` });
const linkedInOf = (page: Page) =>
	shareTab(page).getByRole('textbox', { name: 'Your LinkedIn text, in English' });
/** The buttons that lead from the reply's hint to another tab */
const LEADS = [
	'Set my steps',
	'Open my calendar settings',
	'Change my steps',
	'Set my perfect job'
];
const leadsShown = async (tab: Locator) => {
	const shown: string[] = [];
	for (const name of LEADS) {
		if (await tab.getByRole('button', { name, exact: true }).count()) shown.push(name);
	}
	return shown;
};
/** Texts that promise nothing of the page for recruiters: the job asked for, and the portfolio */
const expectPortfolioOnly = async (page: Page) => {
	await expect(reply(page)).toHaveValue(
		new RegExp(
			`could you send me the job description, with its pay range\\? My experiences and projects are in my portfolio:\\n\\n${LINK}\\n\\n`
		)
	);
	await expect(reply(page)).not.toHaveValue(/\/hire|meeting|scored/);
	await expect(linkedInOf(page)).toHaveValue(`My experiences and projects: ${LINK}`);
};
/** Shows another tab of the admin page, then Share again: the page reads the readiness again */
const showShareAgain = async (page: Page) => {
	await page.getByRole('tab', { name: 'Appearance' }).click();
	await page.getByRole('tab', { name: 'Share' }).click();
};

test('the account menu leads to the Share tab, which writes the reply and the LinkedIn text', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await openAsOwner(page);
	// Whatever is typed or ticked here, nothing leaves the page: no request's body, query string
	// or path on the API carries it
	const sent: string[] = [];
	page.on('request', (request) => {
		const url = new URL(request.url());
		sent.push(url.search);
		if (request.url().startsWith(API_URL)) sent.push(url.pathname);
		const body = request.postData();
		if (body) sent.push(body);
	});

	await gotoHydrated(page, `/${DOMAIN}/experiences`);
	await page.locator('[data-account-menu]').click();
	await page.getByRole('menuitem', { name: 'Share your link' }).click();
	await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/admin\\?tab=share$`));
	await expect(page.getByRole('tab', { name: 'Share' })).toHaveAttribute('aria-selected', 'true');
	await expect(shareTab(page).getByRole('heading', { name: 'Share your link' })).toBeVisible();

	// The link, copied
	const tab = shareTab(page);
	await expect(tab.getByRole('textbox', { name: 'Your link', exact: true })).toHaveValue(LINK);
	await tab.getByRole('button', { name: 'Copy your link' }).click();
	await expect(tab.getByText(`Link copied: localhost:4173/${DOMAIN}`)).toBeAttached();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(LINK);

	// The reply asks for the job and its pay range on the page for recruiters, and says nothing of
	// what the owner asks for
	await expect(
		tab.getByText('It asks them to share the role on your page for recruiters')
	).toBeVisible();
	await expect(reply(page)).toHaveValue(
		/could you share the role on my page for recruiters, with its pay range\? It is scored against what I am looking for/
	);
	await expect(reply(page)).toHaveValue(new RegExp(`\\n\\n${PAGE}\\n\\n`));
	await expect(reply(page)).not.toHaveValue(/65|matter to me/);
	const facts = tab.locator('[data-share-facts]');
	for (const fact of ['The pay I ask for', 'Remote days a week', 'Where', 'Contracts']) {
		await expect(facts.getByRole('checkbox', { name: fact, exact: true })).not.toBeChecked();
	}

	// Ticked, a fact is filled in from the perfect job, and stays the owner's to change
	await facts.getByRole('checkbox', { name: 'The pay I ask for' }).check();
	const amount = facts.getByRole('textbox', { name: 'Gross amount, in euros' });
	await expect(amount).toHaveValue('65000');
	await expect(reply(page)).toHaveValue(
		/A few things that matter to me:\n- Pay: at least €65,000 gross a year\n\nBest regards,$/
	);
	await amount.fill('70000');
	await expect(reply(page)).toHaveValue(/- Pay: at least €70,000 gross a year/);
	await facts.getByRole('checkbox', { name: 'Remote days a week' }).check();
	await expect(facts.getByRole('combobox', { name: 'Remote days a week' })).toHaveValue('2');
	await facts.getByRole('checkbox', { name: 'Where' }).check();
	await expect(facts.getByRole('textbox', { name: 'Where' })).toHaveValue('Paris, Lyon');
	await facts.getByRole('checkbox', { name: 'Contracts' }).check();
	await expect(facts.getByRole('checkbox', { name: 'CDI (permanent)' })).toBeChecked();
	await expect(facts.getByRole('checkbox', { name: 'Freelance' })).toBeChecked();
	await expect(reply(page)).toHaveValue(
		/- Pay: at least €70,000 gross a year\n- Remote work: at least 2 days a week\n- Location: Paris, Lyon\n- Contract: CDI \(permanent\), Freelance/
	);
	// Never the address the commute is counted from
	await expect(reply(page)).not.toHaveValue(/Secrète/);
	// Unticked, gone from the reply; ticked again, as the owner left it
	await facts.getByRole('checkbox', { name: 'The pay I ask for' }).uncheck();
	await expect(reply(page)).not.toHaveValue(/Pay:/);
	await facts.getByRole('checkbox', { name: 'The pay I ask for' }).check();
	await expect(amount).toHaveValue('70000');

	// In French, whatever the page's language, with the French links
	await tab.getByRole('radio', { name: 'Français' }).check();
	const french = reply(page, 'French');
	await expect(french).toHaveValue(/^Bonjour,/);
	await expect(french).toHaveValue(/présenter le poste sur ma page recruteurs/);
	await expect(french).toHaveValue(new RegExp(`${PAGE}\\?lang=fr`));
	await expect(french).toHaveValue(/Rémunération\s:\sau moins 70\s000\s€ brut par an/);
	await expect(french).toHaveValue(/Contrat\s:\sCDI, Freelance/);
	await tab.getByRole('button', { name: 'Copy the reply' }).click();
	await expect(tab.getByText('Copied: Your reply, in French')).toBeAttached();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await french.inputValue());

	const linkedIn = tab.getByRole('textbox', { name: 'Your LinkedIn text, in French' });
	await expect(linkedIn).toHaveValue(/^Recruteurs\s:\spour me proposer un poste/);
	await expect(linkedIn).toHaveValue(new RegExp(`${LINK}\\?lang=fr$`));
	await tab.getByRole('button', { name: 'Copy the text' }).click();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
		await linkedIn.inputValue()
	);

	const typed = /65000|70000|Lyon|freelance/i;
	expect(sent.filter((part) => typed.test(part))).toEqual([]);
	// Nor is it kept in the browser
	const kept = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
	expect(kept).not.toMatch(typed);
});

test('without a job step, the reply asks for the job itself, and leads to the steps', async ({
	page
}) => {
	await openAsOwner(page, { gate: false });
	await gotoHydrated(page, `/${DOMAIN}/admin?tab=share`);
	const tab = shareTab(page);
	await expect(
		tab.getByText('Your page for recruiters does not ask for the job', { exact: false })
	).toBeVisible();
	await expect(reply(page)).toHaveValue(
		/could you send me the job description, with its pay range\? You can then book a meeting with me on my page for recruiters:/
	);
	await expect(reply(page)).not.toHaveValue(/scored/);
	await tab.getByRole('button', { name: 'Set my steps' }).click();
	await expect(page.getByRole('tab', { name: /Get started/ })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/admin\\?tab=start$`));
});

test('while nobody can book, the texts give the portfolio, and lead to the calendar', async ({
	page
}) => {
	// The gate journey, its calendar not connected: recruiters would stop at "No online booking"
	await openAsOwner(page, {
		calendar: { ...OPEN_CALENDAR, connected: false, enabledSchedules: 0 }
	});
	await gotoHydrated(page, `/${DOMAIN}/admin?tab=share`);
	const tab = shareTab(page);
	await expect(
		tab.getByText(
			'Recruiters cannot book on your page for recruiters until your calendar is open',
			{
				exact: false
			}
		)
	).toBeVisible();
	await expectPortfolioOnly(page);
	expect(await leadsShown(tab)).toEqual(['Open my calendar settings']);
	await tab.getByRole('button', { name: 'Open my calendar settings' }).click();
	await expect(page.getByRole('tab', { name: 'Appointments' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/admin\\?tab=appointments$`));
});

test('on a site without Google Calendar, the texts give the portfolio, with nothing to set', async ({
	page
}) => {
	// As on CI's API, which has no GOOGLE_CLIENT_SECRET
	await openAsOwner(page, {
		calendar: { configured: false, connected: false, reconnect: false, enabledSchedules: 0 }
	});
	await gotoHydrated(page, `/${DOMAIN}/admin?tab=share`);
	const tab = shareTab(page);
	await expect(tab.locator('[data-reply-hint]')).toHaveText(
		/^Online booking is not available on this site for now: /
	);
	await expectPortfolioOnly(page);
	expect(await leadsShown(tab)).toEqual([]);
});

test('a step nobody can get past: the texts give the portfolio, and lead to the steps', async ({
	page
}) => {
	await openAsOwner(page, { journey: BLOCKED_JOURNEY });
	await gotoHydrated(page, `/${DOMAIN}/admin?tab=share`);
	const tab = shareTab(page);
	await expect(tab.locator('[data-reply-hint]')).toHaveText(
		/^A step of your page for recruiters is not available anymore: recruiters cannot get past it\./
	);
	// Never that the page asks for no job: it does, recruiters only cannot get through it
	await expect(tab.getByText('does not ask for the job', { exact: false })).toHaveCount(0);
	await expectPortfolioOnly(page);
	expect(await leadsShown(tab)).toEqual(['Change my steps']);
	await tab.getByRole('button', { name: 'Change my steps' }).click();
	const journeyTab = page.getByRole('tab', { name: 'Hiring journey' });
	await expect(journeyTab).toHaveAttribute('aria-selected', 'true');
	await expect(journeyTab).toBeFocused();
	await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/admin\\?tab=workflows$`));
});

test('the gate with nothing to score against: the texts do not say the job is scored', async ({
	page
}) => {
	await openAsOwner(page, { criteria: 0 });
	await gotoHydrated(page, `/${DOMAIN}/admin?tab=share`);
	const tab = shareTab(page);
	await expect(
		tab.getByText('Your perfect job has no criterion yet: every job would score 100', {
			exact: false
		})
	).toBeVisible();
	await expect(reply(page)).toHaveValue(
		/could you share the role on my page for recruiters, with its pay range\? You can then book a meeting with me there\./
	);
	await expect(reply(page)).not.toHaveValue(/scored/);
	await expect(linkedInOf(page)).toHaveValue(/It asks for the job and its pay range first: /);
	await expect(linkedInOf(page)).not.toHaveValue(/scores/);
	expect(await leadsShown(tab)).toEqual(['Set my perfect job']);
	await tab.getByRole('button', { name: 'Set my perfect job' }).click();
	await expect(page.getByRole('tab', { name: 'Perfect job' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/admin\\?tab=perfect-job$`));
});

test('while what the steps ask cannot be read, the texts promise nothing of the page', async ({
	page
}) => {
	// The first read fails, the second succeeds, the one once the tab is shown again fails
	await openAsOwner(page, {
		readinessAnswer: (index) =>
			index === 1 ? undefined : { status: 500, text: 'Internal Server Error' }
	});
	await gotoHydrated(page, `/${DOMAIN}/admin?tab=share`);
	const tab = shareTab(page);
	const notice = tab.locator('[data-readiness-failed]');
	await expect(notice).toContainText(
		'What your steps ask of recruiters could not be read. Try again.'
	);
	await expect(tab.locator('[data-reply-hint]')).toHaveText(
		'It asks them to send you the job description, with its pay range, and gives your portfolio.'
	);
	await expectPortfolioOnly(page);
	expect(await leadsShown(tab)).toEqual([]);

	// Read again: what the steps ask
	await notice.getByRole('button', { name: 'Try again' }).click();
	await expect(notice).toHaveCount(0);
	await expect(reply(page)).toHaveValue(new RegExp(`\\n\\n${PAGE}\\n\\n`));

	// Shown again, the tab is read again: failing, the texts no longer trust what was read before
	// (the steps may have changed in the Hiring journey tab meanwhile)
	await showShareAgain(page);
	await expect(notice).toBeVisible();
	await expectPortfolioOnly(page);
	expect(await leadsShown(tab)).toEqual([]);
});

test('an amount the reply cannot carry is said, and the perfect job is read again', async ({
	page
}) => {
	let perfectJob = PERFECT_JOB;
	await openAsOwner(page, {}, () => ({ json: perfectJob }));
	await gotoHydrated(page, `/${DOMAIN}/admin?tab=share`);
	const facts = shareTab(page).locator('[data-share-facts]');
	await facts.getByRole('checkbox', { name: 'The pay I ask for' }).check();
	const amount = facts.getByRole('textbox', { name: 'Gross amount, in euros' });
	await expect(amount).toHaveValue('65000');

	// Written as the reply cannot carry it: said under the field, and left out of the reply
	await amount.fill('65,000');
	const problem = facts.getByText(
		'Write a whole number of euros, such as 65000: until then, the reply leaves the pay out.'
	);
	await expect(problem).toBeVisible();
	await expect(amount).toHaveAttribute('aria-invalid', 'true');
	await expect(amount).toHaveAccessibleDescription(/^Write a whole number of euros/);
	await expect(reply(page)).not.toHaveValue(/Pay:/);
	await amount.fill('65 000');
	await expect(problem).toHaveCount(0);
	await expect(amount).not.toHaveAttribute('aria-invalid');
	await expect(reply(page)).toHaveValue(/- Pay: at least €65,000 gross a year/);

	// The Perfect job tab saved other places meanwhile: once the tab was shown again, the next
	// fact ticked is filled in from them, and what was filled in before stays the owner's
	perfectJob = {
		...PERFECT_JOB,
		criteria: {
			...PERFECT_JOB.criteria,
			pay: { ...PERFECT_JOB.criteria.pay, perYear: 80000 },
			cities: { importance: 3, places: ['Marseille'] }
		}
	};
	await showShareAgain(page);
	await facts.getByRole('checkbox', { name: 'Where' }).check();
	await expect(facts.getByRole('textbox', { name: 'Where' })).toHaveValue('Marseille');
	await expect(amount).toHaveValue('65 000');
});

test('"Get started" leads to the Share tab from its link item', async ({ page }) => {
	await openAsOwner(page);
	await gotoHydrated(page, `/${DOMAIN}/admin?tab=start`);
	await page
		.getByRole('tabpanel', { name: /^Get started/ })
		.getByRole('button', { name: 'Reply and LinkedIn texts' })
		.click();
	const share = page.getByRole('tab', { name: 'Share' });
	await expect(share).toHaveAttribute('aria-selected', 'true');
	await expect(share).toBeFocused();
	await expect(page).toHaveURL(new RegExp(`/${DOMAIN}/admin\\?tab=share$`));
	await expect(shareTab(page).getByRole('heading', { name: 'Share your link' })).toBeVisible();
});

test('on a phone, the Share tab and the owner’s note fit the screen, in French', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openAsOwner(page);
	/** Nothing runs past the screen's right edge: the page does not scroll sideways */
	const fitsScreen = () =>
		page.evaluate(() => {
			const scroller = document.getElementById('page')!;
			return (
				document.documentElement.scrollWidth <= window.innerWidth &&
				scroller.scrollWidth <= scroller.clientWidth
			);
		});
	const withinScreen = async (locator: Locator) => {
		const box = (await locator.boundingBox())!;
		expect(box.x, await locator.innerText()).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width, await locator.innerText()).toBeLessThanOrEqual(390);
	};

	await gotoHydrated(page, `/${DOMAIN}/admin?tab=share&lang=fr`);
	const tab = page.getByRole('tabpanel', { name: 'Partager' });
	await tab.getByRole('radio', { name: 'Français' }).check();
	// Every fact ticked, filled in from the perfect job: the longest reply
	for (const fact of ['pay', 'remoteDays', 'places', 'contracts']) {
		await tab.locator(`[data-fact="${fact}"]`).check();
	}
	await expect(tab.getByRole('textbox', { name: 'Où' })).toHaveValue('Paris, Lyon');
	await expect(tab.getByRole('textbox', { name: 'Votre réponse, en français' })).toHaveValue(
		/Contrat\s:\sCDI, Freelance/
	);
	expect(await fitsScreen()).toBe(true);
	for (const control of [
		tab.getByRole('button', { name: 'Copier votre lien' }),
		tab.getByRole('textbox', { name: 'Montant brut, en euros' }),
		tab.getByRole('combobox', { name: 'Par', exact: true }),
		tab.getByRole('textbox', { name: 'Votre réponse, en français' }),
		tab.getByRole('button', { name: 'Copier la réponse' }),
		tab.getByRole('button', { name: 'Copier le texte' })
	]) {
		await control.scrollIntoViewIfNeeded();
		await expect(control).toBeInViewport();
		await withinScreen(control);
	}

	await gotoHydrated(page, `/${DOMAIN}/hire?lang=fr`);
	const note = page.locator('[data-owner-note]');
	await expect(note).toBeVisible();
	expect(await fitsScreen()).toBe(true);
	for (const part of [
		note,
		note.getByRole('textbox'),
		note.getByRole('button', { name: 'Copier votre lien' }),
		note.getByRole('link', { name: 'Plus de façons de partager' })
	]) {
		await withinScreen(part);
	}
});

test('the page for recruiters is named in the HTML the server sends, in both languages', async ({
	request
}) => {
	// No script runs: what a link preview, a crawler or a browser without JavaScript reads
	/** French texts keep their non-breaking spaces (before ":"): compared as spaces */
	const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');
	const text = (html: string) =>
		plain(
			html
				.replace(/<!--[\s\S]*?-->/g, '')
				.replace(/<[^>]+>/g, '')
				.trim()
		);
	// The description says the steps of the journey the server rendered: the seeded meeting alone
	for (const { path, title, description } of [
		{
			path: `/${DOMAIN}/hire`,
			title: `Propose a role to ${DOMAIN}`,
			description: `Propose a role to ${DOMAIN} on their page for recruiters: book a meeting, in about 2 minutes.`
		},
		{
			path: `/${DOMAIN}/hire?lang=fr`,
			title: `Proposer un poste à ${DOMAIN}`,
			description: `Proposez un poste à ${DOMAIN} sur sa page recruteurs : réserver un rendez-vous, en 2 minutes environ.`
		}
	]) {
		const response = await request.get(path);
		expect({ path, status: response.status() }).toEqual({ path, status: 200 });
		const html = await response.text();
		const titles = [...html.matchAll(/<title>([\s\S]*?)<\/title>/g)].map((match) => text(match[1]));
		expect({ path, titles }).toEqual({ path, titles: [title] });
		const descriptions = [...html.matchAll(/<meta name="description" content="([^"]*)"/g)].map(
			(match) => plain(match[1])
		);
		expect({ path, descriptions }).toEqual({ path, descriptions: [description] });
		// The page's heading (the header's is the portfolio's name)
		const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((match) =>
			text(match[1])
		);
		expect({ path, headings }).toEqual({ path, headings: [DOMAIN, title] });
	}
});

test('the page for recruiters gives its owner their link to copy', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await openAsOwner(page);
	await gotoHydrated(page, `/${DOMAIN}/hire`);
	await expect(page).toHaveTitle(`Propose a role to ${DOMAIN}`);
	await expect(
		page.getByRole('heading', { level: 1, name: `Propose a role to ${DOMAIN}` })
	).toBeVisible();
	// The seeded journey is the meeting alone: the owner's note shows above it too
	const note = page.locator('[data-owner-note]');
	await expect(note).toContainText('This is your page for recruiters, as they see it.');
	await note.getByRole('button', { name: 'Copy your link' }).click();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(LINK);
	await expect(note.getByRole('link', { name: 'More ways to share' })).toHaveAttribute(
		'href',
		`/${DOMAIN}/admin?tab=share`
	);
});
