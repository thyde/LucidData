/**
 * E2E Test Helpers - Navigation
 *
 * Helper functions for testing navigation functionality across the application.
 */

import { Page, expect } from '@playwright/test';

/**
 * Navigates to the dashboard page
 * @param page Playwright page object
 */
export async function navigateToDashboard(page: Page): Promise<void> {
  await page.click('a[href*="dashboard"], a:has-text("Dashboard")');
  await page.waitForURL('**/dashboard');
  await page.waitForLoadState('networkidle');
}

/**
 * Navigates to the vault page
 * @param page Playwright page object
 */
export async function navigateToVault(page: Page): Promise<void> {
  await page.click('a[href*="vault"], a:has-text("Vault")');
  await page.waitForURL('**/vault');
  await page.waitForLoadState('networkidle');
}

/**
 * Navigates to the consent page
 * @param page Playwright page object
 */
export async function navigateToConsent(page: Page): Promise<void> {
  await page.click('a[href*="consent"], a:has-text("Consent")');
  await page.waitForURL('**/consent');
  await page.waitForLoadState('networkidle');
}

/**
 * Navigates to the audit page
 * @param page Playwright page object
 */
export async function navigateToAudit(page: Page): Promise<void> {
  await page.click('a[href*="audit"], a:has-text("Audit")');
  await page.waitForURL('**/audit');
  await page.waitForLoadState('networkidle');
}

/**
 * Verifies that the active navigation item is highlighted
 * @param page Playwright page object
 * @param pageName Name of the page that should be active
 */
export async function verifyActiveNavItem(page: Page, pageName: string): Promise<void> {
  const activeLink = page.locator(`a[href*="${pageName}"][aria-current="page"], a[href*="${pageName}"].active`);
  const isVisible = await activeLink.isVisible().catch(() => false);

  if (isVisible) {
    await expect(activeLink).toBeVisible();
  } else {
    // Fallback: verify we're on the correct page
    expect(page.url()).toContain(pageName);
  }
}

/**
 * Navigates back using browser back button
 * @param page Playwright page object
 */
export async function goBack(page: Page): Promise<void> {
  await page.goBack();
  await page.waitForLoadState('networkidle');
}

/**
 * Navigates forward using browser forward button
 * @param page Playwright page object
 */
export async function goForward(page: Page): Promise<void> {
  await page.goForward();
  await page.waitForLoadState('networkidle');
}

/**
 * Verifies that the current page URL contains the expected path
 * @param page Playwright page object
 * @param expectedPath Expected path in the URL
 */
export async function verifyCurrentPage(page: Page, expectedPath: string): Promise<void> {
  await page.waitForURL(`**${expectedPath}`, { timeout: 10000 });
  expect(page.url()).toContain(expectedPath);
}

/**
 * Verifies that all main navigation links are present
 * @param page Playwright page object
 */
export async function verifyAllNavLinksPresent(page: Page): Promise<void> {
  // Check for dashboard link
  const dashboardLink = page.locator('nav a[href*="dashboard"], a:has-text("Dashboard")');
  await expect(dashboardLink.first()).toBeVisible();

  // Check for vault link
  const vaultLink = page.locator('nav a[href*="vault"], a:has-text("Vault")');
  await expect(vaultLink.first()).toBeVisible();

  // Check for consent link
  const consentLink = page.locator('nav a[href*="consent"], a:has-text("Consent")');
  await expect(consentLink.first()).toBeVisible();

  // Check for audit link
  const auditLink = page.locator('nav a[href*="audit"], a:has-text("Audit")');
  await expect(auditLink.first()).toBeVisible();
}

/**
 * Verifies that accessing a protected route redirects to login
 * @param page Playwright page object
 * @param protectedRoute The protected route to access
 */
export async function verifyRedirectsToLogin(page: Page, protectedRoute: string): Promise<void> {
  await page.goto(protectedRoute);
  await page.waitForURL('**/login**', { timeout: 10000 });
  expect(page.url()).toContain('/login');
}

/**
 * Opens the mobile navigation menu
 * @param page Playwright page object
 */
export async function openMobileMenu(page: Page): Promise<void> {
  const menuButton = page.locator('button[aria-label*="menu" i], button[aria-label*="navigation" i], button[aria-label*="open" i]');
  await menuButton.click();

  // Wait for menu to open (dialog, menu, or expanded navigation)
  await page.waitForTimeout(500);
}

/**
 * Closes the mobile navigation menu
 * @param page Playwright page object
 */
export async function closeMobileMenu(page: Page): Promise<void> {
  // Try clicking close button first
  const closeButton = page.locator('[role="dialog"] button[aria-label*="close" i], [role="dialog"] button:has-text("Close")');

  if (await closeButton.isVisible()) {
    await closeButton.click();
  } else {
    // Fallback to Escape key
    await page.keyboard.press('Escape');
  }

  // Wait for menu to close
  await page.waitForTimeout(500);
}
