import { expect, test } from '@playwright/test'

/**
 * LD-101: the trust centre must be readable by a prospective user or a security
 * reviewer with no account, since its whole purpose is letting someone assess
 * the product without talking to us.
 */
test.describe('Trust centre', () => {
  test('is reachable without signing in and states key custody', async ({ page }) => {
    await page.goto('/trust')
    await expect(page).toHaveURL('/trust')
    await expect(page.getByRole('heading', { level: 1, name: 'Trust centre' })).toBeVisible()

    // Key custody, including the server-held signing keys, is disclosed by name.
    await expect(page.getByRole('heading', { name: 'Key custody' })).toBeVisible()
    await expect(page.getByText('lib/crypto/key-derivation.ts')).toBeVisible()
    await expect(page.getByText('lib/crypto/credential-signing.ts')).toBeVisible()

    // The unencrypted metadata columns are named so nobody puts secrets in them.
    for (const column of ['label', 'category', 'tags', 'schema_type']) {
      await expect(page.getByText(column, { exact: true })).toBeVisible()
    }

    // The revocation limit is stated rather than implied.
    await expect(page.getByText(/cannot recall data that was already delivered/i)).toBeVisible()

    // A disclosure contact exists.
    await expect(page.getByRole('link', { name: /security@/ })).toBeVisible()
  })

  test('links to a threat model that names residual risk', async ({ page }) => {
    await page.goto('/trust')
    await page.getByRole('link', { name: 'Read the threat model' }).click()
    await expect(page).toHaveURL('/trust/threat-model')
    await expect(page.getByRole('heading', { level: 1, name: 'Threat model' })).toBeVisible()
    await expect(page.getByText('What is still exposed').first()).toBeVisible()
  })

  test('is linked from the public navigation', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Trust', exact: true }).first().click()
    await expect(page).toHaveURL('/trust')
  })
})
