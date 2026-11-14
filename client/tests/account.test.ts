import { expect, test, type Page, type Request, type Route } from '@playwright/test';
import { LEGAL_VERSION } from 'portfolio-common';
import {
	API_URL,
	JWT_SECRET,
	blockGoogle,
	gotoHydrated,
	ownerSession,
	signIn,
	signSession,
	toasts,
	type OwnerSession
} from './support/owner';

// The account page (/account): what the site keeps for the account, the terms it accepted, and
// deleting it. Signed in for real (a session JWT, see support/owner.ts) as the e2e candidate
// ('e2e.candidate@example.com': no portfolio, no acceptance of the terms) or as the owner of
// 'e2e-owner', both seeded by `bun run --cwd server seed:e2e`. Every request that would change an
// account (PUT /me/consent, DELETE /me) is answered in the browser: nothing is accepted or deleted
// for real, and the seeded accounts stay as they are. Google is never reached (deleting signs out
// of Google's automatic sign-in, which would load its script).

/** The e2e candidate of seed:e2e (server/tests/seedE2e.ts): its id is fixed */
const CANDIDATE_ID = '65e2e0000000000000000002';
const CANDIDATE_EMAIL = 'e2e.candidate@example.com';
const OWNER_DOMAIN = 'e2e-owner';

const candidateSession = async (): Promise<OwnerSession> => {
	const exp = Math.floor(Date.now() / 1000) + 3600;
	return { ownerId: CANDIDATE_ID, token: await signSession(CANDIDATE_ID, exp), exp };
};

/**
 * Answers `method path` of the API in the browser with `answer`, with the CORS headers the API
 * would send (the page and the API are on different origins); other methods go to the API.
 * Returns the requests answered.
 */
const stubApi = async (
	page: Page,
	method: string,
	path: string,
	answer: (request: Request) => {
		status?: number;
		json?: unknown;
		headers?: Record<string, string>;
	}
) => {
	const answered: Request[] = [];
	await page.route(`${API_URL}${path}`, async (route: Route) => {
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
					'access-control-allow-methods': 'GET, POST, PUT, DELETE',
					'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? ''
				}
			});
		}
		if (request.method() !== method) return route.fallback();
		answered.push(request);
		const { status = 200, json, headers = {} } = answer(request);
		return route.fulfill({
			status,
			headers: { ...cors, ...headers },
			...(json === undefined ? { body: '' } : { json })
		});
	});
	return answered;
};

const deleteDialog = (page: Page) =>
	page.getByRole('alertdialog', { name: 'Delete your account?' });
const deleteButton = (page: Page) => page.getByRole('button', { name: 'Delete my account' });

