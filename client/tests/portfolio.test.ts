import { expect, test, type Page } from '@playwright/test';

// Runs against the CI seed (server/tests/seedDb.ts): the domain 'louis.gentil' exists and has
// no experiences, and the visitor is anonymous.

const DOMAIN = 'louis.gentil';
// Same API as the web server under test (see playwright.config.ts)
const API_URL = process.env.PUBLIC_PORTFOLIO_API_URL ?? 'http://localhost:3000';

/**
 * Navigates and waits until the page has hydrated: the header asks the API whether the
 * visitor is logged in (GET /isLogged) right after mount, so once that response arrived every
 * onMount/$effect of the initial render has run.
 */
const gotoHydrated = async (page: Page, path: string) => {
	const isLogged = page.waitForResponse((response) => response.url().endsWith('/isLogged'));
	const response = await page.goto(path);
	await isLogged;
	return response;
};

test.describe('navigation', () => {
	test('the landing page redirects to the default portfolio', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveURL(new RegExp(`/${DOMAIN.replace('.', '\\.')}/experiences$`));
	});

	test('a domain root redirects to its experiences', async ({ page }) => {
		await page.goto(`/${DOMAIN}`);
		await expect(page).toHaveURL(new RegExp(`/${DOMAIN.replace('.', '\\.')}/experiences$`));
	});
});

test.describe('experiences page', () => {
	test('renders the portfolio for anonymous visitors', async ({ page }) => {
		const response = await gotoHydrated(page, `/${DOMAIN}/experiences`);

		expect(response?.status()).toBe(200);
		await expect(page).toHaveTitle('Louis Gentil | Resume');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect(page.getByText('No experiences have been published yet.')).toBeVisible();
		await expect(page.getByText('This domain is not yet claimed')).toHaveCount(0);
	});

	test('does not open the "Add Experience" dialog for anonymous visitors', async ({ page }) => {
		await gotoHydrated(page, `/${DOMAIN}/experiences`);

		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Add Experience' })).toHaveCount(0);
		await expect(page.locator(`a[href="/${DOMAIN}/admin"]`)).toHaveCount(0);
	});

	test('a stale local admin session (no auth cookie) never shows admin UI', async ({
		page,
		request
	}) => {
		// The persisted session claims to be the domain admin, but the browser has no auth cookie
		// (blocked, cleared, or the API secret rotated): the API must be asked before admin UI
		const domain = await (await request.get(`${API_URL}/domain/${DOMAIN}`)).json();
		const staleSession = {
			user: { _id: String(domain.admin) },
			expires: Math.floor(Date.now() / 1000) + 3600
		};
		await page.addInitScript((value) => {
			localStorage.setItem('authenticationStore', value);
		}, JSON.stringify(staleSession));

		await gotoHydrated(page, `/${DOMAIN}/experiences`);

		await expect
			.poll(() => page.evaluate(() => localStorage.getItem('authenticationStore')))
			.toBe('{}');
		await expect(page.getByRole('button', { name: 'Logout' })).toHaveCount(0);
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Add Experience' })).toHaveCount(0);
		await expect(page.locator(`a[href="/${DOMAIN}/admin"]`)).toHaveCount(0);
	});
});

test.describe('unknown paths', () => {
	test('an unknown but valid domain name returns 404 and offers the claim flow', async ({
		page
	}) => {
		const response = await page.goto('/e2e-unclaimed-domain');

		expect(response?.status()).toBe(404);
		await expect(page.getByText('This domain is not yet claimed.')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Claim this domain' })).toBeVisible();
	});

	test('scanner-like paths return a plain 404 without the claim flow', async ({ page }) => {
		for (const path of ['/wp-login.php', '/.env', '/admin']) {
			const response = await page.goto(path);

			expect(response?.status(), path).toBe(404);
			await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Claim this domain' })).toHaveCount(0);
		}
	});
});

test('the hire page renders inside the hydrated portfolio layout', async ({ page }) => {
	// gotoHydrated only resolves if the layout's JavaScript ran (csr is enabled)
	const response = await gotoHydrated(page, `/${DOMAIN}/hire`);

	expect(response?.status()).toBe(200);
	await expect(page.getByRole('heading', { name: 'Job description' })).toBeVisible();
});

test('/healthz answers 200 ok', async ({ request }) => {
	const response = await request.get('/healthz');

	expect(response.status()).toBe(200);
	expect(await response.text()).toBe('ok');
});
