import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  isSensitiveDomain,
  registrableDomain,
  sensitiveCategory,
  toStorableDomain,
} from '@/extension/src/url-safety.js'

/**
 * LD-206: only a registrable domain is ever kept.
 *
 * These are adversarial on purpose. A query string carrying a session token or
 * an email address is not a hypothetical; it is what real URLs look like, and
 * the whole feature is discredited if one ends up stored.
 */
describe('toStorableDomain', () => {
  it('keeps the registrable domain and nothing else', () => {
    expect(toStorableDomain('https://www.example.com/articles/anxiety?utm=x#top')).toBe(
      'example.com'
    )
  })

  it('discards a path that names what was read', () => {
    const stored = toStorableDomain(
      'https://news.example.com/health/2026/how-to-tell-your-family-you-are-ill'
    )
    expect(stored).toBe('example.com')
    expect(stored).not.toMatch(/how-to-tell/)
  })

  it('discards a query string carrying a session token', () => {
    // A realistic hostile URL, with a deliberately synthetic token so this
    // fixture cannot trip a secret scanner.
    const stored = toStorableDomain(
      'https://shop.example.com/checkout?sid=eyJhbGciOiJIUzI1NiJ9.abc.def&api_key=EXAMPLE_NOT_A_REAL_KEY'
    )
    expect(stored).toBe('example.com')
    expect(stored).not.toMatch(/sid|api_key|eyJ|EXAMPLE_NOT/)
  })

  it('discards a query string carrying an email address', () => {
    const stored = toStorableDomain('https://example.com/verify?email=sam.jones%40example.org')
    expect(stored).toBe('example.com')
    expect(stored).not.toMatch(/sam|jones|@|%40/)
  })

  it('discards a fragment', () => {
    expect(toStorableDomain('https://example.com/page#access_token=abc123')).toBe('example.com')
  })

  it('discards embedded credentials rather than storing a username', () => {
    const stored = toStorableDomain('https://sam:hunter2@example.com/inbox')
    expect(stored).toBe('example.com')
    expect(stored).not.toMatch(/sam|hunter2/)
  })

  it('collapses a subdomain, which would say which product was used', () => {
    expect(toStorableDomain('https://patient-portal.hospital.example.com/x')).toBe('example.com')
  })

  it('handles a multi-part public suffix', () => {
    expect(toStorableDomain('https://www.bbc.co.uk/news')).toBe('bbc.co.uk')
    expect(toStorableDomain('https://shop.example.com.au/cart')).toBe('example.com.au')
  })

  it('refuses a non-network scheme', () => {
    for (const url of [
      'file:///home/sam/private/diary.txt',
      'chrome-extension://abc/options.html',
      'data:text/html,<script>alert(1)</script>',
      'javascript:alert(1)',
      'about:blank',
    ]) {
      expect(toStorableDomain(url)).toBeNull()
    }
  })

  it('refuses an IP address, which is an address rather than an organization', () => {
    expect(toStorableDomain('http://192.168.1.14/router')).toBeNull()
    expect(toStorableDomain('http://[2001:db8::1]/x')).toBeNull()
  })

  it('refuses localhost and a bare hostname', () => {
    expect(toStorableDomain('http://localhost:3000/vault')).toBeNull()
    expect(toStorableDomain('http://intranet/payroll')).toBeNull()
  })

  it('survives malformed input rather than throwing', () => {
    for (const value of ['', 'not a url', null, undefined, 42, {}]) {
      expect(toStorableDomain(value as string)).toBeNull()
    }
  })

  it('never returns a value containing a path, query, or fragment separator', () => {
    const urls = [
      'https://a.example.com/x/y?z=1#f',
      'https://example.co.uk/a?b=c',
      'https://sub.sub.example.org/deep/path',
    ]
    for (const url of urls) {
      const stored = toStorableDomain(url)
      expect(stored).not.toMatch(/[/?#:@]/)
    }
  })
})

describe('registrableDomain', () => {
  it('normalizes case and a trailing dot', () => {
    expect(registrableDomain('WWW.Example.COM.')).toBe('example.com')
  })

  it('refuses a single label', () => {
    expect(registrableDomain('example')).toBeNull()
  })
})

describe('sensitiveCategory', () => {
  it('names the category for a site where the visit is the disclosure', () => {
    expect(sensitiveCategory('nhs.uk')).toBe('health')
    expect(sensitiveCategory('stepchange.org')).toBe('finance')
    expect(sensitiveCategory('womensaid.org.uk')).toBe('support')
  })

  it('catches a domain whose name gives it away', () => {
    expect(sensitiveCategory('bestrehabclinic.com')).toBe('inferred')
    expect(sensitiveCategory('paydayloansfast.co.uk')).toBe('inferred')
    expect(sensitiveCategory('immigrationhelp.example.com')).toBe('inferred')
  })

  it('leaves an ordinary site alone', () => {
    expect(sensitiveCategory('bbc.co.uk')).toBeNull()
    expect(sensitiveCategory('example.com')).toBeNull()
    expect(isSensitiveDomain('news.example.org')).toBe(false)
  })

  it('treats a missing domain as not sensitive rather than throwing', () => {
    expect(sensitiveCategory(null)).toBeNull()
    expect(sensitiveCategory('')).toBeNull()
  })
})

/**
 * The claim the whole feature rests on. Prose cannot carry it, so this reads
 * the source.
 */
describe('local-only analysis', () => {
  const files = ['url-safety.js', 'trackers.js', 'insight.js']

  /**
   * Comments are stripped first. A comment that explains the rule would
   * otherwise trip the rule, which would train people to stop explaining it.
   */
  function executableSource(file: string): string {
    return readFileSync(join(process.cwd(), 'extension/src', file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
  }

  for (const file of files) {
    it(`${file} cannot make a network request`, () => {
      const source = executableSource(file)
      for (const forbidden of [
        'fetch(',
        'XMLHttpRequest',
        'sendBeacon',
        'WebSocket',
        'EventSource',
        'importScripts',
        'navigator.connection',
      ]) {
        expect(source, `${file} must not reference ${forbidden}`).not.toContain(forbidden)
      }
    })

    it(`${file} imports nothing outside the analysis modules`, () => {
      const source = executableSource(file)
      const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
      for (const specifier of imports) {
        expect(files.some((name) => specifier.endsWith(name))).toBe(true)
      }
    })
  }
})
