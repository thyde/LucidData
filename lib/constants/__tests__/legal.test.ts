import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import {
  ACCOUNT_DELETION_PATH,
  HEALTH_DATA_CONSENT_VERSION,
  HEALTH_SCHEMA_TYPES,
  INDIVIDUAL_DOCUMENTS,
  LEGAL_DOCUMENTS,
  isCurrent,
  isHealthEntry,
  isVersion,
  outstandingDocuments,
} from '@/lib/constants/legal'

const LEGAL_PAGES = join(process.cwd(), 'app', '(marketing)', 'legal')

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return pageFiles(path)
    return name === 'page.tsx' ? [path] : []
  })
}

describe('legal documents', () => {
  it('versions every document by the date it took effect', () => {
    for (const document of Object.values(LEGAL_DOCUMENTS)) {
      expect(isVersion(document.version), document.id).toBe(true)
      expect(Number.isNaN(Date.parse(document.version))).toBe(false)
    }
  })

  it('publishes each document at a page that exists', () => {
    for (const document of Object.values(LEGAL_DOCUMENTS)) {
      expect(document.path.startsWith('/legal/')).toBe(true)
      const page = join(LEGAL_PAGES, document.path.replace('/legal/', ''), 'page.tsx')
      expect(existsSync(page), `${document.path} has no page`).toBe(true)
      // The page must render this document's own header, so its date is shown.
      expect(readFileSync(page, 'utf8')).toContain(`<LegalDocument id="${document.id}">`)
    }
    expect(existsSync(join(LEGAL_PAGES, ACCOUNT_DELETION_PATH.replace('/legal/', ''), 'page.tsx'))).toBe(
      true
    )
  })

  it('ties health data consent to the health privacy policy it refers to', () => {
    expect(HEALTH_DATA_CONSENT_VERSION).toBe(LEGAL_DOCUMENTS['health-privacy'].version)
  })

  it('keeps the copy free of dashes, curly quotes, and earnings promises', () => {
    for (const file of pageFiles(LEGAL_PAGES)) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/[\u2013\u2014\u2018\u2019\u201C\u201D]/)
      expect(text, file).not.toMatch(/earn (money|an income|a living)/i)
    }
  })
})

describe('outstandingDocuments', () => {
  const current = {
    terms: LEGAL_DOCUMENTS.terms.version,
    privacy: LEGAL_DOCUMENTS.privacy.version,
  }

  it('asks a new account to accept both documents', () => {
    expect(outstandingDocuments({})).toEqual([...INDIVIDUAL_DOCUMENTS])
  })

  it('asks for nothing when the current versions are accepted', () => {
    expect(outstandingDocuments(current)).toEqual([])
  })

  it('asks again for a document whose accepted version is stale', () => {
    expect(outstandingDocuments({ ...current, privacy: '2020-01-01' })).toEqual(['privacy'])
  })

  it('treats a missing or empty record as not accepted', () => {
    expect(outstandingDocuments({ terms: null, privacy: current.privacy })).toEqual(['terms'])
    expect(isCurrent(undefined, current.terms)).toBe(false)
    expect(isCurrent('', current.terms)).toBe(false)
  })
})

describe('isHealthEntry', () => {
  it('reads the health schema types from the schema registry', () => {
    expect(HEALTH_SCHEMA_TYPES).toEqual(
      expect.arrayContaining(['medical_basic', 'fitness_activity', 'fitness_daily'])
    )
    expect(HEALTH_SCHEMA_TYPES).not.toContain('employment')
  })

  it('counts the health category or a health type, and nothing else', () => {
    expect(isHealthEntry({ category: 'health' })).toBe(true)
    expect(isHealthEntry({ category: 'personal', schema_type: 'fitness_daily' })).toBe(true)
    // LD-209: the new shapes need consent wherever they are filed.
    for (const schema_type of ['sleep_session', 'vitals_daily', 'body_measurement', 'nutrition_daily']) {
      expect(isHealthEntry({ category: 'other', schema_type })).toBe(true)
    }
    expect(isHealthEntry({ category: 'credentials', schema_type: 'education' })).toBe(false)
    expect(isHealthEntry({})).toBe(false)
  })
})
