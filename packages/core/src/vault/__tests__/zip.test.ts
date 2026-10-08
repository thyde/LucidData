import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { bytesSource, crc32, looksLikeZip, openZip, ZipError, type ZipArchive, type ZipFailure } from '../zip'

// Every archive here was written by an independent implementation: Python's
// zipfile (see the session's make-zip-fixtures.py, which also checks that
// Python reads its ZIP64 archive back) or .NET's Compress-Archive. Damaged and
// hostile archives are those, with bytes patched by hand.

const FIXTURES = join(__dirname, 'fixtures', 'zip')
const fixture = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, name)))
const XML = new TextDecoder().decode(fixture('export.xml'))
const README = 'Stored, not compressed.\n'

async function textOf(archive: ZipArchive, name: string): Promise<string> {
  const entry = archive.entries.find((candidate) => candidate.name === name)
  if (!entry) throw new Error(`No entry named ${name}`)
  return archive.readText(entry)
}

async function failureOf(work: Promise<unknown>): Promise<ZipFailure> {
  try {
    await work
  } catch (error) {
    if (error instanceof ZipError) return error.reason
    throw error
  }
  throw new Error('Expected the archive to be refused')
}

/** Replace every occurrence of one byte string with another of the same length. */
function patch(bytes: Uint8Array, from: string, to: string): Uint8Array {
  const find = new TextEncoder().encode(from)
  const replacement = new TextEncoder().encode(to)
  if (find.length !== replacement.length) throw new Error('A patch must keep the length')
  const out = bytes.slice()
  let replaced = 0
  for (let at = 0; at + find.length <= out.length; at++) {
    if (find.every((byte, offset) => out[at + offset] === byte)) {
      out.set(replacement, at)
      replaced++
    }
  }
  if (replaced === 0) throw new Error('Nothing to patch')
  return out
}

