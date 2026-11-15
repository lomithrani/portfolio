import { expect, test, type Page, type Request, type Route } from '@playwright/test';
import { LEGAL_VERSION, legalMessages } from 'portfolio-common';
import { API_URL, JWT_SECRET, gotoHydrated, ownerSession, signIn } from './support/owner';

// The landing page (/) and its onboarding card. Google is never reached: its script is stubbed
// (a fake "Sign in with Google" button that hands a fake credential to the page). The steps of a
// signed-in candidate stub the session (GET /isLogged) and every call that would change an account
// (POST /login, POST /domain/claim, PUT /me/mode): nothing is claimed for real. The availability
// of the names typed is asked to the real API (public, read-only). The owner's step 3 and the
// `?import=1` link use the real session of the 'e2e-owner' domain (seed:e2e), with the résumé
// import stubbed (Claude is never called).

/** Id of the stubbed candidate without a portfolio (the e2e candidate of seed:e2e) */
const CANDIDATE_ID = '65e2e0000000000000000002';
const CANDIDATE_EMAIL = 'e2e.candidate@example.com';

/** Google Identity Services: a button that signs in with a fake credential when clicked */
const GSI_STUB = `
window.google = { accounts: { id: {
	initialize(options) { window.__gsiCallback = options.callback; },
	renderButton(element) {
		const button = document.createElement('button');
		button.type = 'button';
		button.textContent = 'Stub Google sign-in';
		button.onclick = () => window.__gsiCallback && window.__gsiCallback({ credential: 'stub-credential' });
		element.replaceChildren(button);
	},
	prompt() {}, cancel() {}, disableAutoSelect() {}
} } };`;

/** Requests the page sent to Google's sign-in (the stubbed script included) */
const stubGoogle = async (page: Page) => {
	const requests: string[] = [];
	await page.route('https://accounts.google.com/**', (route) => {
		requests.push(route.request().url());
		return route.fulfill({ contentType: 'application/javascript', body: GSI_STUB });
	});
	return requests;
};

/**
 * Answers `method path` of the API in the browser with `answer`, with the CORS headers the API
 * would send (the page and the API are on different origins). Returns the requests answered.
 */
const stubApi = async (
	page: Page,
	method: string,
	path: string,
	answer: (
		request: Request
	) => { status?: number; json: unknown } | Promise<{ status?: number; json: unknown }>
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
		const { status = 200, json } = await answer(request);
		return route.fulfill({ status, json, headers: cors });
	});
	return answered;
};

const expires = () => Math.floor(Date.now() / 1000) + 3600;

/** The stubbed candidate, signed in (GET /isLogged), with `termsVersion` if given */
const stubCandidateSession = (page: Page, termsVersion?: string) =>
	stubApi(page, 'GET', '/isLogged', () => ({
		json: {
			logged: true,
			user: {
				_id: CANDIDATE_ID,
				email: CANDIDATE_EMAIL,
				...(termsVersion ? { termsVersion } : {})
			},
			expires: expires()
		}
	}));

const stubImportStatus = (page: Page, status: { enabled: boolean; remaining: number }) =>
	stubApi(page, 'GET', '/experiences/import', () => ({
		json: { limit: 3, resetsAt: null, ...status }
	}));

const card = (page: Page) => page.locator('#create');
const addressField = (page: Page) => page.getByLabel('Choose your address');
const preview = (page: Page) => page.getByTestId('address-preview');
const availability = (page: Page) => page.getByTestId('availability');
const currentStep = (page: Page) => card(page).locator('li[aria-current="step"]');

