/**
 * E2E tests - LD-110 legal terms and consumer health data consent.
 */

import { expect, test, type Page } from '@playwright/test'
import { clearSession, getUniqueEmail, signup, TEST_USER } from '../helpers/auth'
import { createAdminClient } from '../helpers/supabase-admin'
import { ACCOUNT_DELETION_PATH, LEGAL_DOCUMENTS } from '@/lib/constants/legal'
import { HEALTH_CONSENT_DECLINED_MESSAGE } from '@/lib/hooks/use-health-consent'

async function acceptances(email: string) {
  const admin = createAdminClient()
  const { data: user } = await admin.from('users').select('id').eq('email', email).single()
  const { data } = await admin
    .from('legal_acceptances')
    .select('document, version, action, source')
    .eq('user_id', user!.id)
    .order('recorded_at')
  return data ?? []
}

async function openVault(page: Page): Promise<void> {
  // A client-side navigation keeps the vault key in memory; a hard load would not.
  await Promise.all([
    page.waitForURL('/vault', { timeout: 20000, waitUntil: 'commit' }),
    page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Vault' }).click(),
  ])
  await expect(page.getByRole('heading', { level: 1, name: 'Vault Entries' })).toBeVisible()
}

async function fillHealthEntry(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: 'Create Vault Entry' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create Vault Entry' })
  await dialog.getByLabel('Label').fill(label)
  await dialog.getByLabel('Category', { exact: true }).selectOption('health')
  await dialog.getByRole('button', { name: 'Edit as JSON' }).click()
  await dialog.getByRole('textbox', { name: 'Data', exact: true }).fill('{"restingHeartRate": 58}')
}

test.describe('Legal pages', () => {
  const pages = [
    ...Object.values(LEGAL_DOCUMENTS).map((document) => ({ path: document.path, title: document.title })),
    { path: ACCOUNT_DELETION_PATH, title: 'Delete your account' },
    { path: '/legal', title: 'Legal' },
  ]

  for (const { path, title } of pages) {
    test(`${path} is public`, async ({ page }) => {
      await clearSession(page)
      await page.goto(path)
      await expect(page).toHaveURL(path)
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    })
  }

  test('shows the version date on each document', async ({ page }) => {
    await page.goto(LEGAL_DOCUMENTS.privacy.path)
    await expect(page.locator(`time[datetime="${LEGAL_DOCUMENTS.privacy.version}"]`)).toBeVisible()
  })

  test('links the consumer health data privacy policy from the homepage', async ({ page }) => {
    await clearSession(page)
    await page.goto('/')
    const link = page.getByRole('link', { name: LEGAL_DOCUMENTS['health-privacy'].title })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', LEGAL_DOCUMENTS['health-privacy'].path)
  })
})

test.describe('Accepting the terms', () => {
  test('asks an account with no recorded acceptance before it can carry on', async ({ page }) => {
    const email = getUniqueEmail('legal-gate')
    const admin = createAdminClient()
    const { error } = await admin.auth.admin.createUser({
      email,
      password: TEST_USER.password,
      email_confirm: true,
    })
    if (error) throw error

    await clearSession(page)
    await page.goto('/login')
    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[name="password"]').fill(TEST_USER.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    // First sign-in sets the vault up, then the dashboard asks about the terms.
    const recovery = page.getByRole('dialog', { name: 'Save your recovery code' })
    await expect(recovery).toBeVisible({ timeout: 60000 })
    await recovery.getByRole('link', { name: 'Continue to dashboard' }).click()

    // The prompt replaces the page, so nothing else can open over it.
    const prompt = page.getByRole('heading', { level: 1, name: 'Review our terms' })
    await expect(prompt).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Settings stays open, so someone who will not accept can still export and delete.
    await Promise.all([
      page.waitForURL('/settings', { timeout: 20000, waitUntil: 'commit' }),
      page.getByRole('main').getByRole('link', { name: 'Settings' }).click(),
    ])
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    await page.goto('/dashboard')
    await expect(prompt).toBeVisible({ timeout: 30000 })

    const continueButton = page.getByRole('button', { name: 'Continue' })
    await expect(continueButton).toBeDisabled()
    await page.getByLabel('I agree to the Terms of Service and the Privacy Policy.').check()
    await continueButton.click()

    // Accepted, the dashboard renders, starting with the welcome tour for a new account.
    await expect(page.getByRole('dialog').filter({ hasText: 'Welcome to Lucid' })).toBeVisible({
      timeout: 30000,
    })

    const rows = await acceptances(email)
    expect(rows.map((row) => `${row.document}:${row.source}`).sort()).toEqual([
      'privacy:prompt',
      'terms:prompt',
    ])

    // Accepted versions are current, so a fresh load goes straight to the dashboard.
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible({
      timeout: 30000,
    })
    await expect(page.getByRole('heading', { name: 'Review our terms' })).toHaveCount(0)
  })
})

