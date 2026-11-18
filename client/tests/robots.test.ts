import { expect, test } from '@playwright/test';
import { API_URL } from './support/owner.ts';

// Search engines (client/src/lib/robots.ts): a portfolio's pages, the 404 of a name nobody
// claimed and the private pages answer with `x-robots-tag: noindex` and carry a robots meta (that
// 404 has the header alone); the landing page and the legal pages stay listed, with their
// canonical links; robots.txt refuses nothing, so crawlers and link previews can still fetch a
// portfolio; the API asks the same of every answer. Runs against the CI seed: the portfolio
// 'louis.gentil' exists; the visitor is anonymous.

const DOMAIN = 'louis.gentil';
// A valid name nobody claimed: the root error page offers to claim it
const UNCLAIMED = 'e2e-robots-nobody-claimed-this';

// A page's answer (page.goto) or a request's (request.get)
const robotsHeader = (response: { headers(): Record<string, string> } | null) =>
	response?.headers()['x-robots-tag'];

test.describe('a portfolio', () => {
	for (const path of [
		`/${DOMAIN}/experiences`,
		`/${DOMAIN}/experiences?view=timeline`,
		`/${DOMAIN}/hire`,
		`/${DOMAIN}/admin`
	]) {
		test(`${path} is not listed, but keeps its preview tags`, async ({ page, baseURL }) => {
			const response = await page.goto(path);

			expect(response?.status()).toBe(200);
			expect(robotsHeader(response)).toMatch(/\bnoindex\b/);
			await expect(page.locator('meta[name="robots"]')).toHaveCount(1);
			await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /\bnoindex\b/);
			// It names no address for search engines to list instead
			await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
			await expect(page.locator('link[rel="alternate"]')).toHaveCount(0);
			// A shared link still gets its preview: the page's address, without its states
			await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
				'content',
				`${baseURL}${new URL(path, baseURL).pathname}`
			);
			await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'en_GB');
		});
	}

	test('in French too, and its data requests', async ({ page, request, baseURL }) => {
		const response = await page.goto(`/${DOMAIN}/experiences?lang=fr`);
		expect(robotsHeader(response)).toMatch(/\bnoindex\b/);
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /\bnoindex\b/);
		await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
			'content',
			`${baseURL}/${DOMAIN}/experiences?lang=fr`
		);
		await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'fr_FR');

		// The whole portfolio, as the page loads it on a client-side navigation
		const data = await request.get(`/${DOMAIN}/experiences/__data.json`);
		expect(data.ok()).toBe(true);
		expect(robotsHeader(data)).toMatch(/\bnoindex\b/);
	});

	test('its bare address redirects to its experiences, not listed either', async ({ request }) => {
		const redirect = await request.get(`/${DOMAIN}`, { maxRedirects: 0 });
		expect(redirect.status()).toBe(302);
		expect(redirect.headers()['location']).toBe(`/${DOMAIN}/experiences`);
		expect(robotsHeader(redirect)).toMatch(/\bnoindex\b/);
	});

	test('the address of a name nobody claimed is not listed either', async ({ page, request }) => {
		// Rendered by the root error page, without the portfolio's layout (and its robots meta):
		// the header says it
		const response = await page.goto(`/${UNCLAIMED}/experiences`);
		expect(response?.status()).toBe(404);
		expect(robotsHeader(response)).toMatch(/\bnoindex\b/);
		await expect(page.getByRole('heading', { name: UNCLAIMED })).toBeVisible();

		// The bare name too (its layout answers before the page could redirect)
		const bare = await request.get(`/${UNCLAIMED}`, { maxRedirects: 0 });
		expect(bare.status()).toBe(404);
		expect(robotsHeader(bare)).toMatch(/\bnoindex\b/);
	});
});

test('the private pages are not listed', async ({ page }) => {
	for (const path of [
		'/account',
		'/recruiter/jobs/new',
		'/recruiter/jobs/65e2e00000000000000000aa'
	]) {
		const response = await page.goto(path);
		expect({ path, status: response?.status() }).toEqual({ path, status: 200 });
		expect({ path, robots: robotsHeader(response) }).toEqual({
			path,
			robots: expect.stringMatching(/\bnoindex\b/)
		});
		// The meta: in the server's HTML for /account, written once the page's script ran in the
		// recruiter space, which is rendered in the browser only. Its layout writes it with the
		// rest of its head, so the links below are checked on the page as it shows
		await expect(page.locator('meta[name="robots"]')).toHaveCount(1);
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /\bnoindex\b/);
		// It names no address for search engines to list instead
		await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
		await expect(page.locator('link[rel="alternate"]')).toHaveCount(0);
	}
});

test('the landing page and the legal pages stay listed, with their canonical links', async ({
	page
}) => {
	for (const path of ['/', '/?lang=fr', '/legal', '/legal/privacy', '/legal/terms', '/recruiter']) {
		const response = await page.goto(path);
		expect({ path, status: response?.status() }).toEqual({ path, status: 200 });
		expect({ path, robots: robotsHeader(response) }).toEqual({ path, robots: undefined });
		// The recruiter landing is rendered in the browser only: its canonical link, written with
		// its layout's head, says the page has shown before the meta is looked for
		await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
		await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
	}
});

test('robots.txt refuses nothing, so crawlers can read that a portfolio is not listed', async ({
	request
}) => {
	const response = await request.get('/robots.txt');
	expect(response.ok()).toBe(true);
	const rules = (await response.text())
		.split('\n')
		.map((line) => line.replace(/#.*/, '').trim())
		.filter(Boolean);
	expect(rules).toContain('User-agent: *');
	expect(rules.filter((rule) => /^disallow:/i.test(rule))).toEqual(['Disallow:']);
});

test('the API asks search engines not to list its answers', async ({ request }) => {
	for (const path of ['/health', `/domain/${DOMAIN}`, `/domain/${UNCLAIMED}`]) {
		const response = await request.get(`${API_URL}${path}`);
		expect({ path, robots: robotsHeader(response) }).toEqual({
			path,
			robots: expect.stringMatching(/\bnoindex\b/)
		});
	}
});
