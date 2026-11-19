import { expect, test, type Page } from '@playwright/test';
import { LEGAL_VERSION, legalMessages } from 'portfolio-common';
import {
	E2E_CANDIDATE_ID as CANDIDATE_ID,
	JWT_SECRET,
	gotoHydrated,
	ownerSession,
	signIn
} from './support/owner';
import { stubApi } from './support/api';
import { stubGoogle } from './support/google';

// The landing page (/) and its onboarding card. Google is never reached: its script is stubbed
// (a fake "Sign in with Google" button that hands a fake credential to the page). The steps of a
// signed-in candidate stub the session (GET /isLogged) and every call that would change an account
// (POST /login, POST /domain/claim, PUT /me/mode): nothing is claimed for real. The availability
// of the names typed is asked to the real API (public, read-only). The owner's steps 3 and 4 and
// the `?import=1` link use the real session of the 'e2e-owner' domain (seed:e2e), with the résumé
// import stubbed (Claude is never called) and what the owner set up (GET /me/readiness) answered
// in the browser: experiences-owner.test.ts changes that domain's experiences meanwhile.

/** The stubbed candidate without a portfolio is the e2e candidate of seed:e2e (CANDIDATE_ID) */
const CANDIDATE_EMAIL = 'e2e.candidate@example.com';

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

type Readiness = {
	domain: string | null;
	experiences: number;
	perfectJob: {
		criteria: number;
		essentials: Record<'pay' | 'workMode' | 'place' | 'contractTypes', boolean>;
	};
	journey: { saved: boolean; types: string[]; blocked: boolean; gate: boolean; meeting: boolean };
	calendar: {
		configured: boolean;
		connected: boolean;
		reconnect: boolean;
		enabledSchedules: number;
	};
};

/** What a portfolio just claimed has set up (GET /me/readiness): nothing */
const newReadiness = (domain: string | null): Readiness => ({
	domain,
	experiences: 0,
	perfectJob: {
		criteria: 0,
		essentials: { pay: false, workMode: false, place: false, contractTypes: false }
	},
	journey: { saved: false, types: ['meeting'], blocked: false, gate: false, meeting: true },
	calendar: { configured: true, connected: false, reconnect: false, enabledSchedules: 0 }
});

/** Everything set up: the gate journey, the pay rated, a calendar to book in */
const readyReadiness = (domain: string): Readiness => ({
	domain,
	experiences: 2,
	perfectJob: {
		criteria: 4,
		essentials: { pay: true, workMode: true, place: true, contractTypes: true }
	},
	journey: {
		saved: true,
		types: ['note', 'job', 'job-match', 'meeting'],
		blocked: false,
		gate: true,
		meeting: true
	},
	calendar: { configured: true, connected: true, reconnect: false, enabledSchedules: 1 }
});

