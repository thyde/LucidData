import { expect, test, type Page } from '@playwright/test'
import { clearSession, getUniqueEmail, signup, TEST_USER } from '../helpers/auth'

// LD-209: each health type can be entered by hand through its schema form, is
// filed under health, and reads back as labelled fields after decryption.

interface TypedEntry {
  type: string
  label: string
  fields: [field: string | RegExp, value: string][]
  shown: [field: string, value: string | RegExp][]
}

const ENTRIES: TypedEntry[] = [
  {
    type: 'sleep_session',
    label: 'Sleep on Tuesday night',
    fields: [
      [/^Went to sleep/, '2026-10-06T22:45'],
      [/^Woke up/, '2026-10-07T06:50'],
      ['Time asleep (minutes)', '452'],
      ['Deep sleep (minutes)', '71'],
    ],
    shown: [
      ['Went to sleep', /Oct 6, 2026/],
      ['Time asleep (minutes)', '452'],
    ],
  },
  {
    type: 'vitals_daily',
    label: 'Vitals for Wednesday',
    fields: [
      [/^Date/, '2026-10-07'],
      ['Resting heart rate (bpm)', '58'],
      ['Blood oxygen (%)', '97'],
      ['Blood pressure, systolic (mmHg)', '118'],
      ['Blood pressure, diastolic (mmHg)', '76'],
    ],
    shown: [
      ['Resting heart rate (bpm)', '58'],
      ['Blood pressure, diastolic (mmHg)', '76'],
    ],
  },
  {
    type: 'body_measurement',
    label: 'Weigh-in for Wednesday',
    fields: [
      [/^Date/, '2026-10-07'],
      ['Weight (kg)', '72.4'],
      ['Waist (cm)', '81'],
    ],
    shown: [['Weight (kg)', '72.4']],
  },
  {
    type: 'nutrition_daily',
    label: 'Food for Wednesday',
    fields: [
      [/^Date/, '2026-10-07'],
      ['Energy (kcal)', '2150'],
      ['Protein (g)', '96'],
      ['Water (ml)', '1800'],
    ],
    shown: [
      ['Energy (kcal)', '2150'],
      ['Water (ml)', '1800'],
    ],
  },
]

async function openTypedDialog(page: Page, type: string, label: string) {
  await page.getByRole('button', { name: 'Create Vault Entry' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create Vault Entry' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Label').fill(label)
  await dialog.getByLabel('Data type', { exact: true }).selectOption(type)
  // The type files the entry under health without being asked.
  await expect(dialog.getByLabel('Category', { exact: true })).toHaveValue('health')
  return dialog
}

test.describe('Health data types', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signup(page, getUniqueEmail('health-types'), TEST_USER.password, { healthConsent: true })
    await Promise.all([
      page.waitForURL('/vault', { timeout: 20000, waitUntil: 'commit' }),
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Vault' }).click(),
    ])
    await expect(page.getByRole('heading', { level: 1, name: 'Vault Entries' })).toBeVisible()
  })

  test('each type can be entered by hand and reads back as fields', async ({ page }) => {
    for (const entry of ENTRIES) {
      const dialog = await openTypedDialog(page, entry.type, entry.label)
      for (const [field, value] of entry.fields) {
        await dialog.getByLabel(field).fill(value)
      }
      await dialog.getByRole('button', { name: 'Create', exact: true }).click()
      await expect(dialog).toBeHidden({ timeout: 15000 })

      await page.getByRole('article').filter({ hasText: entry.label }).click()
      const view = page.getByRole('dialog', { name: entry.label })
      await expect(view).toBeVisible()
      for (const [field, value] of entry.shown) {
        const term = view.locator('dt', { hasText: field })
        await expect(term.locator('xpath=following-sibling::dd[1]')).toHaveText(value)
      }
      await page.keyboard.press('Escape')
      await expect(view).toBeHidden()
    }
  })

  test('a reading no body produces is marked and not saved until fixed', async ({ page }) => {
    const dialog = await openTypedDialog(page, 'vitals_daily', 'Vitals with a typo')
    await dialog.getByLabel(/^Date/).fill('2026-10-07')
    const oxygen = dialog.getByLabel('Blood oxygen (%)')
    await oxygen.fill('970')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()

    await expect(dialog.getByText('Enter 100 or less')).toBeVisible()
    await expect(oxygen).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog).toBeVisible()

    await oxygen.fill('97')
    await expect(dialog.getByText('Enter 100 or less')).toBeHidden()
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(dialog).toBeHidden({ timeout: 15000 })
    await expect(page.getByRole('article').filter({ hasText: 'Vitals with a typo' })).toBeVisible()
  })
})
