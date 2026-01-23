/**
 * E2E Test Helpers - Navigation Operations
 *
 * Helper functions for navigation E2E testing operations
 */

import { Page, expect } from '@playwright/test';

/**
 * Navigates to the dashboard page
 * @param page Playwright page object
 */
export async function navigateToDashboard(page: Page): Promise<void> {
  // Click dashboard link in navigation (using nav-specific selector)
  await page.click('nav a[href="/dashboard"]');

  // Wait for dashboard URL
  await page.waitForURL('**/dashboard', { timeout: 10000 });

  // Verify dashboard page loaded
  await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
}

/**
 * Navigates to the vault page
 * @param page Playwright page object
 */
export async function navigateToVault(page: Page): Promise<void> {
  // Click vault link in navigation (using nav-specific selector)
  await page.click('nav a[href="/vault"]');

  // Wait for vault URL
  await page.waitForURL('**/vault', { timeout: 10000 });

  // Verify vault page loaded
  await expect(page.locator('h1:has-text("Vault")')).toBeVisible();
}

/**
 * Navigates to the consents page
 * @param page Playwright page object
 */
export async function navigateToConsent(page: Page): Promise<void> {
  // Click consents link in navigation (using nav-specific selector)
  await page.click('nav a[href="/consent"]');

  // Wait for consent URL
  await page.waitForURL('**/consent', { timeout: 10000 });

  // Verify consent page loaded
  await expect(page.locator('h1:has-text("Consent")')).toBeVisible();
}

/**
 * Navigates to the audit log page
 * @param page Playwright page object
 */
export async function navigateToAudit(page: Page): Promise<void> {
  // Click audit link in navigation (using nav-specific selector)
  await page.click('nav a[href="/audit"]');

  // Wait for audit URL
  await page.waitForURL('**/audit', { timeout: 10000 });

  // Verify audit page loaded
  await expect(page.locator('h1:has-text("Audit")')).toBeVisible();
}

/**
 * Verifies which navigation item is currently active
 * @param page Playwright page object
 * @param expectedActiveItem Expected active navigation item (dashboard, vault, consent, audit)
 */
export async function verifyActiveNavItem(page: Page, expectedActiveItem: string): Promise<void> {
  // Find the navigation link with aria-current or active class
  const activeLink = page.locator(`nav a[href*="${expectedActiveItem.toLowerCase()}"][aria-current="page"], nav a[href*="${expectedActiveItem.toLowerCase()}"].active`);

  // Verify it's visible and has active state
  await expect(activeLink).toBeVisible();
}

/**
 * Clicks the logo to return to home/dashboard
 * @param page Playwright page object
 */
export async function clickLogo(page: Page): Promise<void> {
  // Click on logo or brand link
  await page.click('a[href="/"], a[href="/dashboard"]:has([alt*="logo" i]), header a:first-child');

  // Wait for navigation
  await page.waitForTimeout(500);
}

/**
 * Opens the mobile navigation menu (hamburger menu)
 * @param page Playwright page object
 */
export async function openMobileMenu(page: Page): Promise<void> {
  // Click hamburger menu button
  const menuButton = page.locator('button[aria-label*="menu" i], button[aria-label*="navigation" i]');

  if (await menuButton.isVisible()) {
    await menuButton.click();

    // Wait for menu to open
    await page.waitForTimeout(300);

    // Verify menu is visible
    await expect(page.locator('[role="dialog"], [role="menu"], nav.mobile-menu')).toBeVisible();
  }
}

/**
 * Closes the mobile navigation menu
 * @param page Playwright page object
 */
export async function closeMobileMenu(page: Page): Promise<void> {
  // Click close button or overlay
  const closeButton = page.locator('button[aria-label*="close" i]');

  if (await closeButton.isVisible()) {
    await closeButton.click();

    // Wait for menu to close
    await page.waitForTimeout(300);
  } else {
    // Try pressing Escape key
    await page.keyboard.press('Escape');
  }
}

/**
 * Verifies that the navigation bar is visible
 * @param page Playwright page object
 */
export async function verifyNavigationBarVisible(page: Page): Promise<void> {
  // Check for navigation element
  await expect(page.locator('nav, header nav')).toBeVisible();

  // Verify key navigation links exist
  await expect(page.locator('nav a[href*="dashboard"]')).toBeVisible();
  await expect(page.locator('nav a[href*="vault"]')).toBeVisible();
}

