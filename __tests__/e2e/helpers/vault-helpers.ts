/**
 * E2E Test Helpers - Vault Operations
 *
 * Helper functions for vault-related E2E testing operations
 */

import { Page, expect } from '@playwright/test';
import { VaultEntryData } from './data-generators';

/**
 * Creates a new vault entry through the UI
 * @param page Playwright page object
 * @param data Vault entry data to create
 * @returns Promise<string> The created entry ID (extracted from URL or data attribute)
 */
export async function createVaultEntry(
  page: Page,
  data: VaultEntryData
): Promise<string> {
  // Click create button
  await page.click('button:has-text("Create Vault Entry")');

  // Wait for dialog to open
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: /create vault entry/i })
  ).toBeVisible();

  // Fill in form fields
  await page.fill('input[name="label"]', data.label);

  // Select category
  await page.click('[name="category"]');
  await page.click(`[role="option"]:has-text("${data.category}")`);

  if (data.description) {
    await page.fill('textarea[name="description"]', data.description);
  }

  if (data.tags && data.tags.length > 0) {
    await page.fill('input[name="tags"]', data.tags.join(', '));
  }

  // Fill JSON data
  await page.fill('textarea[name="data"]', JSON.stringify(data.data));

  // Select data type
  await page.click('[name="dataType"]');
  await page.click(`[role="option"]:has-text("${data.dataType}")`);

  if (data.schemaType) {
    await page.fill('input[name="schemaType"]', data.schemaType);
  }

  // Submit form
  await page.click('button[type="submit"]:has-text("Create")');

  // Wait for dialog to close
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });

  // Wait for success message
  await expect(page.locator('text=/created successfully|added/i')).toBeVisible({
    timeout: 10000,
  });

  // Wait for the entry to appear in the list
  await expect(page.locator(`text="${data.label}"`)).toBeVisible();

  // Extract entry ID from the created card (if data-testid or data-id is available)
  // Otherwise, we'll just return a placeholder as ID extraction may vary by implementation
  const entryCard = page.locator(`[role="article"]:has-text("${data.label}")`).first();
  const entryId = (await entryCard.getAttribute('data-id')) || 'created-entry';

  return entryId;
}

/**
 * Edits an existing vault entry through the UI
 * @param page Playwright page object
 * @param entryLabel Label of the entry to edit
 * @param updates Partial vault entry data to update
 */
export async function editVaultEntry(
  page: Page,
  entryLabel: string,
  updates: Partial<VaultEntryData>
): Promise<void> {
  // Click on the entry to view it
  await page.click(`[role="article"]:has-text("${entryLabel}")`);

  // Wait for view dialog to open
  await expect(page.getByRole('dialog')).toBeVisible();

  // Click edit button
  await page.click('button:has-text("Edit")');

  // Wait for edit dialog (may transition from view to edit)
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: /edit vault entry/i })
  ).toBeVisible();

  // Update fields
  if (updates.label) {
    await page.fill('input[name="label"]', updates.label);
  }

  if (updates.description !== undefined) {
    await page.fill('textarea[name="description"]', updates.description);
  }

  if (updates.data) {
    await page.fill('textarea[name="data"]', JSON.stringify(updates.data));
  }

  if (updates.tags) {
    await page.fill('input[name="tags"]', updates.tags.join(', '));
  }

  // Submit form
  await page.click('button[type="submit"]:has-text("Save")');

  // Wait for dialog to close
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });

  // Wait for success message
  await expect(page.locator('text=/updated successfully|saved/i')).toBeVisible({
    timeout: 10000,
  });
}

/**
 * Deletes a vault entry through the UI
 * @param page Playwright page object
 * @param entryLabel Label of the entry to delete
 */
