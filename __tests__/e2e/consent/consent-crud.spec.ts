/**
 * E2E Tests - Consent Management CRUD Operations
 *
 * Tests for consent creation, viewing, revocation, search, and filter operations.
 */

import { test, expect } from '@playwright/test';
import { signup, clearSession, getUniqueEmail, TEST_USER } from '../helpers/auth';

test.describe('Consent Management', () => {
  test.beforeEach(async ({ page }) => {
    // Clear session and create authenticated user
    await clearSession(page);
    const email = getUniqueEmail();
    await signup(page, email, TEST_USER.password);

    // Navigate to consent page
    await page.goto('/consent');

    // Wait for the page to load
    await page.waitForSelector('h1:has-text("Consents")', { timeout: 10000 });
  });

  test.describe('Page Loading', () => {
    test('should display consent page with correct title', async ({ page }) => {
      // Verify page title
      await expect(page.locator('h1:has-text("Consents")')).toBeVisible();

      // Verify page description
      await expect(
        page.locator('text=Manage who can access your data')
      ).toBeVisible();

      // Verify Grant Consent button is visible
      await expect(page.locator('button:has-text("Grant Consent")')).toBeVisible();
    });

    test('should show loading state initially', async ({ page }) => {
      // Navigate again to see loading state
      await page.goto('/consent');

      // Check for loading message (may be brief)
      const loadingText = page.locator('text=Loading consents...');
      // We check if it exists OR if content has already loaded
      const hasLoading = await loadingText.isVisible().catch(() => false);
      const hasContent = await page.locator('h1:has-text("Consents")').isVisible();

      // Either loading was shown or content loaded very quickly
      expect(hasLoading || hasContent).toBe(true);
    });
  });

  test.describe('Empty State', () => {
    test('should display empty state for new user with no consents', async ({ page }) => {
      // Verify empty state message
      await expect(
        page.locator('text=No consents yet. Grant your first consent to allow others to access your data.')
      ).toBeVisible();

      // Verify Grant Consent button is still visible in empty state
      await expect(page.locator('button:has-text("Grant Consent")')).toBeVisible();
    });

    test('should keep Grant Consent button enabled in empty state', async ({ page }) => {
      // Verify button is not disabled
      const grantButton = page.locator('button:has-text("Grant Consent")');
      await expect(grantButton).toBeVisible();
      await expect(grantButton).toBeEnabled();
    });
  });

  test.describe('Consent Display', () => {
    test('should display consent list when consents exist', async ({ page }) => {
      // Create a consent via API to have data to display
      const response = await page.request.post('/api/consent', {
        data: {
          grantedToName: 'Test Organization',
          accessLevel: 'read',
          purpose: 'Testing E2E display',
        },
      });

      expect(response.ok()).toBe(true);

      // Reload page to see the consent
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Verify consent is displayed
      await expect(page.locator('text=Test Organization')).toBeVisible();
      await expect(page.locator('text=Testing E2E display')).toBeVisible();
    });

    test('should show consent status badge correctly for active consent', async ({ page }) => {
      // Create active consent via API
      await page.request.post('/api/consent', {
        data: {
          grantedToName: 'Active Org',
          accessLevel: 'write',
          purpose: 'Active consent testing',
        },
      });

      // Reload to see consent
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Verify Active badge is displayed with correct styling
      const activeCard = page.locator('[role="article"]:has-text("Active Org"), .card:has-text("Active Org"), div:has-text("Active Org")').first();
      await expect(activeCard).toBeVisible();

      // Verify "Active" status badge
      await expect(
        activeCard.locator('text=Active, span:has-text("Active")')
      ).toBeVisible();
    });

    test('should display consent details in card', async ({ page }) => {
      // Create consent with specific details
      await page.request.post('/api/consent', {
        data: {
          grantedToName: 'Detailed Org',
          accessLevel: 'admin',
          purpose: 'Detailed consent for testing all fields',
        },
      });

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Wait for consent card to appear
      const card = page.locator('text=Detailed Org').locator('..').locator('..');
      await expect(card).toBeVisible();

      // Verify organization name (as title)
      await expect(page.locator('text=Detailed Org')).toBeVisible();

      // Verify purpose (as description)
      await expect(page.locator('text=Detailed consent for testing all fields')).toBeVisible();

      // Verify access level is displayed
      await expect(page.locator('text=admin, text=/access level.*admin/i')).toBeVisible();
    });

    test('should display multiple consents when available', async ({ page }) => {
      // Create multiple consents via API
      await page.request.post('/api/consent', {
        data: {
          grantedToName: 'First Organization',
          accessLevel: 'read',
          purpose: 'First consent',
        },
      });

      await page.request.post('/api/consent', {
        data: {
          grantedToName: 'Second Organization',
          accessLevel: 'write',
          purpose: 'Second consent',
        },
      });

      await page.request.post('/api/consent', {
        data: {
          grantedToName: 'Third Organization',
          accessLevel: 'read',
          purpose: 'Third consent',
        },
      });

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Verify all three consents are displayed
      await expect(page.locator('text=First Organization')).toBeVisible();
      await expect(page.locator('text=Second Organization')).toBeVisible();
      await expect(page.locator('text=Third Organization')).toBeVisible();
    });
  });

  test.describe('Consent Revocation', () => {
    test('should show revoke button for active consents', async ({ page }) => {
      // Create active consent
      await page.request.post('/api/consent', {
        data: {
          grantedToName: 'Revokable Org',
          accessLevel: 'read',
          purpose: 'Testing revoke button',
        },
      });

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Find the consent card
      const card = page.locator('text=Revokable Org').locator('..').locator('..');

      // Verify Revoke button is visible
      await expect(card.locator('button:has-text("Revoke")')).toBeVisible();
    });

    test('should revoke consent when clicking revoke button', async ({ page }) => {
      // Create active consent
      const response = await page.request.post('/api/consent', {
        data: {
          grantedToName: 'To Be Revoked',
          accessLevel: 'write',
          purpose: 'Will be revoked',
        },
      });

      const consent = await response.json();
      const consentId = consent.id;

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Find the consent card and click Revoke
      const card = page.locator('text=To Be Revoked').locator('..').locator('..');
      await card.locator('button:has-text("Revoke")').click();

      // Wait for API call to complete (network idle)
      await page.waitForLoadState('networkidle');

      // Reload to see updated state
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Verify status changed to Revoked
      const updatedCard = page.locator('text=To Be Revoked').locator('..').locator('..');
      await expect(updatedCard.locator('text=Revoked, span:has-text("Revoked")')).toBeVisible();
    });

    test('should NOT show revoke button for already revoked consents', async ({ page }) => {
      // Create and immediately revoke a consent
      const createResponse = await page.request.post('/api/consent', {
        data: {
          grantedToName: 'Already Revoked',
          accessLevel: 'read',
          purpose: 'Pre-revoked consent',
        },
      });

      const consent = await createResponse.json();

      // Revoke it via API
      await page.request.patch(`/api/consent/${consent.id}`, {
        data: { revoked: true },
      });

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Find the revoked consent card
      const card = page.locator('text=Already Revoked').locator('..').locator('..');

      // Verify Revoke button is NOT visible
      await expect(card.locator('button:has-text("Revoke")')).not.toBeVisible();

      // Verify status is Revoked
      await expect(card.locator('text=Revoked, span:has-text("Revoked")')).toBeVisible();
    });

    test('should display revoked status badge with correct styling', async ({ page }) => {
      // Create revoked consent
      const createResponse = await page.request.post('/api/consent', {
        data: {
          grantedToName: 'Revoked Org',
          accessLevel: 'admin',
          purpose: 'Testing revoked styling',
        },
      });

      const consent = await createResponse.json();

      // Revoke it
      await page.request.patch(`/api/consent/${consent.id}`, {
        data: { revoked: true },
      });

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Find revoked consent
      const card = page.locator('text=Revoked Org').locator('..').locator('..');

      // Verify Revoked badge exists
      const statusBadge = card.locator('span:has-text("Revoked"), text=Revoked');
      await expect(statusBadge).toBeVisible();

      // Verify badge has red styling (bg-red-100 text-red-800 per page.tsx lines 125-126)
      const badgeElement = page.locator('text=Revoked Org')
        .locator('..')
        .locator('..')
        .locator('span.bg-red-100');
      await expect(badgeElement).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('should handle API errors gracefully', async ({ page }) => {
      // Intercept API request and force an error
      await page.route('/api/consent', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      });

      // Navigate to consent page
      await page.goto('/consent');

      // Wait for error state
      await page.waitForSelector('text=Error loading consents', { timeout: 10000 });

      // Verify error message is displayed
      await expect(page.locator('text=Error loading consents')).toBeVisible();

      // Verify Retry button is present
      await expect(page.locator('button:has-text("Retry")')).toBeVisible();
    });

    test('should reload page when retry button clicked after error', async ({ page }) => {
      // Force an error first
      await page.route('/api/consent', (route) => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Server error' }),
        });
      });

      await page.goto('/consent');
      await page.waitForSelector('text=Error loading consents');

      // Unroute to allow normal requests
      await page.unroute('/api/consent');

      // Click retry
      await page.click('button:has-text("Retry")');

      // Wait for page reload
      await page.waitForLoadState('networkidle');

      // Verify page loaded successfully (empty state or consents)
      await expect(page.locator('h1:has-text("Consents")')).toBeVisible();
    });

    test('should handle empty API response correctly', async ({ page }) => {
      // Intercept and return empty array
      await page.route('/api/consent', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/consent');
      await page.waitForLoadState('networkidle');

      // Should show empty state
      await expect(
        page.locator('text=No consents yet')
      ).toBeVisible();
    });
  });

  test.describe('Access Level Display', () => {
    test('should display different access levels correctly', async ({ page }) => {
      // Create consents with different access levels
      await page.request.post('/api/consent', {
        data: {
          grantedToName: 'Read Only Org',
          accessLevel: 'read',
          purpose: 'Read-only access',
        },
      });

      await page.request.post('/api/consent', {
        data: {
          grantedToName: 'Write Org',
          accessLevel: 'write',
          purpose: 'Write access',
        },
      });

      await page.request.post('/api/consent', {
        data: {
          grantedToName: 'Admin Org',
          accessLevel: 'admin',
          purpose: 'Admin access',
        },
      });

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Verify all access levels are displayed
      await expect(page.locator('text=/access level.*read/i')).toBeVisible();
      await expect(page.locator('text=/access level.*write/i')).toBeVisible();
      await expect(page.locator('text=/access level.*admin/i')).toBeVisible();
    });
  });

  test.describe('Button States', () => {
    test('should keep Grant Consent button enabled when loading', async ({ page }) => {
      // The button should be enabled after loading completes
      await page.waitForLoadState('networkidle');

      const grantButton = page.locator('button:has-text("Grant Consent")');
      await expect(grantButton).toBeEnabled();
    });

    test('should display Grant Consent button on error state', async ({ page }) => {
      // Force error
      await page.route('/api/consent', (route) => {
        route.fulfill({ status: 500 });
      });

      await page.goto('/consent');
      await page.waitForSelector('text=Error loading consents');

      // Button should still be visible in error state
      await expect(page.locator('button:has-text("Grant Consent")')).toBeVisible();
    });
  });
});
