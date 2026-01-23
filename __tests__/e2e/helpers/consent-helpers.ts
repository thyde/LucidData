/**
 * E2E Test Helpers - Consent Operations
 *
 * Helper functions for consent management E2E testing operations
 */

import { Page, expect } from '@playwright/test';
import { ConsentData } from './data-generators';

/**
 * Creates a new consent through the UI
 * @param page Playwright page object
 * @param data Consent data to create
 * @returns Promise<string> The created consent ID
 */
export async function createConsent(page: Page, data: ConsentData): Promise<string> {
  // Click create consent button
  await page.click('button:has-text("Create Consent"), button:has-text("Grant Consent")');

  // Wait for dialog to open
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: /create consent|grant consent/i })
  ).toBeVisible();

  // Fill in organization name
  await page.fill('input[name="grantedTo"], input[name="grantedToName"]', data.grantedTo);

  // Fill purpose
  await page.fill('textarea[name="purpose"], input[name="purpose"]', data.purpose);

  // Select access level/scope if available
  if (data.scope) {
    await page.click('[name="scope"], [name="accessLevel"]');
    await page.click(`[role="option"]:has-text("${data.scope}")`);
  }

  // Set end date if provided
  if (data.endDate) {
    const endDateStr = data.endDate instanceof Date
      ? data.endDate.toISOString().split('T')[0]
      : data.endDate;
    await page.fill('input[name="endDate"], input[type="date"]', endDateStr);
  }

  // Select vault data if vaultDataId is provided
  if (data.vaultDataId) {
    await page.click('[name="vaultDataId"]');
    await page.click(`[role="option"][data-id="${data.vaultDataId}"]`);
  }

  // Submit form
  await page.click('button[type="submit"]:has-text("Create"), button[type="submit"]:has-text("Grant")');

  // Wait for dialog to close
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });

  // Wait for success message
  await expect(page.locator('text=/consent.*created|granted successfully/i')).toBeVisible({
    timeout: 10000,
  });

  // Extract consent ID from the created card
  const consentCard = page.locator(`[role="article"]:has-text("${data.grantedTo}")`).first();
  const consentId = (await consentCard.getAttribute('data-id')) || 'created-consent';

  return consentId;
}

/**
 * Revokes an existing consent through the UI
 * @param page Playwright page object
 * @param organizationName Name of the organization to revoke consent for
 * @param reason Optional reason for revocation
 */
export async function revokeConsent(
  page: Page,
  organizationName: string,
  reason?: string
): Promise<void> {
  // Click on the consent to view it
  await page.click(`[role="article"]:has-text("${organizationName}")`);

  // Wait for view dialog to open
  await expect(page.getByRole('dialog')).toBeVisible();

  // Click revoke button
  await page.click('button:has-text("Revoke")');

  // Wait for confirmation dialog or reason input
  const confirmDialog = page.getByRole('alertdialog');
  if (await confirmDialog.isVisible()) {
    // If there's a reason textarea, fill it
    if (reason) {
      const reasonInput = confirmDialog.locator('textarea[name="reason"], input[name="revokedReason"]');
      if (await reasonInput.isVisible()) {
        await reasonInput.fill(reason);
      }
    }

    // Confirm revocation
    await confirmDialog.locator('button:has-text("Revoke"), button:has-text("Confirm")').click();
  }

  // Wait for dialogs to close
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });

  // Wait for success message
  await expect(page.locator('text=/consent.*revoked|revocation successful/i')).toBeVisible({
    timeout: 10000,
  });
}

/**
 * Extends the end date of a consent
 * @param page Playwright page object
 * @param organizationName Name of the organization
 * @param newEndDate New end date for the consent
 */
export async function extendConsent(
  page: Page,
  organizationName: string,
  newEndDate: string | Date
): Promise<void> {
  // Click on the consent to view it
  await page.click(`[role="article"]:has-text("${organizationName}")`);

  // Wait for view dialog to open
  await expect(page.getByRole('dialog')).toBeVisible();

  // Click extend or edit button
  const extendButton = page.locator('button:has-text("Extend"), button:has-text("Edit")');
  await extendButton.click();

  // Wait for edit dialog
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: /extend|edit consent/i })
  ).toBeVisible();

  // Update end date
  const endDateStr = newEndDate instanceof Date
    ? newEndDate.toISOString().split('T')[0]
    : newEndDate;
  await page.fill('input[name="endDate"], input[type="date"]', endDateStr);

  // Submit form
  await page.click('button[type="submit"]:has-text("Save"), button[type="submit"]:has-text("Update")');

  // Wait for dialog to close
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });

  // Wait for success message
  await expect(page.locator('text=/consent.*updated|extended successfully/i')).toBeVisible({
    timeout: 10000,
  });
}

/**
 * Filters consents by status
 * @param page Playwright page object
 * @param status Status to filter by (active, expired, revoked, all)
 */
