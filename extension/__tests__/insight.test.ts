import { describe, it, expect } from 'vitest'
import {
  analysePage,
  mergeIntoProfile,
  summariseProfile,
  toVaultRecord,
} from '@/extension/src/insight.js'
import { classifyTracker, companiesFor } from '@/extension/src/trackers.js'

const NOW = new Date('2026-07-26T12:00:00.000Z').getTime()

interface Collector {
  domain: string
  company: string | null
  category: string
  requests: number
}

interface PageReport {
  skipped: boolean
  reason?: string
  site?: string
  seenAt?: number
  collectors?: Collector[]
  knownCount?: number
  unknownCount?: number
}

/** Analyse and assert a report came back, so each test reads as one idea. */
function reported(page: string, resources: string[]): Required<Omit<PageReport, 'reason'>> {
  const result = analysePage(page, resources, NOW) as PageReport | null
  expect(result).not.toBeNull()
  expect(result!.skipped).toBe(false)
  return result as Required<Omit<PageReport, 'reason'>>
}

/**
 * A page with a known set of third parties, used as the detection fixture.
 * Deliberately mixes a first-party asset, a recognized collector, an
 * unrecognized third party, and a non-network scheme.
 */
const FIXTURE_PAGE = 'https://news.example.com/politics/story'
const FIXTURE_RESOURCES = [
  'https://news.example.com/assets/app.js',
  'https://cdn.news.example.com/img/hero.jpg',
  'https://www.google-analytics.com/collect?v=2&tid=G-ABC',
  'https://www.googletagmanager.com/gtm.js?id=GTM-XYZ',
  'https://connect.facebook.net/en_US/fbevents.js',
  'https://static.doubleclick.net/instream/ad_status.js',
  'https://widgets.unknownvendor.example.org/w.js',
  'data:image/gif;base64,R0lGOD',
]

describe('analysePage', () => {
  it('identifies the third parties on a page and names the ones it knows', () => {
    const result = reported(FIXTURE_PAGE, FIXTURE_RESOURCES)

    expect(result.site).toBe('example.com')

    const domains = result.collectors.map((entry) => entry.domain)
    expect(domains).toContain('google-analytics.com')
    expect(domains).toContain('googletagmanager.com')
    expect(domains).toContain('facebook.net')
    expect(domains).toContain('doubleclick.net')
    // Subdomains collapse, so the unknown vendor is recorded by its
    // organization rather than by which of its products was loaded.
    expect(domains).toContain('example.org')
  })

  it('does not count a first-party asset as a collector', () => {
    const result = reported(FIXTURE_PAGE, FIXTURE_RESOURCES)
    expect(result.collectors.map((entry) => entry.domain)).not.toContain('example.com')
  })

  it('counts an unrecognized third party without inventing a company for it', () => {
    const result = reported(FIXTURE_PAGE, FIXTURE_RESOURCES)
    const unknown = result.collectors.find((entry) => entry.domain === 'example.org')!
    expect(unknown.company).toBeNull()
    expect(unknown.category).toBe('unknown')
    expect(result.unknownCount).toBe(1)
    expect(result.knownCount).toBe(4)
  })

  it('ignores a data URI, which is not a request to anyone', () => {
    const result = reported(FIXTURE_PAGE, FIXTURE_RESOURCES)
    expect(result.collectors.some((entry) => entry.domain?.includes('data'))).toBe(false)
  })

  it('records nothing at all for a sensitive site', () => {
    const result = analysePage(
      'https://www.nhs.uk/conditions/depression',
      FIXTURE_RESOURCES,
      NOW
    ) as PageReport
    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('health')
    // Not a filtered record. There is no record.
    expect(result.site).toBeUndefined()
    expect(result.collectors).toBeUndefined()
  })

  it('refuses a page that has no registrable domain', () => {
    expect(analysePage('chrome://extensions', FIXTURE_RESOURCES, NOW)).toBeNull()
    expect(analysePage('http://localhost:3000/vault', [], NOW)).toBeNull()
  })

  it('counts repeat requests to the same collector', () => {
    const result = reported(FIXTURE_PAGE, [
      'https://www.google-analytics.com/collect?a=1',
      'https://www.google-analytics.com/collect?a=2',
      'https://ssl.google-analytics.com/collect?a=3',
    ])
    const ga = result.collectors.find((entry) => entry.domain === 'google-analytics.com')!
    expect(ga.requests).toBe(3)
  })

  it('handles a page with no third parties', () => {
    const result = reported(FIXTURE_PAGE, ['https://news.example.com/a.js'])
    expect(result.collectors).toEqual([])
    expect(result.knownCount).toBe(0)
  })
})

