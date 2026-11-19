import { expect, test, type Page } from '@playwright/test';
import { API_URL } from './support/owner.ts';

// The two languages of the site (docs/I18N.md): a page is rendered in what its URL asks for
// (`?lang=`), else the visitor's saved choice (the `lang` cookie), else what their browser
// prefers, else English. Runs against the CI seed (the 'louis.gentil' portfolio exists); the
// visitor is anonymous. The other test files read the English pages.

const languageCookie = async (page: Page) =>
	(await page.context().cookies()).find((cookie) => cookie.name === 'lang');

/** The link to the site's other language, in the page's footer or the portfolio's rail */
const languageSwitch = (page: Page) => page.locator('a[data-language-switch]');

test.describe('a visitor whose browser prefers French', () => {
	test.use({ locale: 'fr-FR' });

	test('gets the landing page in French, with its own share tags and no cookie', async ({
		page
	}) => {
		const response = await page.goto('/');

		expect(response?.status()).toBe(200);
		expect(response?.headers()['content-language']).toBe('fr');
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		await expect(page).toHaveTitle('Votre carrière, à vos conditions | Portfolio');
		await expect(
			page.getByRole('heading', {
				level: 2,
				name: "Votre carrière, à vos conditions. La rémunération d'abord. L'appel ensuite."
			})
		).toBeVisible();
		await expect(page.getByRole('heading', { level: 2, name: 'Envoyez votre lien' })).toBeVisible();
		await expect(
			page.getByRole('heading', { level: 2, name: 'Nos engagements envers vous' })
		).toBeVisible();
		// The range cap in French numbers, the law cited in the answer about paying
		await expect(
			page.getByRole('listitem').filter({
				has: page.getByRole('heading', { name: "La rémunération d'abord, si vous le demandez" })
			})
		).toContainText('elle est notée comme si son haut valait au plus 1,5 fois son bas');
		await expect(page.locator('details', { hasText: 'Devrai-je payer un jour' })).toContainText(
			'(article L5321-3 du code du travail)'
		);
		// The founder's two questions, answered in French
		await expect(
			page.locator('details', { hasText: 'Avoir un portfolio, est-ce chercher un emploi ?' })
		).toContainText(
			'le lien vers votre page recruteurs dit « Proposer un poste », jamais « Me recruter »'
		);
		await expect(
			page.locator('details', { hasText: "Comment Portfolio gagne-t-il de l'argent ?" })
		).toContainText('Jamais à vos frais : les candidats ne paient pas.');
		await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
			'content',
			"Votre carrière, à vos conditions. La rémunération d'abord, l'appel ensuite."
		);

		// Search engines find each language at its own address
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/\?lang=fr$/);
		await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
			'href',
			/\/$/
		);
		await expect(page.locator('link[rel="alternate"][hreflang="fr"]')).toHaveAttribute(
			'href',
			/\/\?lang=fr$/
		);
		await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
			'content',
			/\/og-image-fr\.png$/
		);
		expect((await page.request.get('/og-image-fr.png')).ok()).toBe(true);

		// Nobody chose: nothing is saved
		expect(await languageCookie(page)).toBeUndefined();
	});

	test("the landing page's French share tags are in the HTML the server sends", async ({
		browser
	}) => {
		// What a link preview reads, without the browser running anything
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto('/?lang=fr');
		await expect(page).toHaveTitle('Votre carrière, à vos conditions | Portfolio');
		await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
			'content',
			"Votre carrière, à vos conditions. La rémunération d'abord, l'appel ensuite."
		);
		await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
			'content',
			/^Votre carrière, à vos conditions\. La rémunération d'abord\. L'appel ensuite\./
		);
		await expect(page.getByRole('heading', { level: 2, name: 'Envoyez votre lien' })).toBeVisible();
		await expect(
			page.getByRole('heading', { level: 2, name: 'Nos engagements envers vous' })
		).toBeVisible();
		await context.close();
	});

	test('reads a portfolio and the recruiter page in French', async ({ page }) => {
		const languages: string[] = [];
		page.on('request', (request) => {
			if (request.url().startsWith(API_URL)) {
				languages.push(request.headers()['accept-language'] ?? '');
			}
		});

		await page.goto('/louis.gentil/experiences');
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		// A portfolio without a title is headed by its address name, which is not translated
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('louis.gentil');
		await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Informations légales' })).toBeVisible();

		// Rendered in the browser only: the page's script reads the language off <html lang>
		await page.goto('/recruiter');
		await expect(
			page.getByRole('heading', {
				level: 2,
				name: 'Voyez où un candidat a utilisé chaque compétence, et pendant combien de temps'
			})
		).toBeVisible();
		// The sign-in starts with the age and terms box, in French too
		await expect(page.getByRole('checkbox', { name: /au moins 16 ans/ })).toBeVisible();
		await expect(page.getByText('Cochez la case pour continuer')).toBeVisible();
		await expect(page.getByText(/^Gratuit pour les recruteurs aujourd'hui/)).toBeVisible();

		// The API is asked in the page's language, whatever the browser's own header says
		expect(languages.length).toBeGreaterThan(0);
		expect(new Set(languages)).toEqual(new Set(['fr']));
	});

	test('can switch to English, which is then kept', async ({ page }) => {
		await page.goto('/');
		await expect(languageSwitch(page)).toHaveText('English');

		await languageSwitch(page).click();
		await expect(page).toHaveURL(/\/\?lang=en$/);
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		await expect(page.getByRole('heading', { level: 2, name: 'Send your link' })).toBeVisible();
		expect((await languageCookie(page))?.value).toBe('en');

		// Without the parameter too: the choice wins over the browser's preference
		await page.goto('/legal/terms');
		await expect(page.locator('article[data-legal-document]')).toHaveAttribute('lang', 'en');
	});

	test('a language the site does not have falls back to the browser', async ({ page }) => {
		const response = await page.goto('/?lang=de');
		expect(response?.status()).toBe(200);
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		expect(await languageCookie(page)).toBeUndefined();
	});

	test('reads an address that matches no page in French', async ({ page }) => {
		// SvelteKit's own "Not Found", which it only has in English
		const response = await page.goto('/louis.gentil/nothing-here');
		expect(response?.status()).toBe(404);
		await expect(page).toHaveTitle('Introuvable');
		await expect(page.getByText('Page introuvable')).toBeVisible();
	});
});