/**
 * Uses browser back button
 * @param page Playwright page object
 */
export async function goBack(page: Page): Promise<void> {
  await page.goBack();

  // Wait for navigation to complete
  await page.waitForLoadState('networkidle');
}

/**
 * Uses browser forward button
 * @param page Playwright page object
 */
export async function goForward(page: Page): Promise<void> {
  await page.goForward();

  // Wait for navigation to complete
  await page.waitForLoadState('networkidle');
}

/**
 * Verifies user is on the expected page by URL
 * @param page Playwright page object
 * @param expectedPath Expected URL path (e.g., '/dashboard', '/vault')
 */
export async function verifyCurrentPage(page: Page, expectedPath: string): Promise<void> {
  // Wait for URL to match
  await page.waitForURL(`**${expectedPath}`, { timeout: 5000 });

  // Verify URL
  expect(page.url()).toContain(expectedPath);
}

/**
 * Verifies that all main navigation links are present
 * @param page Playwright page object
 */
export async function verifyAllNavLinksPresent(page: Page): Promise<void> {
  // Check for all main navigation links
  await expect(page.locator('nav a[href*="dashboard"]')).toBeVisible();
  await expect(page.locator('nav a[href*="vault"]')).toBeVisible();
  await expect(page.locator('nav a[href*="audit"]')).toBeVisible();

  // Consent link may or may not be present depending on implementation
  const consentLink = page.locator('nav a[href*="consent"]');
  if (await consentLink.count() > 0) {
    await expect(consentLink.first()).toBeVisible();
  }
}

/**
 * Verifies that the user email is displayed in the header
 * @param page Playwright page object
 * @param expectedEmail Expected user email
 */
export async function verifyUserEmailDisplayed(
  page: Page,
  expectedEmail: string
): Promise<void> {
  // Look for email in header or navigation
  await expect(page.locator(`text="${expectedEmail}"`)).toBeVisible();
}

/**
 * Verifies that the sign out button is visible
 * @param page Playwright page object
 */
export async function verifySignOutButtonVisible(page: Page): Promise<void> {
  // Look for sign out button
  await expect(
    page.locator('button:has-text("Sign out"), button:has-text("Logout"), a:has-text("Sign out")')
  ).toBeVisible();
}

/**
 * Navigates directly to a path via URL
 * @param page Playwright page object
 * @param path Path to navigate to (e.g., '/dashboard', '/vault')
 */
export async function navigateToPath(page: Page, path: string): Promise<void> {
  await page.goto(path);

  // Wait for page to load
  await page.waitForLoadState('networkidle');
}

/**
 * Verifies that navigation to a path redirects to login (protected route)
 * @param page Playwright page object
 * @param protectedPath Path that should be protected
 */
export async function verifyRedirectsToLogin(
  page: Page,
  protectedPath: string
): Promise<void> {
  // Navigate to protected path
  await page.goto(protectedPath);

  // Verify redirect to login
  await page.waitForURL('**/login**', { timeout: 10000 });

  // Verify login page elements
  await expect(page.locator('text=/sign in|log in/i')).toBeVisible();
}

/**
 * Verifies that redirect query parameter is preserved
 * @param page Playwright page object
 * @param expectedRedirectPath Expected path in redirectedFrom parameter
 */
export async function verifyRedirectParameterPreserved(
  page: Page,
  expectedRedirectPath: string
): Promise<void> {
  // Check URL for redirect parameter
  const url = new URL(page.url());
  const redirectParam = url.searchParams.get('redirectedFrom');

  expect(redirectParam).toContain(expectedRedirectPath);
}

/**
 * Navigates through a sequence of pages
 * @param page Playwright page object
 * @param sequence Array of page names to navigate through (e.g., ['dashboard', 'vault', 'audit'])
 */
export async function navigateSequence(page: Page, sequence: string[]): Promise<void> {
  for (const pageName of sequence) {
    switch (pageName.toLowerCase()) {
      case 'dashboard':
        await navigateToDashboard(page);
        break;
      case 'vault':
        await navigateToVault(page);
        break;
      case 'consent':
      case 'consents':
        await navigateToConsent(page);
        break;
      case 'audit':
        await navigateToAudit(page);
        break;
      default:
        throw new Error(`Unknown page name: ${pageName}`);
    }

    // Small delay between navigations
    await page.waitForTimeout(300);
  }
}
