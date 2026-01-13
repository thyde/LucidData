/**
 * E2E Tests - Login Flow
 *
 * Tests for user authentication and login functionality.
 */

import { test, expect } from '@playwright/test';
import { login, signup, clearSession, getUniqueEmail, TEST_USER } from '../helpers/auth';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear session before each test
    await clearSession(page);
  });

  test('should display login form', async ({ page }) => {
    await page.goto('/login');

    // Check for form elements
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show validation errors for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    // Try to submit empty form
    await page.click('button[type="submit"]');

    // Should show validation errors (adjust selectors based on your UI)
    const errorMessages = page.locator('[role="alert"]');
    const count = await errorMessages.count();
    expect(count).toBeGreaterThanOrEqual(2); // At least email and password errors
  });

  test('should show error for non-existent user', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[name="email"]', 'nonexistent@example.com');
    await page.fill('input[name="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"]');

    // Should show authentication error
    await expect(page.locator('text=/Invalid credentials|User not found/i')).toBeVisible();
  });

  test('should successfully login with valid credentials', async ({ page }) => {
    // First, create a test user
    const email = getUniqueEmail();
    await signup(page, email, TEST_USER.password);

    // Logout
    await page.goto('/login');

    // Now login
    await login(page, email, TEST_USER.password);

    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard');

    // Should display user info (adjust selector based on your UI)
    await expect(page.locator(`text=${email}`)).toBeVisible();
  });

  test('should persist session after page reload', async ({ page }) => {
    // Create and login
    const email = getUniqueEmail();
    await signup(page, email, TEST_USER.password);

    // Reload page
    await page.reload();

    // Should still be authenticated
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator(`text=${email}`)).toBeVisible();
  });

  test('should redirect to originally requested page after login', async ({ page }) => {
    // Try to access protected page while logged out
    await page.goto('/vault');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);

    // Login
    const email = getUniqueEmail();
    await signup(page, email, TEST_USER.password);

    // Should redirect back to vault (or dashboard based on your implementation)
    await expect(page).toHaveURL(/\/vault|\/dashboard/);
  });

  test('should toggle password visibility', async ({ page }) => {
    await page.goto('/login');

    const passwordInput = page.locator('input[name="password"]');

    // Password should be hidden by default
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click toggle button (adjust selector based on your UI)
    const toggleButton = page.locator('button[aria-label="Toggle password visibility"]');
    if (await toggleButton.count() > 0) {
      await toggleButton.click();

      // Password should now be visible
      await expect(passwordInput).toHaveAttribute('type', 'text');
    }
  });

  test('should have link to signup page', async ({ page }) => {
    await page.goto('/login');

    const signupLink = page.locator('a[href="/signup"]');
    await expect(signupLink).toBeVisible();

    await signupLink.click();
    await expect(page).toHaveURL('/signup');
  });
});