test.describe('account page, signed out', () => {
	test('asks to sign in, and asks nothing private', async ({ page }) => {
		const asked: string[] = [];
		page.on('request', (request) => {
			if (request.url().startsWith(API_URL)) asked.push(new URL(request.url()).pathname);
		});
		const response = await gotoHydrated(page, '/account');

		expect(response?.status()).toBe(200);
		await expect(page).toHaveTitle('Account & privacy | Portfolio');
		await expect(page.getByRole('heading', { name: 'Sign in to see your account' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Sign in as a candidate' })).toHaveAttribute(
			'href',
			'/#create'
		);
		await expect(page.getByRole('link', { name: 'Sign in as a recruiter' })).toHaveAttribute(
			'href',
			'/recruiter'
		);
		await expect(deleteButton(page)).toHaveCount(0);
		expect(asked.filter((path) => path.startsWith('/me'))).toEqual([]);
	});
});

test.describe('account page, signed in', () => {
	test.skip(!JWT_SECRET, 'Set JWT_SECRET to the API secret to sign in without Google');

	test('shows the account, its portfolio and the terms it has not accepted yet', async ({
		page
	}) => {
		await signIn(page, await candidateSession());
		await gotoHydrated(page, '/account');

		const details = page.locator('[data-account-details]');
		await expect(details.locator('[data-account-email]')).toHaveText(CANDIDATE_EMAIL);
		await expect(details.locator('[data-account-portfolio]')).toContainText('None yet.');
		await expect(details.getByRole('link', { name: 'Create your portfolio' })).toHaveAttribute(
			'href',
			'/#create'
		);
		await expect(page.locator('[data-terms-status="none"]')).toBeVisible();
		await expect(page.getByRole('checkbox', { name: /at least 16 years old/ })).not.toBeChecked();
		await expect(page.getByRole('link', { name: 'Privacy policy' }).first()).toBeVisible();
		await expect(page.locator('[data-danger-zone]')).toContainText('This cannot be undone.');
	});

	test('tells an owner whose portfolio predates the terms that it stays online', async ({
		page
	}) => {
		await signIn(page, await ownerSession(OWNER_DOMAIN));
		await gotoHydrated(page, '/account');

		const status = page.locator('[data-terms-status="none"]');
		await expect(status).toHaveText(
			'You have not accepted the current Terms of use yet. Accepting them records your confirmation for your portfolio.'
		);
		await expect(page.getByText('before you create a portfolio')).toHaveCount(0);
	});

	test('accepting the terms asks for the box, then records them (PUT /me/consent)', async ({
		page
	}) => {
		await signIn(page, await candidateSession());
		const accepted = await stubApi(page, 'PUT', '/me/consent', () => ({
			json: {
				user: { _id: CANDIDATE_ID, email: CANDIDATE_EMAIL, termsVersion: LEGAL_VERSION }
			}
		}));
		await gotoHydrated(page, '/account');

		const terms = page.locator('[data-terms-acceptance]');
		await terms.getByRole('button', { name: 'Accept the terms' }).click();
		await expect(
			terms.getByText('Tick the box to confirm your age and accept the terms.')
		).toBeVisible();
		await expect(terms.getByRole('checkbox')).toBeFocused();
		expect(accepted).toHaveLength(0);

		await terms.getByRole('checkbox', { name: /at least 16 years old/ }).check();
		await terms.getByRole('button', { name: 'Accept the terms' }).click();

		await expect(terms.locator('[data-terms-status="accepted"]')).toBeVisible();
		await expect(terms.locator('[data-terms-status="accepted"]')).toBeFocused();
		await expect(terms.getByRole('checkbox')).toHaveCount(0);
		await expect(toasts(page).getByText('Terms accepted', { exact: true })).toBeVisible();
		expect(accepted.map((request) => request.postDataJSON())).toEqual([
			{ termsVersion: LEGAL_VERSION, ageConfirmed: true, source: 'account' }
		]);
	});

	test('the account menu opens the account page', async ({ page }) => {
		await signIn(page, await candidateSession());
		await gotoHydrated(page, '/jobs');

		await page.getByRole('button', { name: /^Account menu/ }).click();
		await page.getByRole('menuitem', { name: 'Account & privacy' }).click();
		await expect(page).toHaveURL(/\/account$/);
		await expect(page.locator('[data-account-email]')).toHaveText(CANDIDATE_EMAIL);
	});
});

test.describe('deleting the account', () => {
	test.skip(!JWT_SECRET, 'Set JWT_SECRET to the API secret to sign in without Google');

	test('asks to type DELETE, deletes, signs out, removes the drafts and goes home', async ({
		page
	}) => {
		await blockGoogle(page);
		const session = await ownerSession(OWNER_DOMAIN);
		await signIn(page, session);
		const deletions = await stubApi(page, 'DELETE', '/me', () => ({
			status: 204,
			// As the API does: the session cookie is cleared
			headers: { 'set-cookie': 'auth=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict' }
		}));
		await gotoHydrated(page, '/account');
		await expect(page.locator('[data-account-portfolio]')).toContainText(`/${OWNER_DOMAIN}`);

		// This browser's drafts: the account's own go, another account's stay
		const id = session.ownerId;
		await page.evaluate((id) => {
			localStorage.setItem(`experienceDraft:${id}:new`, '{}');
			localStorage.setItem(`resumeImport:${id}:e2e-owner`, '{}');
			localStorage.setItem(`jobImportDraft:${id}`, '{}');
			localStorage.setItem('experienceDraft:someone-else:new', '{}');
		}, id);

		await deleteButton(page).click();
		const dialog = deleteDialog(page);
		await expect(dialog).toBeVisible();
		await expect(dialog.locator('[data-deleted-items]')).toContainText(
			`/${OWNER_DOMAIN}, its experiences and projects`
		);
		await expect(dialog.getByText('The address becomes available to others.')).toBeVisible();
		await expect(
			dialog.getByText(
				'If you connected Google Calendar, its tokens are deleted and Google is asked to revoke its access.'
			)
		).toBeVisible();
		const confirmation = dialog.getByLabel('Type DELETE to confirm');
		await expect(confirmation).toBeFocused();

		// Anything but DELETE deletes nothing
		await confirmation.fill('delete');
		// The button says it cannot be used yet; Enter in the field says why
		await expect(dialog.getByRole('button', { name: 'Delete my account' })).toBeDisabled();
		await confirmation.press('Enter');
		await expect(dialog.getByText('Type DELETE in capital letters to confirm.')).toBeVisible();
		await expect(confirmation).toHaveAttribute('aria-invalid', 'true');
		expect(deletions).toHaveLength(0);

		await confirmation.fill('DELETE');
		await dialog.getByRole('button', { name: 'Delete my account' }).click();

		await expect(page).toHaveURL(/\/$/);
		await expect(dialog).toHaveCount(0);
		await expect(toasts(page).getByText('Your account was deleted', { exact: true })).toBeVisible();
		expect(deletions.map((request) => request.postDataJSON())).toEqual([{ confirm: 'DELETE' }]);
		// Signed out
		expect(
			JSON.parse((await page.evaluate(() => localStorage.getItem('authenticationStore'))) ?? '{}')
				.user
		).toBeUndefined();
		await expect(page.getByRole('button', { name: /^Account menu/ })).toHaveCount(0);
		const keys = await page.evaluate(() => Object.keys(localStorage));
		expect(keys.filter((key) => key.includes(id))).toEqual([]);
		expect(keys).toContain('experienceDraft:someone-else:new');
	});

	test('a failure keeps the dialog open and says so; Escape closes it', async ({ page }) => {
		await blockGoogle(page);
		await signIn(page, await candidateSession());
		const deletions = await stubApi(page, 'DELETE', '/me', () => ({
			status: 500,
			json: { message: 'Internal Server Error' }
		}));
		await gotoHydrated(page, '/account');

		await deleteButton(page).click();
		const dialog = deleteDialog(page);
		// No portfolio: none is listed
		await expect(dialog.locator('[data-deleted-items]')).not.toContainText('Your portfolio');
		await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
		await dialog.getByRole('button', { name: 'Delete my account' }).click();

		await expect(dialog.getByRole('alert')).toHaveText('Could not delete your account. Try again.');
		await expect(dialog).toBeVisible();
		expect(deletions).toHaveLength(1);
		// Still signed in, on the account page
		await expect(page.locator('[data-account-email]')).toHaveText(CANDIDATE_EMAIL);

		await page.keyboard.press('Escape');
		await expect(dialog).toHaveCount(0);
		await expect(deleteButton(page)).toBeFocused();

		// Opened again, it starts afresh
		await deleteButton(page).click();
		await expect(deleteDialog(page).getByLabel('Type DELETE to confirm')).toHaveValue('');
		await expect(deleteDialog(page).getByRole('alert')).toHaveCount(0);
	});

	test('an expired session deletes nothing and asks to sign in again', async ({ page }) => {
		await blockGoogle(page);
		await signIn(page, await candidateSession());
		await stubApi(page, 'DELETE', '/me', () => ({
			status: 401,
			json: { message: 'Unauthorized' }
		}));
		await gotoHydrated(page, '/account');
		await page.evaluate((id) => localStorage.setItem(`jobImportDraft:${id}`, '{}'), CANDIDATE_ID);

		await deleteButton(page).click();
		const dialog = deleteDialog(page);
		await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
		await dialog.getByRole('button', { name: 'Delete my account' }).click();

		await expect(dialog).toHaveCount(0);
		await expect(
			toasts(page).getByText('Your session expired. Sign in again.', { exact: true })
		).toBeVisible();
		await expect(toasts(page).getByText('Sign in again to check your account.')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Sign in to see your account' })).toBeVisible();
		await expect(page).toHaveURL(/\/account$/);
		// Nothing was deleted: the drafts stay
		expect(
			await page.evaluate((id) => localStorage.getItem(`jobImportDraft:${id}`), CANDIDATE_ID)
		).toBe('{}');
	});

	test('a retry after a lost answer, refused because the account is gone, counts as deleted', async ({
		page
	}) => {
		await blockGoogle(page);
		await signIn(page, await candidateSession());
		// The first DELETE did delete the account, but its answer never came back
		let attempts = 0;
		await page.route(`${API_URL}/me`, async (route) => {
			const request = route.request();
			if (request.method() !== 'DELETE') return route.fallback();
			attempts += 1;
			if (attempts === 1) return route.abort('connectionreset');
			return route.fulfill({
				status: 401,
				body: 'Unauthorized: unknown user',
				headers: {
					'access-control-allow-origin': request.headers()['origin'] ?? '*',
					'access-control-allow-credentials': 'true'
				}
			});
		});
		await gotoHydrated(page, '/account');
		await page.evaluate((id) => localStorage.setItem(`jobImportDraft:${id}`, '{}'), CANDIDATE_ID);

		await deleteButton(page).click();
		const dialog = deleteDialog(page);
		await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
		await dialog.getByRole('button', { name: 'Delete my account' }).click();
		await expect(dialog.getByRole('alert')).toBeVisible();

		await dialog.getByRole('button', { name: 'Delete my account' }).click();

		await expect(toasts(page).getByText('Your account was deleted')).toBeVisible();
		await expect(page).toHaveURL(/\/$/);
		expect(attempts).toBe(2);
		expect(
			await page.evaluate((id) => localStorage.getItem(`jobImportDraft:${id}`), CANDIDATE_ID)
		).toBeNull();
	});

	test('leaving the page with the dialog open closes it without a Svelte warning', async ({
		page
	}) => {
		const warnings: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text());
		});
		await signIn(page, await candidateSession());
		await gotoHydrated(page, '/jobs');
		// Client-side navigation, so that going back unmounts the page with the dialog open
		await page.getByRole('button', { name: /^Account menu/ }).click();
		await page.getByRole('menuitem', { name: 'Account & privacy' }).click();
		await expect(page).toHaveURL(/\/account$/);

		await deleteButton(page).click();
		await expect(deleteDialog(page)).toBeVisible();
		await page.goBack();

		await expect(page).toHaveURL(/\/jobs$/);
		await expect(deleteDialog(page)).toHaveCount(0);
		expect(warnings.filter((text) => text.includes('derived_inert'))).toEqual([]);
	});
});
