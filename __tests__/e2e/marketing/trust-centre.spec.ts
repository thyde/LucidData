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

  // LD-205: an extension that says it will not watch you browse has to publish
  // the permission list, or the claim is unverifiable.
  test('publishes the extension permission list and what stays optional', async ({ page }) => {
    await page.goto('/trust')
    await page.getByRole('link', { name: 'Read the extension permissions' }).click()
    await expect(page).toHaveURL('/trust/extension')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Browser extension permissions' })
    ).toBeVisible()

    // The complete install set, named.
    const installSection = page.getByRole('list').first()
    await expect(installSection.getByText('downloads', { exact: true })).toBeVisible()
    await expect(installSection.getByText('storage', { exact: true })).toBeVisible()

    // The browsing permission is present as a capability, and stated as opt-in.
    const insightRow = page.getByRole('row').filter({ hasText: 'Tracker insight' }).first()
    await expect(insightRow).toContainText('webNavigation')
    await expect(insightRow).toContainText(/separate opt-in/i)

    // Revocation is described as removing the permission, not clearing a flag.
    await expect(
      page.getByText(/removes the underlying browser permission rather than/i)
    ).toBeVisible()
  })

  test('links to an assurance pack that states what we do not meet', async ({ page }) => {
    await page.goto('/trust')
    await page.getByRole('link', { name: 'Read the assurance pack' }).click()
    await expect(page).toHaveURL('/trust/assurance')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Assurance and procurement' })
    ).toBeVisible()
    // LD-107: the limits are stated, not softened or omitted.
    await expect(
      page.getByText('We do not offer EU or UK data residency', { exact: false })
    ).toBeVisible()
    await expect(
      page.getByText('No recovery drill has been performed', { exact: false })
    ).toBeVisible()
    await expect(page.getByText('72 hours from becoming aware', { exact: false })).toBeVisible()
  })

  test('is linked from the public navigation', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Trust', exact: true }).first().click()
    await expect(page).toHaveURL('/trust')
  })
})
