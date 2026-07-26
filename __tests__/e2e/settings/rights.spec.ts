import { expect, test } from '@playwright/test'
import { getUniqueEmail, signup, TEST_USER } from '../helpers/auth'
import { createAdminClient } from '../helpers/supabase-admin'

/**
 * LD-301: a right with no case, no clock, and no appeal path is a promise
 * nobody can hold us to. This walks file, refuse, and appeal end to end.
 */
test.describe('Privacy rights requests', () => {
  test('files a request, tracks its deadline, and appeals a refusal', async ({ page }) => {
    test.setTimeout(240000)
    const service = createAdminClient()
    const email = getUniqueEmail('rights')
    let userId: string | null = null

    try {
      await signup(page, email, TEST_USER.password)
      const { data: profile, error: profileError } = await service
        .from('users')
        .select('id')
        .eq('email', email)
        .single()
      if (profileError) throw profileError
      userId = profile.id

      const privacyLink = page
        .getByRole('navigation', { name: 'Primary' })
        .getByRole('link', { name: 'Privacy' })
      await Promise.all([
        page.waitForURL('/privacy', { timeout: 60000, waitUntil: 'commit' }),
        privacyLink.click(),
      ])
      await expect(page.getByRole('heading', { name: 'Your privacy rights' })).toBeVisible()
      await expect(
        page.getByText('You have not filed a request', { exact: false })
      ).toBeVisible()

      await page.getByLabel('What do you want').selectOption('access')
      await page.getByLabel('Where you live').selectOption('uk')
      await page
        .getByLabel('Anything we should know (optional)')
        .fill('Please list everyone you shared my data with')
      await page.getByRole('button', { name: 'File request' }).click()
      await expect(page.getByText('Request filed', { exact: true })).toBeVisible({
        timeout: 15000,
      })

      // The case carries a jurisdiction-derived deadline, not a made-up one.
      const { data: filed, error: filedError } = await service
        .from('rights_cases')
        .select('*')
        .eq('user_id', userId)
        .single()
      if (filedError) throw filedError
      expect(filed.type).toBe('access')
      expect(filed.jurisdiction).toBe('uk')
      expect(filed.status).toBe('received')
      const windowMs = new Date(filed.due_at).getTime() - new Date(filed.received_at).getTime()
      expect(windowMs).toBeGreaterThan(27 * 86_400_000)
      expect(windowMs).toBeLessThan(32 * 86_400_000)

      const { data: filedEvents } = await service
        .from('rights_case_events')
        .select('event')
        .eq('case_id', filed.id)
      expect(filedEvents?.map((event) => event.event)).toEqual(['received'])

      await page.reload()
      const filedCard = page.getByRole('listitem').filter({ hasText: 'United Kingdom' })
      await expect(filedCard).toHaveCount(1)
      await expect(filedCard.getByText('See what you hold about me')).toBeVisible()
      await expect(filedCard.getByText('Received', { exact: true })).toBeVisible()

      // Filing the same type twice is refused rather than silently duplicated.
      await page.getByLabel('What do you want').selectOption('access')
      await page.getByRole('button', { name: 'File request' }).click()
      await expect(
        page.getByText('Could not file the request', { exact: true })
      ).toBeVisible({ timeout: 15000 })

      // An operator refuses it, in writing. A refusal with no reason cannot be
      // appealed, so the service requires one.
      await service
        .from('rights_cases')
        .update({
          status: 'refused',
          resolution: 'refused',
          resolution_note: 'We could not verify your identity from the documents provided',
        })
        .eq('id', filed.id)

      await page.reload()
      const refusedCard = page.getByRole('listitem').filter({ hasText: 'United Kingdom' })
      await expect(refusedCard.getByText('Refused', { exact: true })).toBeVisible()
      await expect(
        refusedCard.getByText('We could not verify your identity from the documents provided')
      ).toBeVisible()

      await page.getByRole('button', { name: 'Appeal this refusal' }).click()
      await page.getByLabel('Why are you appealing').fill('I sent my passport twice already')
      await page.getByRole('button', { name: 'File appeal' }).click()
      await expect(page.getByText('Appeal filed', { exact: true })).toBeVisible({
        timeout: 15000,
      })

      const { data: appeals, error: appealError } = await service
        .from('rights_cases')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'appeal')
      if (appealError) throw appealError
      expect(appeals).toHaveLength(1)
      expect(appeals?.[0].appeal_of_case_id).toBe(filed.id)

      // The appeal is its own case with its own clock.
      const appealWindow =
        new Date(appeals![0].due_at).getTime() - new Date(appeals![0].received_at).getTime()
      expect(appealWindow).toBeGreaterThan(27 * 86_400_000)

      const { data: refusedAfter } = await service
        .from('rights_cases')
        .select('status')
        .eq('id', filed.id)
        .single()
      expect(refusedAfter?.status).toBe('appealed')

      // The evidence trail is append-only.
      const { error: tamperError } = await service
        .from('rights_case_events')
        .update({ event: 'tampered' })
        .eq('case_id', filed.id)
      expect(tamperError).not.toBeNull()
    } finally {
      if (userId) await service.auth.admin.deleteUser(userId).catch(() => undefined)
    }
  })
})
