/**
 * E2E Test Helpers - Authentication
 *
 * Helper functions for authentication flows in Playwright E2E tests.
 */

import { Page } from '@playwright/test';

/**
 * Test user credentials
 */
export const TEST_USER = {
  email: `test-${Date.now()}@example.com`,
  password: 'TestPassword123!',
  name: 'Test User',
};

/**
 * Login helper
 *
 * Navigates to login page and authenticates user.
 *
 * @param page - Playwright page object
 * @param email - User email
 * @param password - User password
 */
export async function login(
  page: Page,
  email: string = TEST_USER.email,
  password: string = TEST_USER.password
): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL('/dashboard', { timeout: 10000 });
}

/**
 * Signup helper
 *
 * Creates a new user account.
 *
 * @param page - Playwright page object
 * @param email - User email
 * @param password - User password
 */
export async function signup(
  page: Page,
  email: string = TEST_USER.email,
  password: string = TEST_USER.password
): Promise<void> {
  await page.goto('/signup');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="confirmPassword"]', password);
  await page.click('button[type="submit"]');

  // Wait for redirect or success message
  await page.waitForURL('/dashboard', { timeout: 10000 });
}

/**
 * Logout helper
 *
 * Logs out the current user.
 *
 * @param page - Playwright page object
 */
export async function logout(page: Page): Promise<void> {
  // Navigate to a page where the logout button is available
  await page.goto('/dashboard');

  // Click logout button (adjust selector based on your UI)
  const logoutButton = page.locator('button:has-text("Sign out")');
  await logoutButton.click();

  // Wait for redirect to login
  await page.waitForURL('/login', { timeout: 5000 });
}

/**
 * Check if user is authenticated
 *
 * @param page - Playwright page object
 * @returns True if user is authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  try {
    // Navigate to a protected route
    await page.goto('/dashboard');

    // If we're still on dashboard (not redirected to login), user is authenticated
    await page.waitForURL('/dashboard', { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get unique test email
 *
 * Generates a unique email address for test isolation.
 *
 * @param prefix - Email prefix (default: 'test')
 * @returns Unique email address
 */
export function getUniqueEmail(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
}

/**
 * Clear all cookies and local storage
 *
 * Ensures clean state between tests.
 *
 * @param page - Playwright page object
 */
export async function clearSession(page: Page): Promise<void> {
  // Clear all cookies from the context
  await page.context().clearCookies();
  
  // Try to clear storage, but don't fail if it's not available
  // (e.g., on about:blank or cross-origin contexts)
  try {
    await page.evaluate(() => {
      try {
        localStorage.clear();
      } catch {
        // Ignore if localStorage is not accessible
      }
      try {
        sessionStorage.clear();
      } catch {
        // Ignore if sessionStorage is not accessible
      }
    });
  } catch {
    // If evaluation fails entirely, continue - cookies are already cleared
  }
}
