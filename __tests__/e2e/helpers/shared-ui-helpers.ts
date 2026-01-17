/**
 * E2E Test Helpers - Shared UI Operations
 *
 * Consolidates common UI interaction patterns used across multiple test helpers.
 * This reduces code duplication and provides consistent behavior.
 */

import { Page, expect } from '@playwright/test';

/**
 * Opens a dialog by clicking a specified button or element
 * @param page Playwright page object
 * @param selector Selector for the button/element that opens the dialog
 */
export async function openDialog(page: Page, selector: string): Promise<void> {
  await page.click(selector);

  // Wait for dialog to open
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
}

/**
 * Closes the currently open dialog using close button or Escape key
 * @param page Playwright page object
 */
export async function closeDialog(page: Page): Promise<void> {
  // Try clicking close button first
  const closeButton = page.locator('[role="dialog"] button[aria-label*="close" i], [role="dialog"] button:has-text("Close")');

  if (await closeButton.isVisible()) {
    await closeButton.click();
  } else {
    // Fallback to Escape key
    await page.keyboard.press('Escape');
  }

  // Wait for dialog to close
  await waitForDialogClose(page);
}

/**
 * Waits for a dialog to close (disappear from the page)
 * @param page Playwright page object
 */
export async function waitForDialogClose(page: Page): Promise<void> {
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });
}

/**
 * Searches for items using a search input field
 * @param page Playwright page object
 * @param query Search query string
 */
export async function searchItems(page: Page, query: string): Promise<void> {
  // Find search input
  const searchInput = page.locator('input[placeholder*="Search" i], input[aria-label*="search" i]');

  await searchInput.fill(query);

  // Wait for search results to update
  await page.waitForTimeout(500);
}

/**
 * Clears all filters on the current page
 * @param page Playwright page object
 */
export async function clearFilters(page: Page): Promise<void> {
  // Clear search input if present
  const searchInput = page.locator('input[placeholder*="Search" i]');
  if (await searchInput.isVisible()) {
    await searchInput.clear();
  }

  // Reset filter dropdowns to "All" if present
  const filterSelects = page.locator('[role="combobox"], select');
  const count = await filterSelects.count();

  for (let i = 0; i < count; i++) {
    const filter = filterSelects.nth(i);
    if (await filter.isVisible()) {
      await filter.click();
      const allOption = page.locator('[role="option"]:has-text("All")');
      if (await allOption.isVisible()) {
        await allOption.click();
      }
    }
  }

  // Wait for filters to apply
  await page.waitForTimeout(500);
}

/**
 * Selects a filter option from a filter dropdown
 * @param page Playwright page object
 * @param filterName Name or label of the filter (e.g., "status", "category")
 * @param value Value to select (e.g., "active", "personal")
 */
export async function selectFilter(
  page: Page,
  filterName: string,
  value: string
): Promise<void> {
  // Find filter by label or name
  const filter = page.locator(`[aria-label*="${filterName}" i], [name="${filterName}"]`);

  await filter.click();

  // Select the option
  await page.click(`[role="option"]:has-text("${value}")`);

  // Wait for filter to apply
  await page.waitForTimeout(500);
}

/**
 * Gets the count of visible items on the page
 * @param page Playwright page object
 * @param selector Optional specific selector for items (defaults to [role="article"])
 * @returns Promise<number> Number of visible items
 */
export async function getItemCount(page: Page, selector: string = '[role="article"]'): Promise<number> {
  const items = page.locator(selector);
  return await items.count();
}

/**
 * Verifies that an empty state message is displayed
 * @param page Playwright page object
 * @param expectedMessage Optional expected message text
 */
export async function verifyEmptyState(page: Page, expectedMessage?: string): Promise<void> {
  if (expectedMessage) {
    await expect(page.locator(`text=${expectedMessage}`)).toBeVisible();
  } else {
    // Look for common empty state patterns
    await expect(
      page.locator('text=/no.*yet|empty|nothing to show|no results/i')
    ).toBeVisible();
  }
}

