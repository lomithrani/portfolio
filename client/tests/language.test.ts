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
		await expect(page).toHaveTitle('Votre portfolio trie les offres pour vous | Portfolio');
		await expect(
			page.getByRole('heading', {
				level: 2,
				name: 'Votre portfolio, à votre image. Fini les appels pour le mauvais poste.'
			})
		).toBeVisible();
		await expect(
			page.getByRole('heading', { level: 2, name: "D'abord le bon poste, ensuite l'appel" })
		).toBeVisible();

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

	test('reads a portfolio, the job board and the recruiter page in French', async ({ page }) => {
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

		await page.goto('/jobs');
		await expect(page.getByRole('heading', { level: 2, name: 'Offres ouvertes' })).toBeVisible();
		await expect(page.getByRole('heading', { level: 1, name: "Offres d'emploi" })).toBeVisible();

		// Rendered in the browser only: the page's script reads the language off <html lang>
		await page.goto('/recruiter');
		await expect(
			page.getByRole('heading', {
				level: 2,
				name: 'Trouvez des talents qui ont exactement les compétences recherchées'
			})
		).toBeVisible();
		await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();

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
		await expect(
			page.getByRole('heading', { level: 2, name: 'First the match, then the call' })
		).toBeVisible();
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
		await expect(page).toHaveURL(/\/jobs$/);
		await expect(page.getByRole('heading', { level: 2, name: 'Offres ouvertes' })).toBeVisible();
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
		await page.goto('/jobs');
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
		await page.goto('/jobs?lang=fr');
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		expect((await languageCookie(page))?.value).toBe('en');

		// The page's own data requests carry its address, `?lang=` included, from this site: they
		// are no choice either (invalidateAll sends one)
		const data = await page.request.get('/jobs/__data.json?lang=fr', {
			headers: { 'sec-fetch-site': 'same-origin' }
		});
		expect(data.ok()).toBe(true);
		expect((await languageCookie(page))?.value).toBe('en');

		// The job pages tell search engines where each language is
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/jobs\?lang=fr$/);
		await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
			'href',
			/\/jobs$/
		);
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
