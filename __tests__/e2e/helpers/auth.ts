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

  // Wait for form to be ready
  await page.waitForSelector('input[name="email"]', { state: 'visible' });

  // Fill fields using click + pressSequentially for reliable React onChange events
  const emailInput = page.locator('input[name="email"]');
  await emailInput.click();
  await emailInput.pressSequentially(email, { delay: 50 });

  // Verify the email was actually set
  await page.waitForFunction(
    (expectedEmail) => {
      const input = document.querySelector('input[name="email"]') as HTMLInputElement;
      return input && input.value === expectedEmail;
    },
    email,
    { timeout: 2000 }
  );

  const passwordInput = page.locator('input[name="password"]');
  await passwordInput.click();
  await passwordInput.pressSequentially(password, { delay: 50 });

  // Verify the password was actually set
  await page.waitForFunction(
    (expectedPassword) => {
      const input = document.querySelector('input[name="password"]') as HTMLInputElement;
      return input && input.value === expectedPassword;
    },
    password,
    { timeout: 2000 }
  );

  // Wait a moment for any validation
  await page.waitForTimeout(500);

  // Click submit
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard with increased timeout for slower browsers
  await page.waitForURL('/dashboard', { timeout: 15000 });
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

  // Wait for form to be ready
  await page.waitForSelector('input[name="email"]', { state: 'visible' });

  // Fill fields using click + pressSequentially for reliable React onChange events
  const emailInput = page.locator('input[name="email"]');
  await emailInput.click();
  await emailInput.pressSequentially(email, { delay: 50 });

  // Verify the email was actually set before moving on
  await page.waitForFunction(
    (expectedEmail) => {
      const input = document.querySelector('input[name="email"]') as HTMLInputElement;
      return input && input.value === expectedEmail;
    },
    email,
    { timeout: 2000 }
  );
  await emailInput.blur(); // Trigger validation

  const passwordInput = page.locator('input[name="password"]');
  await passwordInput.click();
  await passwordInput.pressSequentially(password, { delay: 50 });

  // Verify the password was actually set
  await page.waitForFunction(
    (expectedPassword) => {
      const input = document.querySelector('input[name="password"]') as HTMLInputElement;
      return input && input.value === expectedPassword;
    },
    password,
    { timeout: 2000 }
  );
  await passwordInput.blur();

  const confirmPasswordInput = page.locator('input[name="confirmPassword"]');
  await confirmPasswordInput.click();
  await confirmPasswordInput.pressSequentially(password, { delay: 50 });

  // Verify the confirm password was actually set
  await page.waitForFunction(
    (expectedPassword) => {
      const input = document.querySelector('input[name="confirmPassword"]') as HTMLInputElement;
      return input && input.value === expectedPassword;
    },
    password,
    { timeout: 2000 }
  );
  await confirmPasswordInput.blur();

  // Wait for validation to complete (increased from 500ms to 1000ms)
  await page.waitForTimeout(1000);

  // Click submit button
  const submitButton = page.locator('button[type="submit"]');
  await submitButton.click();

  // Wait for redirect or success message with increased timeout for slower browsers
  await page.waitForURL('/dashboard', { timeout: 15000 });
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
  await page.waitForLoadState('networkidle');

  // Wait for the page to fully load and sign out button to be visible
  const logoutButton = page.locator('button:has-text("Sign out")');
  await logoutButton.waitFor({ state: 'visible', timeout: 10000 });
  await logoutButton.click();

  // Wait for redirect to login with flexible URL matching
  await page.waitForURL(/\/login/, { timeout: 10000 });
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
 * Fill form field with value using reliable method for all browsers
 *
 * Uses pressSequentially() instead of fill() to ensure React onChange events
 * are triggered consistently across all browsers, especially WebKit/Safari.
 *
 * @param page - Playwright page object
 * @param selector - CSS selector for the input field
 * @param value - Value to fill
 */
export async function fillFormField(
  page: Page,
  selector: string,
  value: string
): Promise<void> {
  const input = page.locator(selector);
  await input.click();
  await input.pressSequentially(value, { delay: 50 });

  // Verify the value was actually set
  await page.waitForFunction(
    ({ sel, val }) => {
      const elem = document.querySelector(sel) as HTMLInputElement;
      return elem && elem.value === val;
    },
    { sel: selector, val: value },
    { timeout: 2000 }
  );
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
