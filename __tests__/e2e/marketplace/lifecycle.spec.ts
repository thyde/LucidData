import { readFile } from 'node:fs/promises'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { getUniqueEmail, signup, TEST_USER } from '../helpers/auth'
import { createAdminClient } from '../helpers/supabase-admin'
import type { Database } from '@/types/database.types'

async function createSyntheticUser(
  service: SupabaseClient<Database>,
  prefix: string
): Promise<User> {
  const { data, error } = await service.auth.admin.createUser({
    email: getUniqueEmail(prefix),
    password: TEST_USER.password,
    email_confirm: true,
  })
  if (error) throw error
  return data.user
}

async function findUserId(
  service: SupabaseClient<Database>,
  email: string
): Promise<string> {
  const { data, error } = await service.from('users').select('id').eq('email', email).single()
  if (error) throw error
  return data.id
}

// LD-501: the privacy gate classifies fields per vault schema, and an
// unclassified custom payload is suppressed from every release. A pool of
// free-form fields can no longer be sold, so this uses the employment schema.
async function createVaultEntry(page: Page, label: string): Promise<void> {
  await Promise.all([
    page.waitForURL('/vault', { timeout: 20000, waitUntil: 'commit' }),
    page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Vault' })
      .click(),
  ])
  await expect(page.getByRole('heading', { name: 'Vault Entries' })).toBeVisible()
  await page.getByRole('button', { name: 'Create Vault Entry' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create Vault Entry' })
  await dialog.getByLabel('Label').fill(label)
  await dialog.locator('#schema-type-select').selectOption('employment')
  await dialog.getByLabel('Employer').fill('Synthetic Industries')
  await dialog.getByLabel('Role / Title').fill('Engineer')
  await dialog.getByLabel('Employment type').selectOption('full_time')
  await dialog.getByLabel('Start date').fill('2020-01-15')
  await dialog.getByLabel('Salary range').selectOption('60k-100k')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
}

async function closeContext(context: BrowserContext | undefined): Promise<void> {
  await context?.close().catch(() => undefined)
}

test.describe('Marketplace lifecycle', () => {
  test('delivers the purchased synthetic tranche and preserves its snapshot', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(600000)
    const service = createAdminClient()
    const createdUserIds: string[] = []
    const createdUserEmails: string[] = []
    let organizationId: string | null = null
    let buyerContext: BrowserContext | undefined
    let sellerContext: BrowserContext | undefined

    try {
      buyerContext = await browser.newContext({ baseURL })
      const buyerPage = await buyerContext.newPage()
      const buyerEmail = getUniqueEmail('market-buyer')
      createdUserEmails.push(buyerEmail)
      await signup(buyerPage, buyerEmail, TEST_USER.password)
      createdUserIds.push(await findUserId(service, buyerEmail))

      const organizationEmail = getUniqueEmail('market-org')
      await buyerPage.goto('/org/register')
      await buyerPage.getByLabel('Organization name').fill('Synthetic Model Lab')
      await buyerPage.getByLabel('Contact email').fill(organizationEmail)
      await buyerPage.getByLabel('Organization type').selectOption('both')
      await buyerPage.getByRole('checkbox').check()
      await buyerPage.getByRole('button', { name: 'Register organization' }).click()
      await expect(
        buyerPage.getByRole('heading', { name: 'Organization created' })
      ).toBeVisible({ timeout: 15000 })

      const { data: organization, error: organizationError } = await service
        .from('organizations')
        .select('id')
        .eq('email', organizationEmail)
        .single()
      if (organizationError) throw organizationError
      organizationId = organization.id

      const poolName = `Synthetic AI tranche ${Date.now()}`
      await buyerPage.goto(`/org/${organizationId}/data`)

      // An unverified buyer is told what to do instead of hitting a failure
      // after filling in the whole form.
      await expect(
        buyerPage.getByText('Verify your organization before using the data marketplace')
      ).toBeVisible()
      await expect(buyerPage.getByRole('button', { name: 'Create data pool' })).toBeDisabled()
      await expect(buyerPage.getByRole('button', { name: 'Create offer' })).toBeDisabled()

      const { error: verificationError } = await service
        .from('organizations')
        .update({ verified_at: new Date().toISOString() })
        .eq('id', organizationId)
      if (verificationError) throw verificationError

      await buyerPage.reload()
      await expect(
        buyerPage.getByText('Verify your organization before using the data marketplace')
      ).toHaveCount(0)

      await buyerPage.getByRole('button', { name: 'Create data pool' }).click()
      const poolDialog = buyerPage.getByRole('dialog', { name: 'Create a data pool' })
      await poolDialog.getByLabel('Name').fill(poolName)
      await poolDialog.getByLabel('Description').fill('Synthetic records for accessibility model evaluation')
      await poolDialog.getByLabel('Category').selectOption('credentials')
      await poolDialog.getByLabel('Purpose').selectOption('ai_training')
      await poolDialog.getByLabel('Minimum contributors').fill('5')
      await poolDialog.getByLabel('Declared retention (days)').fill('30')
      await poolDialog.getByLabel('Requested fields (comma-separated)').fill('employer, role')
      await poolDialog.getByLabel('Base price (USD)').fill('0')
      await poolDialog.getByLabel('Price per record (USD)').fill('0')
      await poolDialog.getByRole('button', { name: 'Create pool' }).click()
      await expect(poolDialog).toBeHidden({ timeout: 15000 })

      const { data: pool, error: poolError } = await service
        .from('data_pools')
        .select('*')
        .eq('buyer_org_id', organizationId)
        .eq('name', poolName)
        .single()
      if (poolError) throw poolError
      expect(pool.purpose).toBe('ai_training')
      expect(pool.minimum_contributors).toBe(5)

      const seededUsers: User[] = []
      for (let index = 0; index < 4; index += 1) {
        const user = await createSyntheticUser(service, `market-cohort-${index}`)
        seededUsers.push(user)
        createdUserIds.push(user.id)
      }
      // LD-501: every seeded contributor shares the same quasi-identifiers, so
      // the cohort forms one equivalence class and the release can meet k. The
      // pool asks for employer and role, so nothing else is contributed.
      const { error: seedError } = await service.from('pool_contributions').insert(
        seededUsers.map((user) => ({
          pool_id: pool.id,
          user_id: user.id,
          schema_type: 'employment',
          anonymized_payload: { employer: 'Synthetic Industries', role: 'Engineer' },
          category: 'credentials',
          payout_cents: 0,
          declared_purpose: 'ai_training',
          consent_version: '2026-07-25',
        }))
      )
      if (seedError) throw seedError

      sellerContext = await browser.newContext({ baseURL })
      const sellerPage = await sellerContext.newPage()
      const sellerEmail = getUniqueEmail('market-seller')
      createdUserEmails.push(sellerEmail)
      await signup(sellerPage, sellerEmail, TEST_USER.password)
      const sellerUserId = await findUserId(service, sellerEmail)
      createdUserIds.push(sellerUserId)

      await createVaultEntry(sellerPage, 'Synthetic employment record')
      const vaultCard = sellerPage
        .getByRole('article')
        .filter({ hasText: 'Synthetic employment record' })
      await vaultCard.click()
      const vaultDialog = sellerPage.getByRole('dialog', {
        name: 'Synthetic employment record',
      })
      const employerPreference = vaultDialog.locator('li').filter({ hasText: 'employer' })
      const rolePreference = vaultDialog.locator('li').filter({ hasText: 'role' })
      const startDatePreference = vaultDialog.locator('li').filter({ hasText: 'start_date' })
      const salaryPreference = vaultDialog.locator('li').filter({ hasText: 'salary_range' })
      for (const preference of [
        employerPreference,
        rolePreference,
        startDatePreference,
        salaryPreference,
      ]) {
        await preference.getByRole('button', { name: 'Private' }).click()
        await expect(preference.getByRole('button', { name: 'For sale' })).toBeVisible()
      }
      await vaultDialog.getByRole('button', { name: 'Save sharing preferences' }).click()
      await expect(sellerPage.getByText('Sharing preferences saved', { exact: true })).toBeVisible()
      await vaultDialog.getByRole('button', { name: 'Close' }).first().click()
      await expect(vaultDialog).toBeHidden()
      const marketplaceLink = sellerPage
        .getByRole('navigation', { name: 'Primary' })
        .getByRole('link', { name: 'Marketplace' })
      await expect(marketplaceLink).toHaveAttribute('href', '/marketplace')
      await Promise.all([
        sellerPage.waitForURL('/marketplace', { timeout: 60000, waitUntil: 'commit' }),
        marketplaceLink.click(),
      ])
      await expect(sellerPage.getByText('Synthetic Model Lab · Verified buyer')).toBeVisible()
      const sellerPool = sellerPage.getByText(poolName).locator('..').locator('..')
      await sellerPool.getByRole('button', { name: 'Contribute' }).click()
      const contributionDialog = sellerPage.getByRole('dialog', { name: `Contribute to ${poolName}` })
      await contributionDialog.getByRole('button', { name: /Synthetic employment record/ }).click()
      await expect(contributionDialog.getByLabel('Share employer')).toBeChecked()
      await expect(contributionDialog.getByLabel('Share role', { exact: true })).toBeChecked()
      // employment_type and is_current were never opted in, so they stay private.
      await expect(contributionDialog.getByLabel('Share employment_type')).not.toBeChecked()
      await contributionDialog.getByLabel('Accept contribution terms').check()
      await contributionDialog.getByRole('button', { name: 'Share to pool' }).click()
      await expect(contributionDialog).toBeHidden({ timeout: 15000 })

      const { data: sellerContribution, error: contributionError } = await service
        .from('pool_contributions')
        .select('*')
        .eq('pool_id', pool.id)
        .eq('user_id', sellerUserId)
        .single()
      if (contributionError) throw contributionError
      expect(sellerContribution.declared_purpose).toBe('ai_training')
      expect(sellerContribution.consent_version).toBe('2026-07-25')
      // LD-501: the schema travels with the contribution so the gate can
      // classify its fields.
      expect(sellerContribution.schema_type).toBe('employment')
      // Only the fields the pool asked for leave the vault.
      expect(sellerContribution.anonymized_payload).toEqual({
        employer: 'Synthetic Industries',
        role: 'Engineer',
      })

      await buyerPage.reload()
      await buyerPage.getByRole('button', { name: 'Buy snapshot' }).click()
      await expect(buyerPage.getByText('Purchase complete', { exact: true })).toBeVisible({
        timeout: 15000,
      })

      const extraUser = seededUsers[0]
      const { error: postPurchaseError } = await service.from('pool_contributions').insert({
        pool_id: pool.id,
        user_id: extraUser.id,
        schema_type: 'employment',
        anonymized_payload: { employer: 'Synthetic Industries', role: 'Post Purchase' },
        category: 'credentials',
        payout_cents: 0,
        declared_purpose: 'ai_training',
        consent_version: '2026-07-25',
      })
      if (postPurchaseError) throw postPurchaseError

      await sellerPage.reload()
      await sellerPage.getByRole('button', { name: 'Withdraw' }).click()
      await expect(
        sellerPage.getByText('Contribution withdrawn', { exact: true })
      ).toBeVisible({ timeout: 15000 })

      await buyerPage.reload()
      const downloadPromise = buyerPage.waitForEvent('download')
      await buyerPage.getByRole('button', { name: 'Download' }).click()
      const download = await downloadPromise
      const downloadPath = await download.path()
      if (!downloadPath) throw new Error('Dataset download path was not available')
      const exported = JSON.parse(await readFile(downloadPath, 'utf8')) as {
        pool: { purpose: string; retentionDays: number }
        exportExpiresAt: string
        recordCount: number
        privacyReport: { k: number; kTarget: number; identifiersDropped: string[] }
        records: { payload: { employer?: string; role?: string } }[]
      }

      expect(exported.pool).toMatchObject({ purpose: 'ai_training', retentionDays: 30 })
      expect(new Date(exported.exportExpiresAt).getTime()).toBeGreaterThan(Date.now())
      expect(exported.recordCount).toBe(5)
      // LD-501: every order carries its privacy report, and the release met k.
      expect(exported.privacyReport.kTarget).toBe(5)
      expect(exported.privacyReport.k).toBeGreaterThanOrEqual(5)
      // The snapshot is immutable: a contribution added after purchase is absent.
      expect(exported.records.map((record) => record.payload.role)).not.toContain(
        'Post Purchase'
      )
      expect(exported.records.every((record) => record.payload.role === 'Engineer')).toBe(true)
    } finally {
      await closeContext(sellerContext)
      await closeContext(buyerContext)
      if (organizationId) {
        await service.from('organizations').delete().eq('id', organizationId)
      }
      for (const email of createdUserEmails) {
        const { data } = await service.from('users').select('id').eq('email', email).maybeSingle()
        if (data && !createdUserIds.includes(data.id)) createdUserIds.push(data.id)
      }
      for (const userId of createdUserIds.reverse()) {
        await service.auth.admin.deleteUser(userId).catch(() => undefined)
      }
    }
  })
})