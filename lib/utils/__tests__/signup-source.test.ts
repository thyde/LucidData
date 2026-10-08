import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { SIGNUP_SOURCES, signupSourceFrom } from '@/lib/utils/signup-source'

describe('signupSourceFrom', () => {
  it('accepts each known source', () => {
    expect(signupSourceFrom('verify')).toBe('verify')
    expect(signupSourceFrom('extension')).toBe('extension')
  })

  it('drops anything else', () => {
    expect(signupSourceFrom(null)).toBeUndefined()
    expect(signupSourceFrom(undefined)).toBeUndefined()
    expect(signupSourceFrom('')).toBeUndefined()
    expect(signupSourceFrom('direct')).toBeUndefined()
    expect(signupSourceFrom('Verify')).toBeUndefined()
    expect(signupSourceFrom('verify,extension')).toBeUndefined()
  })

  it('matches the allowlist the database enforces', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20261006120000_product_metrics.sql'),
      'utf8'
    )
    const trigger = migration.match(/source NOT IN \(([^)]*)\)/)
    expect(trigger).not.toBeNull()
    const allowed = [...trigger![1].matchAll(/'([a-z_]+)'/g)].map((match) => match[1])
    expect(allowed).toEqual([...SIGNUP_SOURCES])
  })
})