test.describe('landing page, signed out', () => {
	test('is rendered on the server with its share tags, and links to an example', async ({
		page
	}) => {
		await stubGoogle(page);
		const response = await gotoHydrated(page, '/');

		expect(response?.status()).toBe(200);
		await expect(page).toHaveTitle('Your portfolio screens jobs for you | Portfolio');
		await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
			'content',
			/\/og-image\.png$/
		);
		await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
			'content',
			'summary_large_image'
		);
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/$/);
		await expect(
			page.getByRole('heading', {
				level: 2,
				name: 'Your portfolio, your way. No more calls about the wrong job.'
			})
		).toBeVisible();
		await expect(
			page.getByRole('heading', { level: 2, name: 'First the match, then the call' })
		).toBeVisible();
		await expect(page.getByRole('link', { name: 'See an example' })).toHaveAttribute(
			'href',
			'/louis.gentil/experiences'
		);
		// The header offers no sign-in here: the card signs in after its checkbox
		await expect(page.getByRole('group', { name: 'Sign in' })).toHaveCount(0);
		await expect(currentStep(page)).toContainText('Sign in with Google');
	});

	test('the footer leads to the job pages and holds the light/dark switch; the logo leads back', async ({
		page
	}) => {
		await stubGoogle(page);
		await gotoHydrated(page, '/');

		// No bar of links under the header (no navigation between it and the scrolling page): the site's
		// links close the page
		const outsidePage = page.locator('nav:not(header nav, main nav)');
		await expect(outsidePage).toHaveCount(0);
		const site = page.getByRole('navigation', { name: 'Site' });
		await expect(site).toHaveCount(1);
		await expect(
			page.locator('main > footer').getByRole('navigation', { name: 'Site' })
		).toHaveCount(1);
		await expect(site.getByRole('link', { name: 'For recruiters' })).toHaveAttribute(
			'href',
			'/recruiter'
		);

		// The switch: one for the page, kept in this browser
		const html = page.locator('html');
		const dark = await html.evaluate((element) => element.classList.contains('dark'));
		await page
			.getByRole('button', { name: dark ? 'Switch to light mode' : 'Switch to dark mode' })
			.click();
		await expect(html).toHaveClass(dark ? /^(?!.*\bdark\b)/ : /\bdark\b/);
		expect(await page.evaluate(() => localStorage.getItem('portfolio-dark-mode'))).toBe(
			String(!dark)
		);

		// The job pages: no bar either, the switch next to the legal links, the logo back to here
		await site.getByRole('link', { name: 'Browse jobs' }).click();
		await expect(page).toHaveURL(/\/jobs$/);
		await expect(page.getByRole('heading', { level: 2, name: 'Open positions' })).toBeVisible();
		await expect(outsidePage).toHaveCount(0);
		await expect(page.getByRole('navigation', { name: 'Jobs' })).toHaveCount(0);
		await expect(
			page
				.locator('main > footer')
				.getByRole('button', { name: dark ? 'Switch to dark mode' : 'Switch to light mode' })
		).toBeVisible();
		await page.getByRole('banner').getByRole('link', { name: 'Home' }).click();
		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByRole('banner').getByRole('link', { name: 'Home' })).toHaveAttribute(
			'aria-current',
			'page'
		);
	});

	test('Google is loaded only once the age and terms box is ticked', async ({ page }) => {
		const google = await stubGoogle(page);
		await gotoHydrated(page, '/');

		const box = card(page).getByRole('checkbox', { name: /at least 16 years old/ });
		await expect(box).not.toBeChecked();
		await expect(card(page).getByText('Tick the box to continue')).toBeVisible();
		await expect(card(page).getByRole('link', { name: /Terms of use/ })).toHaveAttribute(
			'href',
			'/legal/terms'
		);
		// Typing and waiting asks nothing from Google either
		await addressField(page).fill('jane.doe');
		await page.waitForTimeout(500);
		expect(google).toEqual([]);

		await box.check();
		await expect(card(page).getByRole('button', { name: 'Stub Google sign-in' })).toBeVisible();
		expect(google.length).toBeGreaterThan(0);

		// Unticked, the button goes away
		await box.uncheck();
		await expect(card(page).getByRole('button', { name: 'Stub Google sign-in' })).toHaveCount(0);
		await expect(card(page).getByText('Tick the box to continue')).toBeVisible();
	});

	test('the address preview follows what is typed, with its availability', async ({ page }) => {
		await stubGoogle(page);
		await gotoHydrated(page, '/');
		const host = new URL(page.url()).host;

		await expect(preview(page)).toContainText(`${host}/jane.doe`);

		const free = `e2e-free-${Date.now().toString(36)}`;
		await addressField(page).fill(free.toUpperCase());
		// Shown as it would be claimed: lower case
		await expect(preview(page)).toContainText(`${host}/${free}`);
		await expect(availability(page)).toHaveText('Available');

		await addressField(page).fill('louis.gentil');
		await expect(availability(page)).toHaveText('Taken');
		await expect(
			card(page).getByText('This name is already taken. Choose another one.')
		).toBeVisible();
		await expect(addressField(page)).toHaveAttribute('aria-invalid', 'true');
		// The next step does not offer to reserve an address just reported as taken
		await expect(card(page).getByText('Reserve the address you choose above.')).toBeVisible();
		await expect(card(page).getByText(`Reserve ${host}/louis.gentil`)).toHaveCount(0);

		await addressField(page).fill('admin');
		await expect(availability(page)).toHaveText('Reserved');
		await expect(card(page).getByText('“admin” is reserved. Choose another name.')).toBeVisible();

		await addressField(page).fill('jane..doe');
		await expect(availability(page)).toHaveText('Not valid');
		await expect(card(page).getByText('Do not use two dots in a row.')).toBeVisible();

		await addressField(page).fill('');
		await expect(availability(page)).toHaveCount(0);
		await expect(preview(page)).toContainText(`${host}/jane.doe`);
	});

	test('"Create your portfolio" goes to the address field', async ({ page }) => {
		await stubGoogle(page);
		await gotoHydrated(page, '/');

		await page.getByRole('link', { name: 'Create your portfolio' }).first().click();
		await expect(addressField(page)).toBeFocused();
	});

	test('a demo loads and plays once it is on screen, and its button pauses it', async ({
		page
	}) => {
		await stubGoogle(page);
		const recordings: string[] = [];
		page.on('request', (request) => {
			if (/\/landing\/[^/]+\.(webm|mp4)$/.test(request.url())) recordings.push(request.url());
		});
		await gotoHydrated(page, '/');

		const demo = page.getByLabel(/^Recording: a recruiter/);
		const figure = page.locator('[data-demo]', { has: demo });
		await expect(demo).toHaveAttribute('poster', /\/landing\/demo-journey\.jpg$/);
		expect((await page.request.get('/landing/demo-journey.jpg')).ok()).toBe(true);
		// Under the hero: nothing is downloaded for it yet
		expect(recordings).toEqual([]);

		await demo.scrollIntoViewIfNeeded();
		await expect
			.poll(() =>
				demo.evaluate((video: HTMLVideoElement) => !video.paused && video.currentTime > 0)
			)
			.toBe(true);
		expect(recordings.some((url) => url.includes('/landing/demo-journey.'))).toBe(true);

		await figure.getByRole('button', { name: 'Pause the demo' }).click();
		await expect.poll(() => demo.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
		await expect(figure.getByRole('button', { name: 'Play the demo' })).toBeVisible();
	});

	test('with reduced motion a demo does not start by itself', async ({ page }) => {
		await stubGoogle(page);
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await gotoHydrated(page, '/');

		const demo = page.getByLabel(/^Recording: an experiences page/);
		const figure = page.locator('[data-demo]', { has: demo });
		await demo.scrollIntoViewIfNeeded();
		await expect(figure.getByRole('button', { name: 'Play the demo' })).toBeVisible();
		expect(await demo.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);

		await figure.getByRole('button', { name: 'Play the demo' }).click();
		// Clicking scrolled to the button: the recording plays while enough of it is on screen
		await demo.scrollIntoViewIfNeeded();
		await expect
			.poll(() =>
				demo.evaluate((video: HTMLVideoElement) => !video.paused && video.currentTime > 0)
			)
			.toBe(true);
	});
});

