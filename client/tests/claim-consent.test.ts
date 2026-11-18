import { expect, test, type Page } from '@playwright/test';
import { LEGAL_VERSION } from 'portfolio-common';
import {
	E2E_CANDIDATE_ID as CANDIDATE_ID,
	JWT_SECRET,
	blockGoogle,
	candidateSession,
	gotoHydrated,
	signIn
} from './support/owner';
import { stubApi } from './support/api';

// The age and terms checkbox of the claim form a signed-in account without a portfolio meets: the
// account menu's "Claim your portfolio" (SpaceChooser.svelte). Signed in for real as the e2e
// candidate of seed:e2e (no portfolio, no acceptance of the terms); what the session says about
// the terms (GET /isLogged) and every request that would change the account (POST /domain/claim,
// PUT /me/mode) are answered in the browser: nothing is claimed for real.

test.skip(!JWT_SECRET, 'Set JWT_SECRET to the API secret to sign in without Google');

const CANDIDATE_EMAIL = 'e2e.candidate@example.com';
const CONSENT = { termsVersion: LEGAL_VERSION, ageConfirmed: true };
const CONSENT_REFUSED = {
	type: 'validation',
	on: 'body',
	property: 'consent',
	message: 'Confirm your age and accept the terms of use to create your portfolio.'
};

test.beforeEach(async ({ page }) => {
	await blockGoogle(page);
});

/** Signed in as the e2e candidate, the session saying it accepted `termsVersion` (if any) */
const signInAsCandidate = async (page: Page, termsVersion?: string) => {
	const session = await candidateSession();
	await signIn(page, session);
	await stubApi(page, 'GET', '/isLogged', () => ({
		json: {
			logged: true,
			user: {
				_id: CANDIDATE_ID,
				email: CANDIDATE_EMAIL,
				recruiter: false,
				...(termsVersion ? { termsVersion } : {})
			},
			expires: session.exp
		}
	}));
	await stubApi(page, 'PUT', '/me/mode', () => ({
		json: { user: { _id: CANDIDATE_ID, email: CANDIDATE_EMAIL, activeMode: 'candidate' } }
	}));
};

/** POST /domain/claim: `answers` in turn (the last one repeated), the name claimed otherwise */
const stubClaim = (page: Page, answers: { status?: number; json: unknown }[] = []) =>
	stubApi(page, 'POST', '/domain/claim', (_request, index) =>
		answers.length ? answers[Math.min(index, answers.length - 1)] : { json: { name: '' } }
	);

type ClaimForm = {
	name: string;
	/** Opens the form and returns where it is */
	open: (page: Page) => Promise<ReturnType<Page['locator']>>;
	submit: string;
};

const FORMS: ClaimForm[] = [
	{
		name: 'the account menu',
		open: async (page) => {
			await gotoHydrated(page, '/legal');
			await page.getByRole('button', { name: /^Account menu/ }).click();
			await page.getByRole('menuitemradio', { name: /^Candidate space/ }).click();
			const dialog = page.getByRole('dialog', { name: 'Claim your portfolio' });
			await expect(dialog).toBeVisible();
			return dialog;
		},
		submit: 'Claim your portfolio'
	}
];

for (const form of FORMS) {
	test.describe(`claiming from ${form.name}`, () => {
		test('an account without the terms ticks the box first, and the claim sends it', async ({
			page
		}) => {
			await signInAsCandidate(page);
			const claims = await stubClaim(page, [{ status: 409, json: 'Domain already exists' }]);
			const where = await form.open(page);
			const name = `e2e-claimc-${Date.now().toString(36)}`;
			await where.getByLabel('Portfolio name').fill(name);
			const box = where.getByRole('checkbox', { name: /at least 16 years old/ });
			await expect(box).not.toBeChecked();

			// Unticked: nothing is sent, the box is asked for
			await where.getByRole('button', { name: form.submit }).click();
			await expect(box).toBeFocused();
			await expect(
				where.getByText('Tick the box to confirm your age and accept the terms.').first()
			).toBeVisible();
			expect(claims).toHaveLength(0);

			await box.check();
			await where.getByRole('button', { name: form.submit }).click();

			await expect.poll(() => claims.length).toBe(1);
			expect(claims[0].postDataJSON()).toEqual({ name, consent: CONSENT });
		});

		test('an account that accepted the terms in force sees no box, and sends none', async ({
			page
		}) => {
			await signInAsCandidate(page, LEGAL_VERSION);
			const claims = await stubClaim(page, [{ status: 409, json: 'Domain already exists' }]);
			const where = await form.open(page);
			const name = `e2e-claimc-${Date.now().toString(36)}`;
			await where.getByLabel('Portfolio name').fill(name);

			await expect(where.getByRole('checkbox')).toHaveCount(0);
			await where.getByRole('button', { name: form.submit }).click();

			await expect.poll(() => claims.length).toBe(1);
			expect(claims[0].postDataJSON()).toEqual({ name });
		});

		test('when the API still asks for the terms, the box shows, takes the focus, and the retry sends them', async ({
			page
		}) => {
			await signInAsCandidate(page, LEGAL_VERSION);
			const claims = await stubClaim(page, [
				{ status: 422, json: CONSENT_REFUSED },
				{ status: 409, json: 'Domain already exists' }
			]);
			const where = await form.open(page);
			const name = `e2e-claimc-${Date.now().toString(36)}`;
			await where.getByLabel('Portfolio name').fill(name);
			await where.getByRole('button', { name: form.submit }).click();

			const box = where.getByRole('checkbox', { name: /at least 16 years old/ });
			await expect(box).toBeFocused();
			await expect(where.getByText(CONSENT_REFUSED.message).first()).toBeVisible();
			expect(claims.map((request) => request.postDataJSON())).toEqual([{ name }]);

			await box.check();
			await where.getByRole('button', { name: form.submit }).click();

			await expect.poll(() => claims.length).toBe(2);
			expect(claims[1].postDataJSON()).toEqual({ name, consent: CONSENT });
		});
	});
}