/**
 * Verifies that a status badge is displayed with the expected status
 * @param page Playwright page object
 * @param expectedStatus Expected status text (e.g., "Active", "Revoked", "Completed")
 * @param parentSelector Optional parent selector to scope the search
 */
export async function verifyStatusBadge(
  page: Page,
  expectedStatus: string,
  parentSelector?: string
): Promise<void> {
  const container = parentSelector ? page.locator(parentSelector) : page;

  // Look for status badge with various possible selectors
  const statusBadge = container.locator(
    `[data-status="${expectedStatus.toLowerCase()}"], ` +
    `span:has-text("${expectedStatus}"), ` +
    `text=/^${expectedStatus}$/i`
  );

  await expect(statusBadge.first()).toBeVisible();
}

/**
 * Waits for a success toast/notification to appear
 * @param page Playwright page object
 * @param expectedMessage Optional expected message text
 */
export async function waitForSuccessToast(page: Page, expectedMessage?: string): Promise<void> {
  if (expectedMessage) {
    await expect(page.locator(`text=${expectedMessage}`)).toBeVisible({ timeout: 10000 });
  } else {
    // Look for common success patterns
    await expect(
      page.locator('text=/success|successfully|saved|created|updated|deleted/i')
    ).toBeVisible({ timeout: 10000 });
  }
}

/**
 * Waits for an error toast/notification to appear
 * @param page Playwright page object
 * @param expectedMessage Optional expected error message text
 */
export async function waitForErrorToast(page: Page, expectedMessage?: string): Promise<void> {
  if (expectedMessage) {
    await expect(page.locator(`text=${expectedMessage}`)).toBeVisible({ timeout: 10000 });
  } else {
    // Look for common error patterns
    await expect(
      page.locator('[role="alert"], text=/error|failed|invalid|required/i')
    ).toBeVisible({ timeout: 10000 });
  }
}

/**
 * Fills a form field using the most reliable method for the current browser
 * @param page Playwright page object
 * @param selector Selector for the input field
 * @param value Value to fill
 */
export async function fillFormField(page: Page, selector: string, value: string): Promise<void> {
  const field = page.locator(selector);

  // Clear existing value first
  await field.clear();

  // Use pressSequentially for better compatibility (especially WebKit)
  await field.pressSequentially(value, { delay: 50 });

  // Verify value was filled
  await expect(field).toHaveValue(value);
}

/**
 * Clicks a button and waits for navigation to complete
 * @param page Playwright page object
 * @param buttonSelector Selector for the button to click
 * @param expectedUrl Expected URL pattern after navigation
 */
export async function clickAndNavigate(
  page: Page,
  buttonSelector: string,
  expectedUrl: string
): Promise<void> {
  await page.click(buttonSelector);

  // Wait for navigation
  await page.waitForURL(`**${expectedUrl}`, { timeout: 10000 });

  // Wait for page to be ready
  await page.waitForLoadState('networkidle');
}

/**
 * Verifies that a specific number of items are displayed
 * @param page Playwright page object
 * @param expectedCount Expected number of items
 * @param selector Selector for items (defaults to [role="article"])
 */
export async function verifyItemCount(
  page: Page,
  expectedCount: number,
  selector: string = '[role="article"]'
): Promise<void> {
  const items = page.locator(selector);
  await expect(items).toHaveCount(expectedCount, { timeout: 5000 });
}

/**
 * Scrolls to an element to bring it into view
 * @param page Playwright page object
 * @param selector Selector for the element to scroll to
 */
export async function scrollToElement(page: Page, selector: string): Promise<void> {
  await page.locator(selector).scrollIntoViewIfNeeded();
}

/**
 * Waits for a loading indicator to disappear
 * @param page Playwright page object
 */
export async function waitForLoadingToFinish(page: Page): Promise<void> {
  // Wait for common loading indicators to disappear
  const loadingIndicators = page.locator(
    'text=/loading|please wait/i, [aria-busy="true"], [data-loading="true"]'
  );

  // Wait for all loading indicators to disappear
  await expect(loadingIndicators).toHaveCount(0, { timeout: 15000 });
}
