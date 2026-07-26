import { expect, test, type Page } from '@playwright/test'
import { clearSession, getUniqueEmail, signup, TEST_USER } from '../helpers/auth'

interface ConsentInput {
  name: string
  identifier: string
  purpose: string
  access?: 'read' | 'export' | 'verify'
  expires?: '30 days' | '90 days' | '1 year' | 'Indefinite'
}

async function grantConsent(page: Page, input: ConsentInput) {
  await page.getByRole('button', { name: 'Grant Consent', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Grant Consent' })

  await dialog.getByLabel('Organization Name').fill(input.name)
  await dialog.getByLabel('Organization Identifier').fill(input.identifier)
  await dialog.getByRole('radio', { name: new RegExp(`^${input.access ?? 'read'}`, 'i') }).click()
  await dialog.getByLabel('Purpose').fill(input.purpose)
  if (input.expires) {
    await dialog.getByRole('button', { name: input.expires, exact: true }).click()
  }
  await dialog.getByRole('button', { name: 'Grant Consent', exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 15000 })

  return page.locator('.rounded-xl').filter({ hasText: input.name }).first()
}

test.describe('Consent management', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signup(page, getUniqueEmail('consent'), TEST_USER.password)
    await Promise.all([
      page.waitForURL('/consent', { timeout: 20000, waitUntil: 'commit' }),
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Consents' }).click(),
    ])
    await expect(page.getByRole('heading', { level: 1, name: 'Consents' })).toBeVisible()
  })

  test('shows the empty state and validates required fields', async ({ page }) => {
    await expect(page.getByText(/No consents granted yet/)).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Consent status' })).toHaveValue('all')

    await page.getByRole('button', { name: 'Grant Consent', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Grant Consent' })
    await dialog.getByRole('button', { name: 'Grant Consent', exact: true }).click()

    await expect(dialog.getByText('Organization name is required')).toBeVisible()
    await expect(dialog.getByText('Organization identifier is required')).toBeVisible()
    await expect(dialog.getByText('Purpose must be at least 10 characters')).toBeVisible()
  })

  test('grants, displays, searches, and filters consents', async ({ page }) => {
    const acme = await grantConsent(page, {
      name: 'Acme Healthcare',
      identifier: 'acme-health-001',
      purpose: 'Annual healthcare record verification',
      access: 'export',
      expires: '90 days',
    })
    await expect(acme.getByText('Active', { exact: true })).toBeVisible()
    await expect(acme.getByText('Access:')).toBeVisible()
    await expect(acme.getByText('export', { exact: true })).toBeVisible()
    await expect(acme.getByText('Annual healthcare record verification')).toBeVisible()

    await grantConsent(page, {
      name: 'Research Partners',
      identifier: 'research-002',
      purpose: 'Anonymous research eligibility verification',
      access: 'verify',
      expires: 'Indefinite',
    })

    await page.getByPlaceholder('Search by organization or purpose...').fill('Acme')
    await expect(page.getByText('Acme Healthcare')).toBeVisible()
    await expect(page.getByText('Research Partners')).toBeHidden()

    await page.getByPlaceholder('Search by organization or purpose...').clear()
    await page.getByRole('combobox', { name: 'Consent status' }).selectOption('active')
    await expect(page.getByText('Acme Healthcare')).toBeVisible()
    await expect(page.getByText('Research Partners')).toBeVisible()
  })

  test('shows consent details and extends expiration', async ({ page }) => {
    const card = await grantConsent(page, {
      name: 'Credential Review Board',
      identifier: 'review-board-003',
      purpose: 'Review submitted professional credentials',
      access: 'verify',
      expires: '30 days',
    })
    await card.getByRole('button', { name: 'View Details' }).click()

    const details = page.getByRole('dialog', { name: 'Credential Review Board' })
    await expect(details.getByText('verify', { exact: true })).toBeVisible()
    await expect(details.getByText('Review submitted professional credentials')).toBeVisible()
    await details.getByRole('button', { name: 'Extend Consent' }).click()

    const extend = page.getByRole('dialog', { name: 'Extend Consent' })
    await extend.getByRole('button', { name: '+30 days' }).click()
    await extend.getByRole('button', { name: 'Extend Consent', exact: true }).click()
    await expect(extend).toBeHidden({ timeout: 15000 })
    await expect(page.getByText('Consent extended successfully', { exact: true })).toBeVisible()
  })

  test('revokes a consent with a reason and filters revoked records', async ({ page }) => {
    const card = await grantConsent(page, {
      name: 'Former Data Partner',
      identifier: 'former-partner-004',
      purpose: 'Temporary account verification access',
      access: 'read',
      expires: '1 year',
    })
    await card.getByRole('button', { name: 'View Details' }).click()
    await page.getByRole('dialog', { name: 'Former Data Partner' }).getByRole('button', { name: 'Revoke Consent' }).click()

    const revoke = page.getByRole('dialog', { name: 'Revoke Consent' })
    await revoke.getByLabel('Reason for Revocation').fill('The verification engagement has ended')
    await revoke.getByRole('checkbox').check()
    await revoke.getByRole('button', { name: 'Revoke Consent', exact: true }).click()
    await expect(revoke).toBeHidden({ timeout: 15000 })

    await expect(card.getByText('Revoked', { exact: true })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Revoke' })).toHaveCount(0)
    await page.getByRole('combobox', { name: 'Consent status' }).selectOption('revoked')
    await expect(page.getByText('Former Data Partner')).toBeVisible()
  })
})