/**
 * LD-203 bank statement CSV adapter.
 *
 * Every bank exports transactions and no two agree on the columns. "Date",
 * "Transaction Date", and "Posted Date" are the same thing; debits arrive as a
 * negative "Amount", as a separate "Debit" column, or as a positive number with
 * a "Type" saying which direction it went.
 *
 * This adapter normalizes those into one shape so the mapping wizard has
 * something predictable to work with, rather than making the person re-map the
 * same five fields for every bank they use.
 *
 * It does not claim a schema type. `financial_summary` describes an account, not
 * a transaction, and there is no transaction schema. Inventing one is a
 * deliberate decision rather than a side effect of an import adapter: a new
 * schema needs a quasi-identifier classification under LD-501 before anything
 * typed with it could be contributed, and transaction data is about as
 * re-identifying as data gets.
 */

import { parseCsvRows } from '@/lib/vault/import-parsers'
import type { AdapterResult, ExportAdapter, ParseOptions } from './types'

/** Column aliases, lowercased and stripped of anything but letters and digits. */
const COLUMN_ALIASES: Record<string, string[]> = {
  date: ['date', 'transactiondate', 'posteddate', 'postingdate', 'valuedate', 'bookingdate'],
  description: [
    'description',
    'details',
    'narrative',
    'memo',
    'payee',
    'merchant',
    'reference',
    'transactiondescription',
  ],
  amount: ['amount', 'value', 'transactionamount'],
  debit: ['debit', 'withdrawal', 'moneyout', 'paidout'],
  credit: ['credit', 'deposit', 'moneyin', 'paidin'],
  balance: ['balance', 'runningbalance', 'closingbalance'],
  currency: ['currency', 'currencycode', 'ccy'],
  category: ['category', 'type', 'transactiontype'],
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function canonicalColumn(header: string): string | null {
  const key = normalizeKey(header)
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(key)) return canonical
  }
  return null
}

/**
 * Parse a money string.
 *
 * Handles currency symbols, thousands separators, and the accounting
 * convention of wrapping negatives in parentheses, which a plain Number() call
 * silently turns into NaN.
 */
function parseMoney(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined

  const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith('-')
  const digits = trimmed.replace(/[^0-9.]/g, '')
  if (!digits) return undefined

  const value = Number(digits)
  if (!Number.isFinite(value)) return undefined
  return negative ? -value : value
}

/** ISO-8601 where possible, and the original string when the format is ambiguous. */
function normalizeDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)

  // Day-first and month-first are genuinely ambiguous below the thirteenth, so
  // only rewrite when the day is unambiguous. Guessing would silently move
  // transactions by months.
  const slashed = /^(\d{1,2})[/](\d{1,2})[/](\d{2,4})$/.exec(trimmed)
  if (slashed) {
    const [, first, second, year] = slashed
    const a = Number(first)
    const b = Number(second)
    const fullYear = year.length === 2 ? `20${year}` : year
    if (a > 12 && b <= 12) {
      return `${fullYear}-${b.toString().padStart(2, '0')}-${a.toString().padStart(2, '0')}`
    }
    if (b > 12 && a <= 12) {
      return `${fullYear}-${a.toString().padStart(2, '0')}-${b.toString().padStart(2, '0')}`
    }
  }

  return trimmed
}

function headerLooksLikeBankStatement(headers: string[]): boolean {
  const canonical = new Set(headers.map(canonicalColumn).filter(Boolean) as string[])
  const hasDate = canonical.has('date')
  const hasMoney = canonical.has('amount') || canonical.has('debit') || canonical.has('credit')
  return hasDate && hasMoney
}

export const bankCsvAdapter: ExportAdapter = {
  id: 'bank-csv',
  label: 'Bank statement',

  detect(fileName, head) {
    const name = fileName.toLowerCase()
    if (!name.endsWith('.csv') && !name.endsWith('.tsv')) return false

    const rows = parseCsvRows(head)
    if (rows.length === 0) return false
    return headerLooksLikeBankStatement(rows[0])
  },

  parse(text, options: ParseOptions = {}): AdapterResult {
    const limit = options.limit ?? 1000
    const rows = parseCsvRows(text).filter((row) => row.some((cell) => cell.trim() !== ''))
    if (rows.length < 2) {
      return { records: [], totalFound: 0, truncated: false }
    }

    const headers = rows[0]
    const columns = headers.map(canonicalColumn)
    const dataRows = rows.slice(1)

    const records = dataRows.slice(0, limit).map((row) => {
      const raw: Record<string, string> = {}
      columns.forEach((canonical, index) => {
        if (canonical) raw[canonical] = row[index] ?? ''
      })

      // A separate debit column means the value is an outflow, so it is
      // negated to match the single-amount convention.
      const debit = parseMoney(raw.debit)
      const credit = parseMoney(raw.credit)
      const amount =
        parseMoney(raw.amount) ??
        (debit !== undefined ? -Math.abs(debit) : undefined) ??
        (credit !== undefined ? Math.abs(credit) : undefined)

      const record: Record<string, unknown> = {
        date: normalizeDate(raw.date),
        description: raw.description?.trim() || undefined,
        amount,
        currency: raw.currency?.trim() || undefined,
        balance: parseMoney(raw.balance),
        category: raw.category?.trim() || undefined,
      }

      // Keep any column we did not recognise, so a bank-specific field is not
      // silently discarded on the way in.
      headers.forEach((header, index) => {
        if (columns[index]) return
        const value = row[index]?.trim()
        if (value) record[header.trim()] = value
      })

      return record
    })

    return {
      records,
      totalFound: dataRows.length,
      truncated: dataRows.length > records.length,
    }
  },
}
