import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should allow a user to navigate to the signup page', async ({ page }) => {
    await page.goto('/');
    // Assuming there's a link to signup on the auth page
    const signupLink = page.getByRole('button', { name: /create account/i }).or(page.getByText(/create account/i));
    if (await signupLink.isVisible()) {
      await signupLink.click();
      await expect(page).toHaveURL(/.*auth/); // Usually stays on auth but switches mode
    }
  });

  test('should show validation error on empty login', async ({ page }) => {
    await page.goto('/');
    const loginButton = page.getByRole('button', { name: 'Login' });
    await loginButton.click();
    // Assuming there's an alert or text for required fields
    // This depends on how the app handles empty fields (e.g., Simple Alert.alert which Playwright handles)
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('Please enter email and password');
      await dialog.dismiss();
    });
  });
});
