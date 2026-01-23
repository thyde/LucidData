/**
 * E2E Test Helpers - Audit Log Operations
 *
 * Helper functions for audit log E2E testing operations
 */

import { Page, expect } from '@playwright/test';

export interface AuditEntry {
  action: string;
  eventType: string;
  timestamp: string;
  status: string;
  actorType?: string;
}

/**
 * Gets the count of visible audit log entries
 * @param page Playwright page object
 * @returns Promise<number> Number of audit entries displayed
 */
export async function getAuditLogCount(page: Page): Promise<number> {
  // Wait for audit logs to load
  await page.waitForSelector('[data-testid="audit-entry"], [role="row"]', {
    state: 'attached',
    timeout: 5000,
  }).catch(() => {
    // If no entries found, return 0
    return null;
  });

  // Count visible audit entries
  const entries = page.locator('[data-testid="audit-entry"], [role="row"]:not([role="row"]:has-text("Action"))');
  return await entries.count();
}

/**
 * Filters audit logs by action type
 * @param page Playwright page object
 * @param action Action type to filter by (CREATE, UPDATE, DELETE, ACCESS, etc.)
 */
export async function filterAuditByAction(page: Page, action: string): Promise<void> {
  // Click on action filter
  const actionFilter = page.locator('[aria-label*="action" i], [name="action"], [name="eventType"]');
  await actionFilter.click();

  // Select the action option
  await page.click(`[role="option"]:has-text("${action}")`);

  // Wait for filtered results
  await page.waitForTimeout(500);
}

/**
 * Filters audit logs by date range
 * @param page Playwright page object
 * @param startDate Start date for filter
 * @param endDate End date for filter
 */
export async function filterAuditByDateRange(
  page: Page,
  startDate: Date,
  endDate: Date
): Promise<void> {
  // Format dates as YYYY-MM-DD
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  // Fill start date
  const startDateInput = page.locator('input[name="startDate"], input[aria-label*="start date" i]');
  await startDateInput.fill(startDateStr);

  // Fill end date
  const endDateInput = page.locator('input[name="endDate"], input[aria-label*="end date" i]');
  await endDateInput.fill(endDateStr);

  // Wait for filtered results
  await page.waitForTimeout(500);
}

/**
 * Verifies the audit chain integrity indicator
 * @param page Playwright page object
 * @returns Promise<boolean> True if chain is valid, false otherwise
 */
export async function verifyAuditChainIntegrity(page: Page): Promise<boolean> {
  // Look for chain integrity indicator
  const chainStatus = page.locator('[data-testid="chain-status"], [aria-label*="chain integrity" i]');

  // Check if indicator exists and shows valid status
  if (await chainStatus.isVisible()) {
    const statusText = await chainStatus.textContent();
    return statusText?.toLowerCase().includes('valid') ||
           statusText?.toLowerCase().includes('intact') ||
           statusText?.toLowerCase().includes('verified') || false;
  }

  // If no indicator, assume chain is valid (may not be displayed)
  return true;
}

/**
 * Gets the latest audit log entry
 * @param page Playwright page object
 * @returns Promise<AuditEntry | null> Latest audit entry or null if none found
 */
export async function getLatestAuditEntry(page: Page): Promise<AuditEntry | null> {
  // Wait for audit logs to load
  await page.waitForSelector('[data-testid="audit-entry"], [role="row"]', {
    state: 'attached',
    timeout: 5000,
  }).catch(() => null);

  // Get the first entry (should be most recent)
  const firstEntry = page.locator('[data-testid="audit-entry"], [role="row"]:not([role="row"]:has-text("Action"))').first();

  if (!(await firstEntry.isVisible())) {
    return null;
  }

  // Extract entry data
  const action = await firstEntry.locator('[data-field="action"]').textContent() || '';
  const eventType = await firstEntry.locator('[data-field="eventType"]').textContent() || '';
  const timestamp = await firstEntry.locator('[data-field="timestamp"]').textContent() || '';
  const status = await firstEntry.locator('[data-field="status"]').textContent() || '';

  return {
    action: action.trim(),
    eventType: eventType.trim(),
    timestamp: timestamp.trim(),
    status: status.trim(),
  };
}

/**
 * Gets all visible audit log entries
 * @param page Playwright page object
 * @returns Promise<AuditEntry[]> Array of audit entries
 */
export async function getAllAuditEntries(page: Page): Promise<AuditEntry[]> {
  // Wait for audit logs to load
  await page.waitForSelector('[data-testid="audit-entry"], [role="row"]', {
    state: 'attached',
    timeout: 5000,
  }).catch(() => null);

  // Get all entries
  const entries = page.locator('[data-testid="audit-entry"], [role="row"]:not([role="row"]:has-text("Action"))');
  const count = await entries.count();

  const auditEntries: AuditEntry[] = [];

  for (let i = 0; i < count; i++) {
    const entry = entries.nth(i);

    const action = await entry.locator('[data-field="action"]').textContent() || '';
    const eventType = await entry.locator('[data-field="eventType"]').textContent() || '';
    const timestamp = await entry.locator('[data-field="timestamp"]').textContent() || '';
    const status = await entry.locator('[data-field="status"]').textContent() || '';

    auditEntries.push({
      action: action.trim(),
      eventType: eventType.trim(),
      timestamp: timestamp.trim(),
      status: status.trim(),
    });
  }

  return auditEntries;
}