test.describe('a visitor whose browser prefers English', () => {
	test('gets English, and French once they choose it', async ({ page }) => {
		const response = await page.goto('/');
		expect(response?.headers()['content-language']).toBe('en');
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		expect(await languageCookie(page)).toBeUndefined();
		await expect(languageSwitch(page)).toHaveText('Français');
		await expect(languageSwitch(page)).toHaveAttribute('lang', 'fr');

		await languageSwitch(page).click();
		await expect(page).toHaveURL(/\/\?lang=fr$/);
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		const cookie = await languageCookie(page);
		expect(cookie?.value).toBe('fr');
		// Not readable by the page's scripts, kept for a year
		expect(cookie?.httpOnly).toBe(true);
		expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000 + 360 * 24 * 60 * 60);

		// The rest of the site follows: a page opened in the app, then one loaded from the server
		await page.getByRole('navigation', { name: 'Site' }).getByRole('link').first().click();
		await expect(page).toHaveURL(/\/recruiter$/);
		await expect(
			page.getByRole('heading', {
				level: 2,
				name: 'Voyez où un candidat a utilisé chaque compétence, et pendant combien de temps'
			})
		).toBeVisible();
		await page.goto('/louis.gentil/experiences');
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
	});

	test("this site's own switch replaces a saved choice", async ({ page, context, baseURL }) => {
		await context.addCookies([{ name: 'lang', value: 'fr', url: baseURL! }]);
		await page.goto('/');
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		await expect(languageSwitch(page)).toHaveText('English');

		// A same-origin navigation (the link has data-sveltekit-reload)
		await languageSwitch(page).click();
		await expect(page).toHaveURL(/\/\?lang=en$/);
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		expect((await languageCookie(page))?.value).toBe('en');

		// Kept without the parameter
		await page.goto('/legal/terms');
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	});

	test('a portfolio address keeps the language it asks for', async ({ page }) => {
		await page.goto('/louis.gentil?lang=fr');
		await expect(page).toHaveURL(/\/louis\.gentil\/experiences\?lang=fr$/);
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
	});

	test('the switch keeps the page and what its address says', async ({ page }) => {
		await page.goto('/louis.gentil/experiences?view=timeline');
		// The rail holds the switch on a portfolio: its name is the other language's
		const toFrench = languageSwitch(page);
		await expect(toFrench).toHaveAttribute('aria-label', 'Français');
		await expect(toFrench).toHaveAttribute(
			'href',
			'/louis.gentil/experiences?view=timeline&lang=fr'
		);
	});

	test('a link from elsewhere is read in its language without replacing a saved choice', async ({
		page,
		context,
		baseURL
	}) => {
		await context.addCookies([{ name: 'lang', value: 'en', url: baseURL! }]);
		// A shared address, opened from another site
		await page.setExtraHTTPHeaders({ 'sec-fetch-site': 'cross-site' });
		await page.goto('/louis.gentil/experiences?lang=fr');
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		expect((await languageCookie(page))?.value).toBe('en');

		// The page's own data requests carry its address, `?lang=` included, from this site: they
		// are no choice either (invalidateAll sends one)
		const data = await page.request.get('/louis.gentil/experiences/__data.json?lang=fr', {
			headers: { 'sec-fetch-site': 'same-origin' }
		});
		expect(data.ok()).toBe(true);
		expect((await languageCookie(page))?.value).toBe('en');

		// A portfolio is not listed: it names no address of either language for search engines,
		// but its preview says which language the link shows
		await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
		await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
		await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'fr_FR');
	});

	test('a language the site does not have falls back to the browser, then English', async ({
		page
	}) => {
		const response = await page.goto('/?lang=de');
		expect(response?.status()).toBe(200);
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		expect(await languageCookie(page)).toBeUndefined();
	});
});
