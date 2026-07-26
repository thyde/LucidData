import { expect, test } from '@playwright/test'

test.describe('Public site navigation', () => {
  test('routes every primary desktop CTA to its intended screen', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Banks manage your money'
    )

    await page.getByRole('link', { name: 'For individuals', exact: true }).first().click()
    await expect(page).toHaveURL('/for-individuals')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Your data is an asset')

    await page.getByRole('link', { name: 'For business', exact: true }).first().click()
    await expect(page).toHaveURL('/for-business')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Verifiable credentials and seller-approved data snapshots'
    )

    await page.getByRole('link', { name: 'Pricing', exact: true }).first().click()
    await expect(page).toHaveURL('/pricing')
    await expect(page.getByRole('heading', { level: 1, name: 'Pricing' })).toBeVisible()

    await Promise.all([
      page.waitForURL('/register', { timeout: 20000, waitUntil: 'commit' }),
      page.getByRole('link', { name: 'Create account' }).click(),
    ])
    await expect(page.getByRole('button', { name: 'Sign up' })).toBeVisible()

    await page.goto('/')
    await Promise.all([
      page.waitForURL('/login', { timeout: 20000, waitUntil: 'commit' }),
      page.getByRole('link', { name: 'Log in' }).first().click(),
    ])
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  })

  test('opens the mobile menu, follows links, and closes it', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    const menuButton = page.getByRole('button', { name: 'Toggle menu' })
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    await menuButton.click()
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true')

    await page
      .getByRole('navigation')
      .getByRole('link', { name: 'Pricing', exact: true })
      .click()
    await expect(page).toHaveURL('/pricing')
    await expect(page.getByRole('heading', { level: 1, name: 'Pricing' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Toggle menu' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })
})