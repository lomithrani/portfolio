import { expect, test } from '@playwright/test';

test('hire page has expected h1 when unathorized', async ({ page }) => {
	await page.goto('/hire');
	await expect(page.getByRole('heading', { name: 'Unauthorized' })).toBeVisible();
});
