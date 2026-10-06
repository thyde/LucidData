import { describe, it, expect } from 'vitest'
import { safeRedirectPath } from '@/lib/utils/safe-redirect'

describe('safeRedirectPath', () => {
  it('keeps a path on this site, with its query', () => {
    expect(safeRedirectPath('/vault')).toBe('/vault')
    expect(safeRedirectPath('/consent?tab=active')).toBe('/consent?tab=active')
  })

  it('falls back when there is no value', () => {
    expect(safeRedirectPath(null)).toBe('/dashboard')
    expect(safeRedirectPath('')).toBe('/dashboard')
  })

  it.each([
    'https://evil.example',
    'http://evil.example/dashboard',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    '/\t/evil.example',
    '/\n/evil.example',
    'evil.example',
  ])('refuses %j', (value) => {
    expect(safeRedirectPath(value)).toBe('/dashboard')
  })
})
