import { expect, test } from '@playwright/test';

test('about page has expected h1 when unathorized', async ({ page }) => {
	await page.goto('/about');
	await expect(page.getByRole('heading', { name: 'Unauthorized' })).toBeVisible();
});
