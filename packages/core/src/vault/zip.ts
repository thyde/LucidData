/**
 * LD-210 streaming zip reader.
 *
 * Health exports arrive as zip files that can hold gigabytes once unpacked: a
 * long-time Apple Health user's export.xml often runs to several. Loading the
 * archive, or one of its entries, into memory would run a browser tab out of
 * memory before anything reached the vault. This reads the central directory
 * from the end of the file, then streams one entry at a time through the
 * platform's DecompressionStream, a megabyte of input at a time.
 *
 * Archives are untrusted input.
 * - An entry whose path is absolute or climbs out with `..` refuses the whole
 *   archive. No real export holds one, so one means the file is not what it
 *   claims to be.
 * - Declared sizes are checked before anything is read: a cap on the total,
 *   and a compression ratio no real export reaches. Every byte is counted as it
 *   is read too, so a header that understates an entry's size is caught.
 * - Each entry's CRC-32 is checked, so a truncated or corrupt download fails
 *   rather than importing part of a file.
 *
 * Supports stored and deflated entries, ZIP64 sizes and offsets, and data
 * descriptors. Encrypted entries, other compression methods, and archives
 * split across disks are refused with a plain reason.
 */

export type ZipFailure = 'not_zip' | 'unsafe_path' | 'too_large' | 'unsupported' | 'corrupt'

export class ZipError extends Error {
  readonly reason: ZipFailure

  constructor(message: string, reason: ZipFailure) {
    super(message)
    this.name = 'ZipError'
    this.reason = reason
  }
}

/** Anything the reader can take a byte range from: a File in the browser, bytes in a test. */
export interface RandomAccessSource {
  readonly size: number
  read(offset: number, length: number): Promise<Uint8Array>
}

/** A source over bytes already in memory. */
export function bytesSource(bytes: Uint8Array): RandomAccessSource {
  return {
    size: bytes.byteLength,
    read: async (offset, length) => bytes.slice(offset, offset + length),
  }
}

/** A source over a File or Blob that reads only the ranges asked for. */
export function blobSource(blob: Blob): RandomAccessSource {
  return {
    size: blob.size,
    read: async (offset, length) =>
      new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()),
  }
}

export interface ZipLimits {
  /** The most bytes all entries together may unpack to. */
  maxTotalSize: number
  /** The most entries an archive may list. */
  maxEntries: number
  /** The highest unpacked-to-packed ratio, for the archive and for any entry over a megabyte. */
  maxRatio: number
}

/**
 * Real exports compress XML and JSON by 10 to 50 times; a zip bomb relies on
 * ratios near deflate's limit of about 1,000. The total cap guards time rather
 * than memory, because entries are streamed.
 */
export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxTotalSize: 16 * 1024 ** 3,
  maxEntries: 100_000,
  maxRatio: 250,
}

export interface ZipOptions extends Partial<ZipLimits> {
  /** Bytes read from the file at a time. Tests set it small to cross many chunk boundaries. */
  chunkSize?: number
}

export interface ZipEntry {
  /** The path inside the archive, with forward slashes. */
  readonly name: string
  /** Unpacked size, as the archive declares it. Checked while reading. */
  readonly size: number
  readonly compressedSize: number
  readonly method: number
  readonly crc32: number
  readonly flags: number
  readonly isDirectory: boolean
  /** Where the entry's local header starts. */
  readonly headerOffset: number
}

export interface ZipArchive {
  readonly entries: readonly ZipEntry[]
  /** The entry's unpacked bytes, a chunk at a time, checked against its size and CRC. */
  chunks(entry: ZipEntry): AsyncGenerator<Uint8Array>
  /** The entry decoded as UTF-8, a chunk at a time. */
  text(entry: ZipEntry): AsyncGenerator<string>
  /** A whole entry as UTF-8 text, for files small enough to hold at once. */
  readText(entry: ZipEntry, maxBytes?: number): Promise<string>
}

