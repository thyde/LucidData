import { expect, test, type Page } from '@playwright/test'
import { clearSession, getUniqueEmail, signup, TEST_USER } from '../helpers/auth'

async function createVaultEntry(page: Page, label: string) {
  await page.getByRole('button', { name: 'Create Vault Entry' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create Vault Entry' })
  await dialog.getByLabel('Label').fill(label)
  await dialog.getByLabel('Category', { exact: true }).selectOption('personal')
  await dialog.getByRole('button', { name: 'Edit as JSON' }).click()
  await dialog.getByRole('textbox', { name: 'Data', exact: true }).fill('{"status":"created"}')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
}

test.describe('Audit log', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signup(page, getUniqueEmail('audit'), TEST_USER.password)
  })

  test('shows and verifies the recovery event created during registration', async ({ page }) => {
    await Promise.all([
      page.waitForURL('/audit', { timeout: 20000, waitUntil: 'commit' }),
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Audit Log' }).click(),
    ])

    await expect(page.getByRole('heading', { level: 1, name: 'Audit Log' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Recent Activity' })).toBeVisible()
    await expect(page.getByText('Generated a vault recovery code', { exact: true })).toBeVisible()
    await expect(page.getByText('Integrity verified. The hash chain is intact and shows no signs of tampering.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export log' })).toBeEnabled()
  })

  test('records and verifies the complete vault lifecycle', async ({ page }) => {
    await Promise.all([
      page.waitForURL('/vault', { timeout: 30000, waitUntil: 'commit' }),
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Vault' }).click(),
    ])
    await expect(page.getByRole('heading', { level: 1, name: 'Vault Entries' })).toBeVisible()

    await createVaultEntry(page, 'Audited profile')
    let card = page.getByRole('article').filter({ hasText: 'Audited profile' })
    await card.click()
    await page.getByRole('dialog', { name: 'Audited profile' }).getByRole('button', { name: 'Edit' }).click()

    const edit = page.getByRole('dialog', { name: 'Edit Vault Entry' })
    await edit.getByLabel('Label').fill('Audited profile updated')
    await edit.getByRole('textbox', { name: 'Data', exact: true }).fill('{"status":"updated"}')
    await edit.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(edit).toBeHidden({ timeout: 15000 })

    card = page.getByRole('article').filter({ hasText: 'Audited profile updated' })
    await card.click()
    await page.getByRole('dialog', { name: 'Audited profile updated' }).getByRole('button', { name: 'Delete' }).click()
    const confirmation = page.getByRole('alertdialog', { name: 'Are you sure?' })
    await confirmation.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(confirmation).toBeHidden({ timeout: 15000 })

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Audit Log' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Audit Log' })).toBeVisible()

    const integrityMessage = 'Integrity verified. The hash chain is intact and shows no signs of tampering.'
    await expect(page.getByText(integrityMessage)).toBeVisible()
    await expect(page.getByText('Created vault entry: Audited profile', { exact: true })).toBeVisible()
    await expect(page.getByText('Accessed vault entry: Audited profile', { exact: true })).toBeVisible()
    await expect(page.getByText('Updated vault entry: Audited profile updated', { exact: true })).toBeVisible()
    await expect(page.getByText('Deleted vault entry: Audited profile updated', { exact: true })).toBeVisible()
    expect(await page.getByTestId('audit-entry').count()).toBeGreaterThanOrEqual(4)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export log' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('lucid-audit-log.json')

    await page.getByRole('button', { name: 'Verify integrity' }).click()
    await expect(page.getByText(integrityMessage)).toBeVisible()
  })
})