test.describe('landing page, candidate steps', () => {
	test('signing in sends the confirmation, keeps the address typed, then claims it', async ({
		page
	}) => {
		await stubGoogle(page);
		// Signed out on arrival; signed in once POST /login answered
		let signedIn = false;
		await stubApi(page, 'GET', '/isLogged', () => ({
			json: signedIn
				? {
						logged: true,
						user: { _id: CANDIDATE_ID, email: CANDIDATE_EMAIL, termsVersion: LEGAL_VERSION },
						expires: expires()
					}
				: { logged: false }
		}));
		const logins = await stubApi(page, 'POST', '/login', () => {
			signedIn = true;
			return {
				json: {
					user: { _id: CANDIDATE_ID, email: CANDIDATE_EMAIL, termsVersion: LEGAL_VERSION },
					expires: expires()
				}
			};
		});
		const name = `e2e-landing-${Date.now().toString(36)}`;
		const claims = await stubApi(page, 'POST', '/domain/claim', () => ({ json: { name } }));
		const modes = await stubApi(page, 'PUT', '/me/mode', () => ({
			json: {
				user: {
					_id: CANDIDATE_ID,
					email: CANDIDATE_EMAIL,
					termsVersion: LEGAL_VERSION,
					activeMode: 'candidate',
					domain: name
				}
			}
		}));
		await stubImportStatus(page, { enabled: true, remaining: 2 });

		await gotoHydrated(page, '/');
		await addressField(page).fill(name);
		await card(page)
			.getByRole('checkbox', { name: /at least 16 years old/ })
			.check();
		await card(page).getByRole('button', { name: 'Stub Google sign-in' }).click();

		await expect(currentStep(page)).toContainText('Claim your address');
		expect(logins).toHaveLength(1);
		expect(logins[0].postDataJSON()).toEqual({
			token: 'stub-credential',
			mode: 'candidate',
			consent: { termsVersion: LEGAL_VERSION, ageConfirmed: true }
		});
		await expect(card(page).getByText(`Signed in as ${CANDIDATE_EMAIL}.`)).toBeVisible();
		// What was typed before signing in is kept (not replaced by a suggestion)
		await expect(addressField(page)).toHaveValue(name);
		// The terms were accepted while signing in: no second checkbox
		await expect(card(page).getByRole('checkbox')).toHaveCount(0);

		await card(page).getByRole('button', { name: 'Claim this address' }).click();

		await expect(currentStep(page)).toContainText('Add your résumé');
		expect(claims.map((request) => request.postDataJSON())).toEqual([{ name }]);
		// The candidate space becomes the active one
		await expect.poll(() => modes.length).toBe(1);
		expect(modes[0].postDataJSON()).toEqual({ mode: 'candidate' });
		await expect(card(page).getByRole('link', { name: 'Upload my résumé (PDF)' })).toHaveAttribute(
			'href',
			`/${name}/experiences?import=1`
		);
		await expect(card(page).getByText('2 of 3 imports left this month')).toBeVisible();
		await expect(card(page).getByRole('link', { name: 'Open my portfolio' })).toHaveAttribute(
			'href',
			`/${name}/experiences`
		);
	});

	test('a sign-in refused for terms changed since the page loaded asks for a reload', async ({
		page
	}) => {
		await stubGoogle(page);
		await stubApi(page, 'GET', '/isLogged', () => ({ json: { logged: false } }));
		const logins = await stubApi(page, 'POST', '/login', () => ({
			status: 422,
			json: {
				type: 'validation',
				on: 'body',
				property: 'consent.termsVersion',
				message: legalMessages.staleTerms
			}
		}));

		await gotoHydrated(page, '/');
		// A returning owner is told this is also how to sign back in
		await expect(page.getByTestId('returning-owner')).toHaveText(
			'Already have your portfolio? Sign in the same way: you go straight to it.'
		);
		await card(page)
			.getByRole('checkbox', { name: /at least 16 years old/ })
			.check();
		await card(page).getByRole('button', { name: 'Stub Google sign-in' }).click();

		await expect(card(page).getByRole('alert')).toHaveText(legalMessages.staleTerms);
		expect(logins).toHaveLength(1);
		await expect(currentStep(page)).toContainText('Sign in with Google');
	});

	test('an account that has not accepted the terms ticks the box before claiming', async ({
		page
	}) => {
		await stubGoogle(page);
		await stubCandidateSession(page);
		const name = `e2e-landing-${Date.now().toString(36)}`;
		let taken = true;
		const claims = await stubApi(page, 'POST', '/domain/claim', () =>
			taken ? { status: 409, json: 'Domain already claimed' } : { json: { name } }
		);
		await stubApi(page, 'PUT', '/me/mode', () => ({
			json: { user: { _id: CANDIDATE_ID, email: CANDIDATE_EMAIL, domain: name } }
		}));
		await stubImportStatus(page, { enabled: false, remaining: 0 });

		await gotoHydrated(page, '/');
		await expect(currentStep(page)).toContainText('Claim your address');
		// Prefilled from the account's email
		await expect(addressField(page)).toHaveValue('e2e.candidate');

		await addressField(page).fill(name);
		await card(page).getByRole('button', { name: 'Claim this address' }).click();
		await expect(
			card(page).getByText('Confirm your age and accept the terms of use to create your portfolio.')
		).toBeVisible();
		expect(claims).toHaveLength(0);

		await card(page)
			.getByRole('checkbox', { name: /at least 16 years old/ })
			.check();
		await card(page).getByRole('button', { name: 'Claim this address' }).click();
		// Taken meanwhile: the field says so and takes the focus
		await expect(
			card(page).getByText('This name is already taken. Choose another one.')
		).toBeVisible();
		await expect(addressField(page)).toBeFocused();
		expect(claims[0].postDataJSON()).toEqual({
			name,
			consent: { termsVersion: LEGAL_VERSION, ageConfirmed: true }
		});

		taken = false;
		await card(page).getByRole('button', { name: 'Claim this address' }).click();
		await expect(currentStep(page)).toContainText('Add your résumé');
		// Without the résumé import: the experiences page, to add them by hand
		await expect(card(page).getByRole('link', { name: 'Upload my résumé (PDF)' })).toHaveCount(0);
		await expect(card(page).getByRole('link', { name: 'Add my experiences' })).toHaveAttribute(
			'href',
			`/${name}/experiences`
		);
	});
});

