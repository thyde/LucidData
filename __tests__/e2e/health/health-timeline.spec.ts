/**
 * E2E tests - LD-214 the health timeline.
 *
 * Each run builds an Apple Health export with a year of days ending
 * yesterday, so the charts always have the last 30 days to show and the
 * fixture never goes stale.
 */

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Request } from '@playwright/test'
import { clearSession, getUniqueEmail, signup, TEST_USER } from '../helpers/auth'
import { appleHealthYear } from '../helpers/health-export'
import { createAdminClient } from '../helpers/supabase-admin'

test.describe.configure({ mode: 'serial' })

const CHARTED = ['Steps', 'Active energy', 'Workouts', 'Sleep', 'Resting heart rate', 'Weight']

async function navigate(page: Page, name: string, url: string): Promise<void> {
  // A client-side navigation keeps the vault key in memory; a hard load would not.
  await Promise.all([
    page.waitForURL(url, { timeout: 30000, waitUntil: 'commit' }),
    page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name, exact: true }).click(),
  ])
}

async function importYear(page: Page): Promise<number> {
  await navigate(page, 'Vault', '/vault')
  await expect(page.getByRole('heading', { level: 1, name: 'Vault Entries' })).toBeVisible()
  await page.getByRole('button', { name: 'Import file' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import from a file' })
  await dialog.getByLabel('File').setInputFiles({
    name: 'export.zip',
    mimeType: 'application/zip',
    buffer: appleHealthYear().buffer,
  })
  await expect(dialog.getByText('Apple Health export', { exact: true })).toBeVisible({ timeout: 60000 })
  // Counts are written with a thousands separator, such as 1,331.
  const start = dialog.getByRole('button', { name: /^Import [\d,]+ entries$/ })
  const label = (await start.textContent()) ?? ''
  const count = Number(label.replace(/[^\d]/g, ''))
  await start.click()
  await expect(dialog).toBeHidden({ timeout: 240000 })
  await expect(page.getByText(`Saved ${label.replace(/^Import /, '')}.`, { exact: true })).toBeVisible()
  return count
}

async function timelineVisitsToday(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await createAdminClient()
    .from('daily_counters')
    .select('count')
    .eq('counter', 'timeline_visit')
    .eq('day', today)
    .maybeSingle()
  if (error) throw error
  return data?.count ?? 0
}

/** Every request the page makes from now on. */
function recordRequests(page: Page): Request[] {
  const requests: Request[] = []
  page.on('request', (request) => requests.push(request))
  return requests
}

/**
 * Nothing worked out from health entries may leave the browser. A request
 * with a body is a server action, and the two the timeline makes, for the
 * entries and for the visit, take no arguments, so the body is `[]`. A page
 * load carries no query beyond the router's own.
 */
function expectNothingSent(requests: Request[]): void {
  expect(requests.length).toBeGreaterThan(0)
  for (const request of requests) {
    if (request.method() === 'GET') {
      const params = [...new URL(request.url()).searchParams.keys()].filter((key) => key !== '_rsc')
      expect(params, `${request.url()} carries parameters`).toEqual([])
    } else {
      expect(request.postData() ?? '', `${request.method()} ${request.url()} carries a body`).toMatch(/^(\[\])?$/)
    }
  }
}

async function chartsShown(page: Page): Promise<void> {
  for (const name of CHARTED) {
    await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible({ timeout: 30000 })
  }
}

async function signIn(page: Page, email: string, path: string): Promise<void> {
  await page.goto(path)
  const emailInput = page.locator('input[name="email"]')
  await emailInput.click()
  await emailInput.pressSequentially(email, { delay: 20 })
  const passwordInput = page.locator('input[name="password"]')
  await passwordInput.click()
  await passwordInput.pressSequentially(TEST_USER.password, { delay: 20 })
  await page.locator('button[type="submit"]').click()
}

test.describe('Health timeline', () => {
  test('charts a year of records with their sources, counts the visit, and sends nothing it works out', async ({ page }) => {
    test.setTimeout(420000)
    await clearSession(page)
    await signup(page, getUniqueEmail('health-timeline'), TEST_USER.password, { healthConsent: true })

    // An empty vault is pointed at the importer, from the dashboard and the timeline.
    const summary = page.getByTestId('health-summary')
    await expect(summary.getByRole('link', { name: 'Import an export' })).toBeVisible({ timeout: 30000 })
    // Opening the timeline counts, even with nothing on it yet.
    const visitsBefore = await timelineVisitsToday()
    await navigate(page, 'Health', '/health')
    await expect(page.getByRole('heading', { name: 'No health records yet' })).toBeVisible({ timeout: 30000 })
    await expect.poll(timelineVisitsToday).toBe(visitsBefore + 1)

    await importYear(page)

    const requests = recordRequests(page)
    await navigate(page, 'Health', '/health')
    await expect(page.getByRole('heading', { level: 1, name: 'Health' })).toBeVisible()
    await chartsShown(page)
    await expect(page.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')

    // Each value says where it came from.
    const steps = page.getByTestId('metric-steps')
    await expect(steps).toContainText('from Apple Health')
    await steps.getByText('Show the numbers').click()
    const rows = steps.getByRole('table').getByRole('row')
    await expect(rows.nth(1)).toContainText('Apple Health')
    expect(await rows.count()).toBeGreaterThanOrEqual(29)

    // A year is drawn day by day.
    await page.getByRole('button', { name: '1 year' }).click()
    await expect(page.getByRole('button', { name: '1 year' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => steps.locator('.recharts-bar-rectangle').count()).toBeGreaterThanOrEqual(360)
    expect(await rows.count()).toBeGreaterThanOrEqual(361)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical'
    )
    expect(
      blocking.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)
    ).toEqual([])

    expectNothingSent(requests)
    // The first visit today was counted already, and nothing else was.
    expect(await timelineVisitsToday()).toBe(visitsBefore + 1)

    // The dashboard leads with the same figures.
    await navigate(page, 'Dashboard', '/dashboard')
    await expect(summary.getByRole('term').first()).toHaveText('Steps', { timeout: 30000 })
    await expect(summary).toContainText('from Apple Health')

    await navigate(page, 'Health', '/health')
    await chartsShown(page)
    await page.waitForTimeout(1000)
    expect(await timelineVisitsToday()).toBe(visitsBefore + 1)

    // A hard load starts locked, with nothing worked out on screen.
    await page.goto('/health')
    await expect(page.getByRole('heading', { level: 1, name: 'Your vault is locked' })).toBeVisible()
    await expect(page.getByTestId('metric-steps')).toHaveCount(0)
  })

  test('draws a year of records within two seconds of their arrival', async ({ page }) => {
    test.setTimeout(420000)
    const email = getUniqueEmail('health-timeline-speed')
    await clearSession(page)
    await signup(page, email, TEST_USER.password, { healthConsent: true })
    const imported = await importYear(page)
    expect(imported).toBeGreaterThan(1200)

    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.waitForURL(/\/login/, { timeout: 30000, waitUntil: 'commit' })

    await signIn(page, email, '/login?redirectedFrom=%2Fhealth')
    await page.waitForURL('/health', { timeout: 60000, waitUntil: 'commit' })
    const opened = Date.now()
    await chartsShown(page)
    const shown = Date.now()

    // LD-214 measures the work after the encrypted entries arrive, which all
    // happens on this device: decrypting each one, working out the timeline,
    // and drawing it. The browser's own timing says when the download ended.
    const timing = await page.evaluate(() => {
      const downloads = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
        .filter((entry) => entry.initiatorType === 'fetch')
        .sort((a, b) => b.decodedBodySize - a.decodedBodySize)
      return { arrived: downloads[0]?.responseEnd ?? 0, size: downloads[0]?.decodedBodySize ?? 0, now: performance.now() }
    })
    expect(timing.size).toBeGreaterThan(200_000)
    const afterDownload = Math.round(timing.now - timing.arrived)

    const switched = Date.now()
    await page.getByRole('button', { name: '1 year' }).click()
    await expect
      .poll(() => page.getByTestId('metric-steps').locator('.recharts-bar-rectangle').count(), { intervals: [50] })
      .toBeGreaterThanOrEqual(360)
    const redrawn = Date.now() - switched

    console.log(
      `Timeline: ${imported} entries, ${timing.size} bytes; route open to charts ${shown - opened} ms, ${afterDownload} ms of it after the download; a year redrawn in ${redrawn} ms`
    )
    expect(afterDownload).toBeLessThan(2000)
    expect(redrawn).toBeLessThan(2000)
  })
})
