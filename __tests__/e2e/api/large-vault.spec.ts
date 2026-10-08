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
})
