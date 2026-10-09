/**
 * E2E tests - LD-112: a passkey that opens the vault at sign-in, after a
 * reload, and at a password reset, using a Chromium virtual authenticator
 * with the PRF extension.
 */

import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getUniqueEmail, signup, TEST_USER } from '../helpers/auth'
import { createAdminClient } from '../helpers/supabase-admin'

const ENTRY_LABEL = 'Reading list'
const DEVICE = 'Test laptop'

/** A platform authenticator that verifies the user and answers every prompt, with PRF unless told otherwise. */
async function addAuthenticator(page: Page, { prf = true }: { prf?: boolean } = {}): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      ctap2Version: 'ctap2_1',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: prf,
      automaticPresenceSimulation: true,
    },
  })
}

/** The vault, by a soft navigation, so the key in memory survives the move. */
async function goToVault(page: Page): Promise<void> {
  await Promise.all([
    page.waitForURL('/vault', { timeout: 20000, waitUntil: 'commit' }),
    page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Vault' }).click(),
  ])
}

/**
 * Settings, opened as a fresh page load. The vault page sends several server
 * actions as it opens, and Next.js can apply their results to whichever page
 * is showing when they finish, so a soft navigation away from it straight
 * after landing can be pulled back. None of these steps needs the key in memory.
 */
async function openSettings(page: Page): Promise<void> {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
}

async function createVaultEntry(page: Page): Promise<void> {
  await goToVault(page)
  await page.getByRole('button', { name: 'Create Vault Entry' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create Vault Entry' })
  await dialog.getByLabel('Label').fill(ENTRY_LABEL)
  await dialog.getByLabel('Category', { exact: true }).selectOption('personal')
  await dialog.getByRole('button', { name: 'Edit as JSON' }).click()
  await dialog.getByRole('textbox', { name: 'Data', exact: true }).fill('{"book":"Middlemarch"}')
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 15000 })
}

/** Turn on opening the vault with the one registered passkey. */
async function enableUnlock(page: Page, password: string): Promise<void> {
  await page.getByRole('button', { name: 'Open the vault with it' }).click()
  const dialog = page.getByRole('dialog', { name: `Open your vault with ${DEVICE}` })
  await dialog.getByLabel('Password').fill(password)
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText(`${DEVICE} can now open your vault`, { exact: true })).toBeVisible({
    timeout: 30000,
  })
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Opens your vault', { exact: true })).toBeVisible()
}

/** Sign up, store one entry, and register a passkey for this device. Returns the account's id. */
async function accountWithPasskey(page: Page, email: string, prf: boolean): Promise<string> {
  await signup(page, email, TEST_USER.password)
  const { data, error } = await createAdminClient().from('users').select('id').eq('email', email).single()
  if (error) throw error

  await createVaultEntry(page)
  await addAuthenticator(page, { prf })
  await openSettings(page)
  await page.getByLabel('Device name (optional)').fill(DEVICE)
  await page.getByRole('button', { name: 'Register this device as passkey' }).click()
  await expect(page.getByRole('button', { name: `Remove ${DEVICE}` })).toBeVisible({ timeout: 20000 })
  return data.id
}

async function passwordWorks(email: string, password: string): Promise<boolean> {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data } = await client.auth.signInWithPassword({ email, password })
  return Boolean(data.session)
}

/** The reset page with a new password typed in. A signed-in browser stands in for one from a reset email. */
async function startReset(page: Page, newPassword: string): Promise<void> {
  await page.goto('/recover-vault')
  await page.getByLabel('New password', { exact: true }).fill(newPassword)
  await page.getByLabel('Confirm new password').fill(newPassword)
}

async function unlockCopies(userId: string): Promise<{ passkey_id: string | null }[]> {
  const { data, error } = await createAdminClient()
    .from('recovery_factors')
    .select('passkey_id')
    .eq('user_id', userId)
    .eq('type', 'passkey_prf')
  if (error) throw error
  return data
}

