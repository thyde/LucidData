import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { getUniqueEmail, signup, TEST_USER } from '../helpers/auth'
import { createAdminClient } from '../helpers/supabase-admin'

async function createVaultEntry(page: Page): Promise<void> {
  await Promise.all([
    page.waitForURL('/vault', { timeout: 20000, waitUntil: 'commit' }),
    page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Vault' })
      .click(),
  ])
  await page.getByRole('button', { name: 'Create Vault Entry' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create Vault Entry' })
  await dialog.getByLabel('Label').fill('Synthetic portable profile')
  await dialog.getByLabel('Category', { exact: true }).selectOption('personal')
  await dialog.getByRole('button', { name: 'Edit as JSON' }).click()
  await dialog
    .getByRole('textbox', { name: 'Data', exact: true })
    .fill('{"nickname":"Synthetic User","preference":"screen-reader"}')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
}

test.describe('Account security settings', () => {
  test('supports the complete security and data portability journey', async ({ page, context }) => {
    test.setTimeout(360000)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const service = createAdminClient()
    const email = getUniqueEmail('settings')
    const oldPassword = TEST_USER.password
    const newPassword = 'ChangedPassword456!'
    let userId: string | null = null

    try {
      await signup(page, email, oldPassword)
      const { data: profile, error: profileError } = await service
        .from('users')
        .select('id')
        .eq('email', email)
        .single()
      if (profileError) throw profileError
      userId = profile.id

      await createVaultEntry(page)
      const { error: passkeyError } = await service.from('passkeys').insert({
        user_id: userId,
        credential_id: `synthetic-${Date.now()}`,
        public_key: Buffer.from('synthetic-public-key').toString('base64'),
        device_name: 'Synthetic laptop',
      })
      if (passkeyError) throw passkeyError

      await Promise.all([
        page.waitForURL('/settings', { timeout: 20000, waitUntil: 'commit' }),
        page.getByRole('link', { name: 'Settings' }).click(),
      ])
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()

      await page.getByRole('button', { name: 'Remove Synthetic laptop' }).click()
      const removeDialog = page.getByRole('alertdialog', { name: 'Remove this passkey?' })
      await removeDialog.getByRole('button', { name: 'Remove passkey' }).click()
      await expect(page.getByText('Passkey removed', { exact: true })).toBeVisible()
      const { count: passkeyCount } = await service
        .from('passkeys')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
      expect(passkeyCount).toBe(0)

      const notificationSwitch = page.getByRole('switch', { name: 'Email notifications' })
      await expect(notificationSwitch).toBeChecked()
      await notificationSwitch.click()
      await expect(page.getByText('Email notifications off', { exact: true })).toBeVisible()
      const { data: notificationProfile } = await service
        .from('users')
        .select('email_notifications_enabled')
        .eq('id', userId)
        .single()
      expect(notificationProfile?.email_notifications_enabled).toBe(false)

      const exportPromise = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Export vault (JSON-LD)' }).click()
      const exportDownload = await exportPromise
      const exportPath = await exportDownload.path()
      if (!exportPath) throw new Error('Vault export path was not available')
      const exportDocument = JSON.parse(await readFile(exportPath, 'utf8')) as {
        holder: string
        vaultEntries: { label: string; data: Record<string, unknown> }[]
      }
      expect(exportDocument.holder).toBe(email)
      expect(exportDocument.vaultEntries).toEqual([
        expect.objectContaining({
          label: 'Synthetic portable profile',
          data: { nickname: 'Synthetic User', preference: 'screen-reader' },
        }),
      ])

      await page.getByRole('button', { name: 'Regenerate recovery code' }).click()
      const recoveryDialog = page.getByRole('dialog', { name: 'Generate a recovery code' })
      await recoveryDialog.getByLabel('Password').fill(oldPassword)
      await recoveryDialog.getByRole('button', { name: 'Generate code' }).click()
      const savedRecoveryDialog = page.getByRole('dialog', { name: 'Save your recovery code' })
      await expect(savedRecoveryDialog.getByRole('button', { name: 'Copy' })).toBeVisible({
        timeout: 30000,
      })
      await savedRecoveryDialog.getByRole('button', { name: 'Copy' }).click()
      await expect(savedRecoveryDialog.getByRole('button', { name: 'Copied' })).toBeVisible()
      const recoveryDownloadPromise = page.waitForEvent('download')
      await savedRecoveryDialog.getByRole('button', { name: 'Download' }).click()
      const recoveryDownload = await recoveryDownloadPromise
      const recoveryPath = await recoveryDownload.path()
      if (!recoveryPath) throw new Error('Recovery-code download path was not available')
      expect(await readFile(recoveryPath, 'utf8')).toContain('LucidData vault recovery code')
      await savedRecoveryDialog.getByRole('button', { name: 'I have saved my code' }).click()

      await page.getByRole('button', { name: 'Change password' }).click()
      const passwordDialog = page.getByRole('dialog', { name: 'Change password' })
      await passwordDialog.getByLabel('Current password').fill(oldPassword)
      await passwordDialog.getByLabel('New password', { exact: true }).fill(newPassword)
      await passwordDialog.getByLabel('Confirm new password').fill(newPassword)
      await passwordDialog.getByRole('button', { name: 'Change password' }).click()
      const changedDialog = page.getByRole('dialog', { name: 'Save your new recovery code' })
      await expect(changedDialog).toBeVisible({ timeout: 45000 })
      await changedDialog.getByRole('button', { name: 'Done' }).click()

      await Promise.all([
        page.waitForURL('/vault', { timeout: 20000, waitUntil: 'commit' }),
        page
          .getByRole('navigation', { name: 'Primary' })
          .getByRole('link', { name: 'Vault' })
          .click(),
      ])
      await page.getByRole('article').filter({ hasText: 'Synthetic portable profile' }).click()
      await expect(
        page.getByRole('dialog', { name: 'Synthetic portable profile' }).locator('pre')
      ).toContainText('screen-reader')
      await page.keyboard.press('Escape')

      const { data: passwordAudit } = await service
        .from('audit_logs')
        .select('event_type')
        .eq('user_id', userId)
        .eq('event_type', 'password_changed')
        .maybeSingle()
      expect(passwordAudit?.event_type).toBe('password_changed')

      await page.getByRole('button', { name: 'Sign out' }).click()
      await page.waitForURL(/\/login/, { timeout: 15000 })
      await page.getByLabel('Email').fill(email)
      const loginPassword = page.locator('input[name="password"]')
      await loginPassword.fill(oldPassword)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(page.getByRole('alert')).toBeVisible({ timeout: 15000 })

      await loginPassword.fill(newPassword)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await page.waitForURL('/dashboard', { timeout: 30000, waitUntil: 'commit' })

      await Promise.all([
        page.waitForURL('/settings', { timeout: 20000, waitUntil: 'commit' }),
        page.getByRole('link', { name: 'Settings' }).click(),
      ])
      await page.getByRole('button', { name: 'Delete my account' }).click()
      const deletionDialog = page.getByRole('dialog', { name: 'Delete your account?' })
      await deletionDialog.getByLabel('Confirmation').fill('DELETE MY ACCOUNT')
      await deletionDialog.getByRole('button', { name: 'Permanently delete account' }).click()
      await page.waitForURL('/', { timeout: 30000, waitUntil: 'commit' })

      const { data: deletedProfile } = await service
        .from('users')
        .select('id')
        .eq('id', userId)
        .maybeSingle()
      expect(deletedProfile).toBeNull()
      userId = null
    } finally {
      if (userId) await service.auth.admin.deleteUser(userId).catch(() => undefined)
    }
  })
})