/**
 * LD-203 Google Takeout adapter.
 *
 * Takeout is a zip of many services, each writing its own file, so there is no
 * single Takeout format to parse. What is consistent is the JSON shape: either a
 * bare array of records, or one object with a single descriptive key holding the
 * array, such as `{ "Browser History": [...] }`.
 *
 * This adapter unwraps that container and flattens the nested objects Takeout
 * likes to emit, so the existing mapping wizard sees ordinary flat records
 * rather than a tree it cannot address.
 *
 * It deliberately does not guess a schema type. Takeout can hold location
 * history, purchases, browsing, or a dozen other things, and a wrong guess maps
 * fields silently rather than visibly.
 */

import type { AdapterResult, ExportAdapter, ParseOptions } from './types'

/** Container keys Takeout uses to wrap its arrays. */
const KNOWN_CONTAINER_KEYS = [
  'Browser History',
  'Search History',
  'Activity',
  'locations',
  'timelineObjects',
  'Purchase History',
  'Saved Links',
  'Subscriptions',
]

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Flatten one level of nesting into dotted keys.
 *
 * One level rather than all of them, because Takeout nests deeply and a fully
 * flattened record produces dozens of columns nobody will map. Arrays are
 * summarised rather than expanded for the same reason.
 */
function flattenOnce(record: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(record)) {
    if (isPlainObject(value)) {
      for (const [innerKey, innerValue] of Object.entries(value)) {
        if (isPlainObject(innerValue) || Array.isArray(innerValue)) continue
        flat[`${key}.${innerKey}`] = innerValue
      }
      continue
    }

    if (Array.isArray(value)) {
      const scalars = value.filter(
        (item) => item === null || typeof item !== 'object'
      )
      // Only summarise when every element is a scalar. A mixed array turned
      // into a string would look like data while being unusable.
      if (scalars.length === value.length) {
        flat[key] = value.join(', ')
      }
      continue
    }

    flat[key] = value
  }

  return flat
}

function unwrap(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data

  if (isPlainObject(data)) {
    const keys = Object.keys(data)

    for (const key of keys) {
      if (KNOWN_CONTAINER_KEYS.includes(key) && Array.isArray(data[key])) {
        return data[key] as unknown[]
      }
    }

    // A single key wrapping an array is the Takeout shape even when the key is
    // one we have not seen before.
    if (keys.length === 1 && Array.isArray(data[keys[0]])) {
      return data[keys[0]] as unknown[]
    }
  }

  return null
}

export const googleTakeoutAdapter: ExportAdapter = {
  id: 'google-takeout',
  label: 'Google Takeout',

  detect(fileName, head) {
    const name = fileName.toLowerCase()
    if (!name.endsWith('.json')) return false
    if (name.includes('takeout')) return true

    // Fall back to the container keys, because a file pulled out of the zip
    // keeps only its inner name.
    return KNOWN_CONTAINER_KEYS.some((key) => head.includes(`"${key}"`))
  },

  parse(text, options: ParseOptions = {}): AdapterResult {
    const limit = options.limit ?? 1000
    const data: unknown = JSON.parse(text)
    const items = unwrap(data)

    if (!items) {
      // A single object is one record. Still worth flattening.
      const single = isPlainObject(data) ? [flattenOnce(data)] : []
      return { records: single, totalFound: single.length, truncated: false }
    }

    const records = items
      .slice(0, limit)
      .map((item) => (isPlainObject(item) ? flattenOnce(item) : { value: item }))

    return {
      records,
      totalFound: items.length,
      truncated: items.length > records.length,
    }
  },
}
