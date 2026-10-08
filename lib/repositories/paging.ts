/**
 * Read every row a query matches, a page at a time.
 *
 * PostgREST returns at most `max_rows` rows a request (1,000 here, see
 * supabase/config.toml, and the same on the hosted projects) and says nothing
 * when it stops. Anything that needs a whole collection has to page through
 * it: a vault that read only its first page listed part of itself, exported
 * part of itself, and could never re-wrap its keys.
 *
 * Pages follow a key, the row's time and then its id, rather than an offset,
 * so a row added or removed while reading cannot shift another one out of view.
 * Reading stops at the first empty page, which also makes it independent of
 * what `max_rows` is set to.
 */

export interface PageKey {
  at: string
  id: string
}

interface PageResult<Row> {
  data: Row[] | null
  error: unknown
}

/** The largest page asked for. PostgREST may return fewer, which is fine. */
export const PAGE_SIZE = 1000

export async function readAllPages<Row>(
  page: (after: PageKey | null, limit: number) => PromiseLike<PageResult<Row>>,
  keyOf: (row: Row) => PageKey
): Promise<Row[]> {
  const rows: Row[] = []
  let after: PageKey | null = null
  for (;;) {
    const { data, error }: PageResult<Row> = await page(after, PAGE_SIZE)
    if (error) throw error
    if (!data || data.length === 0) return rows
    rows.push(...data)
    after = keyOf(data[data.length - 1])
  }
}

/**
 * The PostgREST filter for rows after a key, in ascending order of `column`
 * then `id`. Values are quoted, so a timestamp's `+` and `:` reach the
 * database intact.
 */
export function afterKey(column: string, key: PageKey): string {
  return `${column}.gt."${key.at}",and(${column}.eq."${key.at}",id.gt."${key.id}")`
}