/** GET /me/readiness answered with `readiness` (given the requests answered before) */
const stubReadiness = (page: Page, readiness: (index: number) => Readiness) =>
	stubApi(page, 'GET', '/me/readiness', (_request, index) => ({ json: readiness(index) }));

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

	test('its claims hold for a new portfolio, whose journey is the meeting alone', async ({
		page
	}) => {
		await stubGoogle(page);
		await page.goto('/');
		// A job is scored only once the owner adds the job and match steps (DEFAULT_WORKFLOW_STEPS)
		await expect(page.locator('meta[name="description"]')).toHaveAttribute(
			'content',
			/Add the job and match steps, and the job they bring is scored against what you want before they can book a meeting with you\.$/
		);
		const answer = (question: string) => page.locator('details', { hasText: question });
		await expect(answer('Who can see my portfolio?')).toContainText(
			'Your email address is not shown on it, but someone who books a meeting with you sees it in the invitation.'
		);
		await expect(answer('What do recruiters see of what I am looking for?')).toContainText(
			'A recruiter who tries several jobs could still guess part of it from the scores.'
		);
		await expect(answer('Can I delete my account?')).toContainText(
			'the step suggestions and feedback already on GitHub (which do not name you), stay'
		);
		await expect(page.getByText("Pick the name in your portfolio's link.")).toContainText(
			'It stays yours as long as you keep your account and follow the terms.'
		);
	});

	test('the footer leads to the recruiter space and holds the light/dark switch; the logo leads back', async ({
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
		// The job board is gone: no link to it
		await expect(page.getByRole('link', { name: 'Browse jobs' })).toHaveCount(0);
		await expect(page.locator('a[href="/jobs"]')).toHaveCount(0);

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

		// The recruiter space: no bar either, the switch next to the legal links, the logo back to here
		await site.getByRole('link', { name: 'For recruiters' }).click();
		await expect(page).toHaveURL(/\/recruiter$/);
		await expect(
			page.getByRole('heading', {
				level: 2,
				name: 'See where a candidate used each skill, and for how long'
			})
		).toBeVisible();
		await expect(outsidePage).toHaveCount(0);
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
		const readinessReads = await stubReadiness(page, () => newReadiness(name));
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
		// The portfolio claimed has no experience yet: step 3 is where its setup says it is
		expect(readinessReads.length).toBeGreaterThan(0);
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
		await stubReadiness(page, () => newReadiness(name));

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
		await stubReadiness(page, () => newReadiness('e2e-owner'));

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

	test('an owner with experiences sets their terms, and copies their link', async ({
		page,
		context
	}) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await stubGoogle(page);
		await signIn(page, await ownerSession('e2e-owner'));
		await stubImportStatus(page, { enabled: true, remaining: 2 });
		// Two experiences and the pay rated: the journey and the calendar are left
		const started = newReadiness('e2e-owner');
		started.experiences = 2;
		started.perfectJob = {
			criteria: 1,
			essentials: { ...started.perfectJob.essentials, pay: true }
		};
		await stubReadiness(page, () => started);

		await gotoHydrated(page, '/');
		const steps = card(page).getByRole('list', { name: 'Steps' }).getByRole('listitem');
		await expect(steps).toHaveCount(4);
		await expect(currentStep(page)).toContainText('Set your terms');
		await expect(steps.nth(2)).toHaveAttribute('data-step-state', 'done');
		await expect(steps.nth(2)).toContainText('2 experiences on your portfolio.');
		await expect(card(page).getByRole('link', { name: 'Set my terms' })).toHaveAttribute(
			'href',
			'/e2e-owner/admin?tab=start'
		);
		await expect(currentStep(page)).toContainText('1 of 3 set');

		const link = 'http://localhost:4173/e2e-owner';
		await expect(currentStep(page).getByRole('textbox', { name: 'Your link' })).toHaveValue(link);
		await currentStep(page).getByRole('button', { name: 'Copy your link' }).click();
		await expect(currentStep(page).getByRole('button', { name: 'Link copied' })).toBeVisible();
		await expect(
			currentStep(page).getByText('Link copied: localhost:4173/e2e-owner')
		).toBeAttached();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
	});

	test('once every step is done, the link is ready', async ({ page }) => {
		await stubGoogle(page);
		await signIn(page, await ownerSession('e2e-owner'));
		await stubImportStatus(page, { enabled: true, remaining: 2 });
		await stubReadiness(page, () => readyReadiness('e2e-owner'));

		await gotoHydrated(page, '/');
		await expect(card(page).getByRole('heading', { name: 'Your link is ready' })).toBeVisible();
		await expect(currentStep(page)).toHaveCount(0);
		await expect(card(page).locator('[data-step-state="done"]')).toHaveCount(4);
		await expect(
			card(page).getByText('Send your link to the next recruiter who writes to you.')
		).toBeVisible();
		await expect(card(page).getByRole('textbox', { name: 'Your link' })).toHaveValue(
			'http://localhost:4173/e2e-owner'
		);
		await expect(card(page).getByRole('link', { name: 'Review my settings' })).toHaveAttribute(
			'href',
			'/e2e-owner/admin?tab=start'
		);
	});

	test('a setup that cannot be read leaves the owner at step 3', async ({ page }) => {
		await stubGoogle(page);
		await signIn(page, await ownerSession('e2e-owner'));
		await stubImportStatus(page, { enabled: true, remaining: 2 });
		await stubApi(page, 'GET', '/me/readiness', () => ({ status: 500, text: 'Internal error' }));

		await gotoHydrated(page, '/');
		await expect(currentStep(page)).toContainText('Add your résumé');
		// Still signed in: the card says so, and offers the import
		await expect(card(page).getByRole('link', { name: 'Upload my résumé (PDF)' })).toBeVisible();
	});

	test('an expired session there does not sign the landing page out', async ({ page }) => {
		await stubGoogle(page);
		await signIn(page, await ownerSession('e2e-owner'));
		await stubImportStatus(page, { enabled: true, remaining: 2 });
		const reads = await stubApi(page, 'GET', '/me/readiness', () => ({
			status: 401,
			text: 'Unauthorized'
		}));

		await gotoHydrated(page, '/');
		await expect(currentStep(page)).toContainText('Add your résumé');
		expect(reads.length).toBeGreaterThan(0);
		// Still the owner's card: no sign-in step, the import offered
		await expect(card(page).getByRole('link', { name: 'Upload my résumé (PDF)' })).toBeVisible();
		await expect(
			card(page).getByRole('heading', { name: 'Your portfolio is online' })
		).toBeVisible();
		await expect(card(page).getByRole('checkbox')).toHaveCount(0);
		await expect(card(page).getByRole('button', { name: 'Sign in with Google' })).toHaveCount(0);
	});

	test('a browser that refuses to copy leaves the link selected, and says so', async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'clipboard', {
				configurable: true,
				value: {
					writeText: () => Promise.reject(new DOMException('Not allowed', 'NotAllowedError'))
				}
			});
		});
		await stubGoogle(page);
		await signIn(page, await ownerSession('e2e-owner'));
		await stubImportStatus(page, { enabled: true, remaining: 2 });
		const started = newReadiness('e2e-owner');
		started.experiences = 1;
		await stubReadiness(page, () => started);

		await gotoHydrated(page, '/');
		await expect(currentStep(page)).toContainText('Set your terms');
		const field = currentStep(page).getByRole('textbox', { name: 'Your link' });
		const link = 'http://localhost:4173/e2e-owner';
		await currentStep(page).getByRole('button', { name: 'Copy your link' }).click();

		const refused =
			'Your browser did not let the page copy it: the link is selected, copy it yourself.';
		await expect(currentStep(page).locator('p:not(.sr-only)', { hasText: refused })).toBeVisible();
		await expect(field).toBeFocused();
		await expect(field).toHaveAccessibleDescription(refused);
		expect(
			await field.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])
		).toEqual([0, link.length]);
		// Read out too (the live region), and the button does not say it was copied
		await expect(
			currentStep(page).locator('[aria-live="polite"]', { hasText: refused })
		).toBeAttached();
		await expect(currentStep(page).getByRole('button', { name: 'Link copied' })).toHaveCount(0);

		// On a phone the field and its button fit the card
		await page.setViewportSize({ width: 390, height: 844 });
		for (const control of [
			field,
			currentStep(page).getByRole('button', { name: 'Copy your link' })
		]) {
			const box = await control.boundingBox();
			expect(box && box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box)).toBe(true);
		}
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
		).toBe(true);
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