describe('openZip', () => {
  it('reads deflated, stored, and directory entries', async () => {
    const archive = await openZip(bytesSource(fixture('basic.zip')))

    expect(archive.entries.map((entry) => [entry.name, entry.isDirectory])).toEqual([
      ['apple_health_export/', true],
      ['apple_health_export/export.xml', false],
      ['readme.txt', false],
    ])
    expect(await textOf(archive, 'apple_health_export/export.xml')).toBe(XML)
    expect(await textOf(archive, 'readme.txt')).toBe(README)
  })

  it('streams across read boundaries without changing a byte', async () => {
    const archive = await openZip(bytesSource(fixture('basic.zip')), { chunkSize: 7 })
    const entry = archive.entries.find((candidate) => candidate.name.endsWith('export.xml'))!
    const parts: string[] = []
    for await (const part of archive.text(entry)) parts.push(part)

    expect(parts.length).toBeGreaterThan(1)
    expect(parts.join('')).toBe(XML)
  })

  it('reads an archive written with data descriptors', async () => {
    const archive = await openZip(bytesSource(fixture('descriptor.zip')))
    expect(await textOf(archive, 'apple_health_export/export.xml')).toBe(XML)
  })

  it('reads ZIP64 sizes, offsets, and end records', async () => {
    const archive = await openZip(bytesSource(fixture('zip64.zip')))
    expect(await textOf(archive, 'apple_health_export/export.xml')).toBe(XML)
    expect(await textOf(archive, 'readme.txt')).toBe(README)
  })

  it('reads an archive written by .NET', async () => {
    const archive = await openZip(bytesSource(fixture('dotnet.zip')))
    expect(await textOf(archive, 'apple_health_export/export.xml')).toBe(XML)
  })

  it('reads UTF-8 names and treats backslashes as separators', async () => {
    const unicode = await openZip(bytesSource(fixture('unicode-name.zip')))
    expect(unicode.entries[0].name).toBe('données/naïve.json')

    const windows = patch(fixture('basic.zip'), 'apple_health_export/export.xml', 'apple_health_export\\export.xml')
    const archive = await openZip(bytesSource(windows))
    expect(archive.entries.map((entry) => entry.name)).toContain('apple_health_export/export.xml')
  })

  it.each(['traversal.zip', 'traversal-backslash.zip', 'absolute.zip', 'drive.zip'])(
    'refuses %s, whose path points outside the archive',
    async (name) => {
      expect(await failureOf(openZip(bytesSource(fixture(name))))).toBe('unsafe_path')
    }
  )

  it('refuses a zip bomb before unpacking any of it', async () => {
    expect(await failureOf(openZip(bytesSource(fixture('bomb.zip'))))).toBe('too_large')
  })

  it('refuses a bomb hidden among ordinary entries', async () => {
    // The archive as a whole stays under the ratio limit; one entry does not.
    expect(await failureOf(openZip(bytesSource(fixture('bomb-hidden.zip'))))).toBe('too_large')
  })

  it('refuses an archive that unpacks to more than the limits allow', async () => {
    expect(await failureOf(openZip(bytesSource(fixture('basic.zip')), { maxRatio: 2 }))).toBe('too_large')
    expect(await failureOf(openZip(bytesSource(fixture('basic.zip')), { maxTotalSize: 100 }))).toBe(
      'too_large'
    )
    expect(await failureOf(openZip(bytesSource(fixture('basic.zip')), { maxEntries: 2 }))).toBe('too_large')
  })

  it('stops an entry that unpacks to more than it declares', async () => {
    const archive = await openZip(bytesSource(fixture('lying-size.zip')))
    expect(await failureOf(textOf(archive, 'apple_health_export/export.xml'))).toBe('too_large')
  })

  it('refuses an entry that does not match its checksum', async () => {
    const archive = await openZip(bytesSource(fixture('bad-crc.zip')))
    expect(await failureOf(textOf(archive, 'apple_health_export/export.xml'))).toBe('corrupt')
    // The other entries are still readable.
    expect(await textOf(archive, 'readme.txt')).toBe(README)
  })

  it('refuses encrypted entries and unsupported compression', async () => {
    const encrypted = await openZip(bytesSource(fixture('encrypted-flag.zip')))
    expect(await failureOf(textOf(encrypted, 'readme.txt'))).toBe('unsupported')

    const bzip2 = await openZip(bytesSource(fixture('bzip2.zip')))
    expect(await failureOf(textOf(bzip2, 'data.json'))).toBe('unsupported')
  })

  it('refuses a file that is not a zip, or one cut short', async () => {
    expect(await failureOf(openZip(bytesSource(fixture('export.xml'))))).toBe('not_zip')
    expect(await failureOf(openZip(bytesSource(new Uint8Array(4))))).toBe('not_zip')

    const whole = fixture('basic.zip')
    const truncated = whole.slice(0, 200)
    expect(await failureOf(openZip(bytesSource(truncated)))).toBe('not_zip')
    // The end record survives but the data it points at does not.
    const hollow = whole.slice()
    hollow.fill(0, 0, 400)
    const archive = await openZip(bytesSource(hollow))
    expect(await failureOf(textOf(archive, 'apple_health_export/export.xml'))).toBe('corrupt')
  })

  it('refuses a large entry before reading it whole', async () => {
    const archive = await openZip(bytesSource(fixture('basic.zip')))
    const entry = archive.entries.find((candidate) => candidate.name.endsWith('export.xml'))!
    expect(await failureOf(archive.readText(entry, 100))).toBe('too_large')
  })
})

describe('crc32', () => {
  it('matches the standard check value and works in pieces', () => {
    const bytes = new TextEncoder().encode('123456789')
    expect(crc32(bytes)).toBe(0xcbf43926)
    expect(crc32(bytes.subarray(4), crc32(bytes.subarray(0, 4)))).toBe(0xcbf43926)
  })
})

describe('looksLikeZip', () => {
  it('knows a zip by its first bytes', () => {
    expect(looksLikeZip(fixture('basic.zip').subarray(0, 4))).toBe(true)
    expect(looksLikeZip(fixture('export.xml').subarray(0, 4))).toBe(false)
  })
})
