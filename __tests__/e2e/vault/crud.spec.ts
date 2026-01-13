/**
 * E2E Tests - Vault CRUD Operations
 *
 * Tests for vault entry create, read, update, delete operations.
 */

import { test, expect } from '@playwright/test';
import { signup, clearSession, getUniqueEmail, TEST_USER } from '../helpers/auth';
import { generateVaultEntry } from '../helpers/data-generators';

test.describe('Vault CRUD Operations', () => {
  test.beforeEach(async ({ page }) => {
    // Clear session and create authenticated user
    await clearSession(page);
    const email = getUniqueEmail();
    await signup(page, email, TEST_USER.password);

    // Navigate to vault page
    await page.goto('/vault');

    // Wait for the page to load - either show entries or empty state
    await page.waitForSelector('button:has-text("Create Vault Entry")', { timeout: 10000 });
  });

  test.describe('Create Vault Entry', () => {
    test('should display create dialog when clicking create button', async ({ page }) => {
      await page.click('button:has-text("Create Vault Entry")');

      // Dialog should be visible - use the heading to avoid ambiguity
      await expect(page.getByRole('heading', { name: 'Create Vault Entry' })).toBeVisible();

      // Form fields should be visible
      await expect(page.locator('input[name="label"]')).toBeVisible();
      await expect(page.locator('select[name="category"]')).toBeVisible();
    });

    test('should successfully create a vault entry', async ({ page }) => {
      // Add debug logging for network requests
      page.on('response', async (response) => {
        if (response.url().includes('/api/vault')) {
          const status = response.status();
          let body = '';
          try {
            body = await response.text();
          } catch (e) {
            body = '[Unable to read body]';
          }
          console.log('🌐 API Response:', {
            url: response.url(),
            method: response.request().method(),
            status,
            statusText: response.statusText(),
            body: body.substring(0, 500), // Limit body length
          });
        }
      });

      // Log cookies to verify session
      const cookies = await page.context().cookies();
      const authCookies = cookies.filter(c => c.name.includes('auth') || c.name.includes('sb-'));
      console.log('🍪 Auth cookies:', authCookies.length, 'found');
      authCookies.forEach(c => {
        console.log(`  - ${c.name}: ${c.value.substring(0, 20)}...`);
      });

      const entry = generateVaultEntry();

      // Open create dialog
      await page.click('button:has-text("Create Vault Entry")');

      // Wait for dialog to be fully loaded
      await page.waitForSelector('input[name="label"]', { state: 'visible' });

      // Fill form using Playwright's type method which is more reliable
      await page.locator('input[name="label"]').clear();
      await page.locator('input[name="label"]').fill(entry.label);

      await page.locator('select[name="category"]').selectOption(entry.category);

      await page.locator('textarea[name="description"]').clear();
      await page.locator('textarea[name="description"]').fill(entry.description);

      await page.locator('input[placeholder*="tags"]').clear();
      await page.locator('input[placeholder*="tags"]').fill(entry.tags.join(', '));

      await page.locator('textarea[aria-label="Data"]').clear();
      await page.locator('textarea[aria-label="Data"]').fill(JSON.stringify(entry.data));

      // Scroll to top to check for any validation errors
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (dialog) dialog.scrollTop = 0;
      });

      // Check if there are any visible alerts/errors before submitting
      const alerts = await page.locator('[role="alert"]').count();
      if (alerts > 0) {
        console.log(`Found ${alerts} validation errors before submission`);
        await page.screenshot({ path: 'vault-validation-errors.png', fullPage: true });
        const errorTexts = await page.locator('[role="alert"]').allTextContents();
        console.log('Validation errors:', errorTexts.join(', '));
      }

      // Wait a moment for form validation to complete
      await page.waitForTimeout(500);

      // Submit form by pressing Enter in the last field (more reliable)
      await page.locator('textarea[aria-label="Data"]').press('Tab');

      const submitButton = page.locator('button[type="submit"]:has-text("Create")');
      await expect(submitButton).toBeVisible();
      await expect(submitButton).toBeEnabled();
      await submitButton.click({ force: true });

      // Wait for either success (dialog closes) or stay open on error
      const dialogClosed = await Promise.race([
        page.waitForSelector('heading:has-text("Create Vault Entry")', { state: 'hidden', timeout: 10000 }).then(() => true).catch(() => false),
        page.waitForTimeout(10000).then(() => false),
      ]);

      if (!dialogClosed) {
        // Dialog didn't close - check for errors
        await page.screenshot({ path: 'vault-create-error.png', fullPage: true });
        const errorCount = await page.locator('[role="alert"]').count();
        console.log(`Dialog did not close. Found ${errorCount} errors`);
        throw new Error('Vault entry creation failed - dialog did not close');
      }

      // Wait for success toast
      await expect(page.locator('text=/created successfully/i')).toBeVisible({
        timeout: 10000,
      });

      // Entry should appear in list
      await expect(page.locator(`[role="article"]:has-text("${entry.label}")`)).toBeVisible({ timeout: 15000 });
    });

    test('should validate required fields on create', async ({ page }) => {
      // Open create dialog
      await page.click('button:has-text("Create Vault Entry")');

      // Try to submit without filling required fields
      await page.click('button[type="submit"]:has-text("Create")');

      // Should show validation errors
      await expect(page.locator('[role="alert"]').first()).toBeVisible();
    });

    test('should validate JSON format', async ({ page }) => {
      // Open create dialog
      await page.click('button:has-text("Create Vault Entry")');

      // Fill form with invalid JSON
      await page.fill('input[name="label"]', 'Test Entry');
      await page.selectOption('select[name="category"]', 'personal');
      await page.fill('textarea[aria-label="Data"]', 'invalid json');

      // Submit form
      await page.click('button[type="submit"]:has-text("Create")');

      // Should show JSON validation error
      await expect(page.locator('text=/Invalid JSON/i')).toBeVisible();
    });

    test('should cancel creation and close dialog', async ({ page }) => {
      // Open create dialog
      await page.click('button:has-text("Create Vault Entry")');

      // Click cancel
      await page.click('button:has-text("Cancel")');

      // Dialog should be closed - check that the dialog heading is not visible
      await expect(page.getByRole('heading', { name: 'Create Vault Entry' })).not.toBeVisible();
    });
  });

  test.describe('Read Vault Entry', () => {
    test('should display vault entries in list', async ({ page }) => {
      // Create an entry first
      const entry = generateVaultEntry();
      await page.click('button:has-text("Create Vault Entry")');
      await page.fill('input[name="label"]', entry.label);
      await page.selectOption('select[name="category"]', entry.category);
      await page.fill('textarea[aria-label="Data"]', JSON.stringify(entry.data));
      await page.click('button[type="submit"]:has-text("Create")');

      // Wait for dialog to close and entry to appear
      await expect(page.getByRole('heading', { name: 'Create Vault Entry' })).not.toBeVisible({ timeout: 10000 });

      // Wait for entry to appear in the list
      const entryCard = page.locator(`[role="article"]:has-text("${entry.label}")`);
      await expect(entryCard).toBeVisible({ timeout: 10000 });

      // Entry card should show category badge
      await expect(entryCard.locator(`text=${entry.category}`)).toBeVisible();
    });

    test('should open view dialog when clicking entry', async ({ page }) => {
      // Create an entry
      const entry = generateVaultEntry();
      await page.click('button:has-text("Create Vault Entry")');
      await page.fill('input[name="label"]', entry.label);
      await page.selectOption('select[name="category"]', entry.category);
      await page.fill('textarea[aria-label="Data"]', JSON.stringify(entry.data));
      await page.click('button[type="submit"]:has-text("Create")');

      // Wait for dialog to close
      await expect(page.getByRole('heading', { name: 'Create Vault Entry' })).not.toBeVisible({ timeout: 10000 });

      // Wait for entry to appear in the list, then click on it
      const entryCard = page.locator(`[role="article"]:has-text("${entry.label}")`);
      await expect(entryCard).toBeVisible({ timeout: 10000 });
      await entryCard.click();

      // View dialog should open with entry details
      await expect(page.getByRole('heading', { name: entry.label })).toBeVisible({ timeout: 5000 });
    });

    test('should display empty state when no entries exist', async ({ page }) => {
      // Should show empty state message (use the data-testid for more reliability)
      await expect(
        page.locator('[data-testid="empty-state"]')
      ).toBeVisible({ timeout: 10000 });
    });

    test('should filter entries by category', async ({ page }) => {
      // Create entries with different categories
      const personalEntry = generateVaultEntry({ label: 'Personal Entry', category: 'personal' });
      const healthEntry = generateVaultEntry({ label: 'Health Entry', category: 'health' });

      // Create personal entry
      await page.click('button:has-text("Create Vault Entry")');
      await page.fill('input[name="label"]', personalEntry.label);
      await page.selectOption('select[name="category"]', personalEntry.category);
      await page.fill('textarea[aria-label="Data"]', JSON.stringify(personalEntry.data));
      await page.click('button[type="submit"]:has-text("Create")');
      await page.waitForTimeout(1000);

      // Create health entry
      await page.click('button:has-text("Create Vault Entry")');
      await page.fill('input[name="label"]', healthEntry.label);
      await page.selectOption('select[name="category"]', healthEntry.category);
      await page.fill('textarea[aria-label="Data"]', JSON.stringify(healthEntry.data));
      await page.click('button[type="submit"]:has-text("Create")');
      await page.waitForTimeout(1000);

      // Filter by health
      await page.selectOption('select[aria-label="Category filter"]', 'health');

      // Only health entry should be visible
      await expect(page.locator(`text=${healthEntry.label}`)).toBeVisible();
      await expect(page.locator(`text=${personalEntry.label}`)).not.toBeVisible();
    });

    test('should search entries by label', async ({ page }) => {
      // Create entries
      const entry1 = generateVaultEntry({ label: 'Unique Test Entry' });
      const entry2 = generateVaultEntry({ label: 'Another Entry' });

      // Create both entries
      for (const entry of [entry1, entry2]) {
        await page.click('button:has-text("Create Vault Entry")');
        await page.fill('input[name="label"]', entry.label);
        await page.selectOption('select[name="category"]', entry.category);
        await page.fill('textarea[aria-label="Data"]', JSON.stringify(entry.data));
        await page.click('button[type="submit"]:has-text("Create")');
        await page.waitForTimeout(1000);
      }

      // Search for "Unique"
      await page.fill('input[placeholder*="Search"]', 'Unique');

      // Only first entry should be visible
      await expect(page.locator(`text=${entry1.label}`)).toBeVisible();
      await expect(page.locator(`text=${entry2.label}`)).not.toBeVisible();
    });
  });

  test.describe('Update Vault Entry', () => {
    test('should open edit dialog from view dialog', async ({ page }) => {
      // Create entry
      const entry = generateVaultEntry();
      await page.click('button:has-text("Create Vault Entry")');
      await page.fill('input[name="label"]', entry.label);
      await page.selectOption('select[name="category"]', entry.category);
      await page.fill('textarea[aria-label="Data"]', JSON.stringify(entry.data));
      await page.click('button[type="submit"]:has-text("Create")');

      // Click entry to view
      await page.click(`[role="article"]:has-text("${entry.label}")`);

      // Click edit button
      await page.click('button:has-text("Edit")');

      // Edit dialog should open with populated fields
      await expect(page.locator('text=Edit Vault Entry')).toBeVisible();
      await expect(page.locator('input[name="label"]')).toHaveValue(entry.label);
    });

    test('should successfully update vault entry', async ({ page }) => {
      // Create entry
      const entry = generateVaultEntry();
      await page.click('button:has-text("Create Vault Entry")');
      await page.fill('input[name="label"]', entry.label);
      await page.selectOption('select[name="category"]', entry.category);
      await page.fill('textarea[aria-label="Data"]', JSON.stringify(entry.data));
      await page.click('button[type="submit"]:has-text("Create")');

      // Open edit dialog
      await page.click(`[role="article"]:has-text("${entry.label}")`);
      await page.click('button:has-text("Edit")');

      // Update label
      const newLabel = 'Updated Test Entry';
      await page.fill('input[name="label"]', newLabel);

      // Save changes
      await page.click('button[type="submit"]:has-text("Save")');

      // Success toast
      await expect(page.locator('text=/updated successfully/i')).toBeVisible();

      // Updated label should be visible in list
      await expect(page.locator(`text=${newLabel}`)).toBeVisible();
      await expect(page.locator(`text=${entry.label}`)).not.toBeVisible();
    });

    test('should cancel update and discard changes', async ({ page }) => {
      // Create entry
      const entry = generateVaultEntry();
      await page.click('button:has-text("Create Vault Entry")');
      await page.fill('input[name="label"]', entry.label);
      await page.selectOption('select[name="category"]', entry.category);
      await page.fill('textarea[aria-label="Data"]', JSON.stringify(entry.data));
      await page.click('button[type="submit"]:has-text("Create")');

      // Open edit dialog
      await page.click(`[role="article"]:has-text("${entry.label}")`);
      await page.click('button:has-text("Edit")');

      // Make changes
      await page.fill('input[name="label"]', 'Should Not Save');

      // Cancel
      await page.click('button:has-text("Cancel")');

      // Original label should still be visible
      await expect(page.locator(`text=${entry.label}`)).toBeVisible();
      await expect(page.locator('text=Should Not Save')).not.toBeVisible();
    });
  });

  test.describe('Delete Vault Entry', () => {
    test('should successfully delete vault entry', async ({ page }) => {
      // Create entry
      const entry = generateVaultEntry();
      await page.click('button:has-text("Create Vault Entry")');
      await page.fill('input[name="label"]', entry.label);
      await page.selectOption('select[name="category"]', entry.category);
      await page.fill('textarea[aria-label="Data"]', JSON.stringify(entry.data));
      await page.click('button[type="submit"]:has-text("Create")');

      // Open entry
      await page.click(`[role="article"]:has-text("${entry.label}")`);

      // Click delete button
      await page.click('button:has-text("Delete")');

      // Confirm deletion (if confirmation dialog exists)
      const confirmButton = page.locator('button:has-text("Confirm")');
      if (await confirmButton.count() > 0) {
        await confirmButton.click();
      }

      // Success toast
      await expect(page.locator('text=/deleted successfully/i')).toBeVisible();

      // Entry should no longer be visible
      await expect(page.locator(`text=${entry.label}`)).not.toBeVisible();
    });

    test('should show empty state after deleting last entry', async ({ page }) => {
      // Create entry
      const entry = generateVaultEntry();
      await page.click('button:has-text("Create Vault Entry")');
      await page.fill('input[name="label"]', entry.label);
      await page.selectOption('select[name="category"]', entry.category);
      await page.fill('textarea[aria-label="Data"]', JSON.stringify(entry.data));
      await page.click('button[type="submit"]:has-text("Create")');

      // Delete entry
      await page.click(`[role="article"]:has-text("${entry.label}")`);
      await page.click('button:has-text("Delete")');

      const confirmButton = page.locator('button:has-text("Confirm")');
      if (await confirmButton.count() > 0) {
        await confirmButton.click();
      }

      // Empty state should appear
      await expect(
        page.locator('text=/No vault entries yet|Create your first entry/i')
      ).toBeVisible();
    });
  });
});
