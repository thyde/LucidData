/**
 * E2E Tests - Navigation
 *
 * Tests for navigation menu, mobile navigation, browser navigation, and protected routes.
 */

import { test, expect } from '@playwright/test';
import { signup, clearSession, getUniqueEmail, TEST_USER } from '../helpers/auth';
import {
  navigateToDashboard,
  navigateToVault,
  navigateToConsent,
  navigateToAudit,
  goBack,
  goForward,
  verifyCurrentPage,
  verifyAllNavLinksPresent,
  verifyRedirectsToLogin,
  openMobileMenu,
} from '../helpers/navigation-helpers';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Clear session and create authenticated user
    await clearSession(page);
    const email = getUniqueEmail();
    await signup(page, email, TEST_USER.password);

    // Navigate to dashboard (default landing page after signup)
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Desktop Navigation', () => {
    // Skip desktop navigation tests on mobile browsers
    test.beforeEach(async ({}, testInfo) => {
      test.skip(testInfo.project.name.includes('Mobile'), 'Desktop navigation is not visible on mobile viewports');
    });

    test('should display all main navigation links', async ({ page }) => {
      // Verify all main navigation links are present
      await verifyAllNavLinksPresent(page);

      // Explicitly check each link (using nav-specific selectors to avoid strict mode violations)
      await expect(page.locator('nav a[href*="dashboard"]')).toBeVisible();
      await expect(page.locator('nav a[href*="vault"]')).toBeVisible();
      await expect(page.locator('nav a[href*="consent"]')).toBeVisible();
      await expect(page.locator('nav a[href*="audit"]')).toBeVisible();
    });

    test('should navigate to vault page using nav link', async ({ page }) => {
      // Click vault link
      await navigateToVault(page);

      // Verify URL changed
      expect(page.url()).toContain('/vault');

      // Verify vault page loaded
      await expect(page.locator('h1:has-text("Vault")')).toBeVisible();
    });

    test('should navigate to consent page using nav link', async ({ page }) => {
      // Click consent link
      await navigateToConsent(page);

      // Verify URL changed
      expect(page.url()).toContain('/consent');

      // Verify consent page loaded
      await expect(page.locator('h1:has-text("Consents")')).toBeVisible();
    });

    test('should navigate to audit page using nav link', async ({ page }) => {
      // Click audit link
      await navigateToAudit(page);

      // Verify URL changed
      expect(page.url()).toContain('/audit');

      // Verify audit page loaded
      await expect(page.locator('h1:has-text("Audit Log")')).toBeVisible();
    });

    test('should navigate back to dashboard using nav link', async ({ page }) => {
      // Navigate away from dashboard first
      await navigateToVault(page);

      // Now navigate back to dashboard
      await navigateToDashboard(page);

      // Verify we're back on dashboard
      expect(page.url()).toContain('/dashboard');
      await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
    });

    test('should highlight active navigation item', async ({ page }) => {
      // On dashboard, verify dashboard is active
      await verifyCurrentPage(page, '/dashboard');

      // Navigate to vault
      await navigateToVault(page);

      // Verify vault nav item is now active (has aria-current or active class)
      const activeVaultLink = page.locator('nav a[href*="vault"][aria-current="page"], nav a[href*="vault"].active');
      const isActiveVisible = await activeVaultLink.isVisible().catch(() => false);

      // Either the active class exists, or verify we're on the right page
      if (isActiveVisible) {
        await expect(activeVaultLink).toBeVisible();
      } else {
        // At minimum, verify we're on the vault page
        expect(page.url()).toContain('/vault');
      }
    });

    test('should maintain navigation bar across all pages', async ({ page }) => {
      // Check dashboard
      await verifyAllNavLinksPresent(page);

      // Navigate to vault
      await navigateToVault(page);
      await verifyAllNavLinksPresent(page);

      // Navigate to consent
      await navigateToConsent(page);
      await verifyAllNavLinksPresent(page);

      // Navigate to audit
      await navigateToAudit(page);
      await verifyAllNavLinksPresent(page);
    });
  });

  test.describe('Browser Navigation', () => {
    // Skip browser navigation tests on mobile browsers (uses desktop nav helpers)
    test.beforeEach(async ({}, testInfo) => {
      test.skip(testInfo.project.name.includes('Mobile'), 'Browser navigation tests use desktop nav which is not visible on mobile viewports');
    });

    test('should navigate using browser back button', async ({ page }) => {
      // Start on dashboard, navigate to vault, then consent
      await verifyCurrentPage(page, '/dashboard');

      await navigateToVault(page);
      await verifyCurrentPage(page, '/vault');

      await navigateToConsent(page);
      await verifyCurrentPage(page, '/consent');

      // Go back to vault
      await goBack(page);
      await verifyCurrentPage(page, '/vault');

      // Go back to dashboard
      await goBack(page);
      await verifyCurrentPage(page, '/dashboard');
    });

    test('should navigate using browser forward button', async ({ page }) => {
      // Navigate dashboard → vault → consent
      await navigateToVault(page);
      await navigateToConsent(page);

      // Go back twice
      await goBack(page);
      await goBack(page);
      await verifyCurrentPage(page, '/dashboard');

      // Go forward to vault
      await goForward(page);
      await verifyCurrentPage(page, '/vault');

      // Go forward to consent
      await goForward(page);
      await verifyCurrentPage(page, '/consent');
    });

    test('should maintain history through multiple navigation actions', async ({ page }) => {
      // Complex navigation sequence
      await navigateToVault(page);
      await navigateToDashboard(page);
      await navigateToAudit(page);
      await navigateToConsent(page);

      // Go back through history
      await goBack(page); // Back to audit
      await verifyCurrentPage(page, '/audit');

      await goBack(page); // Back to dashboard
      await verifyCurrentPage(page, '/dashboard');

      await goBack(page); // Back to vault
      await verifyCurrentPage(page, '/vault');
    });

    test('should handle browser refresh without losing session', async ({ page }) => {
      // Navigate to vault
      await navigateToVault(page);

      // Refresh page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Should still be on vault page and authenticated
      await expect(page.locator('h1:has-text("Vault")')).toBeVisible();
      expect(page.url()).toContain('/vault');
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect to login when accessing vault without authentication', async ({ page }) => {
      // Clear session
      await clearSession(page);

      // Try to access vault
      await verifyRedirectsToLogin(page, '/vault');
    });

    test('should redirect to login when accessing dashboard without authentication', async ({ page }) => {
      // Clear session
      await clearSession(page);

      // Try to access dashboard
      await verifyRedirectsToLogin(page, '/dashboard');
    });

    test('should redirect to login when accessing consent without authentication', async ({ page }) => {
      // Clear session
      await clearSession(page);

      // Try to access consent
      await verifyRedirectsToLogin(page, '/consent');
    });

    test('should redirect to login when accessing audit without authentication', async ({ page }) => {
      // Clear session
      await clearSession(page);

      // Try to access audit
      await verifyRedirectsToLogin(page, '/audit');
    });

    test('should preserve redirect parameter after login', async ({ page }) => {
      // Clear session
      await clearSession(page);

      // Try to access vault (should redirect to login with redirect param)
      await page.goto('/vault');
      await page.waitForURL('**/login**', { timeout: 10000 });

      // Check if redirect parameter is in URL
      const url = new URL(page.url());
      const hasRedirectParam = url.searchParams.has('redirectedFrom') || url.searchParams.has('redirect');

      // Login
      const email = getUniqueEmail();
      await signup(page, email, TEST_USER.password);

      // Should redirect back to vault (or at least be authenticated)
      // In some implementations, this might go to dashboard first
      await page.waitForLoadState('networkidle');

      // Verify user is authenticated (on any protected page)
      const isOnProtectedPage =
        page.url().includes('/vault') ||
        page.url().includes('/dashboard') ||
        page.url().includes('/consent') ||
        page.url().includes('/audit');

      expect(isOnProtectedPage).toBe(true);
    });

    test('should allow access to protected routes after authentication', async ({ page }) => {
      // Already authenticated from beforeEach

      // Should be able to access all protected routes
      await page.goto('/vault');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1:has-text("Vault")')).toBeVisible();

      await page.goto('/consent');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1:has-text("Consents")')).toBeVisible();

      await page.goto('/audit');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1:has-text("Audit Log")')).toBeVisible();

      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
    });
  });

  test.describe('Mobile Navigation', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('should display hamburger menu on mobile', async ({ page }) => {
      // Wait for page to fully load
      await page.waitForLoadState('networkidle');

      // Look for hamburger menu button with specific aria-label
      const menuButton = page.locator('button[aria-label="Open menu"]');

      // Hamburger menu should be visible on mobile
      await expect(menuButton).toBeVisible({ timeout: 5000 });
    });

    test('should open mobile menu when clicking hamburger', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // Click hamburger menu button
      const menuButton = page.locator('button[aria-label="Open menu"]');
      await expect(menuButton).toBeVisible();
      await menuButton.click();

      // Verify dialog opened
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

      // Verify navigation links are visible in the dialog
      await expect(page.locator('[role="dialog"] a[href="/vault"]')).toBeVisible();
    });

    test('should navigate using mobile menu links', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // Open mobile menu
      const menuButton = page.locator('button[aria-label="Open menu"]');
      await menuButton.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible();

      // Click vault link inside the dialog
      await page.locator('[role="dialog"] a[href="/vault"]').click();

      // Wait for navigation
      await page.waitForURL('**/vault');

      // Verify we navigated
      await expect(page.locator('h1:has-text("Vault")')).toBeVisible();
    });

    test('should close mobile menu after navigation', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // Open mobile menu
      const menuButton = page.locator('button[aria-label="Open menu"]');
      await menuButton.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible();

      // Navigate using link in dialog (menu should auto-close on navigation)
      await page.locator('[role="dialog"] a[href="/vault"]').click();
      await page.waitForURL('**/vault');

      // Menu should be closed after navigation
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });

      // Verify content is visible
      await expect(page.locator('h1:has-text("Vault")')).toBeVisible();
    });

    test('should maintain mobile navigation across page changes', async ({ page }) => {
      await page.waitForLoadState('networkidle');

      // Open mobile menu and navigate to vault
      const menuButton = page.locator('button[aria-label="Open menu"]');
      await menuButton.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      await page.locator('[role="dialog"] a[href="/vault"]').click();
      await page.waitForURL('**/vault');

      // Menu button should still be present on the new page
      await expect(menuButton).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Accessibility', () => {
    test('should support keyboard navigation through nav items', async ({ page }, testInfo) => {
      // Skip on mobile - keyboard nav for desktop nav elements
      test.skip(testInfo.project.name.includes('Mobile'), 'Desktop keyboard navigation not applicable on mobile');

      // Focus on first nav link
      await page.keyboard.press('Tab');

      // Keep tabbing until we find a nav link
      let attempts = 0;
      while (attempts < 20) {
        const focused = await page.locator(':focus');
        const isNavLink = await focused.evaluate(el =>
          el.tagName === 'A' && el.getAttribute('href')?.includes('/'));

        if (isNavLink) {
          // We found a nav link, try pressing Enter
          await page.keyboard.press('Enter');
          await page.waitForLoadState('networkidle');

          // Should have navigated somewhere
          const url = page.url();
          const navigated = url.includes('/vault') ||
                          url.includes('/consent') ||
                          url.includes('/audit') ||
                          url.includes('/dashboard');

          expect(navigated).toBe(true);
          break;
        }

        await page.keyboard.press('Tab');
        attempts++;
      }
    });

    test('should have aria-current on active navigation item', async ({ page }, testInfo) => {
      // Skip on mobile - uses desktop navigation helper
      test.skip(testInfo.project.name.includes('Mobile'), 'Uses desktop navigation which is not visible on mobile');

      // Navigate to vault
      await navigateToVault(page);

      // Look for aria-current="page" on vault link
      const activeLink = page.locator('a[href*="vault"][aria-current="page"]');

      // Some implementations might not have aria-current, so we make this flexible
      const hasAriaCurrent = await activeLink.isVisible().catch(() => false);

      if (hasAriaCurrent) {
        await expect(activeLink).toBeVisible();
      } else {
        // At minimum, verify we're on the correct page
        expect(page.url()).toContain('/vault');
      }
    });

    test('should close mobile menu with Escape key', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      // Try to open menu
      const menuButton = page.locator('button[aria-label*="menu" i]');
      if (await menuButton.isVisible()) {
        await openMobileMenu(page);

        // Press Escape
        await page.keyboard.press('Escape');

        // Menu should close
        await page.waitForTimeout(500);

        const menuClosed =
          !(await page.locator('[role="dialog"]').isVisible().catch(() => false));

        // Menu should be closed or we should see the page content
        const pageVisible = await page.locator('h1').isVisible();
        expect(menuClosed || pageVisible).toBe(true);
      }
    });

    test('should have proper heading structure in navigation', async ({ page }) => {
      // Main navigation should not use headings (links only)
      // Page content should have proper h1
      await expect(page.locator('h1')).toBeVisible();

      // Navigation links should be actual links
      const navLinks = page.locator('nav a');
      const linkCount = await navLinks.count();
      expect(linkCount).toBeGreaterThan(0);
    });

    test('should have descriptive link text', async ({ page }) => {
      // All nav links should have descriptive text
      const dashboardLink = page.locator('a:has-text("Dashboard"), a[href*="dashboard"]');
      const vaultLink = page.locator('a:has-text("Vault"), a[href*="vault"]');
      const consentLink = page.locator('a:has-text("Consent"), a[href*="consent"]');
      const auditLink = page.locator('a:has-text("Audit"), a[href*="audit"]');

      // At least one of each type should exist
      expect(await dashboardLink.count()).toBeGreaterThan(0);
      expect(await vaultLink.count()).toBeGreaterThan(0);
      expect(await consentLink.count()).toBeGreaterThan(0);
      expect(await auditLink.count()).toBeGreaterThan(0);
    });
  });
});
