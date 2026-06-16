/**
 * E2E Test - Grant Consent Flow
 *
 * Validates the end-to-end grant consent flow:
 * register → consent page → fill form → submit → verify consent in list
 */

import { test, expect } from '@playwright/test';
import { clearSession, getUniqueEmail, TEST_USER } from '../helpers/auth';

async function signup(page: Parameters<typeof clearSession>[0], email: string, password: string) {
  await page.goto('/register');
  await page.waitForSelector('input[name="email"]', { state: 'visible' });

  const emailInput = page.locator('input[name="email"]');
  await emailInput.click();
  await emailInput.pressSequentially(email, { delay: 30 });

  const passwordInput = page.locator('input[name="password"]');
  await passwordInput.click();
  await passwordInput.pressSequentially(password, { delay: 30 });

  const confirmInput = page.locator('input[name="confirmPassword"]');
  if (await confirmInput.isVisible()) {
    await confirmInput.click();
    await confirmInput.pressSequentially(password, { delay: 30 });
  }

  await page.waitForTimeout(500);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('/dashboard', { timeout: 20000 });
}

test.describe('Grant Consent Flow', () => {
  test('should grant consent and show it in the list', async ({ page }) => {
    await clearSession(page);
    const email = getUniqueEmail('consent');
    await signup(page, email, TEST_USER.password);

    // Navigate to consent page
    await page.goto('/consent');
    await page.waitForSelector('h1', { timeout: 10000 });

    // Open Grant Consent dialog
    await page.getByRole('button', { name: /grant consent/i }).first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Fill Organization Name
    const orgNameInput = page.locator('input[placeholder*="Acme"]');
    await orgNameInput.click();
    await orgNameInput.pressSequentially('Acme Healthcare', { delay: 30 });

    // Fill Organization Identifier
    const orgIdInput = page.locator('input[placeholder*="org-12345"]');
    await orgIdInput.click();
    await orgIdInput.pressSequentially('acme-health-001', { delay: 30 });

    // Select access level "read" via Radix RadioGroup (role=radio)
    await page.getByRole('radio', { name: /read/i }).click();

    // Fill Purpose
    const purposeInput = page.locator('textarea');
    await purposeInput.click();
    await purposeInput.pressSequentially('Healthcare provider needs read access for annual check-up records.', { delay: 20 });

    // Set 90-day expiry using preset button
    await page.getByRole('button', { name: '90 days' }).click();

    // Submit
    await page.getByRole('button', { name: /grant consent/i, exact: false }).filter({ hasNot: page.locator('[role="dialog"] ~ *') }).last().click();

    // Dialog should close
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 15000 });

    // Consent should appear in the list
    await expect(page.getByText('Acme Healthcare')).toBeVisible({ timeout: 10000 });
  });

  test('should show granted consent with Active status', async ({ page }) => {
    await clearSession(page);
    const email = getUniqueEmail('consent-status');
    await signup(page, email, TEST_USER.password);

    await page.goto('/consent');
    await page.waitForSelector('h1', { timeout: 10000 });

    // Open Grant Consent dialog
    await page.getByRole('button', { name: /grant consent/i }).first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Fill in form
    await page.locator('input[placeholder*="Acme"]').fill('Test Corp');
    await page.locator('input[placeholder*="org-12345"]').fill('test-corp-id');
    await page.getByRole('radio', { name: /read/i }).click();
    await page.locator('textarea').fill('Testing consent status display for verification purposes.');

    // Submit (click the submit button inside the dialog footer)
    await page.locator('[role="dialog"] button[type="submit"]').click();

    // Wait for dialog to close
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 15000 });

    // Verify consent appears and has Active badge (span, not option element)
    await expect(page.getByText('Test Corp')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('span.bg-green-100').getByText('Active')).toBeVisible({ timeout: 5000 });
  });
});
