import { expect, test } from '@playwright/test';

test.describe('navigation', () => {
	test('landing page should be my profile for now', async ({ page }) => {
		await page.goto('/');
		expect(new URL(page.url()).pathname).toBe("/louis.gentil/experiences");
	});
});