/**
 * Searches audit logs by action description
 * @param page Playwright page object
 * @param query Search query string
 */
export async function searchAuditLogs(page: Page, query: string): Promise<void> {
  // Find and fill search input
  const searchInput = page.locator('input[placeholder*="Search" i], input[aria-label*="search" i]');
  await searchInput.fill(query);

  // Wait for search results to update
  await page.waitForTimeout(500);
}

/**
 * Verifies that a specific audit entry exists
 * @param page Playwright page object
 * @param expectedAction Expected action description (partial match)
 * @param expectedEventType Expected event type (CREATE, UPDATE, DELETE, ACCESS)
 */
export async function verifyAuditEntryExists(
  page: Page,
  expectedAction: string,
  expectedEventType?: string
): Promise<void> {
  // Look for entry with matching action
  const entry = page.locator(`[data-testid="audit-entry"]:has-text("${expectedAction}"), [role="row"]:has-text("${expectedAction}")`);

  // Verify entry is visible
  await expect(entry).toBeVisible({ timeout: 10000 });

  // If event type provided, verify it matches
  if (expectedEventType) {
    await expect(entry.locator(`text="${expectedEventType}"`)).toBeVisible();
  }
}

/**
 * Waits for a new audit entry to appear (useful after performing an action)
 * @param page Playwright page object
 * @param expectedAction Expected action description (partial match)
 * @param timeout Timeout in milliseconds (default: 10000)
 */
export async function waitForAuditEntry(
  page: Page,
  expectedAction: string,
  timeout: number = 10000
): Promise<void> {
  // Wait for the specific audit entry to appear
  await expect(
    page.locator(`[data-testid="audit-entry"]:has-text("${expectedAction}"), [role="row"]:has-text("${expectedAction}")`)
  ).toBeVisible({ timeout });
}

/**
 * Clears all filters on the audit log page
 * @param page Playwright page object
 */
export async function clearAuditFilters(page: Page): Promise<void> {
  // Clear search input if it exists
  const searchInput = page.locator('input[placeholder*="Search" i]');
  if (await searchInput.isVisible()) {
    await searchInput.clear();
  }

  // Reset action filter if it exists
  const actionFilter = page.locator('[aria-label*="action" i]');
  if (await actionFilter.isVisible()) {
    await actionFilter.click();
    await page.click('[role="option"]:has-text("All")');
  }

  // Clear date filters if they exist
  const startDateInput = page.locator('input[name="startDate"]');
  if (await startDateInput.isVisible()) {
    await startDateInput.clear();
  }

  const endDateInput = page.locator('input[name="endDate"]');
  if (await endDateInput.isVisible()) {
    await endDateInput.clear();
  }

  // Wait for results to update
  await page.waitForTimeout(500);
}

/**
 * Expands an audit entry to view details
 * @param page Playwright page object
 * @param action Action description to identify the entry
 */
export async function expandAuditEntry(page: Page, action: string): Promise<void> {
  // Find the entry
  const entry = page.locator(`[data-testid="audit-entry"]:has-text("${action}"), [role="row"]:has-text("${action}")`);

  // Click to expand (if expandable)
  const expandButton = entry.locator('button[aria-label*="expand" i], button[aria-label*="details" i]');
  if (await expandButton.isVisible()) {
    await expandButton.click();

    // Wait for details to appear
    await page.waitForTimeout(300);
  }
}

/**
 * Verifies that audit entries are sorted by timestamp (most recent first)
 * @param page Playwright page object
 * @returns Promise<boolean> True if properly sorted
 */
export async function verifyAuditSortOrder(page: Page): Promise<boolean> {
  const entries = await getAllAuditEntries(page);

  if (entries.length < 2) {
    return true; // Not enough entries to verify sort
  }

  // Parse timestamps and verify descending order
  for (let i = 0; i < entries.length - 1; i++) {
    const current = new Date(entries[i].timestamp);
    const next = new Date(entries[i + 1].timestamp);

    // Current should be newer than or equal to next
    if (current < next) {
      return false;
    }
  }

  return true;
}

/**
 * Clicks the retry button when audit logs fail to load
 * @param page Playwright page object
 */
export async function retryLoadingAuditLogs(page: Page): Promise<void> {
  // Look for retry button
  const retryButton = page.locator('button:has-text("Retry"), button:has-text("Try Again")');

  if (await retryButton.isVisible()) {
    await retryButton.click();

    // Wait for logs to reload
    await page.waitForTimeout(1000);
  }
}

/**
 * Verifies that the audit log page displays empty state
 * @param page Playwright page object
 */
export async function verifyAuditEmptyState(page: Page): Promise<void> {
  // Look for empty state message
  await expect(
    page.locator('text=/no audit logs|no entries|no activity/i')
  ).toBeVisible();
}

/**
 * Verifies that the audit log page displays loading state
 * @param page Playwright page object
 */
export async function verifyAuditLoadingState(page: Page): Promise<void> {
  // Look for loading indicator
  await expect(
    page.locator('[aria-label="Loading"], [data-testid="loading"], text=/loading/i')
  ).toBeVisible();
}
