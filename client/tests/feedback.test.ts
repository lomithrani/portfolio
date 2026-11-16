import { expect, test, type Page, type Request, type Route } from '@playwright/test';
import {
	API_URL,
	JWT_SECRET,
	blockGoogle,
	gotoHydrated,
	signIn,
	signSession,
	type OwnerSession
} from './support/owner';

// "Send feedback" (components/feedback/): the dialog the account menu and the footers open, for a
// signed-in account. Signed in for real (a session JWT, see support/owner.ts) as the e2e candidate
// of seed:e2e (no portfolio: any account can send feedback). GET and POST /feedback are answered
// in the browser: nothing is filed, neither GitHub nor Claude is ever called.

/** The e2e candidate of seed:e2e (server/tests/seedE2e.ts): its id is fixed */
const CANDIDATE_ID = '65e2e0000000000000000002';

const candidateSession = async (): Promise<OwnerSession> => {
	const exp = Math.floor(Date.now() / 1000) + 3600;
	return { ownerId: CANDIDATE_ID, token: await signSession(CANDIDATE_ID, exp), exp };
};

type Answer = { status?: number; json?: unknown; body?: string; headers?: Record<string, string> };

/**
 * Answers `method /feedback` in the browser, with the CORS headers the API would send (the page
 * and the API are on different origins). Returns the requests answered
 */
const stubFeedback = async (page: Page, method: 'GET' | 'POST', answer: () => Answer) => {
	const answered: Request[] = [];
	await page.route(`${API_URL}/feedback`, async (route: Route) => {
		const request = route.request();
		const cors = {
			'access-control-allow-origin': request.headers()['origin'] ?? '*',
			'access-control-allow-credentials': 'true'
		};
		if (request.method() === 'OPTIONS') {
			return route.fulfill({
				status: 204,
				headers: {
					...cors,
					'access-control-allow-methods': 'GET, POST',
					'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? ''
				}
			});
		}
		if (request.method() !== method) return route.fallback();
		answered.push(request);
		const { status = 200, json, body, headers = {} } = answer();
		return route.fulfill({
			status,
			headers: { ...cors, ...headers },
			...(json === undefined ? { body: body ?? '' } : { json })
		});
	});
	return answered;
};

const enabled = (page: Page, classifies = true) =>
	stubFeedback(page, 'GET', () => ({ json: { enabled: true, classifies } }));

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Send feedback' });
const footerButton = (page: Page) =>
	page.locator('footer').getByRole('button', { name: 'Send feedback' });
const message = (page: Page) => dialog(page).getByRole('textbox', { name: 'Your message' });

test.beforeEach(async ({ page }) => {
	await blockGoogle(page);
});

test.describe('feedback, signed out', () => {
	test('offers nothing to send', async ({ page }) => {
		const asked = await enabled(page);
		await gotoHydrated(page, '/jobs');
		await expect(page.getByRole('link', { name: 'Privacy' }).first()).toBeVisible();
		await expect(footerButton(page)).toHaveCount(0);
		expect(asked).toHaveLength(0);
	});
});