test.describe('Consent to store health data', () => {
  test('is asked for at the first health entry, and can be withdrawn', async ({ page }) => {
    const email = getUniqueEmail('health-consent')
    await clearSession(page)
    await signup(page, email, TEST_USER.password)
    await openVault(page)

    const create = page.getByRole('dialog', { name: 'Create Vault Entry' })
    const consent = page.getByRole('dialog', { name: 'Consent to store health data' })

    // Declining stores nothing, says why, and leaves the form as it was.
    await fillHealthEntry(page, 'Resting heart rate')
    await create.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(consent).toBeVisible({ timeout: 15000 })
    await consent.getByRole('button', { name: 'Not now' }).click()
    await expect(consent).toBeHidden()
    await expect(page.getByText(HEALTH_CONSENT_DECLINED_MESSAGE).first()).toBeVisible()
    await expect(create.getByLabel('Label')).toHaveValue('Resting heart rate')

    // Consenting saves the same entry.
    await create.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(consent).toBeVisible({ timeout: 15000 })
    await consent.getByRole('button', { name: 'I consent' }).click()
    await expect(create).toBeHidden({ timeout: 15000 })
    await expect(page.getByRole('heading', { name: 'Resting heart rate' })).toBeVisible()

    expect(await acceptances(email)).toContainEqual({
      document: 'health-data',
      version: LEGAL_DOCUMENTS['health-privacy'].version,
      action: 'accepted',
      source: 'health-gate',
    })

    // Withdrawing in settings appends a record rather than editing the grant.
    await Promise.all([
      page.waitForURL('/settings', { timeout: 20000, waitUntil: 'commit' }),
      page.getByRole('link', { name: 'Settings' }).click(),
    ])
    const section = page.locator('#health-data-consent')
    await section.getByRole('button', { name: 'Withdraw consent' }).click()
    await page
      .getByRole('alertdialog', { name: 'Withdraw consent to store health data?' })
      .getByRole('button', { name: 'Withdraw consent' })
      .click()
    await expect(section.getByText(/You withdrew consent on/)).toBeVisible({ timeout: 15000 })

    const actions = (await acceptances(email))
      .filter((row) => row.document === 'health-data')
      .map((row) => row.action)
    expect(actions).toEqual(['accepted', 'withdrawn'])
  })
})

test.describe('Organization terms', () => {
  test('cannot register an organization without accepting them', async ({ page }) => {
    await clearSession(page)
    await signup(page, getUniqueEmail('org-terms'), TEST_USER.password)
    await page.goto('/org/register')
    await page.getByLabel('Organization name').fill('Synthetic Terms Lab')
    await page.getByLabel('Contact email').fill(`terms-${Date.now()}@example.com`)
    await page.getByRole('button', { name: 'Register organization' }).click()

    await expect(
      page.getByRole('alert').filter({ hasText: 'Accept the Organization Terms' })
    ).toBeVisible()
    await expect(page).toHaveURL('/org/register')
  })
})
