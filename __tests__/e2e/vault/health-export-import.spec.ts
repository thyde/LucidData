/**
 * E2E tests - LD-210 importing a health export as it comes off the phone.
 *
 * The fixture is a real-shaped Apple Health export.zip: the export.xml inside
 * apple_health_export/, with its clinical document and a workout route beside
 * it, which the import ignores.
 */

import path from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { clearSession, getUniqueEmail, signup, TEST_USER } from '../helpers/auth'

const FIXTURES = path.join(process.cwd(), 'packages/core/src/vault/__tests__/fixtures')
const APPLE_EXPORT = path.join(FIXTURES, 'apple-health/apple-health-export.zip')
const STRAVA_EXPORT = path.join(FIXTURES, 'strava/strava-export.zip')
const GARMIN_EXPORT = path.join(FIXTURES, 'garmin/garmin-export.zip')

const EXPECTED_TYPES: [string, number][] = [
  ['Daily activity', 3],
  ['Daily vitals', 3],
  ['Body measurement', 2],
  ['Daily nutrition', 1],
  ['Sleep session', 1],
  ['Workout', 1],
]

async function openVault(page: Page): Promise<void> {
  // A client-side navigation keeps the vault key in memory; a hard load would not.
  await Promise.all([
    page.waitForURL('/vault', { timeout: 20000, waitUntil: 'commit' }),
    page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Vault' }).click(),
  ])
  await expect(page.getByRole('heading', { level: 1, name: 'Vault Entries' })).toBeVisible()
}

async function chooseFile(page: Page, file: string): Promise<Locator> {
  await page.getByRole('button', { name: 'Import file' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import from a file' })
  await dialog.getByLabel('File').setInputFiles(file)
  return dialog
}

test.describe('Health export import', () => {
  test('imports export.zip as it is, and a second run adds nothing', async ({ page }) => {
    await clearSession(page)
    await signup(page, getUniqueEmail('health-import'), TEST_USER.password, { healthConsent: true })
    await openVault(page)

    const dialog = await chooseFile(page, APPLE_EXPORT)
    await expect(dialog.getByText('Apple Health export', { exact: true })).toBeVisible({ timeout: 30000 })
    for (const [type, count] of EXPECTED_TYPES) {
      await expect(dialog.getByLabel(`${type} (${count})`)).toBeChecked()
    }
    await dialog.getByRole('button', { name: 'Import 11 entries' }).click()
    await expect(dialog).toBeHidden({ timeout: 60000 })
    await expect(page.getByText('Saved 11 entries.', { exact: true })).toBeVisible()

    // Each entry is labelled by its type, and read back from its own ciphertext.
    const cards = page.getByRole('article')
    await expect(cards).toHaveCount(11)
    for (const [type, count] of EXPECTED_TYPES) {
      await expect(cards.filter({ has: page.getByRole('heading', { name: type, exact: true }) })).toHaveCount(count)
    }
    await cards.filter({ has: page.getByRole('heading', { name: 'Workout', exact: true }) }).click()
    const details = page.getByRole('dialog', { name: 'Workout' })
    await expect(details).toContainText('Run workout')
    await expect(details).toContainText('Imported from Apple Health')
    await page.keyboard.press('Escape')
    await expect(details).toBeHidden()

    // The same export again: every record is already there.
    const again = await chooseFile(page, APPLE_EXPORT)
    await again.getByRole('button', { name: 'Import 11 entries' }).click()
    await expect(again).toBeHidden({ timeout: 60000 })
    await expect(page.getByText('Everything in this export was already in your vault.', { exact: true })).toBeVisible()
    await expect(cards).toHaveCount(11)
  })

  test('imports only the chosen types, and asks for health consent first', async ({ page }) => {
    await clearSession(page)
    await signup(page, getUniqueEmail('health-import-consent'), TEST_USER.password)
    await openVault(page)

    const dialog = await chooseFile(page, APPLE_EXPORT)
    await expect(dialog.getByText('Apple Health export', { exact: true })).toBeVisible({ timeout: 30000 })
    for (const [type, count] of EXPECTED_TYPES) {
      if (type !== 'Workout') await dialog.getByLabel(`${type} (${count})`).uncheck()
    }
    await dialog.getByRole('button', { name: 'Import 1 entry' }).click()

    const consent = page.getByRole('dialog', { name: 'Consent to store health data' })
    await expect(consent).toBeVisible({ timeout: 15000 })
    await consent.getByRole('button', { name: 'I consent' }).click()

    await expect(dialog).toBeHidden({ timeout: 60000 })
    await expect(page.getByText('Saved 1 entry.', { exact: true })).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'Workout', exact: true })).toBeVisible()
  })

  test('imports Strava and Garmin archives, each under its own name', async ({ page }) => {
    await clearSession(page)
    await signup(page, getUniqueEmail('health-import-others'), TEST_USER.password, { healthConsent: true })
    await openVault(page)

    const strava = await chooseFile(page, STRAVA_EXPORT)
    await expect(strava.getByText('Strava export', { exact: true })).toBeVisible({ timeout: 30000 })
    await expect(strava.getByLabel('Workout (4)')).toBeChecked()
    await strava.getByRole('button', { name: 'Import 4 entries' }).click()
    await expect(strava).toBeHidden({ timeout: 60000 })
    await expect(page.getByText('Saved 4 entries.', { exact: true })).toBeVisible()

    const garmin = await chooseFile(page, GARMIN_EXPORT)
    await expect(garmin.getByText('Garmin export', { exact: true })).toBeVisible({ timeout: 30000 })
    // The export was made before its last day ended, so that day waits for a later export.
    await expect(garmin.getByText(/is left out because the export was made before the day ended/)).toBeVisible()
    for (const [type, count] of [['Workout', 3], ['Daily activity', 2], ['Daily vitals', 2], ['Sleep session', 2]] as const) {
      await expect(garmin.getByLabel(`${type} (${count})`)).toBeChecked()
    }
    await garmin.getByRole('button', { name: 'Import 9 entries' }).click()
    await expect(garmin).toBeHidden({ timeout: 60000 })
    await expect(page.getByText('Saved 9 entries.', { exact: true })).toBeVisible()

    const cards = page.getByRole('article')
    await expect(cards).toHaveCount(13)
    await cards.filter({ hasText: 'Riverside loop' }).click()
    const details = page.getByRole('dialog', { name: 'Workout' })
    await expect(details).toContainText('Imported from Strava')
    await expect(details).toContainText('Riverside loop')
  })

  test('says why an archive cannot be read', async ({ page }) => {
    await clearSession(page)
    await signup(page, getUniqueEmail('health-import-refused'), TEST_USER.password)
    await openVault(page)

    // A path that climbs out of the archive is refused before anything is read.
    const dialog = await chooseFile(page, path.join(FIXTURES, 'zip/traversal.zip'))
    await expect(dialog.getByText(/points outside it, so it was not opened/)).toBeVisible()

    // An archive with no health export in it is not guessed at.
    await dialog.getByLabel('File').setInputFiles(path.join(FIXTURES, 'zip/unicode-name.zip'))
    await expect(dialog.getByText('LucidData cannot read this archive yet. Unzip it and choose the file inside.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: /^Import/ })).toBeDisabled()
  })
})
