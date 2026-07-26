import { expect, test } from '@playwright/test'
import { clearSession, getUniqueEmail, signup, TEST_USER } from '../helpers/auth'

test.describe('Authenticated navigation', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signup(page, getUniqueEmail(), TEST_USER.password)
  })

  test('exposes the primary links and active page', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Primary' })

    for (const name of ['Dashboard', 'Vault', 'Marketplace', 'Credentials', 'Consents', 'Audit Log', 'Requests']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
    }

    await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
  })

  test('navigates between protected pages while preserving the browser key', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Primary' })

    await Promise.all([
      page.waitForURL('/vault', { timeout: 30000, waitUntil: 'commit' }),
      nav.getByRole('link', { name: 'Vault' }).click(),
    ])
    await expect(page.getByRole('heading', { level: 1, name: 'Vault Entries' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Vault' })).toHaveAttribute('aria-current', 'page')

    await Promise.all([
      page.waitForURL('/consent', { timeout: 30000, waitUntil: 'commit' }),
      nav.getByRole('link', { name: 'Consents' }).click(),
    ])
    await expect(page.getByRole('heading', { level: 1, name: 'Consents' })).toBeVisible()

    await Promise.all([
      page.waitForURL('/audit', { timeout: 30000, waitUntil: 'commit' }),
      nav.getByRole('link', { name: 'Audit Log' }).click(),
    ])
    await expect(page.getByRole('heading', { level: 1, name: 'Audit Log' })).toBeVisible()
  })

  test('supports browser back and forward history', async ({ page }) => {
    test.setTimeout(120000)
    await page.goto('/consent', { timeout: 45000, waitUntil: 'domcontentloaded' })
    await page.goto('/audit', { timeout: 45000, waitUntil: 'domcontentloaded' })

    await page.goBack()
    await page.waitForURL('/consent', { timeout: 20000 })
    await page.goForward()
    await page.waitForURL('/audit', { timeout: 20000 })
  })

  test('keeps the session but locks the vault after a hard reload', async ({ page }) => {
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Vault' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Vault Entries' })).toBeVisible()

    await page.reload()

    await expect(page).toHaveURL('/vault')
    await expect(page.getByRole('heading', { name: 'Your vault is locked' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test.describe('Mobile menu', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('opens, reports the active page, and closes after navigation', async ({ page }) => {
      await page.getByRole('button', { name: 'Open menu' }).click()
      const dialog = page.getByRole('dialog', { name: 'Navigation Menu' })

      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
      await Promise.all([
        page.waitForURL('/vault', { timeout: 20000, waitUntil: 'commit' }),
        dialog.getByRole('link', { name: 'Vault' }).click(),
      ])

      await expect(dialog).toBeHidden()
      await expect(page.getByRole('heading', { level: 1, name: 'Vault Entries' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible()
    })

    test('closes with Escape', async ({ page }) => {
      await page.getByRole('button', { name: 'Open menu' }).click()
      const dialog = page.getByRole('dialog', { name: 'Navigation Menu' })
      await expect(dialog).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
    })
  })
})

test.describe('Protected routes', () => {
  test('redirects unauthenticated requests and preserves their destination', async ({ page }) => {
    for (const path of ['/dashboard', '/vault', '/consent', '/audit']) {
      await clearSession(page)
      await page.goto(path)
      await page.waitForURL('**/login**', { timeout: 15000 })

      const redirectedFrom = new URL(page.url()).searchParams.get('redirectedFrom')
      expect(redirectedFrom).toBe(path)
    }
  })
})