test.describe('Passkey vault unlock', () => {
  test('opens the vault with a passkey after a reload and at sign-in', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'The virtual authenticator is a Chromium DevTools feature')
    test.setTimeout(300000)
    const service = createAdminClient()
    const email = getUniqueEmail('passkey-unlock')
    const password = TEST_USER.password
    let userId: string | null = null

    try {
      userId = await accountWithPasskey(page, email, true)

      await enableUnlock(page, password)
      const { data: passkey, error: passkeyError } = await service
        .from('passkeys')
        .select('id')
        .eq('user_id', userId)
        .single()
      if (passkeyError) throw passkeyError
      expect(await unlockCopies(userId)).toEqual([{ passkey_id: passkey.id }])

      // A reload clears the key from memory. The passkey brings it back.
      await page.reload()
      await goToVault(page)
      await expect(page.getByText('Your vault is locked')).toBeVisible()
      await page.getByRole('button', { name: 'Open with a passkey' }).click()
      await expect(page.getByText(ENTRY_LABEL)).toBeVisible({ timeout: 20000 })

      // Signing in with the passkey opens the vault without the password.
      await page.getByRole('button', { name: 'Sign out' }).click()
      await page.waitForURL(/\/login/, { timeout: 20000, waitUntil: 'commit' })
      await page.locator('input[name="email"]').fill(email)
      const verifying = page.waitForRequest('**/api/auth/passkey/login-verify')
      await page.getByRole('button', { name: 'Sign in with passkey' }).click()
      const sent = JSON.parse((await verifying).postData() ?? '{}') as {
        credential?: { clientExtensionResults?: Record<string, unknown> }
      }
      // The PRF output is the secret that opens the vault, so it never leaves the page.
      expect(sent.credential?.clientExtensionResults).toBeDefined()
      expect(sent.credential?.clientExtensionResults).not.toHaveProperty('prf')

      await page.waitForURL('/dashboard', { timeout: 30000, waitUntil: 'commit' })
      await expect(page.getByRole('dialog', { name: 'Unlock your vault' })).toHaveCount(0)
      await goToVault(page)
      await expect(page.getByText(ENTRY_LABEL)).toBeVisible({ timeout: 20000 })

      // Turning it off needs the password again, and leaves the passkey for sign-in.
      await openSettings(page)
      await page.getByRole('button', { name: 'Stop opening the vault' }).click()
      const stop = page.getByRole('dialog', { name: 'Stop opening the vault with this passkey' })
      await stop.getByLabel('Password').fill(password)
      await stop.getByRole('button', { name: 'Confirm' }).click()
      await expect(page.getByText(`${DEVICE} no longer opens your vault`, { exact: true })).toBeVisible({
        timeout: 20000,
      })
      expect(await unlockCopies(userId)).toEqual([])

      // Removing the passkey removes its copy with it.
      await enableUnlock(page, password)
      await page.getByRole('button', { name: `Remove ${DEVICE}` }).click()
      const remove = page.getByRole('alertdialog', { name: 'Remove this passkey?' })
      await expect(remove).toContainText('or open your vault')
      await remove.getByRole('button', { name: 'Remove passkey' }).click()
      await expect(page.getByText('Passkey removed', { exact: true })).toBeVisible()
      expect(await unlockCopies(userId)).toEqual([])

      const { data: events, error: eventsError } = await service
        .from('audit_logs')
        .select('event_type, action')
        .eq('user_id', userId)
        .in('event_type', ['recovery_factor_added', 'recovery_factor_removed', 'passkey_removed'])
        .order('timestamp', { ascending: true })
      if (eventsError) throw eventsError
      expect(events.map((event) => event.action)).toEqual(
        expect.arrayContaining([
          'Turned on opening the vault with a passkey',
          'Turned off opening the vault with a passkey',
          'Removed a registered passkey, which also stopped it opening the vault',
        ])
      )
    } finally {
      if (userId) await service.auth.admin.deleteUser(userId).catch(() => undefined)
    }
  })

  test('restores the vault with a passkey at a password reset', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'The virtual authenticator is a Chromium DevTools feature')
    test.setTimeout(300000)
    const email = getUniqueEmail('passkey-restore')
    const newPassword = 'RestoredWithPasskey789!'
    let userId: string | null = null

    try {
      userId = await accountWithPasskey(page, email, true)
      await enableUnlock(page, TEST_USER.password)

      await startReset(page, newPassword)
      await page.getByRole('button', { name: 'Restore with a passkey' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Your passkey opened your vault' })).toBeVisible({
        timeout: 20000,
      })
      await expect(page.getByLabel('Recovery code or kit')).toHaveCount(0)
      // Nothing has changed yet.
      expect(await passwordWorks(email, TEST_USER.password)).toBe(true)

      await page.getByRole('button', { name: 'Reset password' }).click()
      const done = page.getByRole('status').filter({ hasText: 'restored' })
      await expect(done).toContainText('1 vault entry was restored', { timeout: 60000 })
      await expect(done).toContainText('Your passkeys no longer open your vault')
      expect(await passwordWorks(email, newPassword)).toBe(true)
      expect(await passwordWorks(email, TEST_USER.password)).toBe(false)

      // The copy wrapped the old key, so it went with the others, and a new code replaced the old one.
      expect(await unlockCopies(userId)).toEqual([])
      const { data: factors } = await createAdminClient()
        .from('recovery_factors')
        .select('type')
        .eq('user_id', userId)
      expect(factors).toEqual([{ type: 'recovery_code' }])

      await Promise.all([
        page.waitForURL('/dashboard', { timeout: 20000, waitUntil: 'commit' }),
        page.getByRole('button', { name: 'Continue to dashboard' }).click(),
      ])
      await goToVault(page)
      await expect(page.getByText(ENTRY_LABEL)).toBeVisible({ timeout: 20000 })
    } finally {
      if (userId) await createAdminClient().auth.admin.deleteUser(userId).catch(() => undefined)
    }
  })

  test('asks before a reset that does not restore, then stops the passkeys opening the vault', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'The virtual authenticator is a Chromium DevTools feature')
    test.setTimeout(300000)
    const service = createAdminClient()
    const email = getUniqueEmail('passkey-skip')
    const newPassword = 'ResetWithoutRestore789!'
    let userId: string | null = null

    try {
      userId = await accountWithPasskey(page, email, true)
      await enableUnlock(page, TEST_USER.password)

      await startReset(page, newPassword)
      await page.getByRole('button', { name: 'Reset password' }).click()
      const warning = page.getByRole('alert').filter({ hasText: 'your passkeys stop opening your vault' })
      await expect(warning).toContainText('until you use your recovery code or kit', { timeout: 20000 })
      // Asking changed nothing.
      expect(await passwordWorks(email, TEST_USER.password)).toBe(true)
      expect(await unlockCopies(userId)).toHaveLength(1)

      await page.getByRole('button', { name: 'Reset without restoring' }).click()
      const done = page.getByRole('status').filter({ hasText: 'Your password was reset' })
      await expect(done).toContainText('Your passkeys no longer open your vault', { timeout: 60000 })
      await expect(done).toContainText('Enter your recovery code or kit to also restore')
      expect(await passwordWorks(email, newPassword)).toBe(true)

      // The passkey copies are gone. The recovery code stays, because it can still restore the vault.
      expect(await unlockCopies(userId)).toEqual([])
      const { data: factors } = await service.from('recovery_factors').select('type').eq('user_id', userId)
      expect(factors).toEqual([{ type: 'recovery_code' }])
      const { data: events } = await service
        .from('audit_logs')
        .select('action')
        .eq('user_id', userId)
        .eq('event_type', 'recovery_factor_removed')
      expect(events?.map((event) => event.action)).toContain(
        'Stopped 1 passkey opening the vault after a password reset that did not restore it'
      )
    } finally {
      if (userId) await service.auth.admin.deleteUser(userId).catch(() => undefined)
    }
  })

  test('explains when a passkey cannot open the vault, and stores nothing', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'The virtual authenticator is a Chromium DevTools feature')
    test.setTimeout(240000)
    const email = getUniqueEmail('passkey-no-prf')
    let userId: string | null = null

    try {
      userId = await accountWithPasskey(page, email, false)

      await page.getByRole('button', { name: 'Open the vault with it' }).click()
      const dialog = page.getByRole('dialog', { name: `Open your vault with ${DEVICE}` })
      await dialog.getByLabel('Password').fill(TEST_USER.password)
      await dialog.getByRole('button', { name: 'Continue' }).click()
      await expect(dialog.getByRole('alert')).toContainText('does not support it', { timeout: 30000 })
      expect(await unlockCopies(userId)).toEqual([])

      // After a reload there is no passkey to offer, so the locked vault asks for a sign-in.
      await page.reload()
      await goToVault(page)
      await expect(page.getByText('Your vault is locked')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Open with a passkey' })).toHaveCount(0)
    } finally {
      if (userId) await createAdminClient().auth.admin.deleteUser(userId).catch(() => undefined)
    }
  })
})
