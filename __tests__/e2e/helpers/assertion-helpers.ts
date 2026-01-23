/**
 * E2E Test Helpers - Custom Assertions
 *
 * Helper functions for common assertions in E2E tests
 */

import { Page, expect } from '@playwright/test';

/**
 * Expects a toast message to be visible with specific text
 * @param page Playwright page object
 * @param message Expected message text (partial match supported)
 * @param type Optional toast type (success, error, info, warning)
 */
export async function expectToastMessage(
  page: Page,
  message: string,
  type?: 'success' | 'error' | 'info' | 'warning'
): Promise<void> {
  // Look for toast container with message
  const toastSelector = '[role="status"], [role="alert"], .toast, [data-testid="toast"]';
  const toast = page.locator(toastSelector).filter({ hasText: message });

  // Verify toast is visible
  await expect(toast).toBeVisible({ timeout: 10000 });

  // If type is specified, verify toast has correct type class or attribute
  if (type) {
    await expect(
      toast.locator(`[data-type="${type}"], .toast-${type}, [class*="${type}"]`)
    ).toBeVisible();
  }
}

/**
 * Expects an error message to be displayed
 * @param page Playwright page object
 * @param message Expected error message text (partial match supported)
 */
export async function expectErrorMessage(page: Page, message: string): Promise<void> {
  // Look for error message in various possible locations
  const errorSelectors = [
    `[role="alert"]:has-text("${message}")`,
    `[data-testid="error"]:has-text("${message}")`,
    `.error:has-text("${message}")`,
    `[class*="error"]:has-text("${message}")`,
    `text=/error.*${message}/i`,
  ];

  // Try each selector
  let found = false;
  for (const selector of errorSelectors) {
    const element = page.locator(selector).first();
    if (await element.isVisible().catch(() => false)) {
      await expect(element).toBeVisible();
      found = true;
      break;
    }
  }

  // If not found in any selector, use a more general approach
  if (!found) {
    await expect(page.locator(`text="${message}"`).first()).toBeVisible({ timeout: 10000 });
  }
}

/**
 * Expects a dialog to be open with a specific title
 * @param page Playwright page object
 * @param title Expected dialog title (partial match supported)
 */
export async function expectDialogOpen(page: Page, title: string): Promise<void> {
  // Verify dialog is visible
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });

  // Verify dialog has expected title
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: new RegExp(title, 'i') })
  ).toBeVisible();
}

/**
 * Expects all dialogs to be closed
 * @param page Playwright page object
 */
export async function expectDialogClosed(page: Page): Promise<void> {
  // Verify no dialogs are visible
  await expect(page.getByRole('dialog')).not.toBeVisible();
}

/**
 * Expects an alert dialog to be open with specific text
 * @param page Playwright page object
 * @param text Expected alert text (partial match supported)
 */
export async function expectAlertDialog(page: Page, text: string): Promise<void> {
  // Verify alert dialog is visible
  await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 10000 });

  // Verify alert has expected text
  await expect(page.getByRole('alertdialog').locator(`text="${text}"`)).toBeVisible();
}

/**
 * Expects the page title to match
 * @param page Playwright page object
 * @param title Expected page title (h1 or h2)
 */
export async function expectPageTitle(page: Page, title: string): Promise<void> {
  // Check for h1 or h2 with title
  const heading = page.locator(`h1:has-text("${title}"), h2:has-text("${title}")`);
  await expect(heading.first()).toBeVisible({ timeout: 10000 });
}

/**
 * Expects a success message to be displayed
 * @param page Playwright page object
 * @param message Expected success message text (partial match supported)
 */
export async function expectSuccessMessage(page: Page, message: string): Promise<void> {
  // Look for success message with partial text match
  await expect(page.locator(`text=/success|${message}/i`)).toBeVisible({ timeout: 10000 });
}

/**
 * Expects a loading state to be visible
 * @param page Playwright page object
 */
