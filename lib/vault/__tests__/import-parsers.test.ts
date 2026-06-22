import { describe, it, expect } from 'vitest'
import {
  parseJsonImport,
  parseCsv,
  parseCsvRows,
  parseImportFile,
  labelForRecord,
} from '@/lib/vault/import-parsers'

describe('parseJsonImport', () => {
  it('turns an array into one record per element', () => {
    const records = parseJsonImport('[{"a":1},{"a":2}]')
    expect(records).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('wraps non-object array elements under value', () => {
    expect(parseJsonImport('[1,"x"]')).toEqual([{ value: 1 }, { value: 'x' }])
  })

  it('uses a nested records array when present', () => {
    const records = parseJsonImport('{"records":[{"a":1}],"meta":true}')
    expect(records).toEqual([{ a: 1 }])
  })

  it('treats a plain object as a single record', () => {
    expect(parseJsonImport('{"a":1,"b":2}')).toEqual([{ a: 1, b: 2 }])
  })

  it('throws on invalid JSON', () => {
    expect(() => parseJsonImport('not json')).toThrow()
  })
})

describe('parseCsvRows', () => {
  it('handles quoted fields with commas and escaped quotes', () => {
    const rows = parseCsvRows('a,b\n"x,y","he said ""hi"""')
    expect(rows).toEqual([
      ['a', 'b'],
      ['x,y', 'he said "hi"'],
    ])
  })

  it('handles newlines inside quoted fields', () => {
    const rows = parseCsvRows('a\n"line1\nline2"')
    expect(rows).toEqual([['a'], ['line1\nline2']])
  })
})

describe('parseCsv', () => {
  it('maps each row to a record keyed by header', () => {
    const records = parseCsv('name,age\nAda,36\nGrace,40')
    expect(records).toEqual([
      { name: 'Ada', age: '36' },
      { name: 'Grace', age: '40' },
    ])
  })

  it('returns nothing for a header-only file', () => {
    expect(parseCsv('name,age')).toEqual([])
  })

  it('skips blank lines', () => {
    const records = parseCsv('name\nAda\n\nGrace\n')
    expect(records).toEqual([{ name: 'Ada' }, { name: 'Grace' }])
  })
})

describe('parseImportFile', () => {
  it('parses by .json extension', () => {
    const out = parseImportFile('data.json', '[{"a":1}]')
    expect(out.format).toBe('json')
    expect(out.records).toEqual([{ a: 1 }])
  })

  it('parses by .csv extension', () => {
    const out = parseImportFile('data.csv', 'a,b\n1,2')
    expect(out.format).toBe('csv')
    expect(out.records).toEqual([{ a: '1', b: '2' }])
  })

  it('falls back to CSV when JSON parsing fails for an unknown extension', () => {
    const out = parseImportFile('data.txt', 'a,b\n1,2')
    expect(out.format).toBe('csv')
    expect(out.records).toEqual([{ a: '1', b: '2' }])
  })
})

describe('labelForRecord', () => {
  it('prefers a name-like field', () => {
    expect(labelForRecord({ name: 'Checking' }, 'Entry 1')).toBe('Checking')
    expect(labelForRecord({ title: 'Visa' }, 'Entry 1')).toBe('Visa')
  })

  it('falls back when no name-like field is present', () => {
    expect(labelForRecord({ amount: 10 }, 'Entry 5')).toBe('Entry 5')
  })
})
