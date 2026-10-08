import { describe, it, expect } from 'vitest'
import {
  detectAdapter,
  parseWithAdapter,
  googleTakeoutAdapter,
  bankCsvAdapter,
} from '../index'

describe('Google Takeout adapter', () => {
  it('unwraps a named container array', () => {
    const json = JSON.stringify({
      'Browser History': [
        { title: 'Example', time_usec: 1700000000000000 },
        { title: 'Another', time_usec: 1700000000000001 },
      ],
    })

    const result = googleTakeoutAdapter.parse(json)

    expect(result.records).toHaveLength(2)
    expect(result.records[0]).toMatchObject({ title: 'Example' })
  })

  it('accepts a bare array', () => {
    const result = googleTakeoutAdapter.parse(JSON.stringify([{ a: 1 }, { a: 2 }]))

    expect(result.records).toHaveLength(2)
  })

  it('flattens one level so nested values are mappable', () => {
    const json = JSON.stringify([{ header: 'Search', details: { name: 'From Google Ads' } }])

    const result = googleTakeoutAdapter.parse(json)

    expect(result.records[0]).toMatchObject({ header: 'Search', 'details.name': 'From Google Ads' })
  })

  it('summarises a scalar array but leaves a mixed one out', () => {
    // A stringified object array looks like data while being unusable, so it is
    // dropped rather than rendered as [object Object].
    const json = JSON.stringify([{ tags: ['a', 'b'], objects: [{ x: 1 }] }])

    const result = googleTakeoutAdapter.parse(json)

    expect(result.records[0].tags).toBe('a, b')
    expect(result.records[0]).not.toHaveProperty('objects')
  })

  it('does not guess a schema type', () => {
    // Takeout can be location history, purchases, or browsing. A wrong guess
    // maps fields silently rather than visibly.
    const result = googleTakeoutAdapter.parse(JSON.stringify([{ a: 1 }]))

    expect(result.schemaType).toBeUndefined()
  })

  it('truncates a large export and reports the true total', () => {
    const items = Array.from({ length: 5000 }, (_, i) => ({ i }))
    const result = googleTakeoutAdapter.parse(JSON.stringify(items), { limit: 250 })

    expect(result.records).toHaveLength(250)
    expect(result.totalFound).toBe(5000)
    expect(result.truncated).toBe(true)
  })

  it('throws on malformed JSON, because a file it claimed is a real failure', () => {
    expect(() => googleTakeoutAdapter.parse('{ not json')).toThrow()
  })
})

describe('bank statement adapter', () => {
  const NATWEST = `Date,Description,Amount,Balance
15/01/2026,TESCO STORES,-42.50,1200.00
16/01/2026,SALARY,2000.00,3200.00`

  const DEBIT_CREDIT = `Transaction Date,Narrative,Debit,Credit
2026-01-15,COFFEE,3.20,
2026-01-16,REFUND,,15.00`

  it('recognises a statement by its columns, not its filename', () => {
    expect(bankCsvAdapter.detect('anything.csv', NATWEST)).toBe(true)
    expect(bankCsvAdapter.detect('contacts.csv', 'Name,Email\nA,a@b.c')).toBe(false)
  })

  it('normalizes differently named columns onto one shape', () => {
    const a = bankCsvAdapter.parse(NATWEST).records[0]
    const b = bankCsvAdapter.parse(DEBIT_CREDIT).records[0]

    expect(Object.keys(a)).toEqual(expect.arrayContaining(['date', 'description', 'amount']))
    expect(Object.keys(b)).toEqual(expect.arrayContaining(['date', 'description', 'amount']))
  })

  it('treats a separate debit column as an outflow', () => {
    const records = bankCsvAdapter.parse(DEBIT_CREDIT).records

    expect(records[0]).toMatchObject({ description: 'COFFEE', amount: -3.2 })
    expect(records[1]).toMatchObject({ description: 'REFUND', amount: 15 })
  })

  it('parses accounting-style negatives', () => {
    // Number('(42.50)') is NaN, which would silently drop the transaction.
    const csv = `Date,Description,Amount\n2026-01-15,FEE,(42.50)`

    expect(bankCsvAdapter.parse(csv).records[0]).toMatchObject({ amount: -42.5 })
  })

  it('strips currency symbols and thousands separators', () => {
    const csv = `Date,Description,Amount\n2026-01-15,RENT,"$1,250.00"`

    expect(bankCsvAdapter.parse(csv).records[0]).toMatchObject({ amount: 1250 })
  })

  it('rewrites an unambiguous day-first date and leaves an ambiguous one alone', () => {
    // 15 cannot be a month, so the order is knowable. 05/06 is genuinely
    // ambiguous and guessing would move a transaction by a month.
    const unambiguous = bankCsvAdapter.parse(
      `Date,Description,Amount\n15/01/2026,A,1`
    ).records[0]
    const ambiguous = bankCsvAdapter.parse(`Date,Description,Amount\n05/06/2026,A,1`).records[0]

    expect(unambiguous.date).toBe('2026-01-15')
    expect(ambiguous.date).toBe('05/06/2026')
  })

  it('keeps columns it does not recognise', () => {
    const csv = `Date,Description,Amount,Sort Code\n2026-01-15,A,1,12-34-56`

    expect(bankCsvAdapter.parse(csv).records[0]).toMatchObject({ 'Sort Code': '12-34-56' })
  })

  it('does not claim a schema type, because there is no transaction schema', () => {
    expect(bankCsvAdapter.parse(NATWEST).schemaType).toBeUndefined()
  })

  it('returns nothing for a header with no rows', () => {
    expect(bankCsvAdapter.parse('Date,Description,Amount').records).toEqual([])
  })

  it('truncates a large statement', () => {
    const rows = Array.from({ length: 4000 }, (_, i) => `2026-01-15,ROW ${i},1.00`).join('\n')
    const result = bankCsvAdapter.parse(`Date,Description,Amount\n${rows}`, { limit: 500 })

    expect(result.records).toHaveLength(500)
    expect(result.totalFound).toBe(4000)
    expect(result.truncated).toBe(true)
  })
})

describe('adapter registry', () => {
  it('routes each fixture to its own adapter', () => {
    expect(
      detectAdapter('takeout-history.json', JSON.stringify([{ a: 1 }]))?.id
    ).toBe('google-takeout')
    expect(detectAdapter('statement.csv', 'Date,Description,Amount\n2026-01-15,A,1')?.id).toBe(
      'bank-csv'
    )
  })

  it('returns null for a file no adapter claims, so the wizard still handles it', () => {
    // This is what keeps the feature additive. An unrecognised file must import
    // exactly as well as it did before adapters existed.
    expect(detectAdapter('notes.json', JSON.stringify([{ note: 'hello' }]))).toBeNull()
    expect(detectAdapter('contacts.csv', 'Name,Email\nA,a@b.c')).toBeNull()
    expect(parseWithAdapter('contacts.csv', 'Name,Email\nA,a@b.c')).toBeNull()
  })

  it('reports which adapter read the file', () => {
    const result = parseWithAdapter('statement.csv', 'Date,Description,Amount\n2026-01-15,A,1')

    expect(result).toMatchObject({ adapterId: 'bank-csv' })
  })

  it('detects from a leading slice, so a huge file is not scanned twice', () => {
    const csv = `Date,Description,Amount\n${'2026-01-15,A,1\n'.repeat(20_000)}`

    expect(detectAdapter('statement.csv', csv)?.id).toBe('bank-csv')
  })
})