export async function expectLoadingState(page: Page): Promise<void> {
  // Look for loading indicator
  const loadingSelectors = [
    '[aria-label="Loading"]',
    '[data-testid="loading"]',
    '.loading',
    'text=/loading/i',
  ];

  let found = false;
  for (const selector of loadingSelectors) {
    const element = page.locator(selector).first();
    if (await element.isVisible().catch(() => false)) {
      await expect(element).toBeVisible();
      found = true;
      break;
    }
  }

  if (!found) {
    throw new Error('Loading state not found');
  }
}

/**
 * Expects a loading state to not be visible (finished loading)
 * @param page Playwright page object
 */
export async function expectLoadingFinished(page: Page): Promise<void> {
  // Wait for loading indicator to disappear
  const loadingSelectors = [
    '[aria-label="Loading"]',
    '[data-testid="loading"]',
    '.loading',
  ];

  for (const selector of loadingSelectors) {
    const element = page.locator(selector);
    if (await element.count() > 0) {
      await expect(element).not.toBeVisible();
    }
  }
}

/**
 * Expects an empty state to be displayed
 * @param page Playwright page object
 * @param message Optional expected empty state message
 */
export async function expectEmptyState(page: Page, message?: string): Promise<void> {
  // Look for empty state indicator
  const emptyStateSelector = '[data-testid="empty-state"], .empty-state, [class*="empty"]';
  await expect(page.locator(emptyStateSelector).first()).toBeVisible({ timeout: 10000 });

  // If message provided, verify it's displayed
  if (message) {
    await expect(page.locator(`text="${message}"`)).toBeVisible();
  }
}

/**
 * Expects a validation error to be displayed for a specific field
 * @param page Playwright page object
 * @param fieldName Field name or label
 * @param errorMessage Expected error message
 */
export async function expectFieldValidationError(
  page: Page,
  fieldName: string,
  errorMessage: string
): Promise<void> {
  // Look for error message near the field
  const field = page.locator(`input[name="${fieldName}"], textarea[name="${fieldName}"]`);
  const errorElement = page.locator(`[data-field="${fieldName}"] .error, #${fieldName}-error, text="${errorMessage}"`);

  await expect(errorElement.first()).toBeVisible({ timeout: 10000 });
}

/**
 * Expects a button to be disabled
 * @param page Playwright page object
 * @param buttonText Button text or aria-label
 */
export async function expectButtonDisabled(page: Page, buttonText: string): Promise<void> {
  const button = page.locator(`button:has-text("${buttonText}"), button[aria-label="${buttonText}"]`);
  await expect(button).toBeDisabled();
}

/**
 * Expects a button to be enabled
 * @param page Playwright page object
 * @param buttonText Button text or aria-label
 */
export async function expectButtonEnabled(page: Page, buttonText: string): Promise<void> {
  const button = page.locator(`button:has-text("${buttonText}"), button[aria-label="${buttonText}"]`);
  await expect(button).toBeEnabled();
}

/**
 * Expects an element to have specific text content
 * @param page Playwright page object
 * @param selector Element selector
 * @param expectedText Expected text content
 */
export async function expectElementText(
  page: Page,
  selector: string,
  expectedText: string
): Promise<void> {
  await expect(page.locator(selector)).toHaveText(expectedText, { timeout: 10000 });
}

/**
 * Expects an element to contain specific text (partial match)
 * @param page Playwright page object
 * @param selector Element selector
 * @param expectedText Expected text content (partial)
 */
export async function expectElementContainsText(
  page: Page,
  selector: string,
  expectedText: string
): Promise<void> {
  await expect(page.locator(selector)).toContainText(expectedText, { timeout: 10000 });
}

/**
 * Expects a count of elements to match
 * @param page Playwright page object
 * @param selector Element selector
 * @param expectedCount Expected number of elements
 */
export async function expectElementCount(
  page: Page,
  selector: string,
  expectedCount: number
): Promise<void> {
  await expect(page.locator(selector)).toHaveCount(expectedCount, { timeout: 10000 });
}

