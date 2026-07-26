import { describe, it, expect } from 'vitest'
import { EXPORT_SOURCES, matchExportSource } from '@/extension/src/sources.js'

interface Source {
  id: string
  label: string
  requestUrl: string | null
  urlPatterns: string[]
  filenamePatterns: string[]
  steps: string[]
}

const sources = EXPORT_SOURCES as Source[]

/**
 * LD-205 export detection.
 *
 * Two failure modes matter and they are not symmetric. Missing a real export
 * is a small annoyance. Matching an ordinary download means offering to import
 * something private that was never meant for the vault, so the matcher stays
 * conservative and these tests hold it there.
 */
describe('matchExportSource', () => {
  it('recognizes a Google Takeout archive by its host', () => {
    const match = matchExportSource(
      'https://takeout.google.com/settings/takeout/download?j=abc',
      'C:\\Users\\me\\Downloads\\takeout-20260726.zip'
    )
    expect(match?.id).toBe('google-takeout')
  })

  it('recognizes an Apple privacy export by its host', () => {
    const match = matchExportSource(
      'https://privacy.apple.com/download/xyz',
      '/home/me/Downloads/apple-data.zip'
    )
    expect(match?.id).toBe('apple-health')
  })

  it('falls back to the file name when the host says nothing', () => {
    const match = matchExportSource(
      'https://secure.examplebank.test/download',
      '/home/me/Downloads/transactions-2026.csv'
    )
    expect(match?.id).toBe('bank-csv')
  })

  it('ignores a file with no export-shaped extension', () => {
    expect(
      matchExportSource('https://takeout.google.com/download', '/downloads/takeout.pdf')
    ).toBeNull()
  })

  it('ignores an ordinary download from an unrelated site', () => {
    expect(
      matchExportSource('https://example.test/holiday.zip', '/downloads/holiday.zip')
    ).toBeNull()
  })

  it('does not match a photo, a document, or an installer', () => {
    for (const [url, file] of [
      ['https://example.test/a.jpg', '/downloads/beach.jpg'],
      ['https://example.test/a.docx', '/downloads/contract.docx'],
      ['https://example.test/a.exe', '/downloads/setup.exe'],
    ]) {
      expect(matchExportSource(url, file)).toBeNull()
    }
  })

  it('survives a malformed URL rather than throwing', () => {
    expect(matchExportSource('not a url', '/downloads/statement.csv')?.id).toBe('bank-csv')
    expect(matchExportSource('', '/downloads/nothing.zip')).toBeNull()
  })

  it('matches on the host, not the whole URL, so a query string cannot trigger it', () => {
    // A URL that merely mentions takeout must not count as a Takeout export.
    expect(
      matchExportSource('https://example.test/d?ref=takeout.google.com', '/downloads/a.zip')
    ).toBeNull()
  })

  it('handles a missing file name', () => {
    expect(matchExportSource('https://takeout.google.com/download', '')).toBeNull()
  })
})

describe('export walkthroughs', () => {
  it('gives every source usable steps', () => {
    expect(sources.length).toBeGreaterThan(0)
    for (const source of sources) {
      expect(source.label.length).toBeGreaterThan(0)
      expect(source.steps.length).toBeGreaterThanOrEqual(3)
      for (const step of source.steps) {
        expect(step.length).toBeGreaterThan(15)
      }
    }
  })

  it('tells the user to choose CSV over PDF for a bank export', () => {
    const bank = sources.find((source) => source.id === 'bank-csv')
    expect(bank!.steps.join(' ')).toMatch(/CSV rather than PDF/i)
  })

  it('never claims to perform the export on the user behalf', () => {
    for (const source of sources) {
      const joined = source.steps.join(' ').toLowerCase()
      expect(joined).not.toMatch(/we will (download|request|fetch)/)
    }
  })
})