const EOCD = 0x06054b50
const EOCD64 = 0x06064b50
const EOCD64_LOCATOR = 0x07064b50
const CENTRAL_HEADER = 0x02014b50
const LOCAL_HEADER = 0x04034b50
const ZIP64_EXTRA = 0x0001

const MEGABYTE = 1024 * 1024
const MAX_CENTRAL_DIRECTORY = 64 * MEGABYTE
const READ_CHUNK = MEGABYTE
const DEFAULT_TEXT_LIMIT = 64 * MEGABYTE

const corrupt = (detail: string) =>
  new ZipError(`The archive is damaged (${detail}). Download the export again.`, 'corrupt')

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function uint64(data: DataView, at: number): number {
  if (at + 8 > data.byteLength) throw corrupt('a size field is cut short')
  const value = data.getUint32(at, true) + data.getUint32(at + 4, true) * 2 ** 32
  if (!Number.isSafeInteger(value)) throw corrupt('a size field is out of range')
  return value
}

async function readExactly(source: RandomAccessSource, offset: number, length: number): Promise<Uint8Array> {
  if (offset < 0 || offset + length > source.size) throw corrupt('a record points past the end of the file')
  const bytes = await source.read(offset, length)
  if (bytes.byteLength !== length) throw corrupt('the file ended early')
  return bytes
}

// --- CRC-32 (the zip and gzip polynomial, 0xEDB88320) ---

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array, previous = 0): number {
  let c = (previous ^ 0xffffffff) >>> 0
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// --- Paths ---

const UTF8 = new TextDecoder('utf-8')

function isUnsafePath(name: string): boolean {
  return (
    name.startsWith('/') ||
    /^[A-Za-z]:/.test(name) ||
    name.includes('\0') ||
    name.split('/').some((segment) => segment === '..')
  )
}

// --- Directory ---

async function findEndRecord(source: RandomAccessSource) {
  if (source.size < 22) throw new ZipError('This file is not a zip archive.', 'not_zip')
  const tailLength = Math.min(source.size, 22 + 0xffff)
  const tailStart = source.size - tailLength
  const tail = await readExactly(source, tailStart, tailLength)
  const data = view(tail)
  for (let at = tail.byteLength - 22; at >= 0; at--) {
    if (data.getUint32(at, true) !== EOCD) continue
    // A comment can contain bytes shaped like the signature; a real end record's
    // comment fits inside the file.
    if (at + 22 + data.getUint16(at + 20, true) > tail.byteLength) continue
    return { data, at, offset: tailStart + at }
  }
  throw new ZipError('This file is not a zip archive.', 'not_zip')
}

async function readDirectoryLocation(source: RandomAccessSource) {
  const end = await findEndRecord(source)
  let disk = end.data.getUint16(end.at + 4, true)
  let directoryDisk = end.data.getUint16(end.at + 6, true)
  let count = end.data.getUint16(end.at + 10, true)
  let size = end.data.getUint32(end.at + 12, true)
  let offset = end.data.getUint32(end.at + 16, true)

  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
    const locator = view(await readExactly(source, end.offset - 20, 20))
    if (locator.getUint32(0, true) !== EOCD64_LOCATOR) throw corrupt('the ZIP64 locator is missing')
    const record = view(await readExactly(source, uint64(locator, 8), 56))
    if (record.getUint32(0, true) !== EOCD64) throw corrupt('the ZIP64 end record is missing')
    disk = record.getUint32(16, true)
    directoryDisk = record.getUint32(20, true)
    count = uint64(record, 32)
    size = uint64(record, 40)
    offset = uint64(record, 48)
  }

  if (disk !== 0 || directoryDisk !== 0) {
    throw new ZipError('This archive is split across several files, which is not supported.', 'unsupported')
  }
  if (offset + size > source.size) throw corrupt('the directory points past the end of the file')
  return { count, size, offset }
}

