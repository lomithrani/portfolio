import { expect, test, type Page } from '@playwright/test';
import { stubApi } from './support/api';
import {
	JWT_SECRET,
	blockGoogle,
	gotoHydrated,
	ownerSession,
	signIn,
	type OwnerSession
} from './support/owner';

// The owner's share kit: the account menu's "Share your link", the admin's Share tab (the link, the
// reply to a recruiter and the LinkedIn text, in English or in French whatever the page's
// language, what the owner asks for added only once ticked) and "Copy your link" on their page for
// recruiters. They sign in as the owner of 'e2e-share-kit' (seeded by `bun run --cwd server
// seed:e2e`, kept for these tests), and answer in the browser what the owner set up (GET
// /me/readiness) and their perfect job (GET /perfect-job): the portfolio stays as seeded.

const DOMAIN = 'e2e-share-kit';
const LINK = `http://localhost:4173/${DOMAIN}`;
const PAGE = `${LINK}/hire`;

test.skip(!JWT_SECRET, 'Set JWT_SECRET to the API’s secret to sign in as the e2e owner');

let session: OwnerSession;

test.beforeAll(async () => {
	session = await ownerSession(DOMAIN);
});

/** What the owner set up (GET /me/readiness): `gate`, the gate journey; else the meeting alone */
const readiness = (gate: boolean) => ({
	domain: DOMAIN,
	experiences: 2,
	perfectJob: {
		criteria: 4,
		essentials: { pay: true, workMode: true, place: true, contractTypes: true }
	},
	journey: gate
		? {
				saved: true,
				types: ['note', 'job', 'job-match', 'meeting'],
				blocked: false,
				gate: true,
				meeting: true
			}
		: { saved: false, types: ['meeting'], blocked: false, gate: false, meeting: true },
	calendar: { configured: true, connected: true, reconnect: false, enabledSchedules: 1 }
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

const openAsOwner = async (page: Page, { gate = true } = {}) => {
	await blockGoogle(page);
	await signIn(page, session);
	await stubApi(page, 'GET', '/me/readiness', () => ({ json: readiness(gate) }));
	return stubApi(page, 'GET', '/perfect-job', () => ({ json: PERFECT_JOB }));
};

const shareTab = (page: Page) => page.getByRole('tabpanel', { name: 'Share' });
const reply = (page: Page, language = 'English') =>
	shareTab(page).getByRole('textbox', { name: `Your reply, in ${language}` });

test('the account menu leads to the Share tab, which writes the reply and the LinkedIn text', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await openAsOwner(page);
	// Whatever is typed or ticked here, nothing leaves the page
	const sent: string[] = [];
	page.on('request', (request) => {
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

	expect(sent.filter((body) => /65000|70000|Lyon|freelance/i.test(body))).toEqual([]);
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