test.describe('feedback, signed in', () => {
	test.skip(!JWT_SECRET, 'Set JWT_SECRET to the API secret to sign in without Google');

	test.beforeEach(async ({ page }) => {
		await signIn(page, await candidateSession());
	});

	test('hides the button while the server takes no feedback', async ({ page }) => {
		await stubFeedback(page, 'GET', () => ({ json: { enabled: false, classifies: false } }));
		await gotoHydrated(page, '/account');
		await expect(page.locator('[data-account-details]')).toBeVisible();
		await expect(footerButton(page)).toHaveCount(0);
		await page.locator('[data-account-menu]').click();
		await expect(page.getByRole('menuitem', { name: 'Log out' })).toBeVisible();
		await expect(page.getByRole('menuitem', { name: 'Send feedback' })).toHaveCount(0);
	});

	test('the footer opens the dialog, which checks the message, sends it and says what it became', async ({
		page
	}) => {
		await enabled(page);
		const sent = await stubFeedback(page, 'POST', () => ({
			json: {
				created: true,
				kind: 'bug',
				classified: true,
				issueUrl: 'https://github.com/lomithrani/portfolio/issues/321'
			}
		}));
		await gotoHydrated(page, '/account');

		await footerButton(page).click();
		await expect(dialog(page)).toBeVisible();
		await expect(message(page)).toBeFocused();
		await expect(dialog(page)).toContainText('published as a public issue on GitHub');
		await expect(dialog(page)).toContainText('Claude, an AI by Anthropic (US)');
		await expect(dialog(page).getByRole('link', { name: /privacy policy/ })).toHaveAttribute(
			'href',
			'/legal/privacy#data-feedback'
		);

		await message(page).fill('Broken');
		await dialog(page).getByRole('button', { name: 'Send' }).click();
		await expect(dialog(page)).toContainText('Write at least 10 characters');
		await expect(message(page)).toHaveAttribute('aria-invalid', 'true');
		expect(sent).toHaveLength(0);

		await message(page).fill('The Save button does nothing on my phone.');
		await dialog(page).getByRole('button', { name: 'Send' }).click();
		await expect(
			dialog(page).getByRole('heading', { name: 'Thanks for your feedback!' })
		).toBeFocused();
		await expect(dialog(page)).toContainText('We filed it as a bug report.');
		await expect(dialog(page).getByRole('link', { name: /See it on GitHub/ })).toHaveAttribute(
			'href',
			'https://github.com/lomithrani/portfolio/issues/321'
		);

		expect(sent).toHaveLength(1);
		const body = sent[0].postDataJSON();
		expect(body.message).toBe('The Save button does nothing on my phone.');
		// The route id, never the page's address
		expect(body.context.route).toBe('/(site)/account');
		expect(body.context.viewport.width).toBeGreaterThan(0);
		expect(['light', 'dark']).toContain(body.context.theme);

		await dialog(page).getByRole('button', { name: 'Close' }).last().click();
		await expect(dialog(page)).toHaveCount(0);
		await expect(footerButton(page)).toBeFocused();
		// A filed feedback makes room for the next one
		await footerButton(page).click();
		await expect(message(page)).toHaveValue('');
	});

	test('the account menu opens it too, without the Claude notice when nothing classifies', async ({
		page
	}) => {
		await enabled(page, false);
		await gotoHydrated(page, '/jobs');

		await page.locator('[data-account-menu]').click();
		await page.getByRole('menuitem', { name: 'Send feedback' }).click();
		await expect(dialog(page)).toBeVisible();
		await expect(dialog(page)).toContainText('without your name');
		await expect(dialog(page)).not.toContainText('Anthropic');

		await page.keyboard.press('Escape');
		await expect(dialog(page)).toHaveCount(0);
		await expect(page.locator('[data-account-menu]')).toBeFocused();
	});

	test("says the API's limit, and keeps the text when the session expired", async ({ page }) => {
		await enabled(page);
		let answer: Answer = {
			status: 429,
			body: 'You can send 5 feedbacks a day. Try again tomorrow.',
			headers: { 'retry-after': '3600' }
		};
		await stubFeedback(page, 'POST', () => answer);
		await gotoHydrated(page, '/jobs');

		await footerButton(page).click();
		await message(page).fill('I would like to add a photo to my portfolio.');
		await dialog(page).getByRole('button', { name: 'Send' }).click();
		await expect(dialog(page).getByRole('alert')).toHaveText(
			'You can send 5 feedbacks a day. Try again tomorrow.'
		);
		await expect(dialog(page).getByRole('alert')).toBeFocused();

		answer = { status: 401, body: 'Unauthorized' };
		await dialog(page).getByRole('button', { name: 'Send' }).click();
		await expect(dialog(page).getByRole('alert')).toContainText('Your session expired');
		await expect(message(page)).toHaveValue('I would like to add a photo to my portfolio.');

		// Closed without sending: what was typed is still there when it opens again
		await dialog(page).getByRole('button', { name: 'Cancel' }).click();
		await footerButton(page).click();
		await expect(message(page)).toHaveValue('I would like to add a photo to my portfolio.');
	});

	test('a portfolio has the button in its footer, and the dialog fits a phone', async ({
		page
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await enabled(page);
		await gotoHydrated(page, '/louis.gentil/experiences');

		await footerButton(page).scrollIntoViewIfNeeded();
		await footerButton(page).click();
		const box = await dialog(page).boundingBox();
		expect(box).not.toBeNull();
		expect(box!.x).toBeGreaterThanOrEqual(0);
		expect(box!.x + box!.width).toBeLessThanOrEqual(390);
		await expect(dialog(page).getByRole('button', { name: 'Send' })).toBeInViewport();
	});
});
