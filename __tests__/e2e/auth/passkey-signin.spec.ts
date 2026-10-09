/**
 * E2E tests - passkey sign-in, and that only an account's own passkeys can
 * sign in to it. Uses a Chromium virtual authenticator.
 */

import { expect, test, type Page } from '@playwright/test'
import { getUniqueEmail, signup, TEST_USER } from '../helpers/auth'
import { createAdminClient } from '../helpers/supabase-admin'

const DEVICE = 'Test laptop'

/** A platform authenticator that verifies the user and answers every prompt. */
async function addAuthenticator(page: Page): Promise<void> {
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
      automaticPresenceSimulation: true,
    },
  })
}

/** Sign up, register a passkey for this device, and sign out again. Returns the account's id. */
async function accountWithPasskey(page: Page, email: string): Promise<string> {
  await signup(page, email, TEST_USER.password)
  await addAuthenticator(page)
  await Promise.all([
    page.waitForURL('/settings', { timeout: 20000, waitUntil: 'commit' }),
    page.getByRole('link', { name: 'Settings' }).click(),
  ])
  await page.getByLabel('Device name (optional)').fill(DEVICE)
  await page.getByRole('button', { name: 'Register this device as passkey' }).click()
  await expect(page.getByRole('button', { name: `Remove ${DEVICE}` })).toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForURL(/\/login/, { timeout: 20000, waitUntil: 'commit' })

  const { data, error } = await createAdminClient().from('users').select('id').eq('email', email).single()
  if (error) throw error
  return data.id
}

test.describe('Passkey sign-in', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'The virtual authenticator is a Chromium DevTools feature')
  })

  test('signs in with a passkey, then opens the vault with the password', async ({ page }) => {
    test.setTimeout(240000)
    const email = getUniqueEmail('passkey-signin')
    let userId: string | null = null

    try {
      userId = await accountWithPasskey(page, email)

      await page.locator('input[name="email"]').fill(email)
      const verifying = page.waitForResponse('**/api/auth/passkey/login-verify')
      await page.getByRole('button', { name: 'Sign in with passkey' }).click()
      const response = await verifying
      expect(response.status()).toBe(200)
      expect(await response.json()).toEqual({ verified: true, token_hash: expect.any(String) })

      const unlock = page.getByRole('dialog', { name: 'Unlock your vault' })
      await unlock.getByLabel('Encryption password').fill(TEST_USER.password)
      await unlock.getByRole('button', { name: 'Unlock vault' }).click()
      await page.waitForURL('/dashboard', { timeout: 30000, waitUntil: 'commit' })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const { data: passkey } = await createAdminClient()
        .from('passkeys')
        .select('last_used_at')
        .eq('user_id', userId)
        .single()
      expect(passkey?.last_used_at).not.toBeNull()
    } finally {
      if (userId) await createAdminClient().auth.admin.deleteUser(userId).catch(() => undefined)
    }
  })

  test('refuses a passkey that belongs to a different account', async ({ page }) => {
    test.setTimeout(240000)
    const service = createAdminClient()
    const attackerEmail = getUniqueEmail('passkey-attacker')
    const victimEmail = getUniqueEmail('passkey-victim')
    let attackerId: string | null = null
    let victimId: string | null = null

    try {
      attackerId = await accountWithPasskey(page, attackerEmail)

      const { data: victim, error: victimError } = await service.auth.admin.createUser({
        email: victimEmail,
        password: 'VictimPassword123!',
        email_confirm: true,
      })
      if (victimError) throw victimError
      victimId = victim.user.id
      // The victim has a passkey of their own, so sign-in options exist for them.
      const { error: passkeyError } = await service.from('passkeys').insert({
        user_id: victimId,
        credential_id: `victim-${Date.now()}`,
        public_key: Buffer.from('victim-public-key').toString('base64'),
        device_name: 'Victim phone',
      })
      if (passkeyError) throw passkeyError

      const { data: attackerPasskey, error: attackerError } = await service
        .from('passkeys')
        .select('credential_id')
        .eq('user_id', attackerId)
        .single()
      if (attackerError) throw attackerError

      // Ask to sign in as the victim, then answer with the attacker's own,
      // genuine passkey, as a modified client could.
      const result = await page.evaluate(
        async ({ victimEmail, credentialId }) => {
          const toBuffer = (value: string) => {
            const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
            return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)).buffer
          }
          const toText = (buffer: ArrayBuffer) =>
            btoa(String.fromCharCode(...new Uint8Array(buffer)))
              .replace(/\+/g, '-')
              .replace(/\//g, '_')
              .replace(/=+$/, '')

          const optionsResponse = await fetch('/api/auth/passkey/login-options', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: victimEmail }),
          })
          const { options } = await optionsResponse.json()
          const assertion = (await navigator.credentials.get({
            publicKey: {
              challenge: toBuffer(options.challenge),
              rpId: options.rpId,
              allowCredentials: [{ id: toBuffer(credentialId), type: 'public-key' }],
              userVerification: 'preferred',
            },
          })) as PublicKeyCredential
          const signed = assertion.response as AuthenticatorAssertionResponse
          const verify = await fetch('/api/auth/passkey/login-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              credential: {
                id: assertion.id,
                rawId: toText(assertion.rawId),
                type: assertion.type,
                response: {
                  authenticatorData: toText(signed.authenticatorData),
                  clientDataJSON: toText(signed.clientDataJSON),
                  signature: toText(signed.signature),
                  userHandle: signed.userHandle ? toText(signed.userHandle) : undefined,
                },
                clientExtensionResults: {},
              },
            }),
          })
          return { status: verify.status, body: await verify.json() }
        },
        { victimEmail, credentialId: attackerPasskey.credential_id }
      )

      expect(result.status).toBe(400)
      expect(result.body).not.toHaveProperty('token_hash')
      expect(result.body).not.toHaveProperty('token')
      expect(result.body).not.toHaveProperty('verified')

      // Nobody is signed in afterwards.
      await page.goto('/dashboard')
      await page.waitForURL(/\/login/, { timeout: 20000, waitUntil: 'commit' })
    } finally {
      for (const id of [attackerId, victimId]) {
        if (id) await service.auth.admin.deleteUser(id).catch(() => undefined)
      }
    }
  })
})
