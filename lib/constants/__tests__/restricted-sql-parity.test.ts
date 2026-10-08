import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  MARKETPLACE_RESTRICTED_CATEGORIES,
  SALE_RESTRICTED_SCHEMA_TYPES,
} from '@luciddata/core/validations/marketplace'
import { HEALTH_SCHEMA_TYPES } from '@/lib/constants/legal'

// The database refuses restricted contributions and unconsented health data on
// its own, with its own copies of the lists. These tests hold each copy to the
// TypeScript it mirrors.
//
// The schema type lists may run ahead in the database. A migration that adds a
// type ships before the code that offers it, so for a while the database
// refuses a type the app does not know yet. That is the safe direction; the
// unsafe one, the app restricting a type the database does not, fails here.

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

/** The body of the most recent migration that defines this function. */
function latestDefinition(functionName: string): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
  let body: string | null = null
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    const start = sql.indexOf(`FUNCTION public.${functionName}(`)
    if (start === -1) continue
    const end = sql.indexOf('$$;', start)
    body = sql.slice(start, end)
  }
  if (!body) throw new Error(`No migration defines ${functionName}`)
  return body
}

function sqlArray(body: string, name: string): string[] {
  const match = body.match(new RegExp(`${name} CONSTANT TEXT\\[\\] := ARRAY\\[([^\\]]*)\\]`))
  if (!match) throw new Error(`${name} not found`)
  return [...match[1].matchAll(/'([^']+)'/g)].map((value) => value[1]).sort()
}

describe('database copies of the restricted lists', () => {
  it('refuses the same categories the marketplace restricts', () => {
    const body = latestDefinition('is_sale_restricted')
    expect(sqlArray(body, 'restricted_categories')).toEqual(
      [...MARKETPLACE_RESTRICTED_CATEGORIES].sort()
    )
  })

  it('refuses at least the schema types the marketplace restricts', () => {
    const body = latestDefinition('is_sale_restricted')
    expect(sqlArray(body, 'restricted_schema_types')).toEqual(
      expect.arrayContaining([...SALE_RESTRICTED_SCHEMA_TYPES])
    )
  })

  it('judges contributions with the shared helper rather than a list of their own', () => {
    const body = latestDefinition('refuse_restricted_contribution')
    expect(body).toContain('public.is_sale_restricted(NEW.category, NEW.schema_type)')
    expect(body).toContain('public.is_sale_restricted(entry_category, entry_schema_type)')
    expect(body).not.toMatch(/CONSTANT TEXT\[\]/)
  })

  it('asks for health consent on at least the schema types the vault service does', () => {
    const body = latestDefinition('require_health_data_consent')
    expect(sqlArray(body, 'health_schema_types')).toEqual(
      expect.arrayContaining([...HEALTH_SCHEMA_TYPES])
    )
  })

  it('treats every health type it requires consent for as never for sale', () => {
    const consent = sqlArray(latestDefinition('require_health_data_consent'), 'health_schema_types')
    const restricted = sqlArray(latestDefinition('is_sale_restricted'), 'restricted_schema_types')
    expect(restricted).toEqual(expect.arrayContaining(consent))
  })
})
