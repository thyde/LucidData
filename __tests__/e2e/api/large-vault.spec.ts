/**
 * E2E tests - a vault past the first page of results.
 *
 * PostgREST returns at most 1,000 rows a request (max_rows in
 * supabase/config.toml) and says nothing when it stops. Anything that reads a
 * whole collection has to page through it, or a large vault lists part of
 * itself, exports part of itself, fails its own audit check, and can never
 * re-wrap its keys, because the database refuses a re-wrap that leaves an
 * entry out.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '../helpers/supabase-admin'
import { getUniqueEmail, TEST_USER } from '../helpers/auth'
import { createAuditHash } from '@/lib/crypto/hashing'

interface Person {
  id: string
  email: string
  token: string
}

function anonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function signIn(email: string): Promise<string> {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password: TEST_USER.password })
  if (error || !data.session) throw error ?? new Error('No session')
  return data.session.access_token
}

const as = (person: Person) => ({ authorization: `Bearer ${person.token}` })

const ENTRIES = 1001
const ENTRY = {
  category: 'personal',
  schema_type: 'custom',
  client_ciphertext: 'c2VhbGVkIGJ5IHRoZSBkZXZpY2U',
  encrypted_dek: 'd3JhcHBlZCBkYXRhIGtleQ',
  dek_salt: 'c2FsdA',
}

let person: Person

test.describe('A vault past the first page of results', () => {
  test.describe.configure({ mode: 'serial', timeout: 10 * 60 * 1000 })

  test.beforeAll(async ({ request }) => {
    test.setTimeout(10 * 60 * 1000)
    const email = getUniqueEmail('api-large')
    const { data, error } = await createAdminClient().auth.admin.createUser({
      email,
      password: TEST_USER.password,
      email_confirm: true,
    })
    if (error) throw error
    person = { id: data.user.id, email, token: await signIn(email) }
    expect((await request.post('/api/v1/recovery/decline', { headers: as(person) })).status()).toBe(200)

    for (let start = 0; start < ENTRIES; start += 100) {
      let entries = Array.from({ length: Math.min(100, ENTRIES - start) }, (_, offset) => ({
        ...ENTRY,
        label: `Entry ${start + offset + 1}`,
      }))
      // An importer sends again whatever failed for a passing reason, as the
      // batch endpoint's per-entry results are there for. Anything else fails.
      for (let attempt = 0; attempt < 2 && entries.length > 0; attempt++) {
        const response = await request.post('/api/v1/vault/batch', {
          headers: as(person),
          data: { entries },
          timeout: 120_000,
        })
        expect(response.status()).toBe(200)
        const results = (await response.json()).data.results as { index: number; code?: string }[]
        const failed = results.filter((result) => result.code)
        expect(failed.filter((result) => result.code !== 'internal')).toEqual([])
        entries = failed.map((result) => entries[result.index])
      }
      expect(entries).toEqual([])
    }
  })

  test.afterAll(async () => {
    if (person) await createAdminClient().auth.admin.deleteUser(person.id)
  })

  test('lists every entry', async ({ request }) => {
    const response = await request.get('/api/v1/vault', { headers: as(person), timeout: 120_000 })
    const entries = (await response.json()).data as { label: string }[]

    expect(entries).toHaveLength(ENTRIES)
    expect(new Set(entries.map((entry) => entry.label)).size).toBe(ENTRIES)
  })

  test('verifies an audit chain longer than one page', async ({ request }) => {
    // An import writes one audit entry a batch, and the client API allows 120
    // calls a minute, so the long chain is appended here the way the audit
    // service appends: each entry hashes the one before it.
    const admin = createAdminClient()
    const { data: latest } = await admin
      .from('audit_logs')
      .select('current_hash, timestamp')
      .eq('user_id', person.id)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single()
    let previous: string | null = latest?.current_hash ?? null
    const start = new Date(latest?.timestamp ?? Date.now()).getTime() + 1000
    const rows = Array.from({ length: ENTRIES }, (_, n) => {
      const timestamp = new Date(start + n * 1000)
      const action = `Read entry ${n + 1}`
      const current = createAuditHash(previous, { userId: person.id, eventType: 'data_accessed', action, timestamp })
      const row = {
        user_id: person.id,
        event_type: 'data_accessed',
        action,
        previous_hash: previous,
        current_hash: current,
        timestamp: timestamp.toISOString(),
      }
      previous = current
      return row
    })
    for (let at = 0; at < rows.length; at += 500) {
      const { error } = await admin.from('audit_logs').insert(rows.slice(at, at + 500))
      expect(error).toBeNull()
    }
    const { count } = await admin
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', person.id)
    expect(count).toBeGreaterThan(1000)

    const response = await request.get('/api/v1/audit', { headers: as(person), timeout: 120_000 })
    const { chain_valid } = (await response.json()).data

    expect(chain_valid).toBe(true)
  })

  test('re-wraps every key at once, as a password change does', async ({ request }) => {
    const vault = (await (await request.get('/api/v1/vault', { headers: as(person), timeout: 120_000 })).json())
      .data as { id: string; encrypted_dek: string; dek_salt: string }[]
    const grant = await request.post('/api/v1/step-up', {
      headers: as(person),
      data: { action: 'change_password', proof: await signIn(person.email) },
    })
    expect(grant.status()).toBe(200)

    const response = await request.post('/api/v1/vault/rewrap', {
      headers: as(person),
      timeout: 120_000,
      data: {
        reason: 'password_change',
        step_up_token: (await grant.json()).data.token,
        entries: vault.map(({ id, encrypted_dek }) => ({
          id,
          encrypted_dek: 'cmUtd3JhcHBlZCBkYXRhIGtleQ',
          dek_salt: 'bmV3LXNhbHQ',
          previous_encrypted_dek: encrypted_dek,
        })),
      },
    })

    expect(response.status()).toBe(200)
    expect((await response.json()).data.rewrapped).toBe(ENTRIES)
  })

  test('re-wraps in parts, as a vault too large for one request does', async ({ request }) => {
    const read = async () =>
      (await (await request.get('/api/v1/vault', { headers: as(person), timeout: 120_000 })).json()).data as {
        id: string
        encrypted_dek: string
      }[]
    const start = async () => {
      const grant = await request.post('/api/v1/step-up', {
        headers: as(person),
        data: { action: 'change_password', proof: await signIn(person.email) },
      })
      const started = await request.post('/api/v1/vault/rewraps', {
        headers: as(person),
        data: { reason: 'password_change', step_up_token: (await grant.json()).data.token },
      })
      expect(started.status()).toBe(201)
      return (await started.json()).data.id as string
    }
    const send = async (rewrap: string, entries: object[]) => {
      let staged = 0
      for (let at = 0; at < entries.length; at += 400) {
        const part = await request.post(`/api/v1/vault/rewraps/${rewrap}/entries`, {
          headers: as(person),
          data: { entries: entries.slice(at, at + 400) },
          timeout: 120_000,
        })
        expect(part.status()).toBe(200)
        staged = (await part.json()).data.staged
      }
      return staged
    }
    const apply = (rewrap: string) =>
      request.post(`/api/v1/vault/rewraps/${rewrap}/apply`, { headers: as(person), data: {}, timeout: 120_000 })

    const vault = await read()
    const envelopes = vault.map(({ id, encrypted_dek }) => ({
      id,
      encrypted_dek: 'c2VudC1pbi1wYXJ0cw',
      dek_salt: 'cGFydC1zYWx0',
      previous_encrypted_dek: encrypted_dek,
    }))

    // One entry that changed since it was read stops the whole re-wrap.
    const stale = await start()
    await send(stale, [{ ...envelopes[0], previous_encrypted_dek: 'c3RhbGU' }, ...envelopes.slice(1)])
    const refused = await apply(stale)
    expect(refused.status()).toBe(409)
    expect((await refused.json()).code).toBe('conflict')
    expect((await read()).every((entry) => entry.encrypted_dek !== 'c2VudC1pbi1wYXJ0cw')).toBe(true)

    const rewrap = await start()
    expect(await send(rewrap, envelopes)).toBe(ENTRIES)
    // A part sent again replaces what was sent, rather than counting twice.
    expect(await send(rewrap, envelopes.slice(0, 400))).toBe(ENTRIES)

    const applied = await apply(rewrap)
    expect(applied.status()).toBe(200)
    expect((await applied.json()).data.rewrapped).toBe(ENTRIES)
    expect((await read()).every((entry) => entry.encrypted_dek === 'c2VudC1pbi1wYXJ0cw')).toBe(true)

    // A re-wrap applies once.
    expect((await apply(rewrap)).status()).toBe(404)
  })
})
