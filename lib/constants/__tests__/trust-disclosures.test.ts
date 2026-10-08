import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  KEY_CUSTODY,
  KEY_HOLDER_LABEL,
  SERVER_VISIBLE_VAULT_METADATA,
  CERTIFICATIONS,
  SUBPROCESSORS,
  REVOCATION_LIMIT,
  VULNERABILITY_DISCLOSURE,
  THREAT_MODEL,
  PRODUCT_MEASUREMENT,
} from '@/lib/constants/trust-disclosures'
import { SIGNUP_SOURCES, type SignupSource } from '@/lib/utils/signup-source'

const CRYPTO_DIR = join(process.cwd(), 'lib', 'crypto')
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function cryptoModules(): string[] {
  return readdirSync(CRYPTO_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => entry.name)
}

/** The columns vault_data has after every migration, in file order. */
function vaultDataColumns(): string[] {
  const columns = new Set<string>()
  const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort()
  const table = String.raw`(?:public\.)?"?vault_data"?`
  const ignore = new Set(['constraint', 'primary', 'unique', 'check', 'foreign', 'exclude'])

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replace(/--[^\n]*/g, '')

    const create = new RegExp(String.raw`CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${table}\s*\(([\s\S]*?)\n\);`, 'i').exec(sql)
    if (create) {
      for (const line of create[1].split('\n')) {
        const name = /^\s*"?([a-z_][a-z0-9_]*)"?\s+/i.exec(line)?.[1]?.toLowerCase()
        if (name && !ignore.has(name)) columns.add(name)
      }
    }

    const alters = new RegExp(String.raw`ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?${table}([\s\S]*?);`, 'gi')
    for (const alter of sql.matchAll(alters)) {
      for (const added of alter[1].matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
        columns.add(added[1].toLowerCase())
      }
      for (const dropped of alter[1].matchAll(/DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
        columns.delete(dropped[1].toLowerCase())
      }
    }
  }
  return [...columns]
}

describe('trust disclosures', () => {
  it('discloses every module in lib/crypto', () => {
    const disclosed = new Set(KEY_CUSTODY.map((entry) => entry.module))
    const undisclosed = cryptoModules().filter((name) => !disclosed.has(name))
    expect(undisclosed).toEqual([])
  })

  it('does not disclose a module that no longer exists', () => {
    const present = new Set(cryptoModules())
    const stale = KEY_CUSTODY.map((entry) => entry.module).filter(
      (name) => !present.has(name)
    )
    expect(stale).toEqual([])
  })

  it('names a holder and a note for every key', () => {
    for (const entry of KEY_CUSTODY) {
      expect(entry.material.length).toBeGreaterThan(0)
      expect(KEY_HOLDER_LABEL[entry.heldBy]).toBeTruthy()
      expect(entry.derivedOrGenerated.length).toBeGreaterThan(0)
      expect(entry.note.length).toBeGreaterThan(0)
    }
  })

  it('states that the master key and per-entry keys stay in the browser', () => {
    const master = KEY_CUSTODY.find((entry) => entry.module === 'key-derivation.ts')
    const dek = KEY_CUSTODY.find((entry) => entry.module === 'client-crypto.ts')
    expect(master?.heldBy).toBe('user_browser')
    expect(dek?.heldBy).toBe('user_browser')
  })

  it('discloses every readable vault_data column, derived from the migrations', () => {
    // Everything except the row's own identifiers and the encrypted envelope is
    // readable by the server, so it has to appear on the trust centre.
    const notMetadata = new Set(['id', 'user_id', 'client_ciphertext', 'encrypted_dek', 'dek_salt'])
    const readable = vaultDataColumns().filter((column) => !notMetadata.has(column))
    expect(readable).toContain('description')
    expect(SERVER_VISIBLE_VAULT_METADATA.map((row) => row.column).sort()).toEqual(readable.sort())
  })

  it('states the PBKDF2 iteration count the code uses', () => {
    const source = ['key-derivation.ts', 'recovery.ts']
      .map((file) => readFileSync(join(CRYPTO_DIR, file), 'utf8'))
      .join('\n')
    const used = new Set(
      [...source.matchAll(/iterations:\s*([\d_]+)/g)].map((match) => Number(match[1].replace(/_/g, '')))
    )
    expect(used.size).toBe(1)
    const [iterations] = [...used]
    const stated = [
      ...KEY_CUSTODY.map((entry) => entry.derivedOrGenerated),
      ...THREAT_MODEL.map((row) => row.residual),
    ]
      .flatMap((text) => [...text.matchAll(/([\d,]+) (iterations|rounds)/g)])
      .map((match) => Number(match[1].replace(/,/g, '')))
    expect(stated.length).toBeGreaterThan(1)
    for (const count of stated) expect(count).toBe(iterations)
  })

  it('states that revocation cannot recall a delivered copy', () => {
    expect(REVOCATION_LIMIT).toMatch(/cannot recall/i)
  })

  it('never claims a standard is both achieved and in progress', () => {
    const byStandard = new Map<string, string[]>()
    for (const item of CERTIFICATIONS) {
      byStandard.set(item.standard, [...(byStandard.get(item.standard) ?? []), item.state])
    }
    for (const [, states] of byStandard) {
      expect(states).toHaveLength(1)
    }
  })

  it('publishes a vulnerability disclosure contact', () => {
    expect(VULNERABILITY_DISCLOSURE.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)
    expect(VULNERABILITY_DISCLOSURE.policy.length).toBeGreaterThan(0)
  })

  it('states what each subprocessor handles', () => {
    expect(SUBPROCESSORS.length).toBeGreaterThan(0)
    for (const processor of SUBPROCESSORS) {
      expect(processor.role.length).toBeGreaterThan(0)
      expect(processor.dataHandled.length).toBeGreaterThan(0)
    }
  })

  it('pairs every threat with a residual risk rather than only a mitigation', () => {
    expect(THREAT_MODEL.length).toBeGreaterThan(0)
    for (const row of THREAT_MODEL) {
      expect(row.mitigation.length).toBeGreaterThan(0)
      expect(row.residual.length).toBeGreaterThan(0)
    }
  })

  it('keeps the copy free of em dashes', () => {
    const copy = JSON.stringify({
      KEY_CUSTODY,
      SERVER_VISIBLE_VAULT_METADATA,
      CERTIFICATIONS,
      SUBPROCESSORS,
      REVOCATION_LIMIT,
      VULNERABILITY_DISCLOSURE,
      THREAT_MODEL,
      PRODUCT_MEASUREMENT,
    })
    expect(copy).not.toContain('\u2014')
  })

  it('discloses every place a sign-up source can come from', () => {
    // Adding a source to the allowlist without saying so on /trust would mean
    // recording something the trust centre does not mention.
    const named: Record<SignupSource, RegExp> = {
      verify: /credential check/i,
      extension: /browser extension/i,
    }
    const disclosure = PRODUCT_MEASUREMENT.find((row) => row.measure === 'Where you signed up from')
    expect(disclosure).toBeDefined()
    for (const source of SIGNUP_SOURCES) {
      expect(disclosure?.how).toMatch(named[source])
    }
  })
})