export async function deleteVaultEntry(
  page: Page,
  entryLabel: string
): Promise<void> {
  // Click on the entry to view it
  await page.click(`[role="article"]:has-text("${entryLabel}")`);

  // Wait for view dialog to open
  await expect(page.getByRole('dialog')).toBeVisible();

  // Click delete button in main dialog
  await page.click('button:has-text("Delete")');

  // Wait for confirmation dialog (alertdialog)
  await expect(page.getByRole('alertdialog')).toBeVisible();

  // Set up response listener before confirming deletion
  const deleteResponse = page.waitForResponse(resp =>
    resp.url().includes('/api/vault/') && resp.request().method() === 'DELETE'
  );

  // Click the Delete button in the confirmation dialog
  // Use a more specific selector that targets the destructive button in the alertdialog
  const confirmButton = page.locator('[role="alertdialog"] button[class*="destructive"]:has-text("Delete")');
  await confirmButton.click();

  // Wait for the DELETE API call to complete
  await deleteResponse;

  // Wait for confirmation dialog to close
  await expect(page.getByRole('alertdialog')).not.toBeVisible();

  // Wait for view dialog to close
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });

  // Wait for success message (toast notification)
  await expect(page.locator('text=/deleted successfully|removed/i')).toBeVisible({
    timeout: 10000,
  });

  // Verify entry is no longer in the list
  await expect(page.locator(`[role="article"]:has-text("${entryLabel}")`)).not.toBeVisible();
}

/**
 * Searches for vault entries using the search input
 * @param page Playwright page object
 * @param query Search query string
 */
export async function searchVaultEntries(page: Page, query: string): Promise<void> {
  // Find and fill search input
  const searchInput = page.locator('input[placeholder*="Search" i], input[aria-label*="search" i]');
  await searchInput.fill(query);

  // Wait for search results to update (debounce delay)
  await page.waitForTimeout(500);
}

/**
 * Filters vault entries by category
 * @param page Playwright page object
 * @param category Category to filter by (personal, health, financial, credentials, other)
 */
export async function filterVaultByCategory(
  page: Page,
  category: string
): Promise<void> {
  // Click on category filter/select
  const categoryFilter = page.locator('[aria-label*="category" i], select[name*="category" i]');
  await categoryFilter.click();

  // Select the category option
  await page.click(`[role="option"]:has-text("${category}")`);

  // Wait for filtered results
  await page.waitForTimeout(500);
}

/**
 * Gets the count of visible vault entries
 * @param page Playwright page object
 * @returns Promise<number> Number of vault entries displayed
 */
export async function getVaultEntryCount(page: Page): Promise<number> {
  // Count visible entry cards
  const entries = page.locator('[role="article"]');
  return await entries.count();
}

/**
 * Opens a vault entry view dialog
 * @param page Playwright page object
 * @param entryLabel Label of the entry to view
 */
export async function viewVaultEntry(page: Page, entryLabel: string): Promise<void> {
  // Click on the entry card
  await page.click(`[role="article"]:has-text("${entryLabel}")`);

  // Wait for view dialog to open
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator(`text="${entryLabel}"`).first()).toBeVisible();
}

/**
 * Closes the currently open vault dialog
 * @param page Playwright page object
 */
export async function closeVaultDialog(page: Page): Promise<void> {
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
 * Verifies that a vault entry exists with specific data
 * @param page Playwright page object
 * @param entryLabel Label of the entry to verify
 * @param expectedData Expected data fields to verify
 */
export async function verifyVaultEntry(
  page: Page,
  entryLabel: string,
  expectedData: Partial<VaultEntryData>
): Promise<void> {
  // Open the entry
  await viewVaultEntry(page, entryLabel);

  // Verify label
  await expect(page.locator(`text="${entryLabel}"`).first()).toBeVisible();

  // Verify category if provided
  if (expectedData.category) {
    await expect(
      page.locator(`text=/category.*${expectedData.category}/i`)
    ).toBeVisible();
  }

  // Verify description if provided
  if (expectedData.description) {
    await expect(page.locator(`text="${expectedData.description}"`)).toBeVisible();
  }

  // Verify tags if provided
  if (expectedData.tags && expectedData.tags.length > 0) {
    for (const tag of expectedData.tags) {
      await expect(page.locator(`text="${tag}"`)).toBeVisible();
    }
  }

  // Close dialog
  await closeVaultDialog(page);
}

/**
 * Clears all filters and search on the vault page
 * @param page Playwright page object
 */
export async function clearVaultFilters(page: Page): Promise<void> {
  // Clear search input if it exists
  const searchInput = page.locator('input[placeholder*="Search" i]');
  if (await searchInput.isVisible()) {
    await searchInput.clear();
  }

  // Reset category filter if it exists
  const categoryFilter = page.locator('[aria-label*="category" i]');
  if (await categoryFilter.isVisible()) {
    await categoryFilter.click();
    await page.click('[role="option"]:has-text("All")');
  }

  // Wait for results to update
  await page.waitForTimeout(500);
}
