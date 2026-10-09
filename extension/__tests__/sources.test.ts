import { describe, it, expect } from 'vitest'
import { EXPORT_SOURCES, matchExportSource } from '@/extension/src/sources.js'
import { EXPORT_ADAPTERS } from '@luciddata/core/vault/adapters'
import { EXPORT_READERS } from '@luciddata/core/vault/archive'

interface Source {
  id: string
  label: string
  adapterId: string
  fileTypes: string[]
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

  it('recognizes an Apple Health export by its file name', () => {
    // The export is made on the phone, so it reaches the browser as an
    // attachment or a shared file, from no particular host.
    const match = matchExportSource(
      'https://mail.example.test/attachment?id=1',
      '/home/me/Downloads/export.zip'
    )
    expect(match?.id).toBe('apple-health')
  })

  it('does not take an Apple privacy download for a Health export', () => {
    // privacy.apple.com does not include Health data.
    expect(
      matchExportSource('https://privacy.apple.com/download/xyz', '/home/me/Downloads/apple-data.zip')
    ).toBeNull()
  })

  it('takes no activity download from Strava or Garmin for an account export', () => {
    // Both sites serve single activities as files the matcher would accept.
    expect(
      matchExportSource('https://connect.garmin.com/download-service/files/activity/123', '/downloads/123.zip')
    ).toBeNull()
    expect(matchExportSource('https://www.strava.com/activities/123/export_original', '/downloads/123.zip')).toBeNull()
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

  it('backs every walkthrough with an adapter that can read the result', () => {
    // LD-203 closing the last LD-205 criterion. A walkthrough talks someone
    // through an export request that can take hours, and Google's takes days.
    // Doing that and then failing to read the file is worse than never having
    // offered, so the link is checked rather than assumed. LD-210 readers
    // count too: they read the zip archives the adapters cannot.
    const adapterIds = new Set([
      ...EXPORT_ADAPTERS.map((adapter) => adapter.id),
      ...EXPORT_READERS.map((reader) => reader.id),
    ])

    for (const source of sources) {
      expect(adapterIds, `${source.id} has no adapter`).toContain(source.adapterId)
    }
  })

  it('tells the user which file type to end up with', () => {
    // The download is usually a zip. Saying which file inside it matters is the
    // difference between a walkthrough that completes and one that stops at the
    // last step.
    for (const source of sources) {
      expect(source.fileTypes.length).toBeGreaterThan(0)
      for (const type of source.fileTypes) {
        expect(type).toMatch(/^\.[a-z]+$/)
      }
    }
  })
})
