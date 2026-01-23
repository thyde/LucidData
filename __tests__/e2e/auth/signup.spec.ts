/**
 * E2E Tests - Signup Flow
 *
 * Tests for user registration functionality.
 */

import { test, expect } from '@playwright/test';
import { clearSession, getUniqueEmail, fillFormField, TEST_USER } from '../helpers/auth';

test.describe('Signup Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear session before each test
    await clearSession(page);
  });

  test('should display signup form', async ({ page }) => {
    await page.goto('/signup');

    // Check for form elements
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show validation errors for empty form', async ({ page }) => {
    await page.goto('/signup');

    // Try to submit empty form
    await page.click('button[type="submit"]');

    // Should show validation errors
    const errorMessages = page.locator('[role="alert"]');
    await expect(errorMessages.first()).toBeVisible();
  });

  test('should validate email format', async ({ page }) => {
    await page.goto('/signup');

    await fillFormField(page, 'input[name="email"]', 'invalid-email');
    await fillFormField(page, 'input[name="password"]', TEST_USER.password);
    await fillFormField(page, 'input[name="confirmPassword"]', TEST_USER.password);
    await page.click('button[type="submit"]');

    // Should show email validation error
    await expect(page.locator('text=/Invalid email|Enter a valid email/i')).toBeVisible();
  });

  test('should validate password strength', async ({ page }) => {
    await page.goto('/signup');

    await fillFormField(page, 'input[name="email"]', getUniqueEmail());
    await fillFormField(page, 'input[name="password"]', 'weak');
    await fillFormField(page, 'input[name="confirmPassword"]', 'weak');
    await page.click('button[type="submit"]');

    // Should show password validation error
    await expect(
      page.locator('text=/Password must be|too short|at least/i')
    ).toBeVisible();
  });

  test('should validate password confirmation match', async ({ page }) => {
    await page.goto('/signup');

    await fillFormField(page, 'input[name="email"]', getUniqueEmail());
    await fillFormField(page, 'input[name="password"]', TEST_USER.password);
    await fillFormField(page, 'input[name="confirmPassword"]', 'DifferentPassword123!');
    await page.click('button[type="submit"]');

    // Should show password mismatch error
    await expect(page.locator('text=/Passwords must match|do not match/i')).toBeVisible();
  });

  test('should successfully create account with valid data', async ({ page }) => {
    await page.goto('/signup');

    const email = getUniqueEmail();
    await fillFormField(page, 'input[name="email"]', email);
    await fillFormField(page, 'input[name="password"]', TEST_USER.password);
    await fillFormField(page, 'input[name="confirmPassword"]', TEST_USER.password);
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });

    // Should display user info
    await expect(page.locator(`text=${email}`)).toBeVisible();
  });

  test('should prevent duplicate email registration', async ({ page }) => {
    const email = getUniqueEmail();

    // First signup
    await page.goto('/signup');
    await fillFormField(page, 'input[name="email"]', email);
    await fillFormField(page, 'input[name="password"]', TEST_USER.password);
    await fillFormField(page, 'input[name="confirmPassword"]', TEST_USER.password);
    await page.click('button[type="submit"]');

    // Wait for success
    await expect(page).toHaveURL('/dashboard');

    // Logout
    await clearSession(page);

    // Try to signup again with same email
    await page.goto('/signup');
    await fillFormField(page, 'input[name="email"]', email);
    await fillFormField(page, 'input[name="password"]', TEST_USER.password);
    await fillFormField(page, 'input[name="confirmPassword"]', TEST_USER.password);
    await page.click('button[type="submit"]');

    // Should show error about existing account
    await expect(
      page.locator('text=/already exists|already registered/i')
    ).toBeVisible();
  });

  test('should have link to login page', async ({ page }) => {
    await page.goto('/signup');

    const loginLink = page.locator('a[href="/login"]');
    await expect(loginLink).toBeVisible();

    await loginLink.click();
    await expect(page).toHaveURL('/login');
  });

  test('should accept terms and conditions if required', async ({ page }) => {
    await page.goto('/signup');

    // Check if terms checkbox exists
    const termsCheckbox = page.locator('input[name="acceptTerms"]');
    if (await termsCheckbox.count() > 0) {
      const email = getUniqueEmail();
      await fillFormField(page, 'input[name="email"]', email);
      await fillFormField(page, 'input[name="password"]', TEST_USER.password);
      await fillFormField(page, 'input[name="confirmPassword"]', TEST_USER.password);

      // Try without accepting terms
      await page.click('button[type="submit"]');
      await expect(page.locator('text=/accept|terms/i')).toBeVisible();

      // Accept terms
      await termsCheckbox.check();
      await page.click('button[type="submit"]');

      // Should succeed
      await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
    }
  });
});
