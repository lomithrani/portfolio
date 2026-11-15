import { expect, test, type Page } from '@playwright/test';

// The legal pages (legal notice, privacy policy, terms of use, cookies), in English and in French
// (?lang=fr), and the legal links every page shows: the footer of the site's own pages, the
// compact links at the end of the portfolios and of the job pages. Runs against the CI seed (the
// 'louis.gentil' portfolio exists); the visitor is anonymous. The publisher's details come from
// the web server's LEGAL_* variables, which CI does not set: the pages then say so.

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The absolute URL of `path` on the site, as the server writes it: on the page's host, over http or
 * https (the production adapter-bun server says https unless ORIGIN or PROTOCOL_HEADER tells it
 * otherwise, as behind Railway's proxy; the dev server says http).
 */
const absoluteUrl = (page: Page, path: string): RegExp =>
	new RegExp(`^https?://${escapeRegExp(new URL(page.url()).host)}${escapeRegExp(path)}$`);

const PAGES = [
	{
		path: '/legal',
		en: 'Legal notice',
		fr: 'Mentions légales',
		firstSection: { en: 'Publisher', fr: 'Éditeur' }
	},
	{
		path: '/legal/privacy',
		en: 'Privacy policy',
		fr: 'Politique de confidentialité',
		firstSection: { en: 'In short', fr: 'En bref' }
	},
	{
		path: '/legal/terms',
		en: 'Terms of use',
		fr: "Conditions d'utilisation",
		firstSection: { en: 'About these terms', fr: 'À propos de ces conditions' }
	},
	{
		path: '/legal/cookies',
		en: 'Cookies and local storage',
		fr: 'Cookies et stockage local',
		firstSection: { en: 'In short', fr: 'En bref' }
	}
] as const;

const SITE_NAME = 'Portfolio';
const LAST_UPDATED = {
	en: /Last updated: \d{1,2} \w+ \d{4}/,
	// \s before the colon: French messages are read with an unbreakable space there
	fr: /Dernière mise à jour\s: \d{1,2} \S+ \d{4}/
};

/** Fails the test if the page asks Google for anything (the legal pages never load its sign-in) */
const forbidGoogle = (page: Page) => {
	const requests: string[] = [];
	page.on('request', (request) => {
		if (new URL(request.url()).hostname.endsWith('google.com')) requests.push(request.url());
	});
	return requests;
};

const legalNav = (page: Page) => page.getByRole('navigation', { name: 'Legal' });

test.describe('legal pages', () => {
	for (const doc of PAGES) {
		for (const lang of ['en', 'fr'] as const) {
			const url = lang === 'fr' ? `${doc.path}?lang=fr` : doc.path;

			test(`${url} renders the ${lang === 'fr' ? 'French' : 'English'} version`, async ({
				page
			}) => {
				const google = forbidGoogle(page);
				const response = await page.goto(url);

				expect(response?.status()).toBe(200);
				await expect(page).toHaveTitle(`${doc[lang]} | ${SITE_NAME}`);

				const article = page.locator('article[data-legal-document]');
				await expect(article).toHaveAttribute('lang', lang);
				await expect(article.getByRole('heading', { level: 2, name: doc[lang] })).toBeVisible();
				await expect(article.getByText(LAST_UPDATED[lang])).toBeVisible();
				await expect(
					article.getByRole('heading', { level: 3, name: doc.firstSection[lang], exact: true })
				).toBeVisible();

				// Search engines find both versions; each page names itself canonical
				await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
					'href',
					absoluteUrl(page, url)
				);
				await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
					'href',
					absoluteUrl(page, doc.path)
				);
				await expect(page.locator('link[rel="alternate"][hreflang="fr"]')).toHaveAttribute(
					'href',
					absoluteUrl(page, `${doc.path}?lang=fr`)
				);
				await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
					'href',
					absoluteUrl(page, doc.path)
				);

				// The current language is marked in the switch
				const switcher = page.getByRole('navigation', {
					name: lang === 'fr' ? 'Langue' : 'Language'
				});
				await expect(
					switcher.getByRole('link', { name: lang === 'fr' ? 'Français' : 'English' })
				).toHaveAttribute('aria-current', 'page');

				expect(google).toEqual([]);
			});
		}
	}

	test('the language switch goes to the French version and back', async ({ page }) => {
		await page.goto('/legal/privacy');
		const article = page.locator('article[data-legal-document]');

		await page
			.getByRole('navigation', { name: 'Language' })
			.getByRole('link', { name: 'Français' })
			.click();
		await expect(page).toHaveURL(/\/legal\/privacy\?lang=fr$/);
		await expect(article).toHaveAttribute('lang', 'fr');
		await expect(
			article.getByRole('heading', { level: 2, name: 'Politique de confidentialité' })
		).toBeVisible();
		await expect(page).toHaveTitle(`Politique de confidentialité | ${SITE_NAME}`);

		// The choice is saved: the whole page is French, and the bare address stays French
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		await page.goto('/legal/privacy');
		await expect(article).toHaveAttribute('lang', 'fr');

		// Back to English: asked for explicitly, since French is now the saved choice
		await article
			.getByRole('navigation', { name: 'Langue' })
			.getByRole('link', { name: 'English' })
			.click();
		await expect(page).toHaveURL(/\/legal\/privacy\?lang=en$/);
		await expect(article).toHaveAttribute('lang', 'en');
		await expect(article.getByRole('heading', { level: 2, name: 'Privacy policy' })).toBeVisible();
	});

	test('links between documents keep the language', async ({ page }) => {
		await page.goto('/legal/terms?lang=fr');
		await page
			.locator('article footer')
			.getByRole('link', { name: 'Cookies et stockage local' })
			.click();
		// No parameter needed: French is the site's language since the first page asked for it
		await expect(page).toHaveURL(/\/legal\/cookies$/);
		await expect(page.locator('article[data-legal-document="cookies"]')).toHaveAttribute(
			'lang',
			'fr'
		);
	});

	test('the French pages keep the site footer, links and header in French', async ({ page }) => {
		await page.goto('/legal/privacy?lang=fr');

		// The whole page is French, so nothing in it needs a language of its own
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		const nav = page.getByRole('navigation', { name: 'Informations légales' });
		await expect(nav.getByRole('link', { name: "Conditions d'utilisation" })).toBeVisible();
		await expect(
			page.getByRole('heading', { level: 1, name: 'Informations légales' })
		).toBeVisible();
		await expect(page.getByRole('banner').getByRole('link', { name: 'Accueil' })).toHaveAttribute(
			'href',
			'/'
		);
		// The site's links: in the footer only, no bar of links under the header
		await expect(page.locator('nav:not(header nav, main nav)')).toHaveCount(0);
		await expect(page.getByRole('navigation', { name: 'Site' })).toHaveCount(1);
		const site = page.locator('main > footer').getByRole('navigation', { name: 'Site' });
		await expect(site.getByRole('link', { name: "Offres d'emploi" })).toHaveAttribute(
			'href',
			'/jobs'
		);
		await expect(site.getByRole('link', { name: 'Pour les recruteurs' })).toHaveAttribute(
			'href',
			'/recruiter'
		);

		await nav.getByRole('link', { name: 'Cookies et stockage local' }).click();
		await expect(page).toHaveURL(/\/legal\/cookies$/);
		await expect(page.locator('article[data-legal-document="cookies"]')).toHaveAttribute(
			'lang',
			'fr'
		);
	});

	test('an unknown language shows the English version', async ({ page }) => {
		const response = await page.goto('/legal/terms?lang=de');
		expect(response?.status()).toBe(200);
		await expect(page.locator('article[data-legal-document]')).toHaveAttribute('lang', 'en');
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
			'href',
			absoluteUrl(page, '/legal/terms')
		);
	});

	test('the table of contents links to each section', async ({ page }) => {
		await page.goto('/legal/privacy');
		const toc = page.getByRole('navigation', { name: 'Contents' });
		await expect(toc.getByRole('listitem')).toHaveCount(16);

		await toc.getByRole('link', { name: 'Your rights' }).click();
		await expect(page).toHaveURL(/#rights$/);
		await expect(page.getByRole('heading', { level: 3, name: 'Your rights' })).toBeInViewport();
	});

	test('the legal notice names the host, and the publisher only as configured', async ({
		page
	}) => {
		await page.goto('/legal');
		await expect(page.getByText('Railway Corporation')).toBeVisible();
		await expect(
			page.getByText('548 Market St PMB 68956, San Francisco, CA 94104, USA')
		).toBeVisible();

		// Either the publisher's contact address (LEGAL_CONTACT_EMAIL) or the notice that the
		// details are not configured: never both, never a made-up identity
		const notConfigured = page.getByText('Publisher details are not configured yet.');
		const contact = page.locator('#publisher ~ dl a[href^="mailto:"]:not([href*="railway.com"])');
		const configured = (await notConfigured.count()) === 0;
		if (configured) {
			await expect(contact).toBeVisible();
		} else {
			await expect(notConfigured).toBeVisible();
			await expect(page.locator('a[href^="mailto:"]:not([href*="railway.com"])')).toHaveCount(0);
		}
	});

	test('the privacy policy carries the Google Limited Use statement', async ({ page }) => {
		await page.goto('/legal/privacy');
		await expect(
			page.getByText(
				`${SITE_NAME}'s use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.`
			)
		).toBeVisible();
		await expect(
			page.getByRole('link', { name: 'Google API Services User Data Policy' })
		).toHaveAttribute('href', 'https://developers.google.com/terms/api-services-user-data-policy');
	});
});

