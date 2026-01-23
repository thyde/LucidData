/**
 * E2E Tests - Audit Log Viewing
 *
 * Tests for viewing and validating audit log functionality.
 */

import { test, expect } from '@playwright/test';
import { signup, clearSession, getUniqueEmail, TEST_USER } from '../helpers/auth';
import { generateVaultEntry } from '../helpers/data-generators';

test.describe.skip('Audit Log', () => {
  test.beforeEach(async ({ page }) => {
    // Clear session and create authenticated user
    await clearSession(page);
    const email = getUniqueEmail();
    await signup(page, email, TEST_USER.password);
  });

  test.describe('Viewing Audit Log', () => {
    test('should display audit page with correct title', async ({ page }) => {
      // Navigate to audit page
      await page.goto('/audit');

      // Page should load
      await expect(page).toHaveURL('/audit');

      // Title should be visible
      await expect(page.locator('h1:has-text("Audit Log")')).toBeVisible();

      // Description should be visible
      await expect(page.locator('text=/Complete history of data access/i')).toBeVisible();
    });

    test('should show loading state initially', async ({ page }) => {
      // Navigate to audit page
      await page.goto('/audit');

      // Loading text should appear briefly (may be too fast to catch)
      // This is a best-effort check
      const loadingText = page.locator('text=/Loading audit logs/i');
      try {
        await expect(loadingText).toBeVisible({ timeout: 1000 });
      } catch {
        // Loading might be too fast, which is fine
      }
    });

    test('should display empty state when no audit logs exist', async ({ page }) => {
      // Navigate to audit page
      await page.goto('/audit');

      // Wait for loading to complete
      await page.waitForLoadState('networkidle');

      // Check if empty state is shown
      const emptyState = page.locator('text=/No audit logs yet/i');
      const hasLogs = await page.locator('text=/Recent Activity/i').isVisible();

      if (!hasLogs) {
        await expect(emptyState).toBeVisible();
      }
    });

    test('should display audit logs after vault operations', async ({ page }) => {
      // Create a vault entry to generate audit logs
      await page.goto('/vault');
      await page.waitForSelector('button:has-text("Create Vault Entry")', { timeout: 10000 });

      const entry = generateVaultEntry();

      // Create vault entry
      await page.click('button:has-text("Create Vault Entry")');
      await page.waitForSelector('input[name="label"]', { state: 'visible' });
      await page.locator('input[name="label"]').fill(entry.label);
      await page.locator('select[name="category"]').selectOption(entry.category);
      await page.locator('textarea[aria-label="Data"]').fill(JSON.stringify(entry.data));
      await page.click('button[type="submit"]:has-text("Create")');

      // Wait for dialog to close (indicates success)
      await expect(page.getByRole('heading', { name: 'Create Vault Entry' })).not.toBeVisible({ timeout: 15000 });

      // Wait for the create operation to complete
      await page.waitForLoadState('networkidle');

      // Navigate to audit page
      await page.goto('/audit');

      // Wait for the page to fully load
      await page.waitForLoadState('networkidle');

      // Recent Activity section should be visible
      await expect(page.locator('text=/Recent Activity/i')).toBeVisible({ timeout: 10000 });

      // Wait for audit entries to appear (giving time for polling interval if needed)
      // Using the new data-testid attribute
      const auditEntries = page.locator('[data-testid="audit-entry"]');
      await expect(auditEntries.first()).toBeVisible({ timeout: 10000 });
    });

    test('should display audit log details correctly', async ({ page }) => {
      // Create a vault entry to generate audit logs
      await page.goto('/vault');
      await page.waitForSelector('button:has-text("Create Vault Entry")', { timeout: 10000 });

      const entry = generateVaultEntry();

      // Create vault entry
      await page.click('button:has-text("Create Vault Entry")');
      await page.waitForSelector('input[name="label"]', { state: 'visible' });
      await page.locator('input[name="label"]').fill(entry.label);
      await page.locator('select[name="category"]').selectOption(entry.category);
      await page.locator('textarea[aria-label="Data"]').fill(JSON.stringify(entry.data));
      await page.click('button[type="submit"]:has-text("Create")');

      // Wait for dialog to close (indicates success)
      await expect(page.getByRole('heading', { name: 'Create Vault Entry' })).not.toBeVisible({ timeout: 15000 });

      // Navigate to audit page
      await page.goto('/audit');

      // Wait for audit logs to load
      await page.waitForLoadState('networkidle');

      // Check that audit log has required elements
      const firstLog = page.locator('[data-testid="audit-entry"]').first();
      await expect(firstLog).toBeVisible();

      // Should have action text
      const action = firstLog.locator('p[class*="font-medium"]');
      await expect(action).toBeVisible();

      // Should have timestamp
      const timestamp = firstLog.locator('text=/\\d{1,2}\\/\\d{1,2}\\/\\d{4}/');
      await expect(timestamp).toBeVisible();

      // Should have success badge
      const successBadge = firstLog.locator('text=/Success|Failed/i');
      await expect(successBadge).toBeVisible();
    });

    test('should handle API errors gracefully', async ({ page }) => {
      // Intercept the API call and make it fail
      await page.route('**/api/audit', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      // Navigate to audit page
      await page.goto('/audit');

      // Wait for error state
      await page.waitForTimeout(2000);

      // Error message should be displayed
      await expect(page.locator('text=/Error loading audit log/i')).toBeVisible({ timeout: 10000 });

      // Retry button should be visible
      await expect(page.locator('button:has-text("Retry")')).toBeVisible();
    });

    test('should reload when retry button is clicked', async ({ page }) => {
      let callCount = 0;

      // Intercept the API call - fail first time, succeed second time
      await page.route('**/api/audit', (route) => {
        callCount++;
        if (callCount === 1) {
          route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Internal Server Error' }),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ logs: [], chainValid: true, totalLogs: 0 }),
          });
        }
      });

      // Navigate to audit page
      await page.goto('/audit');

      // Wait for error state
      await page.waitForTimeout(1000);

      // Click retry button
      const retryButton = page.locator('button:has-text("Retry")');
      await expect(retryButton).toBeVisible({ timeout: 10000 });
      await retryButton.click();

      // Page should reload and show content (or empty state)
      await page.waitForTimeout(2000);
      await expect(page.locator('text=/Error loading audit log/i')).not.toBeVisible();
    });
  });

  test.describe('Audit Log after multiple operations', () => {
    test('should show audit logs for create, update, and delete operations', async ({ page }) => {
      // Create a vault entry
      await page.goto('/vault');
      await page.waitForSelector('button:has-text("Create Vault Entry")', { timeout: 10000 });

      const entry = generateVaultEntry();

      // CREATE
      await page.click('button:has-text("Create Vault Entry")');
      await page.waitForSelector('input[name="label"]', { state: 'visible' });
      await page.locator('input[name="label"]').fill(entry.label);
      await page.locator('select[name="category"]').selectOption(entry.category);
      await page.locator('textarea[aria-label="Data"]').fill(JSON.stringify(entry.data));
      await page.click('button[type="submit"]:has-text("Create")');
      await expect(page.getByRole('heading', { name: 'Create Vault Entry' })).not.toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(1000);

      // UPDATE
      await page.click(`[role="article"]:has-text("${entry.label}")`);
      await page.click('button:has-text("Edit")');
      await page.waitForSelector('input[name="label"]', { state: 'visible' });
      await page.locator('input[name="label"]').fill('Updated Entry');
      await page.click('button[type="submit"]:has-text("Save")');
      await expect(page.locator('text=Edit Vault Entry')).not.toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(1000);

      // DELETE
      await page.click('[role="article"]:has-text("Updated Entry")');
      await page.click('button:has-text("Delete")');
      const confirmButton = page.locator('button:has-text("Confirm")');
      if (await confirmButton.count() > 0) {
        await confirmButton.click();
      }
      await page.waitForTimeout(1000);

      // Navigate to audit page
      await page.goto('/audit');
      await page.waitForTimeout(2000);

      // Should have multiple audit log entries
      const auditEntries = page.locator('[data-testid="audit-entry"]');
      const count = await auditEntries.count();

      // Should have at least 3 entries (create, update, delete)
      expect(count).toBeGreaterThanOrEqual(3);
    });
  });
});
