/**
 * E2E tests - LD-105 recovery that works with any factor the person kept, and
 * LD-106 confirmation before a factor is removed.
 */

import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getUniqueEmail, signup, TEST_USER } from '../helpers/auth'
import { createAdminClient } from '../helpers/supabase-admin'

const ENTRY_LABEL = 'Blood pressure log'

async function goTo(page: Page, name: 'Vault' | 'Settings', path: string): Promise<void> {
  // Vault is in the primary navigation; Settings sits in the account menu area.
  const link =
    name === 'Vault'
      ? page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name })
      : page.getByRole('link', { name })
  await Promise.all([page.waitForURL(path, { timeout: 20000, waitUntil: 'commit' }), link.click()])
}

async function createVaultEntry(page: Page): Promise<void> {
  await goTo(page, 'Vault', '/vault')
  await page.getByRole('button', { name: 'Create Vault Entry' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create Vault Entry' })
  await dialog.getByLabel('Label').fill(ENTRY_LABEL)
  await dialog.getByLabel('Category', { exact: true }).selectOption('personal')
  await dialog.getByRole('button', { name: 'Edit as JSON' }).click()
  await dialog.getByRole('textbox', { name: 'Data', exact: true }).fill('{"systolic":118,"diastolic":76}')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
}

/** Make a recovery kit in settings and return the secret from the downloaded file. */
async function createKit(page: Page, password: string): Promise<string> {
  await goTo(page, 'Settings', '/settings')
  await page.getByRole('button', { name: 'Add a recovery kit' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create a recovery kit' })
  await dialog.getByLabel('Password').fill(password)
  await dialog.getByRole('button', { name: 'Create recovery kit' }).click()

  const saved = page.getByRole('dialog', { name: 'Save your recovery kit' })
  await expect(saved.getByRole('button', { name: 'Download as a file' })).toBeVisible({ timeout: 30000 })
  const downloading = page.waitForEvent('download')
  await saved.getByRole('button', { name: 'Download as a file' }).click()
  const path = await (await downloading).path()
  if (!path) throw new Error('The recovery kit was not downloaded')
  const secret = (await readFile(path, 'utf8')).match(/^[0-9A-Z]{8}(?:-[0-9A-Z]{8}){3}$/m)?.[0]
  if (!secret) throw new Error('The recovery kit file holds no secret')
  await saved.getByRole('button', { name: 'I have saved my kit' }).click()
  return secret
}

async function passwordWorks(email: string, password: string): Promise<boolean> {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { data } = await client.auth.signInWithPassword({ email, password })
  return Boolean(data.session)
}

async function userIdFor(email: string): Promise<string> {
  const { data, error } = await createAdminClient().from('users').select('id').eq('email', email).single()
  if (error) throw error
  return data.id
}

test.describe('Vault recovery', () => {
  test('recovers the vault with a recovery kit after a password reset', async ({ page }) => {
    test.setTimeout(300000)
    const service = createAdminClient()
    const email = getUniqueEmail('recovery-kit')
    const newPassword = 'RecoveredPassword789!'
    let userId: string | null = null

    try {
      await signup(page, email, TEST_USER.password)
      userId = await userIdFor(email)
      await createVaultEntry(page)
      const kit = await createKit(page, TEST_USER.password)

      // The page works with any session, so a signed-in browser stands in for
      // one that arrived from a reset email.
      await page.goto('/recover-vault')
      await page.getByLabel('New password', { exact: true }).fill(newPassword)
      await page.getByLabel('Confirm new password').fill(newPassword)

      // A kit that is not theirs is refused before the password changes.
      await page.getByLabel('Recovery code or kit').fill('ABCDEFGH-JKMNPQRS-TVWXYZ01-23456789')
      await page.getByRole('button', { name: 'Reset password' }).click()
      await expect(
        page.getByRole('alert').filter({ hasText: 'does not open this vault' })
      ).toBeVisible({ timeout: 30000 })
      expect(await passwordWorks(email, TEST_USER.password)).toBe(true)

      await page.getByLabel('Recovery code or kit').fill(kit.toLowerCase())
      await page.getByRole('button', { name: 'Reset password' }).click()
      const done = page.getByRole('status').filter({ hasText: 'restored' })
      await expect(done).toContainText('1 vault entry was restored', { timeout: 60000 })
      await expect(done).toContainText('recovery kits stopped working')
      await expect(page.getByText('Your new recovery code')).toBeVisible()
      expect(await passwordWorks(email, newPassword)).toBe(true)
      expect(await passwordWorks(email, TEST_USER.password)).toBe(false)

      // The kit wrapped the old key, so it is gone, and a new code replaced the old one.
      const { data: factors } = await service
        .from('recovery_factors')
        .select('type')
        .eq('user_id', userId)
      expect(factors).toEqual([{ type: 'recovery_code' }])

      await Promise.all([
        page.waitForURL('/dashboard', { timeout: 20000, waitUntil: 'commit' }),
        page.getByRole('button', { name: 'Continue to dashboard' }).click(),
      ])
      await goTo(page, 'Vault', '/vault')
      await page.getByRole('article').filter({ hasText: ENTRY_LABEL }).click()
      await expect(page.getByRole('dialog', { name: ENTRY_LABEL }).locator('pre')).toContainText(
        'systolic'
      )
    } finally {
      if (userId) await service.auth.admin.deleteUser(userId)
    }
  })

  test('a reset on an empty vault replaces the recovery code made for the old password', async ({ page }) => {
    test.setTimeout(240000)
    const service = createAdminClient()
    const email = getUniqueEmail('recovery-empty')
    const newPassword = 'FreshStartPassword321!'
    let userId: string | null = null

    try {
      await signup(page, email, TEST_USER.password)
      userId = await userIdFor(email)
      const before = await service
        .from('recovery_factors')
        .select('wrapped_master_key')
        .eq('user_id', userId)
        .single()

      await page.goto('/recover-vault')
      await page.getByLabel('New password', { exact: true }).fill(newPassword)
      await page.getByLabel('Confirm new password').fill(newPassword)
      await page.getByRole('button', { name: 'Reset password' }).click()

      await expect(
        page.getByRole('status').filter({ hasText: 'a new recovery code replaces the old one' })
      ).toBeVisible({ timeout: 60000 })
      await expect(page.getByText('Your new recovery code')).toBeVisible()

      // The code made at sign-up wrapped the key the old password derived.
      const after = await service
        .from('recovery_factors')
        .select('type, wrapped_master_key')
        .eq('user_id', userId)
      expect(after.data).toHaveLength(1)
      expect(after.data?.[0].type).toBe('recovery_code')
      expect(after.data?.[0].wrapped_master_key).not.toBe(before.data?.wrapped_master_key)
    } finally {
      if (userId) await service.auth.admin.deleteUser(userId)
    }
  })

  test('keeps the factors a connector key needs, and moves the key when a kit is used', async ({
    page,
  }) => {
    test.setTimeout(300000)
    const service = createAdminClient()
    const email = getUniqueEmail('recovery-ingest')
    const newPassword = 'ConnectorSafePassword654!'
    let userId: string | null = null
    const connectorKey = async () =>
      (await service.from('users').select('wrapped_ingest_private_key').eq('id', userId!).single()).data
        ?.wrapped_ingest_private_key ?? null

    try {
      await signup(page, email, TEST_USER.password)
      userId = await userIdFor(email)
      // Opening settings while unlocked publishes the connector key, wrapped
      // under the master key, before any source is connected.
      const kit = await createKit(page, TEST_USER.password)
      await expect.poll(connectorKey, { timeout: 20000 }).not.toBeNull()
      const keyBefore = await connectorKey()

      await page.goto('/recover-vault')
      await page.getByLabel('New password', { exact: true }).fill(newPassword)
      await page.getByLabel('Confirm new password').fill(newPassword)
      await page.getByRole('button', { name: 'Reset password' }).click()
      await expect(
        page.getByRole('status').filter({ hasText: 'the data your connected sources sent' })
      ).toBeVisible({ timeout: 60000 })

      // With no code entered, the factors are the only way back to the
      // connector key, so they all stay.
      const { data: kept } = await service.from('recovery_factors').select('type').eq('user_id', userId)
      expect(kept?.map((factor) => factor.type).sort()).toEqual(['recovery_code', 'recovery_kit'])

      await page.goto('/recover-vault')
      await page.getByLabel('New password', { exact: true }).fill(newPassword)
      await page.getByLabel('Confirm new password').fill(newPassword)
      await page.getByLabel('Recovery code or kit').fill(kit)
      await page.getByRole('button', { name: 'Reset password' }).click()
      await expect(page.getByText('Your new recovery code')).toBeVisible({ timeout: 60000 })

      expect(await connectorKey()).not.toBe(keyBefore)
      const { data: after } = await service.from('recovery_factors').select('type').eq('user_id', userId)
      expect(after).toEqual([{ type: 'recovery_code' }])
    } finally {
      if (userId) await service.auth.admin.deleteUser(userId)
    }
  })

  test('asks for the password before a recovery factor is removed', async ({ page }) => {
    test.setTimeout(240000)
    const service = createAdminClient()
    const email = getUniqueEmail('recovery-remove')
    let userId: string | null = null

    try {
      await signup(page, email, TEST_USER.password)
      userId = await userIdFor(email)
      await createKit(page, TEST_USER.password)

      await page.getByRole('button', { name: 'Remove recovery kit Backup kit' }).click()
      const confirm = page.getByRole('dialog', { name: 'Remove recovery kit Backup kit?' })
      await confirm.getByLabel('Password').fill('not the password')
      await confirm.getByRole('button', { name: 'Confirm' }).click()
      await expect(confirm.getByText('Incorrect password')).toBeVisible({ timeout: 30000 })

      await confirm.getByLabel('Password').fill(TEST_USER.password)
      await confirm.getByRole('button', { name: 'Confirm' }).click()
      // Role queries skip the page while a dialog hides it from assistive
      // technology, so wait on the text itself until the list drops the kit.
      await expect(confirm).toBeHidden({ timeout: 30000 })
      await expect(page.getByText('Recovery kit · Backup kit')).toHaveCount(0, { timeout: 30000 })
      await expect(page.getByRole('button', { name: 'Remove the recovery code' })).toBeEnabled()

      const { data: factors } = await service
        .from('recovery_factors')
        .select('type')
        .eq('user_id', userId)
      expect(factors).toEqual([{ type: 'recovery_code' }])
      const { data: alerts } = await service
        .from('notifications')
        .select('title')
        .eq('user_id', userId)
        .eq('type', 'security_alert')
      expect(alerts?.map((alert) => alert.title)).toEqual(
        expect.arrayContaining(['Recovery kit added', 'Recovery factor removed'])
      )
    } finally {
      if (userId) await service.auth.admin.deleteUser(userId)
    }
  })
})
