/**
 * E2E tests - LD-608 versioned client API.
 *
 * Runs against the real stack: people sign in with Supabase and call the API
 * with their own access tokens, so row level security is what decides what
 * each of them can reach.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '../helpers/supabase-admin'
import { getUniqueEmail, TEST_USER } from '../helpers/auth'

interface Person {
  id: string
  email: string
  token: string
}

const created: string[] = []

function anonClient(accessToken?: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
    }
  )
}

async function signedInPerson(prefix: string): Promise<Person> {
  const email = getUniqueEmail(prefix)
  const { data, error } = await createAdminClient().auth.admin.createUser({
    email,
    password: TEST_USER.password,
    email_confirm: true,
  })
  if (error) throw error
  created.push(data.user.id)
  const { data: signedIn, error: signInError } = await anonClient().auth.signInWithPassword({
    email,
    password: TEST_USER.password,
  })
  if (signInError || !signedIn.session) throw signInError ?? new Error('No session')
  return { id: data.user.id, email, token: signedIn.session.access_token }
}

/** The access token of a password sign-in made just now, which step-up accepts once. */
async function freshProof(person: Person): Promise<string> {
  const { data, error } = await anonClient().auth.signInWithPassword({
    email: person.email,
    password: TEST_USER.password,
  })
  if (error || !data.session) throw error ?? new Error('No session')
  return data.session.access_token
}

const as = (person: Person) => ({ authorization: `Bearer ${person.token}` })

const ENTRY = {
  label: 'API test entry',
  category: 'personal',
  schema_type: 'custom',
  client_ciphertext: 'c2VhbGVkIGJ5IHRoZSBkZXZpY2U',
  encrypted_dek: 'd3JhcHBlZCBkYXRhIGtleQ',
  dek_salt: 'c2FsdA',
}

let owner: Person
let stranger: Person

