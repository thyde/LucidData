import { describe, expect, it, vi } from 'vitest'
import { afterKey, PAGE_SIZE, readAllPages, type PageKey } from '@/lib/repositories/paging'

interface Row {
  id: string
  at: string
}

const rows: Row[] = Array.from({ length: 2345 }, (_, index) => ({
  id: `id-${String(index).padStart(5, '0')}`,
  at: `2026-10-08T12:00:${String(Math.floor(index / 100)).padStart(2, '0')}Z`,
}))

/** A stand-in for PostgREST: ascending by time then id, capped at maxRows. */
function serve(maxRows: number) {
  return vi.fn(async (after: PageKey | null, limit: number) => {
    const remaining = rows.filter(
      (row) => !after || row.at > after.at || (row.at === after.at && row.id > after.id)
    )
    return { data: remaining.slice(0, Math.min(limit, maxRows)), error: null }
  })
}

describe('readAllPages', () => {
  it('reads every row across pages, in order, with no repeats', async () => {
    const page = serve(1000)
    const all = await readAllPages(page, (row: Row) => ({ at: row.at, id: row.id }))

    expect(all).toEqual(rows)
    expect(page).toHaveBeenCalledTimes(4)
    expect(page.mock.calls[0]).toEqual([null, PAGE_SIZE])
    expect(page.mock.calls[1][0]).toEqual({ at: rows[999].at, id: rows[999].id })
  })

  it('does not depend on how many rows the server returns a page', async () => {
    expect(await readAllPages(serve(7), (row: Row) => ({ at: row.at, id: row.id }))).toEqual(rows)
  })

  it('passes a failed page on rather than returning part of the collection', async () => {
    const failure = { message: 'connection reset' }
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: rows.slice(0, 1000), error: null })
      .mockResolvedValueOnce({ data: null, error: failure })

    await expect(readAllPages(page, (row: Row) => ({ at: row.at, id: row.id }))).rejects.toBe(failure)
  })
})

describe('afterKey', () => {
  it('quotes the values, so a timestamp keeps its offset', () => {
    expect(afterKey('created_at', { at: '2026-10-08T21:02:58.200971+00:00', id: 'abc' })).toBe(
      'created_at.gt."2026-10-08T21:02:58.200971+00:00",and(created_at.eq."2026-10-08T21:02:58.200971+00:00",id.gt."abc")'
    )
  })
})
