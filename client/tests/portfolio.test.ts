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

	test('going back with the claim dialog open closes it without a Svelte warning', async ({
		page
	}) => {
		// Opening the dialog loads Google Sign-In: stub it so the test does not depend on Google
		await page.route('https://accounts.google.com/**', (route) =>
			route.fulfill({
				contentType: 'application/javascript',
				body: 'window.google = { accounts: { id: { initialize() {}, renderButton() {}, prompt() {}, cancel() {}, disableAutoSelect() {} } } };'
			})
		);
		const warnings: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text());
		});

		await gotoHydrated(page, `/${DOMAIN}/experiences`);
		// Client-side navigation, so that going back unmounts the error page with the dialog open
		await page.evaluate(() => {
			(window as Window & { e2eSameDocument?: boolean }).e2eSameDocument = true;
			const link = document.createElement('a');
			link.href = '/e2e-unclaimed-domain';
			link.textContent = 'Unclaimed domain';
			document.body.append(link);
		});
		await page.getByRole('link', { name: 'Unclaimed domain' }).click();
		await page.getByRole('button', { name: 'Claim this domain' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();

		await page.goBack();
		await expect(page.getByText('No experiences have been published yet.')).toBeVisible();
		await expect(page.getByRole('dialog')).toHaveCount(0);
		// Still the same document: the dialog was torn down by Svelte, not by a page load
		expect(
			await page.evaluate(() => (window as Window & { e2eSameDocument?: boolean }).e2eSameDocument)
		).toBe(true);
		expect(warnings.filter((text) => text.includes('derived_inert'))).toEqual([]);
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

test('the hire page renders the booking view inside the hydrated portfolio layout', async ({
	page
}) => {
	// The page lists the owner's bookable schedules once mounted
	const schedules = page.waitForResponse((response) =>
		response.url().endsWith(`/appointments/domains/${DOMAIN}/schedules`)
	);
	// gotoHydrated only resolves if the layout's JavaScript ran (csr is enabled)
	const response = await gotoHydrated(page, `/${DOMAIN}/hire`);

	expect(response?.status()).toBe(200);
	expect((await schedules).status()).toBe(200);
	await expect(page.getByRole('heading', { name: /^Book a meeting with / })).toBeVisible();
	// The CI API has no Google Calendar (GOOGLE_CLIENT_SECRET unset): nothing is bookable
	await expect(page.getByText('Online booking is not available right now.')).toBeVisible();
});

test.describe('hire page calendar (appointment API stubbed in the browser)', () => {
	// The CI API has no Google Calendar: the browser's calls to the appointment routes are
	// answered here, with two meeting types on a Paris schedule
	const ZONE = 'Europe/Paris';
	const schedule = (id: string, title: string) => ({
		id: id.repeat(24),
		title,
		description: null,
		durationMinutes: 60,
		minNoticeHours: 24,
		maxAdvanceDays: 30,
		timezone: ZONE,
		locationType: 'google_meet',
		locationDetails: null,
		availability: [1, 0].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '12:00' }))
	});
	const INTRO = schedule('a', 'Intro call');
	const DEEP_DIVE = schedule('b', 'Deep dive');

	const addDays = (date: string, days: number) =>
		new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
	const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);
	const todayIn = (timezone: string) => {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).formatToParts(new Date());
		const part = (type: string) => parts.find((p) => p.type === type)?.value;
		return `${part('year')}-${part('month')}-${part('day')}`;
	};

	// Two bookable dates and, between them or next to them, one that is not; all in one month
	const first = todayIn(ZONE);
	const horizon = { first, last: addDays(first, 30) };
	const bookable = addDays(first, 2);
	const step = sameMonth(bookable, addDays(bookable, 2)) ? 1 : -1;
	const unbookable = addDays(bookable, step);
	const otherBookable = addDays(bookable, 2 * step);

	/**
	 * Answers the browser's calls to the appointment routes; returns the dates asked for slots.
	 * `paused`: a schedule listed at first, then paused: asked about, it answers 404 and leaves the list
	 */
	const stubAppointments = async (page: Page, { paused }: { paused?: string } = {}) => {
		let schedules = [INTRO, DEEP_DIVE];
		const slotRequests: string[] = [];
		await page.route(`${API_URL}/appointments/**`, async (route) => {
			const url = new URL(route.request().url());
			const cors = { 'access-control-allow-origin': '*' };
			const json = (body: unknown) => route.fulfill({ json: body, headers: cors });
			if (url.pathname === `/appointments/domains/${DOMAIN}/schedules`) return json(schedules);
			const scheduleId = url.searchParams.get('scheduleId');
			if (scheduleId === paused) {
				schedules = schedules.filter((s) => s.id !== paused);
				return route.fulfill({ status: 404, body: 'Schedule not found', headers: cors });
			}
			if (url.pathname === '/appointments/available-dates') {
				return json({ horizon, dates: [bookable, otherBookable].sort() });
			}
			if (url.pathname === '/appointments/available-slots') {
				const date = url.searchParams.get('date') ?? '';
				slotRequests.push(date);
				// 10:00 in Paris, summer or winter time alike: UTC+1 or +2
				return json([{ start: `${date}T08:00:00.000Z`, end: `${date}T09:00:00.000Z` }]);
			}
			return route.fulfill({ status: 404, body: 'Not stubbed', headers: cors });
		});
		return slotRequests;
	};

	const cell = (page: Page, date: string) =>
		page.locator(
			`[data-scope="date-picker"][data-part="table-cell-trigger"][data-value="${date}"]`
		);
	const selected = (page: Page) =>
		page.locator('[data-scope="date-picker"][data-part="table-cell-trigger"][data-selected]');

	test('greys out the dates without a free slot, which neither a click nor the keyboard picks', async ({
		page
	}) => {
		const slotRequests = await stubAppointments(page);
		await gotoHydrated(page, `/${DOMAIN}/hire`);
		await page.getByRole('button', { name: /Intro call/ }).click();

		await expect(cell(page, unbookable)).toHaveAttribute('aria-disabled', 'true');
		await expect(cell(page, unbookable)).toHaveAttribute('data-unavailable');
		await expect(cell(page, bookable)).not.toHaveAttribute('aria-disabled', 'true');
		await expect(cell(page, otherBookable)).not.toHaveAttribute('aria-disabled', 'true');

		// A click on a greyed-out date (dispatched: it takes no pointer events) picks nothing
		await cell(page, unbookable).dispatchEvent('click');
		await expect(selected(page)).toHaveCount(0);

		await cell(page, bookable).click();
		await expect(page.getByText('Times shown in your timezone')).toBeVisible();
		await expect(selected(page)).toHaveAttribute('data-value', bookable);

		// The arrow keys move the focus onto a greyed-out date: Enter and Space leave it unpicked
		const arrow = step === 1 ? 'ArrowRight' : 'ArrowLeft';
		await page.keyboard.press(arrow);
		await expect(cell(page, unbookable)).toBeFocused();
		await page.keyboard.press('Enter');
		await page.keyboard.press(' ');
		await expect(selected(page)).toHaveAttribute('data-value', bookable);

		// Space picks a bookable one, as Enter does
		await page.keyboard.press(arrow);
		await expect(cell(page, otherBookable)).toBeFocused();
		await page.keyboard.press(' ');
		await expect(selected(page)).toHaveAttribute('data-value', otherBookable);
		await expect.poll(() => slotRequests).toEqual([bookable, otherBookable]);
	});

	test('a meeting type paused while the visitor looks leaves the others to pick, saying why', async ({
		page
	}) => {
		await stubAppointments(page, { paused: DEEP_DIVE.id });
		await gotoHydrated(page, `/${DOMAIN}/hire`);

		await page.getByRole('button', { name: /Deep dive/ }).click();
		await expect(
			page.getByText('Deep dive is not available anymore. Please pick another meeting type.')
		).toBeVisible();
		// One meeting type left, not selected for the visitor: listed to pick
		await expect(page.getByRole('button', { name: /Deep dive/ })).toHaveCount(0);
		await page.getByRole('button', { name: /Intro call/ }).click();

		await expect(cell(page, bookable)).not.toHaveAttribute('aria-disabled', 'true');
		await expect(page.getByText('is not available anymore')).toHaveCount(0);
	});
});

test('/healthz answers 200 ok', async ({ request }) => {
	const response = await request.get('/healthz');

	expect(response.status()).toBe(200);
	expect(await response.text()).toBe('ok');
});