test.describe('Client API v1', () => {
  // The tests share two people and build on each other's state.
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    owner = await signedInPerson('api-owner')
    stranger = await signedInPerson('api-stranger')
  })

  test.afterAll(async () => {
    const admin = createAdminClient()
    for (const id of created) await admin.auth.admin.deleteUser(id)
  })

  test('refuses a request without a valid token', async ({ request }) => {
    expect((await request.get('/api/v1/me')).status()).toBe(401)
    const forged = await request.get('/api/v1/me', { headers: { authorization: 'Bearer not.a.token' } })
    expect(forged.status()).toBe(401)
  })

  test('acts as the person, and row level security keeps everyone else out', async ({ request }) => {
    const me = await request.get('/api/v1/me', { headers: as(owner) })
    expect(me.status()).toBe(200)
    expect((await me.json()).data).toMatchObject({ id: owner.id, email: owner.email })

    // LD-105: a new vault refuses its first entry until recovery is set up or declined.
    const early = await request.post('/api/v1/vault', { headers: as(owner), data: ENTRY })
    expect(early.status()).toBe(409)
    expect((await early.json()).code).toBe('recovery_required')
    expect((await request.post('/api/v1/recovery/decline', { headers: as(owner) })).status()).toBe(200)

    const stored = await request.post('/api/v1/vault', { headers: as(owner), data: ENTRY })
    expect(stored.status()).toBe(201)
    const id = (await stored.json()).data.id as string
    expect((await request.get(`/api/v1/vault/${id}`, { headers: as(owner) })).status()).toBe(200)

    // Someone else can neither see nor touch it.
    expect((await request.get(`/api/v1/vault/${id}`, { headers: as(stranger) })).status()).toBe(404)
    const changed = await request.patch(`/api/v1/vault/${id}`, {
      headers: as(stranger),
      data: { label: 'Taken' },
    })
    expect(changed.status()).toBe(404)
    expect((await request.delete(`/api/v1/vault/${id}`, { headers: as(stranger) })).status()).toBe(404)
    const theirs = await request.get('/api/v1/vault', { headers: as(stranger) })
    expect((await theirs.json()).data).toEqual([])

    // The database itself refuses, not only the service's filter: the stranger's
    // token reaches nothing even when asking for that row by id.
    const { data: direct } = await anonClient(stranger.token).from('vault_data').select('id').eq('id', id)
    expect(direct).toEqual([])

    const after = await request.get(`/api/v1/vault/${id}`, { headers: as(owner) })
    expect((await after.json()).data.label).toBe(ENTRY.label)
  })

  test('stores health data only with consent', async ({ request }) => {
    await request.post('/api/v1/recovery/decline', { headers: as(stranger) })
    const health = { ...ENTRY, label: 'Resting heart rate', category: 'health' }

    const refused = await request.post('/api/v1/vault', { headers: as(stranger), data: health })
    expect(refused.status()).toBe(403)
    expect((await refused.json()).code).toBe('health_consent_required')

    const consent = await request.post('/api/v1/legal/health-consent', {
      headers: as(stranger),
      data: {},
    })
    expect(consent.status()).toBe(200)
    expect((await consent.json()).data.healthConsent.granted).toBe(true)

    const stored = await request.post('/api/v1/vault', { headers: as(stranger), data: health })
    expect(stored.status()).toBe(201)
  })

  test('says what was wrong with invalid input', async ({ request }) => {
    const response = await request.post('/api/v1/vault', {
      headers: as(owner),
      data: { label: '', client_ciphertext: '' },
    })
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('invalid_input')
    expect(body.issues.map((issue: { path: string }) => issue.path)).toEqual(
      expect.arrayContaining(['label', 'client_ciphertext', 'encrypted_dek', 'dek_salt'])
    )
  })

  test('publishes its OpenAPI document without a token', async ({ request }) => {
    const response = await request.get('/api/v1/openapi')
    expect(response.status()).toBe(200)
    const document = await response.json()
    expect(document.paths['/api/v1/vault'].post.requestBody).toBeDefined()
    expect(document.components.securitySchemes.bearerAuth.scheme).toBe('bearer')
  })

  test('stores a batch and reports each entry on its own', async ({ request }) => {
    const response = await request.post('/api/v1/vault/batch', {
      headers: as(owner),
      data: {
        entries: [
          { ...ENTRY, label: 'Batch one' },
          // The owner has not agreed to health processing, so this one is refused.
          { ...ENTRY, label: 'Batch two', category: 'health' },
        ],
      },
    })
    expect(response.status()).toBe(200)
    const body = (await response.json()).data
    expect(body.stored).toBe(1)
    expect(body.results[0].data.label).toBe('Batch one')
    expect(body.results[1].code).toBe('health_consent_required')

    // A rule broken by any entry refuses the whole request, and says where.
    const unpaired = await request.post('/api/v1/vault/batch', {
      headers: as(owner),
      data: { entries: [{ ...ENTRY, source_record_id: 'run-2026-10-08' }] },
    })
    expect(unpaired.status()).toBe(400)
    expect((await unpaired.json()).issues).toEqual([
      expect.objectContaining({ path: 'entries.0.source_record_id' }),
    ])

    // Running an import again stores nothing twice, and says why.
    const sourced = {
      ...ENTRY,
      label: 'Synced run',
      source_provider: 'strava',
      source_record_id: 'run-2026-10-08',
    }
    const first = await request.post('/api/v1/vault', { headers: as(owner), data: sourced })
    expect(first.status()).toBe(201)
    const again = await request.post('/api/v1/vault', { headers: as(owner), data: sourced })
    expect(again.status()).toBe(409)
    expect((await again.json()).code).toBe('already_stored')
    const batchAgain = await request.post('/api/v1/vault/batch', {
      headers: as(owner),
      data: { entries: [sourced] },
    })
    const repeated = (await batchAgain.json()).data
    expect(repeated.stored).toBe(0)
    expect(repeated.results[0].code).toBe('already_stored')
  })

  test('updates and deletes without recording a read that never happened', async ({ request }) => {
    const accessed = async () => {
      const audit = await request.get('/api/v1/audit', { headers: as(owner) })
      const logs = (await audit.json()).data.logs as { event_type: string }[]
      return logs.filter((log) => log.event_type === 'data_accessed').length
    }
    const created = await request.post('/api/v1/vault', {
      headers: as(owner),
      data: { ...ENTRY, label: 'Short lived' },
    })
    expect(created.status()).toBe(201)
    const id = (await created.json()).data.id as string
    const before = await accessed()

    const renamed = await request.patch(`/api/v1/vault/${id}`, {
      headers: as(owner),
      data: { label: 'Renamed' },
    })
    expect(renamed.status()).toBe(200)
    expect((await renamed.json()).data.label).toBe('Renamed')
    expect((await request.delete(`/api/v1/vault/${id}`, { headers: as(owner) })).status()).toBe(200)
    expect((await request.delete(`/api/v1/vault/${id}`, { headers: as(owner) })).status()).toBe(404)

    expect(await accessed()).toBe(before)
  })

  test('grants, extends, and revokes consent, with each step in a valid audit chain', async ({
    request,
  }) => {
    const inMonth = new Date(Date.now() + 30 * 86_400_000).toISOString()
    const inYear = new Date(Date.now() + 365 * 86_400_000).toISOString()

    const granted = await request.post('/api/v1/consents', {
      headers: as(owner),
      data: {
        granted_to: 'Riverside Clinic',
        access_level: 'read',
        purpose: 'Annual checkup',
        end_date: inMonth,
      },
    })
    expect(granted.status()).toBe(201)
    const consent = (await granted.json()).data
    expect(consent.status).toBe('active')

    expect(
      (await request.get(`/api/v1/consents/${consent.id}`, { headers: as(stranger) })).status()
    ).toBe(404)
    const strangerRevoke = await request.post(`/api/v1/consents/${consent.id}/revoke`, {
      headers: as(stranger),
      data: { reason: 'Not mine to stop' },
    })
    expect(strangerRevoke.status()).toBe(404)

    const extended = await request.post(`/api/v1/consents/${consent.id}/extend`, {
      headers: as(owner),
      data: { end_date: inYear },
    })
    expect(extended.status()).toBe(200)
    expect(Date.parse((await extended.json()).data.end_date)).toBe(Date.parse(inYear))

    const revoked = await request.post(`/api/v1/consents/${consent.id}/revoke`, {
      headers: as(owner),
      data: { reason: 'The checkup is done' },
    })
    expect(revoked.status()).toBe(200)
    expect((await revoked.json()).data.status).toBe('revoked')

    const audit = await request.get('/api/v1/audit', { headers: as(owner) })
    const { logs, chain_valid } = (await audit.json()).data
    expect(chain_valid).toBe(true)
    expect(logs.map((log: { event_type: string }) => log.event_type)).toEqual(
      expect.arrayContaining(['consent_granted', 'consent_extended', 'consent_revoked'])
    )
  })

  test('publishes the ingestion key once, and only for its owner', async ({ request }) => {
    const before = await request.get('/api/v1/ingest/key', { headers: as(owner) })
    expect(before.status()).toBe(200)
    expect((await before.json()).data.public_key).toBeNull()

    const key = {
      public_key: 'cHVibGljIGhhbGYgb2YgdGhlIGluZ2VzdGlvbiBrZXlwYWlyIGZvciB0ZXN0cw',
      wrapped_private_key: 'd3JhcHBlZCBwcml2YXRlIGhhbGY',
      salt: 'aW5nZXN0LXNhbHQ',
    }
    const published = await request.put('/api/v1/ingest/key', { headers: as(owner), data: key })
    expect(published.status()).toBe(200)
    const again = await request.put('/api/v1/ingest/key', { headers: as(owner), data: key })
    expect(again.status()).toBe(409)

    const after = await request.get('/api/v1/ingest/key', { headers: as(owner) })
    expect((await after.json()).data.public_key).toBe(key.public_key)
    const theirs = await request.get('/api/v1/ingest/key', { headers: as(stranger) })
    expect((await theirs.json()).data.public_key).toBeNull()

    const pending = await request.get('/api/v1/ingest', { headers: as(owner) })
    expect((await pending.json()).data).toEqual([])
  })

  test('guards every change to recovery with a fresh password proof', async ({ request }) => {
    const grant = async (action: string) => {
      const response = await request.post('/api/v1/step-up', {
        headers: as(owner),
        data: { action, proof: await freshProof(owner) },
      })
      expect(response.status()).toBe(200)
      return (await response.json()).data.token as string
    }
    const kit = {
      type: 'recovery_kit',
      label: 'Spare kit',
      wrapped_master_key: 'd3JhcHBlZCBvbiB0aGUgZGV2aWNl',
      salt: 'a2l0LXNhbHQ',
    }

    const refused = await request.post('/api/v1/recovery/factors', { headers: as(owner), data: kit })
    expect(refused.status()).toBe(403)
    expect((await refused.json()).code).toBe('step_up_required')

    const added = await request.post('/api/v1/recovery/factors', {
      headers: as(owner),
      data: { ...kit, step_up_token: await grant('add_recovery_factor') },
    })
    expect(added.status()).toBe(201)
    const id = (await added.json()).data.id as string

    // The device reads back only wrapped bytes, and only its own.
    const material = (await (await request.get('/api/v1/recovery/material', { headers: as(owner) })).json()).data
    expect(material.factors).toEqual([
      expect.objectContaining({ id, type: 'recovery_kit', wrapped_master_key: kit.wrapped_master_key }),
    ])
    expect(material.probe).toEqual(
      expect.objectContaining({ encrypted_dek: expect.any(String), dek_salt: expect.any(String) })
    )
    const theirs = (await (await request.get('/api/v1/recovery/material', { headers: as(stranger) })).json()).data
    expect(theirs.factors).toEqual([])

    const unconfirmed = await request.delete(`/api/v1/recovery/factors/${id}`, {
      headers: as(owner),
      data: { step_up_token: 'made-up-grant' },
    })
    expect(unconfirmed.status()).toBe(403)
    const removed = await request.delete(`/api/v1/recovery/factors/${id}`, {
      headers: as(owner),
      data: { step_up_token: await grant('remove_recovery_factor') },
    })
    expect(removed.status()).toBe(200)

    // Re-wrapping every key needs a grant as well. Sending the envelopes back
    // unchanged would otherwise retire every factor without the password.
    const vault = (await (await request.get('/api/v1/vault', { headers: as(owner) })).json()).data as {
      id: string
      encrypted_dek: string
      dek_salt: string
    }[]
    const entries = vault.map(({ id, encrypted_dek, dek_salt }) => ({
      id,
      encrypted_dek,
      dek_salt,
      previous_encrypted_dek: encrypted_dek,
    }))
    const ungranted = await request.post('/api/v1/vault/rewrap', {
      headers: as(owner),
      data: { reason: 'password_change', entries, step_up_token: 'made-up-grant' },
    })
    expect(ungranted.status()).toBe(403)

    // A re-wrap computed from a read that is no longer current is refused whole.
    const stale = await request.post('/api/v1/vault/rewrap', {
      headers: as(owner),
      data: {
        reason: 'password_change',
        entries: entries.map((entry, index) =>
          index === 0 ? { ...entry, previous_encrypted_dek: 'cmVhZCBiZWZvcmUgYW4gZWRpdA' } : entry
        ),
        step_up_token: await grant('change_password'),
      },
    })
    expect(stale.status()).toBe(409)
    expect((await stale.json()).code).toBe('conflict')

    const rewrapped = await request.post('/api/v1/vault/rewrap', {
      headers: as(owner),
      data: {
        reason: 'password_change',
        entries,
        step_up_token: await grant('change_password'),
        // The connector key published earlier in this file moves with the entries.
        ingest_key: { previous: 'd3JhcHBlZCBwcml2YXRlIGhhbGY', wrapped: 'bW92ZWQgdG8gdGhlIG5ldyBrZXk' },
      },
    })
    expect(rewrapped.status()).toBe(200)
    expect((await rewrapped.json()).data).toEqual({
      rewrapped: entries.length,
      retired_kits: 0,
      retired_passkeys: 0,
    })
    const ingestKey = (await (await request.get('/api/v1/ingest/key', { headers: as(owner) })).json()).data
    expect(ingestKey.wrapped_private_key).toBe('bW92ZWQgdG8gdGhlIG5ldyBrZXk')
  })

  test('deletes an account only with a fresh password proof', async ({ request }) => {
    const leaver = await signedInPerson('api-leaver')
    const remove = (stepUpToken: string) =>
      request.delete('/api/v1/account', {
        headers: as(leaver),
        data: { confirm_phrase: 'DELETE MY ACCOUNT', step_up_token: stepUpToken },
      })

    const unconfirmed = await remove('made-up-grant')
    expect(unconfirmed.status()).toBe(403)
    expect((await unconfirmed.json()).code).toBe('step_up_required')

    // The session making the request never counts as its own proof.
    const self = await request.post('/api/v1/step-up', {
      headers: as(leaver),
      data: { action: 'delete_account', proof: leaver.token },
    })
    expect(self.status()).toBe(403)

    const proof = await freshProof(leaver)
    const granted = await request.post('/api/v1/step-up', {
      headers: as(leaver),
      data: { action: 'delete_account', proof },
    })
    expect(granted.status()).toBe(200)
    const stepUpToken = (await granted.json()).data.token as string

    // Checking the proof ended its session, so it works once.
    const replay = await request.post('/api/v1/step-up', {
      headers: as(leaver),
      data: { action: 'delete_account', proof },
    })
    expect(replay.status()).toBe(403)

    const deleted = await remove(stepUpToken)
    expect(deleted.status()).toBe(200)
    expect((await deleted.json()).data.verified).toBe(true)

    expect((await request.get('/api/v1/me', { headers: as(leaver) })).status()).toBe(401)
  })
})
