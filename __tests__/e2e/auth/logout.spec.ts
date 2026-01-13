/**
 * E2E Tests - Logout Flow
 *
 * Tests for user logout functionality.
 */

import { test, expect } from '@playwright/test';
import { signup, logout, clearSession, getUniqueEmail, TEST_USER } from '../helpers/auth';

test.describe('Logout Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear session and create authenticated user
    await clearSession(page);
    const email = getUniqueEmail();
    await signup(page, email, TEST_USER.password);
  });

  test('should successfully logout user', async ({ page }) => {
    // Verify we're logged in
    await expect(page).toHaveURL('/dashboard');

    // Logout
    await logout(page);

    // Should redirect to login
    await expect(page).toHaveURL('/login');
  });

  test('should clear session on logout', async ({ page }) => {
    // Logout
    await logout(page);

    // Try to access protected route
    await page.goto('/dashboard');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('should not allow access to protected routes after logout', async ({ page }) => {
    // Logout
    await logout(page);

    // Try to access various protected routes
    const protectedRoutes = ['/dashboard', '/vault', '/consents', '/audit'];

    for (const route of protectedRoutes) {
      await page.goto(route);

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    }
  });

  test('should remove authentication cookies on logout', async ({ page }) => {
    // Get cookies before logout
    const cookiesBefore = await page.context().cookies();
    const hasAuthCookies = cookiesBefore.some(
      (cookie) => cookie.name.includes('auth') || cookie.name.includes('session')
    );

    // Logout
    await logout(page);

    // Get cookies after logout
    const cookiesAfter = await page.context().cookies();
    const hasAuthCookiesAfter = cookiesAfter.some(
      (cookie) => cookie.name.includes('auth') || cookie.name.includes('session')
    );

    // Auth cookies should be removed
    if (hasAuthCookies) {
      expect(hasAuthCookiesAfter).toBe(false);
    }
  });

  test('should clear local storage on logout', async ({ page }) => {
    // Check if there's any auth data in localStorage before logout
    const hasAuthData = await page.evaluate(() => {
      return Object.keys(localStorage).some(
        (key) => key.includes('auth') || key.includes('token') || key.includes('user')
      );
    });

    // Logout
    await logout(page);

    // Check localStorage after logout
    const hasAuthDataAfter = await page.evaluate(() => {
      return Object.keys(localStorage).some(
        (key) => key.includes('auth') || key.includes('token') || key.includes('user')
      );
    });

    // Auth data should be cleared
    if (hasAuthData) {
      expect(hasAuthDataAfter).toBe(false);
    }
  });
});