function zip64Fields(extra: Uint8Array): DataView | null {
  const data = view(extra)
  for (let at = 0; at + 4 <= extra.byteLength; ) {
    const id = data.getUint16(at, true)
    const length = data.getUint16(at + 2, true)
    if (at + 4 + length > extra.byteLength) break
    if (id === ZIP64_EXTRA) return view(extra.subarray(at + 4, at + 4 + length))
    at += 4 + length
  }
  return null
}

function parseDirectory(directory: Uint8Array, count: number): ZipEntry[] {
  const data = view(directory)
  const entries: ZipEntry[] = []
  let at = 0
  for (let n = 0; n < count; n++) {
    if (at + 46 > directory.byteLength || data.getUint32(at, true) !== CENTRAL_HEADER) {
      throw corrupt('a directory record is missing')
    }
    const flags = data.getUint16(at + 8, true)
    const method = data.getUint16(at + 10, true)
    const crc = data.getUint32(at + 16, true)
    let compressedSize = data.getUint32(at + 20, true)
    let size = data.getUint32(at + 24, true)
    const nameLength = data.getUint16(at + 28, true)
    const extraLength = data.getUint16(at + 30, true)
    const commentLength = data.getUint16(at + 32, true)
    let headerOffset = data.getUint32(at + 42, true)
    const nameStart = at + 46
    const extraStart = nameStart + nameLength
    const next = extraStart + extraLength + commentLength
    if (next > directory.byteLength) throw corrupt('a directory record is cut short')

    // ZIP64 keeps a field's real value in an extra block, in this order, for
    // each field set to its all-ones placeholder.
    if (size === 0xffffffff || compressedSize === 0xffffffff || headerOffset === 0xffffffff) {
      const fields = zip64Fields(directory.subarray(extraStart, extraStart + extraLength))
      if (!fields) throw corrupt('a ZIP64 size is missing')
      let field = 0
      if (size === 0xffffffff) size = uint64(fields, (field++) * 8)
      if (compressedSize === 0xffffffff) compressedSize = uint64(fields, (field++) * 8)
      if (headerOffset === 0xffffffff) headerOffset = uint64(fields, field * 8)
    }

    // Bit 11 marks a UTF-8 name. Older archives use code page 437, which
    // matches UTF-8 for the plain ASCII names exports use.
    const name = UTF8.decode(directory.subarray(nameStart, extraStart)).replace(/\\/g, '/')
    if (isUnsafePath(name)) {
      throw new ZipError(
        'The archive holds a file whose path points outside it, so it was not opened. Download the export again from its source.',
        'unsafe_path'
      )
    }

    entries.push({
      name,
      size,
      compressedSize,
      method,
      crc32: crc,
      flags,
      isDirectory: name.endsWith('/'),
      headerOffset,
    })
    at = next
  }
  return entries
}

function checkSizes(entries: readonly ZipEntry[], archiveSize: number, limits: ZipLimits): void {
  const tooLarge = () =>
    new ZipError(
      'This archive unpacks to far more than any health export, so it was not opened.',
      'too_large'
    )
  let total = 0
  for (const entry of entries) {
    total += entry.size
    if (entry.size > MEGABYTE && entry.size / Math.max(entry.compressedSize, 1) > limits.maxRatio) {
      throw tooLarge()
    }
  }
  if (total > limits.maxTotalSize || total / Math.max(archiveSize, 1) > limits.maxRatio) throw tooLarge()
}

// --- Entries ---

function rangeStream(
  source: RandomAccessSource,
  start: number,
  length: number,
  chunkSize: number
): ReadableStream<Uint8Array> {
  let position = 0
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (position >= length) {
        controller.close()
        return
      }
      const size = Math.min(chunkSize, length - position)
      try {
        controller.enqueue(await readExactly(source, start + position, size))
        position += size
      } catch (error) {
        controller.error(error)
      }
    },
  })
}

type Decompressor = new (format: 'deflate-raw') => TransformStream<Uint8Array, Uint8Array>

