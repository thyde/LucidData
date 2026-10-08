import { describe, expect, it } from 'vitest'
import {
  SALE_RESTRICTED_SCHEMA_TYPES,
  SALE_RESTRICTED_STATEMENT,
  describeRestrictedCategories,
  isMarketplaceCategoryAllowed,
  isSaleRestrictedContribution,
  isSaleRestrictedEntry,
} from '../marketplace'

describe('sale restrictions', () => {
  it('names every schema type that holds restricted data', () => {
    expect(SALE_RESTRICTED_SCHEMA_TYPES).toEqual([
      'browsing_insight',
      'financial_summary',
      'fitness_activity',
      'fitness_daily',
      'medical_basic',
    ])
  })

  it('restricts by category or by schema type, whichever applies', () => {
    expect(isSaleRestrictedEntry({ category: 'health' })).toBe(true)
    expect(isSaleRestrictedEntry({ category: 'location', schema_type: 'custom' })).toBe(true)
    expect(isSaleRestrictedEntry({ category: 'personal', schema_type: 'medical_basic' })).toBe(true)
    expect(isSaleRestrictedEntry({ category: 'other', schema_type: 'browsing_insight' })).toBe(true)
  })

  it('leaves credential data and unclassified entries open to the privacy gate', () => {
    for (const schema_type of ['employment', 'education', 'identity', 'custom']) {
      expect(isSaleRestrictedEntry({ category: 'credentials', schema_type })).toBe(false)
    }
    expect(isSaleRestrictedEntry({})).toBe(false)
    expect(isMarketplaceCategoryAllowed('credentials')).toBe(true)
    expect(isMarketplaceCategoryAllowed('health')).toBe(false)
  })

  it('judges a contribution by its source entry as well as its own columns', () => {
    const contribution = { category: 'credentials', schema_type: 'employment' }
    expect(isSaleRestrictedContribution({ ...contribution, vault_data: null })).toBe(false)
    expect(
      isSaleRestrictedContribution({
        ...contribution,
        vault_data: { category: 'credentials', schema_type: 'employment' },
      })
    ).toBe(false)
    expect(
      isSaleRestrictedContribution({
        ...contribution,
        vault_data: { category: 'financial', schema_type: 'employment' },
      })
    ).toBe(true)
    expect(isSaleRestrictedContribution({ category: 'credentials', schema_type: 'medical_basic' })).toBe(
      true
    )
  })

  it('states the restriction in plain words', () => {
    expect(describeRestrictedCategories()).toBe('Health, financial, location, and browsing data')
    expect(SALE_RESTRICTED_STATEMENT).toBe(
      'Health, financial, location, and browsing data are never for sale'
    )
  })
})