test.describe('legal links', () => {
	const COMPACT = ['Legal notice', 'Privacy', 'Terms', 'Cookies'];

	test('the home page footer links the four documents', async ({ page }) => {
		await page.goto('/');
		const nav = legalNav(page);
		for (const name of [
			'Legal notice',
			'Privacy policy',
			'Terms of use',
			'Cookies and local storage'
		]) {
			await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
		}
		await nav.getByRole('link', { name: 'Privacy policy', exact: true }).click();
		await expect(page).toHaveURL(/\/legal\/privacy$/);
		await expect(legalNav(page).getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
			'aria-current',
			'page'
		);
	});

	test('a portfolio links the legal pages at the end of the page', async ({ page }) => {
		await page.goto('/louis.gentil/experiences');
		const nav = legalNav(page);
		for (const name of COMPACT) {
			await expect(nav.getByRole('link', { name, exact: true })).toBeAttached();
		}
		await nav.getByRole('link', { name: 'Privacy', exact: true }).click();
		await expect(page).toHaveURL(/\/legal\/privacy$/);
		await expect(page.getByRole('heading', { level: 2, name: 'Privacy policy' })).toBeVisible();
	});

	test('the job pages link the legal pages at the end of the page', async ({ page }) => {
		await page.goto('/jobs');
		const nav = legalNav(page);
		for (const name of COMPACT) {
			await expect(nav.getByRole('link', { name, exact: true })).toBeAttached();
		}
		await nav.getByRole('link', { name: 'Terms', exact: true }).click();
		await expect(page).toHaveURL(/\/legal\/terms$/);
		await expect(page.getByRole('heading', { level: 2, name: 'Terms of use' })).toBeVisible();
	});

	test('the compact links fit a phone screen', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/louis.gentil/experiences');
		const nav = legalNav(page);
		await nav.scrollIntoViewIfNeeded();
		for (const name of COMPACT) {
			await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
		}
		const overflows = await page
			.locator('main')
			.evaluate((main) => main.scrollWidth > main.clientWidth);
		expect(overflows).toBe(false);
	});
});
