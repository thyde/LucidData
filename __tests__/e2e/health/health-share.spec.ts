/**
 * E2E tests - LD-305 health summary sharing.
 *
 * A person shares chosen figures by link. Someone with no account opens it.
 * The server never receives the key or anything the summary says, every
 * share and revocation leaves a receipt and an audit entry, and a revoked or
 * expired link stops opening.
 */

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Request } from '@playwright/test'
import { clearSession, getUniqueEmail, signup, TEST_USER } from '../helpers/auth'
import { appleHealthDays } from '../helpers/health-export'
import { createAdminClient } from '../helpers/supabase-admin'

test.describe.configure({ mode: 'serial' })

const NOTE = 'Marker: steps since the new knee brace'
const NAME = 'Alex Example'

async function navigate(page: Page, name: string, url: string): Promise<void> {
  // A client-side navigation keeps the vault key in memory; a hard load would not.
  await Promise.all([
    page.waitForURL(url, { timeout: 30000, waitUntil: 'commit' }),
    page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name, exact: true }).click(),
  ])
}

async function importDays(page: Page, days: number): Promise<void> {
  await navigate(page, 'Vault', '/vault')
  await page.getByRole('button', { name: 'Import file' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import from a file' })
  await dialog.getByLabel('File').setInputFiles({
    name: 'export.zip',
    mimeType: 'application/zip',
    buffer: appleHealthDays(days).buffer,
  })
  await expect(dialog.getByText('Apple Health export', { exact: true })).toBeVisible({ timeout: 60000 })
  await dialog.getByRole('button', { name: /^Import [\d,]+ entries$/ }).click()
  await expect(dialog).toBeHidden({ timeout: 120000 })
}

function recordRequests(page: Page): Request[] {
  const requests: Request[] = []
  page.on('request', (request) => requests.push(request))
  return requests
}

/** Nothing a page sent carries any of these: not in the address, a header, or the body. */
async function expectNoneSent(requests: Request[], secrets: string[]): Promise<void> {
  expect(requests.length).toBeGreaterThan(0)
  for (const request of requests) {
    const headers = JSON.stringify(await request.allHeaders())
    const sent = `${request.url()} ${headers} ${request.postData() ?? ''}`
    for (const secret of secrets) {
      expect(sent.includes(secret), `${request.method()} ${request.url()} carries "${secret.slice(0, 12)}"`).toBe(false)
    }
  }
}

async function share(page: Page, figures: RegExp[], label: string, expiry = '7 days'): Promise<string> {
  await page.getByRole('button', { name: 'Share a summary' }).click()
  const dialog = page.getByRole('dialog', { name: 'Share a summary' })
  for (const figure of figures) await dialog.getByRole('checkbox', { name: figure }).click()
  await dialog.getByRole('radio', { name: expiry }).click()
  await dialog.getByLabel('Who is it for? (optional)').fill(label)
  await dialog.getByLabel('Your name on the summary (optional)').fill(NAME)
  await dialog.getByLabel('A note (optional)').fill(NOTE)
  await dialog.getByRole('button', { name: 'Create link' }).click()
  const ready = page.getByRole('dialog', { name: 'Your link is ready' })
  const link = await ready.getByTestId('share-link').inputValue()
  await expect(ready.getByRole('img', { name: 'QR code for the link' })).toBeVisible()
  await ready.getByRole('button', { name: 'Done' }).click()
  await expect(ready).toBeHidden()
  return link
}

async function expectNoBlockingViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical'
  )
  expect(
    blocking.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)
  ).toEqual([])
}

