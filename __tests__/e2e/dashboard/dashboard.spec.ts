import { expect, test, type Locator, type Page } from '@playwright/test'
import { clearSession, getUniqueEmail, signup, TEST_USER } from '../helpers/auth'

function summaryCard(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator('..').locator('..')
}

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signup(page, getUniqueEmail(), TEST_USER.password)
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible()
  })

  test('renders the data overview and insight panels', async ({ page }) => {
    await expect(page.getByText('Your personal data bank at a glance')).toBeVisible()

    for (const heading of [
      'Data tracker',
      'Data score',
      'Revenue',
      'Data market',
      'Consent activity',
      'Your offers',
      'Learning center',
    ]) {
      await expect(page.getByText(heading, { exact: true })).toBeVisible()
    }

    await expect(page.getByText('0 fields shared')).toBeVisible()
    await expect(page.getByText('0 buyer accesses')).toBeVisible()
    await expect(page.getByText('0% profile complete')).toBeVisible()
  })

  test('shows zeroed summary values for a new account', async ({ page }) => {
    await expect(summaryCard(page, 'Vault entries').getByText('0', { exact: true })).toBeVisible()
    await expect(summaryCard(page, 'Active consents').getByText('0', { exact: true })).toBeVisible()
    await expect(summaryCard(page, 'Total earned').getByText('$0.00', { exact: true })).toBeVisible()
    await expect(summaryCard(page, 'Contributions').getByText('0', { exact: true })).toBeVisible()

    const consentActivity = page.getByText('Consent activity', { exact: true }).locator('..').locator('..')
    await expect(consentActivity.getByText('Active', { exact: true })).toBeVisible()
    await expect(consentActivity.getByText('Expiring within 30 days')).toBeVisible()
    await expect(consentActivity.getByText('Revoked', { exact: true })).toBeVisible()
  })

  test('provides descriptive links to core workflows', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'View vault' })).toHaveAttribute('href', '/vault')
    await expect(page.getByRole('link', { name: 'Manage consents' })).toHaveAttribute('href', '/consent')
    await expect(page.getByRole('link', { name: 'Open marketplace' })).toHaveAttribute('href', '/marketplace')
    await expect(page.getByRole('link', { name: 'Sell your data' })).toHaveAttribute('href', '/marketplace')

    await page.getByRole('link', { name: 'View vault' }).click()
    await expect(page).toHaveURL('/vault')
    await expect(page.getByRole('heading', { level: 1, name: 'Vault Entries' })).toBeVisible()
  })

  test('updates the vault summary after creating an entry', async ({ page }) => {
    await page.getByRole('link', { name: 'View vault' }).click()
    await page.getByRole('button', { name: 'Create Vault Entry' }).click()

    await page.getByLabel('Label').fill('Dashboard count entry')
    await page.getByLabel('Category', { exact: true }).selectOption('personal')
    await page.getByRole('button', { name: 'Edit as JSON' }).click()
    await page.getByRole('textbox', { name: 'Data', exact: true }).fill('{"source":"dashboard-test"}')
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Create Vault Entry' })).toBeHidden()

    await page.goto('/dashboard')
    await expect(summaryCard(page, 'Vault entries').getByText('1', { exact: true })).toBeVisible()
    await expect(page.getByText('1 vault entries')).toBeVisible()
  })

  test('preserves the session across navigation and reload', async ({ page }) => {
    await Promise.all([
      page.waitForURL('/consent', { timeout: 20000, waitUntil: 'commit' }),
      page.getByRole('link', { name: 'Manage consents' }).click(),
    ])

    await page.goto('/dashboard')
    await page.reload()

    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('uses a single page heading and named section headings', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back')
    await expect(page.getByRole('heading', { name: 'Data tracker' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Data score' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Consent activity' })).toBeVisible()
  })
})