test.describe('landing page, portfolio owner', () => {
	test.skip(!JWT_SECRET, 'Set JWT_SECRET to the API’s secret to sign in as the e2e owner');

	test('an owner is at step 3, and the import link opens the résumé import', async ({ page }) => {
		await stubGoogle(page);
		const session = await ownerSession('e2e-owner');
		await signIn(page, session);
		await stubImportStatus(page, { enabled: true, remaining: 2 });

		await gotoHydrated(page, '/');
		await expect(currentStep(page)).toContainText('Add your résumé');
		await expect(
			card(page).getByRole('heading', { name: 'Your portfolio is online' })
		).toBeVisible();
		await expect(addressField(page)).toHaveCount(0);
		await expect(preview(page)).toContainText('/e2e-owner');
		await expect(page.getByRole('link', { name: 'Open my portfolio' }).first()).toHaveAttribute(
			'href',
			'/e2e-owner/experiences'
		);

		await card(page).getByRole('link', { name: 'Upload my résumé (PDF)' }).click();
		await expect(page.getByRole('dialog', { name: 'Import from résumé' })).toBeVisible();
		// The parameter is gone: reloading does not open the import again
		await expect(page).toHaveURL(/\/e2e-owner\/experiences$/);
		await gotoHydrated(page, '/e2e-owner/experiences');
		await expect(page.getByRole('button', { name: /Import (from )?résumé/ }).first()).toBeVisible();
		await expect(page.getByRole('dialog', { name: 'Import from résumé' })).toHaveCount(0);
	});

	test('`?import=1` without the import available only leaves the URL', async ({ page }) => {
		await stubGoogle(page);
		await signIn(page, await ownerSession('e2e-owner'));
		await stubImportStatus(page, { enabled: false, remaining: 0 });

		await gotoHydrated(page, '/e2e-owner/experiences?import=1');
		await expect(page).toHaveURL(/\/e2e-owner\/experiences$/);
		await expect(page.getByText('Résumé import is not available right now')).toBeVisible();
		await expect(page.getByRole('dialog', { name: 'Import from résumé' })).toHaveCount(0);
	});
});