describe('mergeIntoProfile', () => {
  it('builds a running profile across pages', () => {
    let profile = mergeIntoProfile(null, analysePage(FIXTURE_PAGE, FIXTURE_RESOURCES, NOW))
    profile = mergeIntoProfile(
      profile,
      analysePage('https://shop.other.test/item', ['https://www.google-analytics.com/c'], NOW)
    )

    expect(profile.pagesSeen).toBe(2)
    expect(Object.keys(profile.sites).sort()).toEqual(['example.com', 'other.test'])
    expect(profile.collectors['google-analytics.com'].sites).toBe(2)
    expect(profile.collectors['doubleclick.net'].sites).toBe(1)
  })

  it('does not inflate reach when the same site is visited twice', () => {
    let profile = mergeIntoProfile(null, analysePage(FIXTURE_PAGE, FIXTURE_RESOURCES, NOW))
    profile = mergeIntoProfile(profile, analysePage(FIXTURE_PAGE, FIXTURE_RESOURCES, NOW))

    expect(profile.sites['example.com'].visits).toBe(2)
    expect(profile.collectors['google-analytics.com'].sites).toBe(1)
  })

  it('counts a skipped sensitive site without recording which one', () => {
    const profile = mergeIntoProfile(
      null,
      analysePage('https://nhs.uk/conditions/x', FIXTURE_RESOURCES, NOW)
    )
    expect(profile.skipped).toBe(1)
    expect(Object.keys(profile.sites)).toEqual([])
    expect(JSON.stringify(profile)).not.toContain('nhs')
  })

  it('stores nothing that could hold a path or a title', () => {
    const profile = mergeIntoProfile(null, analysePage(FIXTURE_PAGE, FIXTURE_RESOURCES, NOW))
    const serialized = JSON.stringify(profile)
    expect(serialized).not.toContain('/politics/')
    expect(serialized).not.toContain('story')
    expect(serialized).not.toContain('gtm.js')
    expect(serialized).not.toContain('?')
  })
})

describe('summariseProfile', () => {
  it('reports reach by company, not by domain', () => {
    let profile = mergeIntoProfile(null, analysePage(FIXTURE_PAGE, FIXTURE_RESOURCES, NOW))
    profile = mergeIntoProfile(
      profile,
      analysePage('https://a.test/p', ['https://www.google-analytics.com/c'], NOW)
    )
    profile = mergeIntoProfile(
      profile,
      analysePage('https://b.test/p', ['https://static.doubleclick.net/x'], NOW)
    )

    const summary = summariseProfile(profile)
    expect(summary.siteCount).toBe(3)
    expect(summary.topCompany.company).toBe('Google')
    // Google appears through several domains, counted once as a company.
    expect(summary.topCompany.domains.length).toBeGreaterThan(1)
  })

  it('labels an unidentified third party rather than dropping it', () => {
    const profile = mergeIntoProfile(
      null,
      analysePage(FIXTURE_PAGE, ['https://widgets.unknownvendor.example.org/w.js'], NOW)
    )
    const summary = summariseProfile(profile)
    expect(summary.companies[0].company).toBe('Unidentified third party')
    expect(summary.companies[0].identified).toBe(false)
  })

  it('handles an empty profile', () => {
    const summary = summariseProfile(null)
    expect(summary.siteCount).toBe(0)
    expect(summary.topCompany).toBeNull()
    expect(summary.reach).toBe(0)
  })
})

describe('toVaultRecord', () => {
  it('produces counts and categories, never a site list', () => {
    let profile = mergeIntoProfile(null, analysePage(FIXTURE_PAGE, FIXTURE_RESOURCES, NOW))
    profile = mergeIntoProfile(
      profile,
      analysePage('https://a.test/p', ['https://www.google-analytics.com/c'], NOW)
    )

    const record = toVaultRecord(profile, NOW)
    expect(record.sites_visited).toBe(2)
    expect(record.top_collector).toBe('Google')
    expect(record.top_collector_reach).toBe(100)
    expect(record.source).toBe('lucid-extension')

    const serialized = JSON.stringify(record)
    expect(serialized).not.toContain('example.com')
    expect(serialized).not.toContain('a.test')
  })

  it('counts collectors by what they are for', () => {
    const profile = mergeIntoProfile(
      null,
      analysePage(FIXTURE_PAGE, [
        'https://www.google-analytics.com/c',
        'https://static.doubleclick.net/x',
        'https://fpjs.io/agent',
      ], NOW)
    )
    const record = toVaultRecord(profile, NOW)
    expect(record.advertising_collectors).toBeGreaterThanOrEqual(1)
    expect(record.analytics_collectors).toBeGreaterThanOrEqual(1)
    expect(record.fingerprinting_collectors).toBe(1)
  })
})

describe('classifyTracker', () => {
  it('maps several domains of one company to that company', () => {
    expect(classifyTracker('doubleclick.net').company).toBe('Google')
    expect(classifyTracker('google-analytics.com').company).toBe('Google')
    expect(classifyTracker('googletagmanager.com').company).toBe('Google')
  })

  it('returns nothing for an unknown domain rather than guessing', () => {
    expect(classifyTracker('unknownvendor.example.org')).toBeNull()
    expect(classifyTracker(null)).toBeNull()
  })

  it('groups domains under the company a rights request would name', () => {
    const companies = companiesFor(['doubleclick.net', 'google-analytics.com', 'criteo.com'])
    const google = companies.find((entry) => entry.company === 'Google')
    expect(google.domains.sort()).toEqual(['doubleclick.net', 'google-analytics.com'])
    expect(companies).toHaveLength(2)
  })
})
