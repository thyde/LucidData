import { describe, expect, it, vi } from 'vitest'
import { runImport, type EntryToStore, type StoreAnswer } from '../runner'
import type { ImportedRecord } from '../types'

const record = (n: number, schemaType: ImportedRecord['schemaType'] = 'fitness_daily'): ImportedRecord => ({
  schemaType,
  data: { date: `2026-10-${String(n).padStart(2, '0')}`, steps: 1000 + n, name: `Morning walk ${n}` },
  sourceRecordId: `${schemaType}:2026-10-${String(n).padStart(2, '0')}`,
  capturedAt: `2026-10-${String(n).padStart(2, '0')}T20:00:00-07:00`,
})

const encrypt = vi.fn(async (plaintext: string) => ({
  client_ciphertext: `sealed(${plaintext.length})-${Math.random()}`,
  encrypted_dek: 'dek',
  dek_salt: 'salt',
}))

/** A vault that stores everything, and remembers what it has. */
function vault(options: { refuse?: (entry: EntryToStore) => string | null } = {}) {
  const held = new Set<string>()
  const batches: EntryToStore[][] = []
  const store = vi.fn(async (entries: EntryToStore[]): Promise<StoreAnswer[]> => {
    batches.push(entries)
    return entries.map((entry, index) => {
      const refusal = options.refuse?.(entry)
      if (refusal) return { index, code: refusal, error: `Refused: ${refusal}` }
      if (held.has(entry.source_record_id)) return { index, code: 'already_stored', error: 'Already there' }
      held.add(entry.source_record_id)
      return { index, id: `id-${entry.source_record_id}` }
    })
  })
  return { held, batches, store }
}

describe('runImport', () => {
  it('stores records in batches, labelled by type, with their provenance', async () => {
    const target = vault()
    const progress = vi.fn()
    const outcome = await runImport([1, 2, 3, 4, 5].map((n) => record(n)), 'apple-health', {
      encrypt,
      store: target.store,
      onProgress: progress,
      batchSize: 2,
    })

    expect(outcome).toEqual({ total: 5, done: 5, stored: 5, alreadyStored: 0, failed: 0, stopped: null, firstError: null })
    expect(target.batches.map((batch) => batch.length)).toEqual([2, 2, 1])
    const [first] = target.batches[0]
    expect(first).toMatchObject({
      label: 'Daily activity',
      category: 'health',
      schema_type: 'fitness_daily',
      source_provider: 'apple-health',
      source_record_id: 'fitness_daily:2026-10-01',
      source_captured_at: '2026-10-01T20:00:00-07:00',
    })
    // Nothing from inside the record is readable: its name went into the encrypted data only.
    expect(JSON.stringify({ ...first, client_ciphertext: '' })).not.toContain('Morning walk')
    expect(progress).toHaveBeenLastCalledWith({ total: 5, done: 5, stored: 5, alreadyStored: 0, failed: 0 })
  })

  it('stores nothing twice: a second run carries on from where the first stopped', async () => {
    const target = vault()
    const controller = new AbortController()
    const records = [1, 2, 3, 4].map((n) => record(n))

    const first = await runImport(records, 'apple-health', {
      encrypt,
      store: async (entries) => {
        const answers = await target.store(entries)
        controller.abort()
        return answers
      },
      signal: controller.signal,
      batchSize: 2,
    })
    expect(first).toMatchObject({ stored: 2, stopped: 'cancelled' })

    encrypt.mockClear()
    const second = await runImport(records, 'apple-health', {
      encrypt,
      store: target.store,
      alreadyStored: async () => target.held,
      batchSize: 2,
    })
    expect(second).toMatchObject({ total: 4, done: 4, stored: 2, alreadyStored: 2, stopped: null })
    // The two already stored were skipped before they were encrypted again.
    expect(encrypt).toHaveBeenCalledTimes(2)
  })

  it('counts a record the vault already holds as done, not as a failure', async () => {
    const target = vault()
    target.held.add('fitness_daily:2026-10-02')
    const outcome = await runImport([1, 2].map((n) => record(n)), 'apple-health', { encrypt, store: target.store })
    expect(outcome).toMatchObject({ stored: 1, alreadyStored: 1, failed: 0 })
  })

  it('asks for health data consent once, then stores what was refused for want of it', async () => {
    let consented = false
    const target = vault({ refuse: () => (consented ? null : 'health_consent_required') })
    const ask = vi.fn(async () => (consented = true))

    const outcome = await runImport([1, 2, 3].map((n) => record(n)), 'apple-health', {
      encrypt,
      store: target.store,
      askForHealthConsent: ask,
      batchSize: 2,
    })

    expect(ask).toHaveBeenCalledTimes(1)
    expect(outcome).toMatchObject({ stored: 3, failed: 0, stopped: null })
  })

  it('stops when consent is declined, and when the vault needs recovery set up first', async () => {
    const declined = await runImport([record(1)], 'apple-health', {
      encrypt,
      store: vault({ refuse: () => 'health_consent_required' }).store,
      askForHealthConsent: async () => false,
    })
    expect(declined).toMatchObject({ stored: 0, stopped: 'consent_declined' })

    const recovery = await runImport([record(1)], 'apple-health', {
      encrypt,
      store: vault({ refuse: () => 'recovery_required' }).store,
    })
    expect(recovery).toMatchObject({ stored: 0, stopped: 'recovery_required', firstError: 'Refused: recovery_required' })
  })

  it('keeps going past a record the vault could not store, and says why', async () => {
    const target = vault({ refuse: (entry) => (entry.source_record_id.endsWith('02') ? 'internal' : null) })
    const outcome = await runImport([1, 2, 3].map((n) => record(n)), 'apple-health', { encrypt, store: target.store })
    expect(outcome).toMatchObject({ stored: 2, failed: 1, firstError: 'Refused: internal', stopped: null })
  })

  it('goes past the 1,000 records a single file import stops at, 100 a request', async () => {
    const target = vault()
    const records = Array.from({ length: 2345 }, (_, n) => ({ ...record(1), sourceRecordId: `fitness_daily:${n}` }))

    const outcome = await runImport(records, 'apple-health', { encrypt, store: target.store })

    expect(outcome).toMatchObject({ total: 2345, done: 2345, stored: 2345, failed: 0, stopped: null })
    expect(target.batches).toHaveLength(24)
    expect(Math.max(...target.batches.map((batch) => batch.length))).toBe(100)
  })
})