/**
 * Expects URL to contain a specific path
 * @param page Playwright page object
 * @param expectedPath Expected path in URL
 */
export async function expectUrlContains(page: Page, expectedPath: string): Promise<void> {
  await page.waitForURL(`**${expectedPath}**`, { timeout: 10000 });
  expect(page.url()).toContain(expectedPath);
}

/**
 * Expects a specific status badge to be visible
 * @param page Playwright page object
 * @param status Status text (active, expired, revoked, success, failed, etc.)
 */
export async function expectStatusBadge(page: Page, status: string): Promise<void> {
  const badge = page.locator(`[data-status="${status}"], .badge:has-text("${status}"), [class*="status"]:has-text("${status}")`);
  await expect(badge.first()).toBeVisible({ timeout: 10000 });
}

/**
 * Expects a form to have validation errors
 * @param page Playwright page object
 */
export async function expectFormHasErrors(page: Page): Promise<void> {
  // Look for any error messages in form
  const errors = page.locator('[role="alert"], .error, [data-testid="error"], [class*="error"]');
  await expect(errors.first()).toBeVisible({ timeout: 10000 });
}

/**
 * Expects a form to have no validation errors
 * @param page Playwright page object
 */
export async function expectFormHasNoErrors(page: Page): Promise<void> {
  // Verify no error messages are visible
  const errors = page.locator('[role="alert"], .error, [data-testid="error"]');
  await expect(errors).toHaveCount(0);
}

/**
 * Expects a checkbox to be checked
 * @param page Playwright page object
 * @param label Checkbox label or name
 */
export async function expectCheckboxChecked(page: Page, label: string): Promise<void> {
  const checkbox = page.locator(`input[type="checkbox"][name="${label}"], input[type="checkbox"][aria-label="${label}"]`);
  await expect(checkbox).toBeChecked();
}

/**
 * Expects a checkbox to be unchecked
 * @param page Playwright page object
 * @param label Checkbox label or name
 */
export async function expectCheckboxUnchecked(page: Page, label: string): Promise<void> {
  const checkbox = page.locator(`input[type="checkbox"][name="${label}"], input[type="checkbox"][aria-label="${label}"]`);
  await expect(checkbox).not.toBeChecked();
}

/**
 * Expects an input to have a specific value
 * @param page Playwright page object
 * @param inputName Input name attribute
 * @param expectedValue Expected input value
 */
export async function expectInputValue(
  page: Page,
  inputName: string,
  expectedValue: string
): Promise<void> {
  const input = page.locator(`input[name="${inputName}"], textarea[name="${inputName}"]`);
  await expect(input).toHaveValue(expectedValue);
}

/**
 * Expects a network request to have been made
 * @param page Playwright page object
 * @param urlPattern URL pattern to match (can be string or regex)
 * @param method Optional HTTP method (GET, POST, etc.)
 */
export async function expectNetworkRequest(
  page: Page,
  urlPattern: string | RegExp,
  method?: string
): Promise<void> {
  // Set up request listener
  const requestPromise = page.waitForRequest(
    request => {
      const urlMatches = typeof urlPattern === 'string'
        ? request.url().includes(urlPattern)
        : urlPattern.test(request.url());

      const methodMatches = method ? request.method() === method : true;

      return urlMatches && methodMatches;
    },
    { timeout: 10000 }
  );

  // Wait for the request
  await requestPromise;
}

/**
 * Expects a network response with specific status
 * @param page Playwright page object
 * @param urlPattern URL pattern to match
 * @param expectedStatus Expected HTTP status code
 */
export async function expectNetworkResponse(
  page: Page,
  urlPattern: string | RegExp,
  expectedStatus: number
): Promise<void> {
  // Wait for response
  const response = await page.waitForResponse(
    response => {
      const urlMatches = typeof urlPattern === 'string'
        ? response.url().includes(urlPattern)
        : urlPattern.test(response.url());

      return urlMatches && response.status() === expectedStatus;
    },
    { timeout: 10000 }
  );

  expect(response.status()).toBe(expectedStatus);
}
