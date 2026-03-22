import { test, expect } from '@playwright/test';

/**
 * Detailed E2E Test Suite for WiseWallet
 * This test covers a complete user journey:
 * 1. Signup and Onboarding (Initial Balance)
 * 2. Dashbard Verification
 * 3. Adding a Transaction
 * 4. Verifying Analytics and Balance
 * 5. Data Cleanup (Wipe)
 */

test.describe('Complete WiseWallet User Journey', () => {
    // Generate a unique user for each test run to ensure cleanliness
    const uniqueId = Date.now();
    const testEmail = `thesis_user_${uniqueId}@example.com`;
    const testName = `Thesis Tester ${uniqueId}`;

    test('should perform a full financial management lifecycle', async ({ page }) => {
        // --- STEP 1: Signup & Onboarding ---
        await page.goto('/auth');
        
        // Wait for the auth screen to load
        const usernameField = page.getByPlaceholder('Username');
        await expect(usernameField).toBeVisible({ timeout: 15000 });

        // Fill Signup Form
        await usernameField.click();
        await usernameField.fill(testEmail);
        
        const pinField = page.getByPlaceholder('PIN (4-digits)');
        await pinField.click();
        await pinField.fill('1234');
        
        await page.getByRole('button', { name: 'Register' }).click();

        // Onboarding: Name and Initial Balance
        await page.getByPlaceholder(/your name/i).fill(testName);
        await page.getByPlaceholder(/initial balance/i).fill('10000');
        await page.getByRole('button', { name: /get started/i }).click();

        // --- STEP 2: Dashboard Verification ---
        // Verify Dashboard Header and Initial Balance
        await expect(page.getByText(`Hello ${testName}`)).toBeVisible();
        await expect(page.getByText('₱10,000.00')).toBeVisible();

        // --- STEP 3: Add a Transaction ---
        // Click Add FAB (using icon or accessibility label if available)
        const addBtn = page.getByRole('button').filter({ hasText: /plus/i }).first();
        await addBtn.click();

        // Fill Transaction Details (e.g., Food Expense)
        await page.getByPlaceholder('0.00').fill('500');
        await page.getByText(/food/i).first().click(); // Select Food category
        await page.getByPlaceholder(/description/i).fill('Thesis Celebration Lunch');
        await page.getByRole('button', { name: /add transaction/i }).click();

        // --- STEP 4: Verify Balance Update & Totals ---
        // Balance should subtract the 500 expense
        await expect(page.getByText('₱9,500.00')).toBeVisible(); 
        await expect(page.getByText('₱500.00')).toBeVisible(); // Today's spend

        // --- STEP 5: Settings & Cleanup ---
        await page.getByRole('button', { name: /settings/i }).or(page.getByText(/settings/i)).click();
        
        // Wipe Data (Safety check)
        const clearDataBtn = page.getByRole('button', { name: /clear all data/i });
        await clearDataBtn.click();

        // Handle Confirmation Dialog
        page.on('dialog', async dialog => {
            expect(dialog.message()).toContain(/reset/i);
            await dialog.accept();
        });

        // App should return to Auth screen after wipe
        await expect(page).toHaveURL(/.*auth/);
    });
});
