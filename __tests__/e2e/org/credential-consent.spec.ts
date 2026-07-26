import { readFile } from 'node:fs/promises'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { getUniqueEmail, signup, TEST_USER } from '../helpers/auth'
import { createAdminClient } from '../helpers/supabase-admin'

async function goToOrgRegistration(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Organizations' }).click()
  await page.waitForURL('/org', { timeout: 20000, waitUntil: 'commit' })
  await page.getByRole('link', { name: 'New organization', exact: true }).click()
  await page.waitForURL('/org/register', { timeout: 20000, waitUntil: 'commit' })
}

async function waitForMail(recipient: string, subject: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const response = await fetch('http://127.0.0.1:54324/api/v1/messages')
        if (!response.ok) return false
        const body = (await response.json()) as {
          messages?: { To?: { Address?: string }[]; Subject?: string }[]
        }
        return (body.messages ?? []).some(
          (message) =>
            message.Subject === subject &&
            (message.To ?? []).some((to) => to.Address === recipient)
        )
      },
      { timeout: 15000 }
    )
    .toBe(true)
}

async function closeContext(context: BrowserContext | undefined): Promise<void> {
  await context?.close().catch(() => undefined)
}

test.describe('Organization credentials and consent', () => {
  test('issues, selectively shares, verifies, requests, and revokes', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(360000)
    const service = createAdminClient()
    const createdUserIds: string[] = []
    let organizationId: string | null = null
    let holderContext: BrowserContext | undefined
    let issuerContext: BrowserContext | undefined
    let publicContext: BrowserContext | undefined

    try {
      holderContext = await browser.newContext({ baseURL })
      const holderPage = await holderContext.newPage()
      const holderEmail = getUniqueEmail('credential-holder')
      await signup(holderPage, holderEmail, TEST_USER.password)
      const { data: holderProfile, error: holderError } = await service
        .from('users')
        .select('id')
        .eq('email', holderEmail)
        .single()
      if (holderError) throw holderError
      createdUserIds.push(holderProfile.id)

      issuerContext = await browser.newContext({ baseURL })
      const issuerPage = await issuerContext.newPage()
      const issuerEmail = getUniqueEmail('credential-issuer')
      await signup(issuerPage, issuerEmail, TEST_USER.password)
      const { data: issuerProfile, error: issuerError } = await service
        .from('users')
        .select('id')
        .eq('email', issuerEmail)
        .single()
      if (issuerError) throw issuerError
      createdUserIds.push(issuerProfile.id)

      await goToOrgRegistration(issuerPage)
      const organizationEmail = getUniqueEmail('credential-org')
      await issuerPage.getByLabel('Organization name').fill('Synthetic Credential Lab')
      await issuerPage.getByLabel('Contact email').fill(organizationEmail)
      await issuerPage.getByLabel('Organization type').selectOption('both')
      await issuerPage.getByRole('button', { name: 'Register organization' }).click()
      await expect(
        issuerPage.getByRole('heading', { name: 'Organization created' })
      ).toBeVisible({ timeout: 15000 })

      const { data: organization, error: organizationError } = await service
        .from('organizations')
        .select('id')
        .eq('email', organizationEmail)
        .single()
      if (organizationError) throw organizationError
      organizationId = organization.id

      // Registration now lands directly on the organization it created.
      await issuerPage.getByRole('link', { name: 'Go to organization portal' }).click()
      await issuerPage.getByLabel('Issuing domain').fill('synthetic-credential.invalid')
      await issuerPage.getByRole('button', { name: 'Start', exact: true }).click()
      await expect(issuerPage.getByText('Add this DNS TXT record')).toBeVisible()
      await issuerPage.getByRole('button', { name: 'Check verification' }).click()
      await expect(issuerPage.getByText('Not verified yet', { exact: true })).toBeVisible({
        timeout: 15000,
      })

      const { error: verifyFixtureError } = await service
        .from('organizations')
        .update({ verified_at: new Date().toISOString() })
        .eq('id', organizationId)
      if (verifyFixtureError) throw verifyFixtureError
      await issuerPage.reload()

      // LD-109: no API key exists until the domain is verified, so the first key
      // is created here rather than handed out at registration.
      await issuerPage.getByRole('button', { name: 'Rotate key' }).click()
      const firstKeyDialog = issuerPage.getByRole('alertdialog', {
        name: 'Rotate this API key?',
      })
      await firstKeyDialog.getByRole('button', { name: 'Rotate key' }).click()
      await expect(issuerPage.getByText('API key rotated', { exact: true })).toBeVisible({
        timeout: 15000,
      })
      const apiKey = (
        await issuerPage.locator('code').filter({ hasText: 'lk_live_' }).textContent()
      )?.trim()
      if (!apiKey) throw new Error('Organization API key was not displayed')

      await issuerPage.getByRole('button', { name: 'Create signing key' }).click()
      await expect(issuerPage.getByText('Signing key ready', { exact: true })).toBeVisible({
        timeout: 15000,
      })

      const credentialLabel = `Synthetic degree ${Date.now()}`
      await issuerPage.getByLabel('Credential type').selectOption('education')
      await issuerPage.getByLabel('Subject email').fill(holderEmail)
      await issuerPage.getByLabel('Label').fill(credentialLabel)
      await issuerPage.getByLabel('Institution').fill('Synthetic University')
      await issuerPage.getByLabel('Degree').selectOption('bachelor')
      await issuerPage.getByLabel('Field of study').fill('Accessible systems')
      await issuerPage.getByLabel('Graduation year').fill('2026')
      await issuerPage.getByLabel('GPA (optional)').fill('3.9')
      await issuerPage.getByLabel('Honors / Awards').fill('Synthetic honors')
      await issuerPage.getByRole('button', { name: 'Issue credential' }).click()
      await expect(issuerPage.getByText('Credential issued', { exact: true })).toBeVisible({
        timeout: 20000,
      })
      await waitForMail(holderEmail, 'New credential received')

      await Promise.all([
        holderPage.waitForURL('/credentials', { timeout: 20000, waitUntil: 'commit' }),
        holderPage
          .getByRole('navigation', { name: 'Primary' })
          .getByRole('link', { name: 'Credentials' })
          .click(),
      ])
      const claimRow = holderPage.locator('li').filter({ hasText: credentialLabel })
      await claimRow.getByRole('button', { name: 'Claim' }).click()
      await expect(holderPage.getByText('Credential claimed', { exact: true })).toBeVisible({
        timeout: 20000,
      })
      const ownedRow = holderPage.locator('li').filter({ hasText: credentialLabel })
      await expect(ownedRow.getByText('Verified', { exact: true })).toBeVisible()

      const vcDownloadPromise = holderPage.waitForEvent('download')
      await ownedRow.getByRole('button', { name: 'Export' }).click()
      const vcDownload = await vcDownloadPromise
      const vcPath = await vcDownload.path()
      if (!vcPath) throw new Error('Credential export path was not available')
      const vc = JSON.parse(await readFile(vcPath, 'utf8')) as {
        credentialSubject: Record<string, unknown>
        proof: { type: string; proofValue: string }
      }
      expect(vc.credentialSubject).toMatchObject({
        email: holderEmail,
        institution: 'Synthetic University',
      })
      expect(vc.proof.type).toBe('Ed25519Signature2020')
      expect(vc.proof.proofValue).toBeTruthy()

      await ownedRow.getByRole('button', { name: 'Share' }).click()
      const shareDialog = holderPage.getByRole('dialog', { name: 'Share credential' })
      await shareDialog.getByLabel('GPA (optional)').uncheck()
      await shareDialog.getByLabel('Honors / Awards').uncheck()
      await shareDialog.getByRole('button', { name: 'Create share link' }).click()
      const shareUrl = (await shareDialog.locator('code').textContent())?.trim()
      if (!shareUrl) throw new Error('Credential share URL was not created')
      await shareDialog.getByRole('button', { name: 'Done' }).click()
      await expect(shareDialog).toBeHidden()

      publicContext = await browser.newContext({ baseURL })
      const publicPage = await publicContext.newPage()
      await publicPage.goto(shareUrl)
      await expect(publicPage.getByText('Verified credential')).toBeVisible()
      await expect(publicPage.getByText('Synthetic University')).toBeVisible()
      await expect(publicPage.getByText('Accessible systems')).toBeVisible()
      await expect(publicPage.getByText('3.9', { exact: true })).toHaveCount(0)
      await expect(publicPage.getByText('Synthetic honors')).toHaveCount(0)

      const requestPanel = issuerPage
        .locator('section')
        .filter({
          has: issuerPage.getByRole('heading', { name: 'Request credentials', exact: true }),
        })
        .first()
      await requestPanel.getByLabel('Candidate email').fill(holderEmail)
      await requestPanel
        .getByLabel('Purpose')
        .fill('Verify education before synthetic model evaluation')
      const educationRequest = requestPanel.getByLabel('Education Record', { exact: true })
      await educationRequest.check()
      await expect(requestPanel.getByLabel('Candidate email')).toHaveValue(holderEmail)
      await expect(requestPanel.getByLabel('Purpose')).toHaveValue(
        'Verify education before synthetic model evaluation'
      )
      await expect(educationRequest).toBeChecked()
      await requestPanel.getByRole('button', { name: 'Send request' }).click()
      await expect(issuerPage.getByText('Request sent', { exact: true })).toBeVisible({
        timeout: 15000,
      })

      await holderPage.goto('/requests', { waitUntil: 'domcontentloaded' })
      const credentialRequest = holderPage
        .locator('div.rounded-lg')
        .filter({ hasText: 'Verify education before synthetic model evaluation' })
      await credentialRequest.getByRole('button', { name: 'Review & share' }).click()
      const fulfillDialog = holderPage.getByRole('dialog', { name: 'Share credentials' })
      await fulfillDialog
        .getByLabel(`Share GPA (optional) from ${credentialLabel}`)
        .uncheck()
      await fulfillDialog
        .getByLabel(`Share Honors / Awards from ${credentialLabel}`)
        .uncheck()
      await fulfillDialog.getByRole('button', { name: 'Share selected' }).click()
      await expect(fulfillDialog).toBeHidden({ timeout: 15000 })

      await issuerPage.reload()
      const sentRequest = issuerPage.locator('li').filter({ hasText: holderEmail })
      await expect(sentRequest.getByText('fulfilled', { exact: true })).toBeVisible()
      await sentRequest.getByRole('button', { name: 'View' }).click()
      await expect(sentRequest.getByText('Synthetic University')).toBeVisible()
      await expect(sentRequest.getByText('3.9', { exact: true })).toHaveCount(0)

      const consentResponse = await issuerPage.request.post(
        `${baseURL}/api/org/consent-request`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          data: {
            user_email: holderEmail,
            purpose: 'Verify credential-category records for onboarding',
            access_level: 'verify',
            data_category: 'credentials',
            expires_in_days: 30,
          },
        }
      )
      expect(consentResponse.status()).toBe(202)
      await waitForMail(holderEmail, 'New data access request')

      await holderPage.reload()
      const accessRequest = holderPage
        .locator('div.rounded-lg')
        .filter({ hasText: 'Verify credential-category records for onboarding' })
      await accessRequest.getByRole('button', { name: 'Review & Respond' }).click()
      const consentDialog = holderPage.getByRole('dialog', {
        name: 'Respond to access request',
      })
      await consentDialog.getByRole('button', { name: 'Approve' }).click()
      await expect(consentDialog).toBeHidden({ timeout: 15000 })

      const credentialsVerification = await issuerPage.request.get(
        `${baseURL}/api/org/verify-consent?user_email=${encodeURIComponent(holderEmail)}&category=credentials`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      )
      expect(credentialsVerification.ok()).toBe(true)
      expect((await credentialsVerification.json()).has_consent).toBe(true)

      const healthVerification = await issuerPage.request.get(
        `${baseURL}/api/org/verify-consent?user_email=${encodeURIComponent(holderEmail)}&category=health`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      )
      expect(healthVerification.ok()).toBe(true)
      expect((await healthVerification.json()).has_consent).toBe(false)

      const sentConsentRequests = await issuerPage.request.get(
        `${baseURL}/api/org/consent-requests`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      )
      expect(sentConsentRequests.ok()).toBe(true)
      const sentBody = (await sentConsentRequests.json()) as {
        data: { status: string; data_category: string }[]
      }
      expect(sentBody.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: 'approved', data_category: 'credentials' }),
        ])
      )

      await issuerPage.getByRole('button', { name: 'Rotate key' }).click()
      const rotateDialog = issuerPage.getByRole('alertdialog', { name: 'Rotate this API key?' })
      await rotateDialog.getByRole('button', { name: 'Rotate key' }).click()
      await expect(issuerPage.getByText('API key rotated', { exact: true })).toBeVisible()
      const rotatedApiKey = (await issuerPage.locator('code').filter({ hasText: 'lk_live_' }).textContent())?.trim()
      if (!rotatedApiKey) throw new Error('Rotated API key was not displayed')

      const oldKeyResponse = await issuerPage.request.get(
        `${baseURL}/api/org/consent-requests`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      )
      expect(oldKeyResponse.status()).toBe(401)
      const rotatedKeyResponse = await issuerPage.request.get(
        `${baseURL}/api/org/consent-requests`,
        { headers: { Authorization: `Bearer ${rotatedApiKey}` } }
      )
      expect(rotatedKeyResponse.ok()).toBe(true)

      const apiAccessPanel = issuerPage
        .locator('div.rounded-lg')
        .filter({ hasText: 'API access' })
      await apiAccessPanel.getByRole('button', { name: 'Revoke' }).click()
      const revokeKeyDialog = issuerPage.getByRole('alertdialog', {
        name: 'Revoke this API key?',
      })
      await revokeKeyDialog.getByRole('button', { name: 'Revoke key' }).click()
      await expect(issuerPage.getByText('API key revoked', { exact: true })).toBeVisible()
      const revokedKeyResponse = await issuerPage.request.get(
        `${baseURL}/api/org/consent-requests`,
        { headers: { Authorization: `Bearer ${rotatedApiKey}` } }
      )
      expect(revokedKeyResponse.status()).toBe(401)

      issuerPage.once('dialog', (dialog) => dialog.accept())
      await issuerPage
        .locator('li')
        .filter({ hasText: credentialLabel })
        .getByRole('button', { name: 'Revoke' })
        .click()
      await expect(issuerPage.getByText('Credential revoked', { exact: true })).toBeVisible({
        timeout: 15000,
      })
      await publicPage.reload()
      await expect(publicPage.getByText('Could not verify')).toBeVisible()
      await expect(publicPage.getByText('Credential is revoked')).toBeVisible()
    } finally {
      await closeContext(publicContext)
      await closeContext(holderContext)
      await closeContext(issuerContext)
      if (organizationId) {
        await service.from('organizations').delete().eq('id', organizationId)
      }
      for (const userId of createdUserIds.reverse()) {
        await service.auth.admin.deleteUser(userId).catch(() => undefined)
      }
    }
  })
})