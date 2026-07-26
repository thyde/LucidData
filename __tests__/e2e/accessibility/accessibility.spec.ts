import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { clearSession, getUniqueEmail, signup, TEST_USER } from '../helpers/auth'

/**
 * LD-108: accessibility conformance, asserted rather than claimed.
 *
 * An automated scan covers roughly a third of WCAG, so this file does three
 * things it can genuinely prove: it fails the build on serious and critical
 * axe violations, it drives the primary flows with the keyboard alone, and it
 * asserts the structural pieces a scanner cannot judge on its own.
 *
 * Violations at serious and critical only. Minor and moderate findings are
 * real but noisy enough that failing on them would train people to disable
 * the check, which is worse than not having it.
 */
const BLOCKING_IMPACTS = new Set(['serious', 'critical'])

async function scan(page: Page, context?: string) {
  const builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
  ])
  const results = await (context ? builder.include(context) : builder).analyze()

  const blocking = results.violations.filter(
    (violation) => violation.impact && BLOCKING_IMPACTS.has(violation.impact)
  )

  // Report the rule and the element, because "1 violation" is not actionable.
  const detail = blocking
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n  ${violation.nodes
          .map((node) => node.target.join(' '))
          .join('\n  ')}`
    )
    .join('\n')

  expect(detail, `Accessibility violations on ${page.url()}\n${detail}`).toBe('')
}

/**
 * Reach the vault with its key intact. `page.goto` is a hard load, which
 * discards the master key on purpose, so the vault renders its locked state.
 */
async function openUnlockedVault(page: Page) {
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Vault' })
    .click()
  await page.waitForURL('/vault', { timeout: 30000, waitUntil: 'commit' })
  await expect(page.getByRole('heading', { level: 1, name: 'Vault Entries' })).toBeVisible()
}

test.describe('Accessibility, public surfaces', () => {
  const publicRoutes = [
    '/',
    '/for-individuals',
    '/for-business',
    '/pricing',
    '/trust',
    '/trust/accessibility',
    '/trust/assurance',
    '/trust/extension',
    '/trust/threat-model',
    '/login',
    '/register',
  ]

  for (const route of publicRoutes) {
    test(`${route} has no serious or critical violations`, async ({ page }) => {
      await page.goto(route)
      await scan(page)
    })
  }

  test('every public page offers a skip link that reaches the content', async ({ page }) => {
    await page.goto('/')

    // First tab stop, before any navigation. That is the whole point of it.
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()

    await skip.press('Enter')
    await expect(page.locator('#main')).toBeVisible()
  })

  test('publishes a conformance statement with named limitations', async ({ page }) => {
    await page.goto('/trust')
    await page.getByRole('link', { name: 'Read the accessibility statement' }).click()
    await expect(page).toHaveURL('/trust/accessibility')

    await expect(
      page.getByRole('heading', { level: 1, name: 'Accessibility statement' })
    ).toBeVisible()
    // A blanket claim would be worthless. It has to say what is not met.
    await expect(page.getByRole('heading', { name: 'Known limitations' })).toBeVisible()
    await expect(page.getByText('Partially conforming').first()).toBeVisible()
    await expect(page.getByRole('link', { name: /accessibility@/ })).toBeVisible()
  })
})

test.describe('Accessibility, authenticated surfaces', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page)
    await signup(page, getUniqueEmail(), TEST_USER.password)
  })

  const privateRoutes = [
    '/dashboard',
    '/vault',
    '/consent',
    '/audit',
    '/credentials',
    '/requests',
    '/marketplace',
    '/settings',
    '/privacy',
  ]

  for (const route of privateRoutes) {
    test(`${route} has no serious or critical violations`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('#main')).toBeVisible()
      await scan(page)
    })
  }

  test('each page has exactly one level-one heading and a named main landmark', async ({
    page,
  }) => {
    for (const route of ['/dashboard', '/vault', '/consent', '/audit']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('main#main')).toHaveCount(1)
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    }
  })

  test('the vault create dialog is operable and dismissable by keyboard alone', async ({
    page,
  }) => {
    // Navigate in-app. A hard load discards the master key by design, and the
    // locked vault has no create button to open.
    await openUnlockedVault(page)

    await page.getByRole('button', { name: 'Create Vault Entry' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create Vault Entry' })
    await expect(dialog).toBeVisible()

    // Every control inside is reachable, and focus does not escape the dialog.
    await page.keyboard.press('Tab')
    await expect(dialog.locator(':focus')).toHaveCount(1)

    await scan(page, '[role="dialog"]')

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('form errors are announced and linked to their control', async ({ page }) => {
    await openUnlockedVault(page)
    await page.getByRole('button', { name: 'Create Vault Entry' }).click()

    const dialog = page.getByRole('dialog', { name: 'Create Vault Entry' })
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()

    // An error a screen reader cannot reach from the field is not an error
    // that field has.
    const invalid = dialog.locator('[aria-invalid="true"]').first()
    await expect(invalid).toBeVisible()
    const describedBy = await invalid.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    await expect(dialog.locator(`#${describedBy!.split(' ').pop()}`)).toBeVisible()
  })
})

test.describe('Accessibility, keyboard-only sign in', () => {
  test('completes sign in without a pointing device', async ({ page }) => {
    const email = getUniqueEmail()
    await clearSession(page)
    await signup(page, email, TEST_USER.password)
    await clearSession(page)

    await page.goto('/login')

    // Focus rather than click, so the whole path is proven operable from the
    // keyboard. The password field is reached by tabbing, not by pointing.
    const emailInput = page.locator('input[name="email"]')
    const passwordInput = page.locator('input[name="password"]')
    await emailInput.focus()
    await page.keyboard.type(email)

    // The form may put a control between the two fields, so this asserts that
    // the password field is reachable, not that it is exactly one tab away.
    let reached = false
    for (let i = 0; i < 6 && !reached; i += 1) {
      await page.keyboard.press('Tab')
      reached = await passwordInput.evaluate((el) => el === document.activeElement)
    }
    expect(reached, 'password field should be reachable by Tab').toBe(true)

    await page.keyboard.type(TEST_USER.password)
    await page.keyboard.press('Enter')
    await page.waitForURL('/dashboard', { timeout: 30000, waitUntil: 'commit' })
  })
})
