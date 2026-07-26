import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { getUniqueEmail, signup, TEST_USER } from '../helpers/auth'
import { createAdminClient } from '../helpers/supabase-admin'

async function publishOffer(page: Page, title: string, incentive: string): Promise<void> {
  const trigger = page.getByRole('button', { name: 'Create offer' })
  const dialog = page.getByRole('dialog', { name: 'Create an offer' })
  // The trigger only responds once React has hydrated the page.
  await expect(async () => {
    await trigger.click()
    await expect(dialog).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 30000 })
  await dialog.getByLabel('Title').fill(title)
  await dialog.getByLabel('Incentive').fill(incentive)
  await dialog.getByLabel('Target category').selectOption('interests')
  await dialog.getByRole('button', { name: 'Publish offer' }).click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
}

async function closeContext(context: BrowserContext | undefined): Promise<void> {
  await context?.close().catch(() => undefined)
}

test.describe('Marketplace offers', () => {
  test('claims, redeems, and keeps incentives after the buyer closes an offer', async ({
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
      const buyerEmail = getUniqueEmail('market-offer-buyer')
      createdUserEmails.push(buyerEmail)
      await signup(buyerPage, buyerEmail, TEST_USER.password)

      const organizationEmail = getUniqueEmail('market-offer-org')
      await buyerPage.goto('/org/register')
      await buyerPage.getByLabel('Organization name').fill('Synthetic Offer Lab')
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

      const { error: verificationError } = await service
        .from('organizations')
        .update({ verified_at: new Date().toISOString() })
        .eq('id', organizationId)
      if (verificationError) throw verificationError

      const stamp = Date.now()
      const redeemedTitle = `Synthetic redeem offer ${stamp}`
      const keptTitle = `Synthetic kept offer ${stamp}`
      await buyerPage.goto(`/org/${organizationId}/data`)
      await publishOffer(buyerPage, redeemedTitle, '15% off your next order')
      await publishOffer(buyerPage, keptTitle, 'Free synthetic tote bag')

      sellerContext = await browser.newContext({ baseURL })
      const sellerPage = await sellerContext.newPage()
      const sellerEmail = getUniqueEmail('market-offer-seller')
      createdUserEmails.push(sellerEmail)
      await signup(sellerPage, sellerEmail, TEST_USER.password)

      const redeemedRow = sellerPage.locator('li').filter({ hasText: redeemedTitle })
      await redeemedRow.getByRole('button', { name: 'Claim' }).click()
      await expect(sellerPage.getByText('Offer claimed', { exact: true })).toBeVisible({
        timeout: 15000,
      })
      const redeemedCode = (await redeemedRow.locator('code').textContent())?.trim()
      if (!redeemedCode) throw new Error('Redemption code was not shown')
      expect(redeemedCode).toMatch(/^LC-[A-Z0-9]{12}$/)

      const keptRow = sellerPage.locator('li').filter({ hasText: keptTitle })
      await keptRow.getByRole('button', { name: 'Claim' }).click()
      await expect(sellerPage.getByText('Offer claimed', { exact: true })).toBeVisible({
        timeout: 15000,
      })
      const keptCode = (await keptRow.locator('code').textContent())?.trim()
      if (!keptCode) throw new Error('Second redemption code was not shown')
      expect(keptCode).not.toBe(redeemedCode)

      // The buyer redeems the code without learning who claimed the offer.
      await buyerPage.reload()
      const redemptionInput = buyerPage.getByLabel('Redemption code')
      await redemptionInput.fill(redeemedCode)
      await buyerPage.getByRole('button', { name: 'Redeem code' }).click()
      await expect(buyerPage.getByText('Offer redeemed', { exact: true })).toBeVisible({
        timeout: 15000,
      })
      await expect(buyerPage.getByText('Give this incentive now')).toBeVisible()
      await expect(buyerPage.getByText('15% off your next order · ' + redeemedTitle)).toBeVisible()

      // A redemption code works once.
      await redemptionInput.fill(redeemedCode)
      await buyerPage.getByRole('button', { name: 'Redeem code' }).click()
      await expect(buyerPage.getByText('Could not redeem offer', { exact: true })).toBeVisible({
        timeout: 15000,
      })

      await buyerPage.reload()
      const redeemedCard = buyerPage.locator('li').filter({ hasText: redeemedTitle })
      await expect(redeemedCard.getByText('0 awaiting redemption · 1 redeemed')).toBeVisible()
      const keptCard = buyerPage.locator('li').filter({ hasText: keptTitle })
      await expect(keptCard.getByText('1 awaiting redemption · 0 redeemed')).toBeVisible()

      await keptCard.getByRole('button', { name: 'Close offer' }).click()
      const closeDialog = buyerPage.getByRole('alertdialog', { name: 'Close this offer?' })
      await closeDialog.getByRole('button', { name: 'Close offer' }).click()
      await expect(buyerPage.getByText('Offer closed', { exact: true })).toBeVisible({
        timeout: 15000,
      })

      // The seller keeps the incentive they already accepted, and a redeemed
      // offer never invites a second claim.
      await sellerPage.reload()
      const keptRowAfterClose = sellerPage.locator('li').filter({ hasText: keptTitle })
      await expect(
        keptRowAfterClose.getByText('The buyer closed this offer. The incentive you claimed still stands.')
      ).toBeVisible()
      await expect(keptRowAfterClose.getByText(keptCode)).toBeVisible()

      const redeemedRowAfterRedeem = sellerPage.locator('li').filter({ hasText: redeemedTitle })
      await expect(redeemedRowAfterRedeem.getByText('Redeemed', { exact: true })).toBeVisible()
      await expect(redeemedRowAfterRedeem.getByRole('button', { name: 'Claim' })).toHaveCount(0)

      await keptRowAfterClose
        .getByRole('button', { name: `Remove claimed offer ${keptTitle}` })
        .click()
      const removeDialog = sellerPage.getByRole('alertdialog', {
        name: 'Remove this claimed offer?',
      })
      await removeDialog.getByRole('button', { name: 'Remove offer' }).click()
      await expect(sellerPage.getByText('Claimed offer removed', { exact: true })).toBeVisible({
        timeout: 15000,
      })
      await expect(sellerPage.locator('li').filter({ hasText: keptTitle })).toHaveCount(0)

      const { data: claims, error: claimsError } = await service
        .from('offer_claims')
        .select('status, redemption_code, offer_title, redeemed_at, withdrawn_at')
        .eq('buyer_org_id', organizationId)
      if (claimsError) throw claimsError

      const redeemedClaim = claims.find((claim) => claim.offer_title === redeemedTitle)
      const keptClaim = claims.find((claim) => claim.offer_title === keptTitle)
      expect(redeemedClaim?.status).toBe('redeemed')
      expect(redeemedClaim?.redeemed_at).not.toBeNull()
      expect(keptClaim?.status).toBe('withdrawn')
      expect(keptClaim?.withdrawn_at).not.toBeNull()
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
