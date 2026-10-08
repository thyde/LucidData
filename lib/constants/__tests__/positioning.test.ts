import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { TIERS } from '@/components/marketing/pricing-table'
import { MARKETPLACE_RESTRICTED_CATEGORIES } from '@luciddata/core/validations/marketplace'

// LD-111: the public site leads with keeping health records, not with selling data.
// These checks hold the copy to that position so it cannot drift back.

const ROOT = process.cwd()
const LEGAL_PAGES = join(ROOT, 'app', '(marketing)', 'legal')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || path === LEGAL_PAGES ? [] : sourceFiles(path)
    }
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

/** Every page or component a visitor sees before signing in, plus the first-run copy. */
const PUBLIC_COPY = [
  ...sourceFiles(join(ROOT, 'components', 'marketing')),
  ...sourceFiles(join(ROOT, 'app', '(marketing)')),
  join(ROOT, 'app', 'layout.tsx'),
  join(ROOT, 'components', 'onboarding', 'onboarding-wizard.tsx'),
  join(ROOT, 'public', 'manifest.json'),
]

const EARNINGS_PITCH: RegExp[] = [
  /\bearn(s|ed|ing|ings)?\b/i,
  /\bget paid\b/i,
  /\bincome\b/i,
  /\bprofits?\b/i,
  /\bpassive\b/i,
  /\bsee a cent\b/i,
  /\bmonetiz/i,
  /\bmost popular\b/i,
  // "We never sell your health data" is a promise, not a pitch.
  /(?<!(never|not) )\bsell (your|on your)\b/i,
]

describe('public positioning', () => {
  it('reads the copy from the files that exist', () => {
    expect(PUBLIC_COPY.length).toBeGreaterThan(8)
    expect(PUBLIC_COPY.some((file) => file.startsWith(LEGAL_PAGES))).toBe(false)
  })

  it('does not pitch selling data or earnings', () => {
    for (const file of PUBLIC_COPY) {
      const text = readFileSync(file, 'utf8')
      for (const pattern of EARNINGS_PITCH) {
        expect(text, `${relative(ROOT, file)} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('keeps the copy free of dashes and curly quotes', () => {
    for (const file of PUBLIC_COPY) {
      const text = readFileSync(file, 'utf8')
      expect(text, relative(ROOT, file)).not.toMatch(/[\u2013\u2014\u2018\u2019\u201C\u201D]/)
    }
  })

  it('uses the LucidData name rather than the old short one', () => {
    for (const file of PUBLIC_COPY) {
      const text = readFileSync(file, 'utf8')
      expect(text, relative(ROOT, file)).not.toMatch(/\bLucid\b(?!Data)/)
    }
  })

  it('leads the home page with health records', () => {
    const sections = readFileSync(join(ROOT, 'components', 'marketing', 'sections.tsx'), 'utf8')
    expect(sections).toMatch(/<h1[^>]*>\s*Your health history/)
  })

  it('names the app LucidData when installed', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'public', 'manifest.json'), 'utf8'))
    expect(manifest.name).toBe('LucidData')
    expect(manifest.short_name).toBe('LucidData')
    expect(manifest.categories[0]).toBe('health')
  })
})

describe('pricing tiers', () => {
  it('features the free individual vault first and ranks no tier as popular', () => {
    expect(TIERS[0].name).toBe('Individual')
    expect(TIERS[0].price).toBe('Free')
    expect(TIERS.filter((tier) => tier.primary).map((tier) => tier.name)).toEqual(['Individual'])
  })

  it('tells data buyers which categories are never for sale', () => {
    const buyer = TIERS.find((tier) => tier.name === 'Data buyer')
    const restriction = buyer?.features.find((feature) => feature.endsWith('are never for sale'))
    expect(restriction).toBeDefined()
    for (const category of MARKETPLACE_RESTRICTED_CATEGORIES) {
      expect(restriction?.toLowerCase()).toContain(category)
    }
  })
})
