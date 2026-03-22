import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/wise-wallet/);
});

test('login navigation works', async ({ page }) => {
  await page.goto('/');
  // Basic check for the login screen arrival - adjusting for potential Expo Router URL patterns if needed
  await expect(page).toHaveURL(/.*auth/);
});
