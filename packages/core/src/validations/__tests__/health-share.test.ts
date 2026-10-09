import { describe, expect, it } from 'vitest'
import { createHealthShareSchema, healthShareIdSchema } from '../health-share'

const valid = {
  ciphertext: 'oKGio6SlpqeoqaqrpzgPRSS5Z9tCFvK+ahuyp0qMYTymhnBM73pD9gyLGm/yRHfNmQ9jBHKvNOapL296tKNBfzHKVwseqikn',
  metrics: ['steps', 'sleep_hours'],
  rangeStart: '2026-09-01',
  rangeEnd: '2026-09-30',
  expiresInDays: 7,
}

describe('createHealthShareSchema', () => {
  it('accepts a share and drops a blank label', () => {
    expect(createHealthShareSchema.parse({ ...valid, label: '   ' })).toEqual({ ...valid, label: undefined })
    expect(createHealthShareSchema.parse({ ...valid, label: ' Dr. Patel ' }).label).toBe('Dr. Patel')
  })

  it('has no place for the key', () => {
    expect(() => createHealthShareSchema.parse({ ...valid, key: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8' })).toThrow()
  })

  const refused: [string, Record<string, unknown>][] = [
    ['no ciphertext', { ciphertext: '' }],
    ['ciphertext that is not base64', { ciphertext: 'not base64 at all, with spaces and more than forty characters' }],
    ['ciphertext too large', { ciphertext: 'A'.repeat(1_048_580) }],
    ['no figures', { metrics: [] }],
    ['a figure it does not know', { metrics: ['steps', 'secret'] }],
    ['a figure twice', { metrics: ['steps', 'steps'] }],
    ['a date that does not exist', { rangeEnd: '2026-09-31' }],
    ['a range that ends before it starts', { rangeStart: '2026-10-01' }],
    ['a range longer than a year', { rangeStart: '2025-09-01' }],
    ['an expiry it does not offer', { expiresInDays: 365 }],
    ['a label too long', { label: 'x'.repeat(81) }],
  ]
  it.each(refused)('refuses %s', (_, change) => {
    expect(createHealthShareSchema.safeParse({ ...valid, ...change }).success).toBe(false)
  })
})

describe('healthShareIdSchema', () => {
  it('takes a share id and nothing else', () => {
    expect(healthShareIdSchema.safeParse({ shareId: '00000000-0000-4000-8000-000000000001' }).success).toBe(true)
    expect(healthShareIdSchema.safeParse({ shareId: 'abc' }).success).toBe(false)
    expect(healthShareIdSchema.safeParse({ shareId: '00000000-0000-4000-8000-000000000001', userId: 'x' }).success).toBe(false)
  })
})