async function* entryChunks(
  source: RandomAccessSource,
  entry: ZipEntry,
  chunkSize: number
): AsyncGenerator<Uint8Array> {
  if (entry.isDirectory) return
  if (entry.flags & 0x1) {
    throw new ZipError(`${entry.name} is encrypted, which is not supported.`, 'unsupported')
  }
  if (entry.method !== 0 && entry.method !== 8) {
    throw new ZipError(`${entry.name} uses a compression method that is not supported.`, 'unsupported')
  }

  const local = view(await readExactly(source, entry.headerOffset, 30))
  if (local.getUint32(0, true) !== LOCAL_HEADER) throw corrupt(`the header for ${entry.name} is missing`)
  const dataStart = entry.headerOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true)

  let stream = rangeStream(source, dataStart, entry.compressedSize, chunkSize)
  if (entry.method === 8) {
    const Decompression = (globalThis as { DecompressionStream?: Decompressor }).DecompressionStream
    if (!Decompression) {
      throw new ZipError('This device cannot unpack zip archives.', 'unsupported')
    }
    stream = stream.pipeThrough(new Decompression('deflate-raw'))
  }

  const reader = stream.getReader()
  let unpacked = 0
  let crc = 0
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch (error) {
        if (error instanceof ZipError) throw error
        throw corrupt(`${entry.name} could not be unpacked`)
      }
      if (chunk.done) break
      unpacked += chunk.value.byteLength
      // Caught as it happens, so an entry that lies about its size cannot run on.
      if (unpacked > entry.size) {
        throw new ZipError(
          'This archive unpacks to more than it declares, so it was not read.',
          'too_large'
        )
      }
      crc = crc32(chunk.value, crc)
      yield chunk.value
    }
  } finally {
    reader.releaseLock()
  }
  if (unpacked !== entry.size) throw corrupt(`${entry.name} is shorter than it declares`)
  if (crc !== entry.crc32) throw corrupt(`${entry.name} does not match its checksum`)
}

/** Read an archive's directory. Nothing is unpacked until an entry is read. */
export async function openZip(source: RandomAccessSource, options: ZipOptions = {}): Promise<ZipArchive> {
  const { chunkSize = READ_CHUNK, ...overrides } = options
  const limits: ZipLimits = { ...DEFAULT_ZIP_LIMITS, ...overrides }
  const location = await readDirectoryLocation(source)
  if (location.count > limits.maxEntries || location.size > MAX_CENTRAL_DIRECTORY) {
    throw new ZipError('This archive lists more files than any health export, so it was not opened.', 'too_large')
  }
  const directory = await readExactly(source, location.offset, location.size)
  const entries = parseDirectory(directory, location.count)
  checkSizes(entries, source.size, limits)

  async function* text(entry: ZipEntry): AsyncGenerator<string> {
    const decoder = new TextDecoder('utf-8')
    for await (const chunk of entryChunks(source, entry, chunkSize)) {
      const decoded = decoder.decode(chunk, { stream: true })
      if (decoded) yield decoded
    }
    const rest = decoder.decode()
    if (rest) yield rest
  }

  async function readText(entry: ZipEntry, maxBytes = DEFAULT_TEXT_LIMIT): Promise<string> {
    if (entry.size > maxBytes) {
      throw new ZipError(`${entry.name} is too large to read at once.`, 'too_large')
    }
    let whole = ''
    for await (const part of text(entry)) whole += part
    return whole
  }

  return { entries, chunks: (entry) => entryChunks(source, entry, chunkSize), text, readText }
}

/** True when the first bytes are a zip signature, before anything else is read. */
export function looksLikeZip(head: Uint8Array): boolean {
  return (
    head.byteLength >= 4 &&
    head[0] === 0x50 &&
    head[1] === 0x4b &&
    ((head[2] === 0x03 && head[3] === 0x04) || (head[2] === 0x05 && head[3] === 0x06))
  )
}
