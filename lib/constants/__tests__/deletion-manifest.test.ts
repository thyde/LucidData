import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  DELETION_MANIFEST,
  RESIDUAL_DISCLOSURES,
  manifestEntryFor,
  tablesRequiringNoResidue,
} from '@/lib/constants/deletion-manifest'

/**
 * LD-607: the manifest is the contract. These tests derive the live table list
 * from the migrations, so adding a table without a deletion decision fails the
 * build rather than quietly shipping data that survives erasure.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function liveTables(): string[] {
  const created = new Set<string>()
  const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort()

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')

    const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi
    for (const match of sql.matchAll(createRe)) created.add(match[1].toLowerCase())

    const dropRe = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi
    for (const match of sql.matchAll(dropRe)) created.delete(match[1].toLowerCase())

    const renameRe =
      /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+RENAME\s+TO\s+"?([a-z_][a-z0-9_]*)"?/gi
    for (const match of sql.matchAll(renameRe)) {
      created.delete(match[1].toLowerCase())
      created.add(match[2].toLowerCase())
    }
  }

  return [...created].sort()
}

describe('deletion manifest coverage', () => {
  it('finds the schema it is asserting against', () => {
    const tables = liveTables()
    expect(tables.length).toBeGreaterThan(20)
    expect(tables).toContain('vault_data')
    expect(tables).toContain('audit_logs')
  })

  it('covers every table created by a migration', () => {
    const missing = liveTables().filter((table) => !manifestEntryFor(table))
    expect(
      missing,
      `Add a DELETION_MANIFEST entry for: ${missing.join(', ')}. A new table needs a deletion decision.`
    ).toEqual([])
  })

  it('has no manifest entry for a table that does not exist', () => {
    const tables = new Set(liveTables())
    const stale = DELETION_MANIFEST.map((entry) => entry.table).filter(
      (table) => !tables.has(table)
    )
    expect(stale).toEqual([])
  })

  it('lists each table exactly once', () => {
    const names = DELETION_MANIFEST.map((entry) => entry.table)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('deletion manifest shape', () => {
  it('gives every entry a reason', () => {
    for (const entry of DELETION_MANIFEST) {
      expect(entry.reason.length, `${entry.table} needs a reason`).toBeGreaterThan(20)
    }
  })

  it('names a user column for every table holding personal data', () => {
    for (const entry of DELETION_MANIFEST) {
      if (!entry.personalData) continue
      expect(entry.userColumn, `${entry.table} claims personal data with no user column`).toBeTruthy()
    }
  })

  it('only strips columns on entries whose behaviour is strip', () => {
    for (const entry of DELETION_MANIFEST) {
      if (entry.behaviour === 'strip') {
        expect(entry.strippedColumns.length, `${entry.table} strips nothing`).toBeGreaterThan(0)
      } else {
        expect(entry.strippedColumns).toEqual([])
      }
    }
  })

  it('never marks a table holding personal data as untouched', () => {
    const untouched = DELETION_MANIFEST.filter(
      (entry) => entry.personalData && entry.behaviour === 'no_personal_data'
    )
    expect(untouched).toEqual([])
  })

  it('handles the two keys that do not cascade explicitly', () => {
    expect(manifestEntryFor('issued_credentials')?.behaviour).toBe('explicit_delete')
    expect(manifestEntryFor('issued_credentials')?.userColumn).toBe('subject_user_id')

    const records = manifestEntryFor('data_order_records')
    expect(records?.behaviour).toBe('strip')
    expect(records?.userColumn).toBe('source_user_id')
    // A nulled foreign key beside an intact payload is not anonymization.
    expect(records?.strippedColumns).toContain('payload')
    expect(records?.strippedColumns).toContain('source_user_id')
  })

  it('keeps the deletion receipt out of the residue sweep', () => {
    const swept = tablesRequiringNoResidue().map((entry) => entry.table)
    expect(swept).not.toContain('deletion_receipts')
    expect(swept).toContain('vault_data')
    expect(swept).toContain('issued_credentials')
    expect(swept).toContain('data_order_records')
  })
})

describe('residual disclosures', () => {
  it('names the payment provider, because we cannot erase their records', () => {
    expect(RESIDUAL_DISCLOSURES.some((entry) => entry.holder === 'Stripe')).toBe(true)
  })

  it('explains every residual rather than just listing it', () => {
    for (const entry of RESIDUAL_DISCLOSURES) {
      expect(entry.why.length).toBeGreaterThan(30)
      expect(entry.what.length).toBeGreaterThan(10)
    }
  })
})
