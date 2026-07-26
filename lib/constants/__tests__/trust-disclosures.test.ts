import { describe, it, expect } from 'vitest'
import { readdirSync } from 'fs'
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
} from '@/lib/constants/trust-disclosures'

const CRYPTO_DIR = join(process.cwd(), 'lib', 'crypto')

function cryptoModules(): string[] {
  return readdirSync(CRYPTO_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => entry.name)
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

  it('lists exactly the unencrypted vault_data columns', () => {
    expect(SERVER_VISIBLE_VAULT_METADATA.map((row) => row.column).sort()).toEqual([
      'category',
      'label',
      'schema_type',
      'tags',
    ])
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
    })
    expect(copy).not.toContain('\u2014')
  })
})
