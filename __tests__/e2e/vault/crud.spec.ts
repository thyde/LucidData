import { expect, test, type Locator, type Page } from '@playwright/test'
import { clearSession, getUniqueEmail, signup, TEST_USER } from '../helpers/auth'

interface VaultInput {
  label: string
  category: 'personal' | 'health' | 'financial' | 'credentials' | 'other'
  description?: string
  tags?: string
  data: Record<string, unknown>
}

async function openCreateDialog(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Create Vault Entry' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create Vault Entry' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function createEntry(page: Page, input: VaultInput): Promise<Locator> {
  const dialog = await openCreateDialog(page)
  await dialog.getByLabel('Label').fill(input.label)
  await dialog.getByLabel('Category', { exact: true }).selectOption(input.category)
  if (input.description) await dialog.getByLabel('Description').fill(input.description)
  if (input.tags) await dialog.getByLabel('Tags').fill(input.tags)
  await dialog.getByRole('button', { name: 'Edit as JSON' }).click()
  await dialog.getByRole('textbox', { name: 'Data', exact: true }).fill(JSON.stringify(input.data))
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
  await expect(page.getByText('Vault entry created successfully', { exact: true })).toBeVisible()

  return page.getByRole('article').filter({ hasText: input.label })
}

test.describe('Vault', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signup(page, getUniqueEmail('vault'), TEST_USER.password)
    await Promise.all([
      page.waitForURL('/vault', { timeout: 20000, waitUntil: 'commit' }),
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Vault' }).click(),
    ])
    await expect(page.getByRole('heading', { level: 1, name: 'Vault Entries' })).toBeVisible()
  })

  test('shows the empty state and validates metadata and JSON', async ({ page }) => {
    await expect(page.getByTestId('empty-state')).toContainText('No vault entries yet')
    const dialog = await openCreateDialog(page)

    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(dialog.getByText('Label is required')).toBeVisible()
    await expect(dialog.getByText('Category is required')).toBeVisible()

    await dialog.getByLabel('Label').fill('Invalid JSON entry')
    await dialog.getByLabel('Category', { exact: true }).selectOption('personal')
    await dialog.getByRole('button', { name: 'Edit as JSON' }).click()
    await dialog.getByRole('textbox', { name: 'Data', exact: true }).fill('{invalid}')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(dialog.getByText('Invalid JSON')).toBeVisible()
  })

  test('creates and decrypts an entry in the current browser session', async ({ page }) => {
    const card = await createEntry(page, {
      label: 'Medical profile',
      category: 'health',
      description: 'Private health summary',
      tags: 'medical, current',
      data: { bloodType: 'A+', allergies: ['pollen'] },
    })

    await expect(card).toBeVisible()
    await expect(card.getByText('health', { exact: true })).toBeVisible()
    await expect(card.getByText('medical', { exact: true })).toBeVisible()
    await card.click()

    const details = page.getByRole('dialog', { name: 'Medical profile' })
    await expect(details.locator('pre')).toContainText('"bloodType": "A+"')
    await expect(details.locator('pre')).toContainText('"pollen"')
    await expect(details.getByText('Private health summary')).toBeVisible()
  })

  test('searches, filters, and sorts decrypted entries', async ({ page }) => {
    await createEntry(page, {
      label: 'Alpha health record',
      category: 'health',
      tags: 'shared, health',
      data: { status: 'current' },
    })
    await createEntry(page, {
      label: 'Beta budget',
      category: 'financial',
      tags: 'finance',
      data: { balance: 1250 },
    })

    await page.getByPlaceholder('Search entries...').fill('budget')
    await expect(page.getByRole('heading', { name: 'Beta budget' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Alpha health record' })).toBeHidden()

    await page.getByPlaceholder('Search entries...').clear()
    await page.getByRole('combobox', { name: 'Category filter' }).selectOption('health')
    await expect(page.getByRole('heading', { name: 'Alpha health record' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Beta budget' })).toBeHidden()

    await page.getByRole('combobox', { name: 'Category filter' }).selectOption('')
    await page.getByRole('button', { name: 'Filter by tag: finance' }).click()
    await expect(page.getByRole('heading', { name: 'Beta budget' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Alpha health record' })).toBeHidden()
  })

  test('edits and re-encrypts an existing entry', async ({ page }) => {
    const card = await createEntry(page, {
      label: 'Original profile',
      category: 'personal',
      data: { status: 'draft' },
    })
    await card.click()
    await page.getByRole('dialog', { name: 'Original profile' }).getByRole('button', { name: 'Edit' }).click()

    const edit = page.getByRole('dialog', { name: 'Edit Vault Entry' })
    await edit.getByLabel('Label').fill('Updated profile')
    await edit.getByRole('textbox', { name: 'Data', exact: true }).fill('{"status":"verified"}')
    await edit.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(edit).toBeHidden({ timeout: 15000 })
    await expect(page.getByText('Vault entry updated successfully', { exact: true })).toBeVisible()

    const updated = page.getByRole('article').filter({ hasText: 'Updated profile' })
    await expect(updated).toBeVisible()
    await updated.click()
    await expect(page.getByRole('dialog', { name: 'Updated profile' }).locator('pre')).toContainText('"status": "verified"')
  })

  test('deletes an entry after confirmation', async ({ page }) => {
    const card = await createEntry(page, {
      label: 'Disposable record',
      category: 'other',
      data: { temporary: true },
    })
    await card.click()
    await page.getByRole('dialog', { name: 'Disposable record' }).getByRole('button', { name: 'Delete' }).click()

    const confirmation = page.getByRole('alertdialog', { name: 'Are you sure?' })
    await expect(confirmation).toContainText('Disposable record')
    await confirmation.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(confirmation).toBeHidden({ timeout: 15000 })
    await expect(page.getByText('Vault entry deleted successfully', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Disposable record' })).toHaveCount(0)
    await expect(page.getByTestId('empty-state')).toBeVisible()
  })

  test('keeps the session but discards the master key on reload', async ({ page }) => {
    await createEntry(page, {
      label: 'Reload-sensitive record',
      category: 'personal',
      data: { secret: 'browser-only' },
    })

    await page.reload()

    await expect(page).toHaveURL('/vault')
    await expect(page.getByRole('heading', { name: 'Your vault is locked' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('imports multiple JSON records and decrypts them in the browser', async ({ page }) => {
    await page.getByRole('button', { name: 'Import file' }).click()
    const dialog = page.getByRole('dialog', { name: 'Import from a file' })
    await dialog.getByLabel('File').setInputFiles({
      name: 'synthetic-profiles.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify([
          { label: 'Imported alpha', preference: 'keyboard' },
          { label: 'Imported beta', preference: 'screen-reader' },
        ])
      ),
    })
    await expect(dialog.getByText('2 entries found (JSON)')).toBeVisible()
    await dialog.getByLabel('Category').selectOption('other')
    await dialog.getByLabel('Tags').fill('synthetic, imported')
    await dialog.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(dialog).toBeHidden({ timeout: 30000 })
    await expect(page.getByText('Import complete', { exact: true })).toBeVisible()

    const alpha = page.getByRole('article').filter({ hasText: 'Imported alpha' })
    const beta = page.getByRole('article').filter({ hasText: 'Imported beta' })
    await expect(alpha).toBeVisible()
    await expect(beta).toBeVisible()
    await beta.click()
    await expect(page.getByRole('dialog', { name: 'Imported beta' }).locator('pre')).toContainText(
      'screen-reader'
    )
  })
})