export async function filterConsentsByStatus(
  page: Page,
  status: string
): Promise<void> {
  // Click on status filter
  const statusFilter = page.locator('[aria-label*="status" i], [name="status"]');
  await statusFilter.click();

  // Select the status option
  await page.click(`[role="option"]:has-text("${status}")`);

  // Wait for filtered results
  await page.waitForTimeout(500);
}

/**
 * Searches for consents by organization name or purpose
 * @param page Playwright page object
 * @param query Search query string
 */
export async function searchConsents(page: Page, query: string): Promise<void> {
  // Find and fill search input
  const searchInput = page.locator('input[placeholder*="Search" i], input[aria-label*="search" i]');
  await searchInput.fill(query);

  // Wait for search results to update
  await page.waitForTimeout(500);
}

/**
 * Gets the count of visible consents
 * @param page Playwright page object
 * @returns Promise<number> Number of consents displayed
 */
export async function getConsentCount(page: Page): Promise<number> {
  // Count visible consent cards
  const consents = page.locator('[role="article"]');
  return await consents.count();
}

/**
 * Opens a consent view dialog
 * @param page Playwright page object
 * @param organizationName Name of the organization to view consent for
 */
export async function viewConsent(
  page: Page,
  organizationName: string
): Promise<void> {
  // Click on the consent card
  await page.click(`[role="article"]:has-text("${organizationName}")`);

  // Wait for view dialog to open
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator(`text="${organizationName}"`).first()).toBeVisible();
}

/**
 * Closes the currently open consent dialog
 * @param page Playwright page object
 */
export async function closeConsentDialog(page: Page): Promise<void> {
  // Click close button or overlay
  const closeButton = page.locator('[role="dialog"] button[aria-label*="close" i]');
  if (await closeButton.isVisible()) {
    await closeButton.click();
  } else {
    // Try pressing Escape key
    await page.keyboard.press('Escape');
  }

  // Wait for dialog to close
  await expect(page.getByRole('dialog')).not.toBeVisible();
}

/**
 * Verifies that a consent exists with specific data
 * @param page Playwright page object
 * @param organizationName Organization name to verify
 * @param expectedData Expected consent data to verify
 */
export async function verifyConsent(
  page: Page,
  organizationName: string,
  expectedData: Partial<ConsentData>
): Promise<void> {
  // Open the consent
  await viewConsent(page, organizationName);

  // Verify organization name
  await expect(page.locator(`text="${organizationName}"`).first()).toBeVisible();

  // Verify purpose if provided
  if (expectedData.purpose) {
    await expect(page.locator(`text="${expectedData.purpose}"`)).toBeVisible();
  }

  // Verify scope if provided
  if (expectedData.scope) {
    await expect(
      page.locator(`text=/scope.*${expectedData.scope}|access.*${expectedData.scope}/i`)
    ).toBeVisible();
  }

  // Close dialog
  await closeConsentDialog(page);
}

/**
 * Verifies consent status badge is displayed correctly
 * @param page Playwright page object
 * @param organizationName Organization name
 * @param expectedStatus Expected status (active, expired, revoked)
 */
export async function verifyConsentStatus(
  page: Page,
  organizationName: string,
  expectedStatus: string
): Promise<void> {
  // Find consent card
  const consentCard = page.locator(`[role="article"]:has-text("${organizationName}")`);

  // Verify status badge
  await expect(
    consentCard.locator(`text=/^${expectedStatus}$/i, [data-status="${expectedStatus}"]`)
  ).toBeVisible();
}

/**
 * Clears all filters and search on the consents page
 * @param page Playwright page object
 */
export async function clearConsentFilters(page: Page): Promise<void> {
  // Clear search input if it exists
  const searchInput = page.locator('input[placeholder*="Search" i]');
  if (await searchInput.isVisible()) {
    await searchInput.clear();
  }

  // Reset status filter if it exists
  const statusFilter = page.locator('[aria-label*="status" i]');
  if (await statusFilter.isVisible()) {
    await statusFilter.click();
    await page.click('[role="option"]:has-text("All")');
  }

  // Wait for results to update
  await page.waitForTimeout(500);
}

/**
 * Gets consent details from the view dialog
 * @param page Playwright page object
 * @returns Promise<object> Object containing consent details
 */
export async function getConsentDetails(page: Page): Promise<{
  organization: string;
  purpose: string;
  status: string;
  startDate?: string;
  endDate?: string;
}> {
  // Ensure dialog is open
  await expect(page.getByRole('dialog')).toBeVisible();

  // Extract details from dialog
  const organization = await page.locator('[data-field="organization"], [data-field="grantedTo"]').textContent() || '';
  const purpose = await page.locator('[data-field="purpose"]').textContent() || '';
  const status = await page.locator('[data-field="status"]').textContent() || '';

  return {
    organization: organization.trim(),
    purpose: purpose.trim(),
    status: status.trim(),
  };
}