test.describe('Health summary sharing', () => {
  test('shares chosen figures by link, opens without an account, and stops when revoked or expired', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300000)
    await clearSession(page)
    await signup(page, getUniqueEmail('health-share'), TEST_USER.password, { healthConsent: true })
    await importDays(page, 21)
    await navigate(page, 'Health', '/health')
    await expect(page.getByRole('heading', { level: 2, name: 'Steps', exact: true })).toBeVisible({ timeout: 30000 })

    // Sharing sends ciphertext and terms, never the key or what the summary says.
    const ownerRequests = recordRequests(page)
    await page.getByRole('button', { name: 'Share a summary' }).click()
    await expectNoBlockingViolations(page)
    await page.getByRole('dialog', { name: 'Share a summary' }).getByRole('button', { name: 'Cancel' }).click()
    const link = await share(page, [/^Steps/, /^Resting heart rate/], 'Dr. Patel')
    const [address, key] = link.split('#')
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/)
    await expectNoneSent(ownerRequests, [key, NOTE, NAME])

    // The server holds ciphertext and terms, with a receipt and an audit entry.
    const shareId = address.split('/').pop()!
    const admin = createAdminClient()
    const { data: stored, error } = await admin
      .from('health_shares')
      .select('ciphertext, metrics, consent_id, user_id')
      .eq('id', shareId)
      .single()
    if (error) throw error
    expect(stored.metrics).toEqual(['steps', 'resting_heart_rate'])
    expect(stored.ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/)
    for (const plain of [NOTE, NAME, 'steps', 'Steps']) expect(stored.ciphertext).not.toContain(plain)
    const receiptEvents = async () =>
      ((await admin.from('consent_receipts').select('event').eq('consent_id', stored.consent_id).order('created_at')).data ?? []).map(
        (receipt) => receipt.event
      )
    expect(await receiptEvents()).toEqual(['granted'])
    const auditEvents = async () =>
      ((await admin.from('audit_logs').select('event_type').eq('consent_id', stored.consent_id)).data ?? []).map(
        (entry) => entry.event_type
      )
    expect(await auditEvents()).toEqual(expect.arrayContaining(['consent_granted', 'consent_receipt_issued']))

    // Someone without an account opens it, and their browser keeps the key to itself.
    const recipient = await browser.newContext()
    const viewer = await recipient.newPage()
    const viewerRequests = recordRequests(viewer)
    await viewer.goto(link)
    await expect(viewer.getByRole('heading', { level: 1, name: 'Health summary' })).toBeVisible({ timeout: 30000 })
    await expect(viewer.getByTestId('share-range')).toContainText(`Shared by ${NAME}.`)
    await expect(viewer.getByTestId('share-note')).toHaveText(NOTE)
    await expect(viewer.getByTestId('metric-steps')).toBeVisible()
    await expect(viewer.getByTestId('metric-resting_heart_rate')).toBeVisible()
    await expect(viewer.getByTestId('metric-sleep_hours')).toHaveCount(0)
    await expect(viewer.getByTestId('metric-weight_kg')).toHaveCount(0)
    await expectNoneSent(viewerRequests, [key])
    await expectNoBlockingViolations(viewer)
    await expect.poll(auditEvents).toContain('health_share_viewed')

    // The owner sees the view, and revokes.
    await navigate(page, 'Vault', '/vault')
    await navigate(page, 'Health', '/health')
    const item = page.getByTestId('health-share').filter({ hasText: 'Dr. Patel' })
    await expect(item).toContainText('Steps and Resting heart rate')
    await expect(item).toContainText('opened once')
    await item.getByRole('button', { name: 'Revoke the link for Dr. Patel' }).click()
    await page.getByRole('alertdialog', { name: 'Revoke this link?' }).getByRole('button', { name: 'Revoke' }).click()
    await expect(item).toContainText('Revoked on', { timeout: 30000 })
    expect(await receiptEvents()).toEqual(['granted', 'revoked'])
    expect(await auditEvents()).toContain('consent_revoked')
    const { data: revoked } = await admin.from('health_shares').select('ciphertext, revoked_at').eq('id', shareId).single()
    expect(revoked?.ciphertext).toBeNull()
    expect(revoked?.revoked_at).not.toBeNull()

    await viewer.reload()
    await expect(viewer.getByRole('heading', { name: 'This summary was revoked' })).toBeVisible({ timeout: 30000 })

    // A second link, still open, for the consents page and for expiry.
    await navigate(page, 'Health', '/health')
    const second = await share(page, [/^Steps/], 'Coach', '1 day')
    const secondId = second.split('#')[0].split('/').pop()!

    // The consents page lists both links like any grant. An open one can be
    // revoked there but not extended, because a share keeps its terms.
    await navigate(page, 'Consents', '/consent')
    await expect(page.getByRole('heading', { name: 'Dr. Patel' })).toBeVisible({ timeout: 30000 })
    await page.getByPlaceholder('Search by organization or purpose...').fill('Coach')
    await page.getByRole('button', { name: 'View Details' }).click()
    const details = page.getByRole('dialog', { name: 'Coach' })
    await expect(details.getByText(/A link to a health summary you shared/)).toBeVisible({ timeout: 30000 })
    await expect(details.getByRole('button', { name: 'Revoke Consent' })).toBeVisible()
    await expect(details.getByRole('button', { name: 'Extend Consent' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(details).toBeHidden()

    // A link past its expiry stops opening too.
    await viewer.goto(second)
    await expect(viewer.getByRole('heading', { level: 1, name: 'Health summary' })).toBeVisible({ timeout: 30000 })
    const past = Date.now()
    await admin
      .from('health_shares')
      .update({ created_at: new Date(past - 2 * 86_400_000).toISOString(), expires_at: new Date(past - 60_000).toISOString() })
      .eq('id', secondId)
      .throwOnError()
    await viewer.reload()
    await expect(viewer.getByRole('heading', { name: 'This link has expired' })).toBeVisible({ timeout: 30000 })

    // A link without its key asks for the whole link, and asks the server nothing.
    const bare = recordRequests(viewer)
    await viewer.goto(address)
    await expect(viewer.getByRole('heading', { name: 'This link is incomplete' })).toBeVisible({ timeout: 30000 })
    expect(bare.filter((request) => request.url().includes('/api/share/'))).toEqual([])

    await recipient.close()
  })
})
