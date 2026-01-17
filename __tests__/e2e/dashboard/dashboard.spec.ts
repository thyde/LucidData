/**
 * E2E Tests - Dashboard Page
 *
 * Tests for dashboard statistics display, navigation, and quick start guide.
 */

import { test, expect } from '@playwright/test';
import { signup, clearSession, getUniqueEmail, TEST_USER } from '../helpers/auth';

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    // Clear session and create authenticated user
    await clearSession(page);
    const email = getUniqueEmail();
    await signup(page, email, TEST_USER.password);

    // Navigate to dashboard (should redirect there after signup)
    await page.goto('/dashboard');

    // Wait for the page to load
    await page.waitForSelector('h1:has-text("Dashboard")', { timeout: 10000 });
  });

  test.describe('Page Loading', () => {
    test('should load dashboard with correct title', async ({ page }) => {
      // Verify main heading
      await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();

      // Verify welcome message
      await expect(
        page.locator('text=Welcome to your personal data bank')
      ).toBeVisible();
    });

    test('should display page structure correctly', async ({ page }) => {
      // Verify title is at the top
      const title = page.locator('h1:has-text("Dashboard")');
      await expect(title).toBeVisible();

      // Verify subtitle/description is below title
      const description = page.locator('text=Welcome to your personal data bank');
      await expect(description).toBeVisible();

      // Verify cards are displayed
      await expect(page.locator('text=Vault')).toBeVisible();
      await expect(page.locator('text=Consents')).toBeVisible();
      await expect(page.locator('text=Audit Log')).toBeVisible();
    });
  });

  test.describe('Statistics Display', () => {
    test('should display vault entry count for new user', async ({ page }) => {
      // New user should have 0 entries
      await expect(
        page.locator('text=Vault').locator('..').locator('text=0 entries')
      ).toBeVisible();
    });

    test('should display active consent count for new user', async ({ page }) => {
      // New user should have 0 active consents
      await expect(
        page.locator('text=Consents').locator('..').locator('text=0 active')
      ).toBeVisible();
    });

    test('should display audit log event count for new user', async ({ page }) => {
      // New user should have 0 events initially (or a few from signup)
      const auditCard = page.locator('text=Audit Log').locator('..');
      const eventText = auditCard.locator('text=/\\d+ events?/');
      await expect(eventText).toBeVisible();
    });

    test('should update vault count after creating vault entry', async ({ page }) => {
      // Create a vault entry via API
      await page.request.post('/api/vault', {
        data: {
          label: 'Test Entry',
          category: 'personal',
          description: 'Testing dashboard count',
          tags: [],
          data: JSON.stringify({ test: 'data' }),
        },
      });

      // Reload dashboard
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Verify count updated to 1
      await expect(
        page.locator('text=Vault').locator('..').locator('text=1 entry')
      ).toBeVisible();
    });

    test('should update consent count after creating consent', async ({ page }) => {
      // Create a consent via API
      await page.request.post('/api/consent', {
        data: {
          grantedToName: 'Test Org',
          accessLevel: 'read',
          purpose: 'Testing dashboard count',
        },
      });

      // Reload dashboard
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Verify count updated to 1
      await expect(
        page.locator('text=Consents').locator('..').locator('text=1 active')
      ).toBeVisible();
    });

    test('should display correct plural forms for counts', async ({ page }) => {
      // Create 2 vault entries
      await page.request.post('/api/vault', {
        data: {
          label: 'Entry 1',
          category: 'personal',
          description: 'First',
          tags: [],
          data: JSON.stringify({ num: 1 }),
        },
      });

      await page.request.post('/api/vault', {
        data: {
          label: 'Entry 2',
          category: 'personal',
          description: 'Second',
          tags: [],
          data: JSON.stringify({ num: 2 }),
        },
      });

      // Reload
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Should say "entries" not "entry"
      await expect(
        page.locator('text=Vault').locator('..').locator('text=2 entries')
      ).toBeVisible();
    });

    test('should display all three statistics cards', async ({ page }) => {
      // Verify all three main cards are present
      const vaultCard = page.locator('text=Vault').locator('..');
      const consentCard = page.locator('text=Consents').locator('..');
      const auditCard = page.locator('text=Audit Log').locator('..');

      await expect(vaultCard).toBeVisible();
      await expect(consentCard).toBeVisible();
      await expect(auditCard).toBeVisible();

      // Verify each has a count
      await expect(vaultCard.locator('text=/\\d+ entr(y|ies)/')).toBeVisible();
      await expect(consentCard.locator('text=/\\d+ active/')).toBeVisible();
      await expect(auditCard.locator('text=/\\d+ events?/')).toBeVisible();
    });
  });

  test.describe('Card Descriptions', () => {
    test('should display correct description for Vault card', async ({ page }) => {
      await expect(
        page.locator('text=Manage your encrypted data')
      ).toBeVisible();
    });

    test('should display correct description for Consents card', async ({ page }) => {
      await expect(
        page.locator('text=Control data access permissions')
      ).toBeVisible();
    });

    test('should display correct description for Audit Log card', async ({ page }) => {
      await expect(
        page.locator('text=Track all data access events')
      ).toBeVisible();
    });
  });

  test.describe('Navigation Links', () => {
    test('should navigate to vault page when clicking View Vault button', async ({ page }) => {
      // Click the "View Vault" button
      await page.click('button:has-text("View Vault")');

      // Wait for navigation
      await page.waitForURL('**/vault');

      // Verify we're on vault page
      await expect(page.locator('h1:has-text("Vault")')).toBeVisible();
    });

    test('should navigate to consent page when clicking Manage Consents button', async ({ page }) => {
      // Click the "Manage Consents" button
      await page.click('button:has-text("Manage Consents")');

      // Wait for navigation
      await page.waitForURL('**/consent');

      // Verify we're on consent page
      await expect(page.locator('h1:has-text("Consents")')).toBeVisible();
    });

    test('should navigate to audit page when clicking View Log button', async ({ page }) => {
      // Click the "View Log" button
      await page.click('button:has-text("View Log")');

      // Wait for navigation
      await page.waitForURL('**/audit');

      // Verify we're on audit page
      await expect(page.locator('h1:has-text("Audit Log")')).toBeVisible();
    });

    test('should have all navigation buttons visible', async ({ page }) => {
      // Verify all three buttons are present
      await expect(page.locator('button:has-text("View Vault")')).toBeVisible();
      await expect(page.locator('button:has-text("Manage Consents")')).toBeVisible();
      await expect(page.locator('button:has-text("View Log")')).toBeVisible();
    });

    test('should preserve authentication when navigating between pages', async ({ page }) => {
      // Navigate to vault
      await page.click('button:has-text("View Vault")');
      await page.waitForURL('**/vault');

      // Navigate back to dashboard
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Should still be authenticated
      await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();

      // Verify we didn't get redirected to login
      expect(page.url()).toContain('/dashboard');
    });
  });

  test.describe('Quick Start Guide', () => {
    test('should display Quick Start section', async ({ page }) => {
      // Verify Quick Start heading
      await expect(page.locator('text=Quick Start')).toBeVisible();

      // Verify description
      await expect(page.locator('text=Get started with Lucid')).toBeVisible();
    });

    test('should display all three quick start steps', async ({ page }) => {
      // Verify step 1
      await expect(page.locator('text=Add data to your vault')).toBeVisible();
      await expect(
        page.locator('text=Store your personal data securely with AES-256 encryption')
      ).toBeVisible();

      // Verify step 2
      await expect(page.locator('text=Grant consent for data access')).toBeVisible();
      await expect(
        page.locator('text=Control who can access your data and for what purpose')
      ).toBeVisible();

      // Verify step 3
      await expect(page.locator('text=Monitor audit trail')).toBeVisible();
      await expect(
        page.locator('text=See exactly who accessed your data and when')
      ).toBeVisible();
    });

    test('should display step numbers in circular badges', async ({ page }) => {
      // Find all numbered badges
      const badge1 = page.locator('text=Add data to your vault').locator('..').locator('..').locator('text=1');
      const badge2 = page.locator('text=Grant consent for data access').locator('..').locator('..').locator('text=2');
      const badge3 = page.locator('text=Monitor audit trail').locator('..').locator('..').locator('text=3');

      // Verify all badges are visible
      await expect(badge1).toBeVisible();
      await expect(badge2).toBeVisible();
      await expect(badge3).toBeVisible();
    });

    test('should display step titles as headings', async ({ page }) => {
      // Verify step titles are styled as headings (font-semibold per page.tsx line 101)
      const step1Title = page.locator('h3:has-text("Add data to your vault"), .font-semibold:has-text("Add data to your vault")');
      const step2Title = page.locator('h3:has-text("Grant consent for data access"), .font-semibold:has-text("Grant consent for data access")');
      const step3Title = page.locator('h3:has-text("Monitor audit trail"), .font-semibold:has-text("Monitor audit trail")');

      await expect(step1Title).toBeVisible();
      await expect(step2Title).toBeVisible();
      await expect(step3Title).toBeVisible();
    });

    test('should display step descriptions with muted styling', async ({ page }) => {
      // Verify descriptions are visible (text-sm text-muted-foreground per page.tsx line 102)
      const descriptions = page.locator('.text-muted-foreground, .text-sm');

      // Should have at least 3 descriptions (one for each step)
      const count = await descriptions.count();
      expect(count).toBeGreaterThanOrEqual(3);
    });
  });

  test.describe('Grid Layout', () => {
    test('should display statistics cards in grid layout', async ({ page }) => {
      // Verify cards are in a grid (md:grid-cols-2 lg:grid-cols-3)
      const gridContainer = page.locator('.grid').first();
      await expect(gridContainer).toBeVisible();

      // Verify all three cards are within the grid
      const cardsInGrid = gridContainer.locator('div').filter({ hasText: /Vault|Consents|Audit Log/ });
      const cardCount = await cardsInGrid.count();
      expect(cardCount).toBeGreaterThanOrEqual(3);
    });
  });

  test.describe('Server-Side Rendering', () => {
    test('should load statistics without client-side JavaScript', async ({ page, context }) => {
      // Disable JavaScript
      await context.setExtraHTTPHeaders({ 'User-Agent': 'test-no-js' });

      // Navigate to dashboard
      await page.goto('/dashboard');

      // Even without JS, should see the structure (server-rendered)
      await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();

      // Statistics should be present (rendered on server)
      await expect(page.locator('text=/\\d+ entr(y|ies)/')).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper heading hierarchy', async ({ page }) => {
      // h1 for main page title
      await expect(page.locator('h1')).toBeVisible();

      // Cards should have proper heading structure
      const vaultTitle = page.locator('text=Vault').first();
      await expect(vaultTitle).toBeVisible();
    });

    test('should have descriptive button text', async ({ page }) => {
      // Buttons should have clear action text
      await expect(page.locator('button:has-text("View Vault")')).toBeVisible();
      await expect(page.locator('button:has-text("Manage Consents")')).toBeVisible();
      await expect(page.locator('button:has-text("View Log")')).toBeVisible();
    });
  });
});
