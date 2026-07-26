import { describe, it, expect } from 'vitest'
import {
  PLATFORM_FEE_BPS,
  MINIMUM_ORDER_CENTS,
  PAYOUT_THRESHOLD_CENTS,
  platformFeeCents,
  contributorNetCents,
  processingCostCents,
  orderMarginCents,
  isOrderProfitable,
  assertOrderMeetsMinimum,
  MinimumOrderError,
  splitEarnings,
  formatFeePercent,
} from '@/lib/constants/marketplace-economics'
import { DATA_TYPE_PRICING } from '@/lib/constants/data-pricing'

describe('platform fee', () => {
  it('retains the configured share of gross', () => {
    expect(platformFeeCents(10_000)).toBe(2_500)
    expect(contributorNetCents(10_000)).toBe(7_500)
  })

  it('never produces a negative fee or net', () => {
    expect(platformFeeCents(0)).toBe(0)
    expect(platformFeeCents(-100)).toBe(0)
    expect(contributorNetCents(0)).toBe(0)
  })

  it('honours a pinned rate rather than the current one', () => {
    // A contribution consented to at 10% keeps earning at 10% after a rise.
    expect(contributorNetCents(1_000, 1_000)).toBe(900)
    expect(contributorNetCents(1_000, PLATFORM_FEE_BPS)).toBe(750)
  })

  it('splits gross into three numbers that add up', () => {
    const split = splitEarnings(1_234)
    expect(split.platformFeeCents + split.netCents).toBe(split.grossCents)
    expect(split.feeBps).toBe(PLATFORM_FEE_BPS)
  })

  it('formats the fee for display', () => {
    expect(formatFeePercent()).toBe('25%')
  })
})

describe('minimum order value', () => {
  it('accepts a free dataset', () => {
    expect(() => assertOrderMeetsMinimum(0)).not.toThrow()
  })

  it('refuses an order that cannot cover its own processing', () => {
    expect(() => assertOrderMeetsMinimum(MINIMUM_ORDER_CENTS - 1)).toThrow(MinimumOrderError)
  })

  it('accepts an order at the floor', () => {
    expect(() => assertOrderMeetsMinimum(MINIMUM_ORDER_CENTS)).not.toThrow()
  })

  it('states the actual and required amounts so a buyer can act', () => {
    try {
      assertOrderMeetsMinimum(1_000)
      throw new Error('should have thrown')
    } catch (error) {
      expect((error as Error).message).toContain('$10.00')
      expect((error as Error).message).toContain('$50.00')
    }
  })
})

describe('profitability across categories and pool sizes', () => {
  // This is the regression the old model failed: margin was constant while
  // processing cost grew with the order, so every category had a pool size
  // beyond which a sale lost money.
  const poolSizes = [5, 50, 500, 1_000, 2_000, 5_000, 10_000, 100_000]

  it('is profitable at every category and pool size at or above the minimum', () => {
    const losses: string[] = []

    for (const pricing of Object.values(DATA_TYPE_PRICING)) {
      for (const records of poolSizes) {
        const total = pricing.accessFeeCents + records * pricing.perRecordCents
        if (total < MINIMUM_ORDER_CENTS) continue
        if (!isOrderProfitable(total)) {
          losses.push(`${pricing.category} at ${records} records (total ${total})`)
        }
      }
    }

    expect(losses).toEqual([])
  })

  it('grows margin as the pool grows, rather than shrinking it', () => {
    const financial = DATA_TYPE_PRICING.financial
    const small = financial.accessFeeCents + 500 * financial.perRecordCents
    const large = financial.accessFeeCents + 10_000 * financial.perRecordCents

    expect(orderMarginCents(large)).toBeGreaterThan(orderMarginCents(small))
  })

  it('no category has a zero access fee, which guaranteed a loss', () => {
    for (const pricing of Object.values(DATA_TYPE_PRICING)) {
      expect(pricing.accessFeeCents, pricing.category).toBeGreaterThan(0)
    }
  })

  it('prices health above browsing per record, matching its sensitivity', () => {
    expect(DATA_TYPE_PRICING.health.perRecordCents).toBeGreaterThan(
      DATA_TYPE_PRICING.browsing.perRecordCents
    )
  })
})

describe('processing cost', () => {
  it('grows with the order total', () => {
    expect(processingCostCents(10_000)).toBeGreaterThan(processingCostCents(1_000))
  })

  it('is zero for a free order', () => {
    expect(processingCostCents(0)).toBe(0)
  })
})

describe('payout threshold', () => {
  it('is high enough that a transfer costs a small share of what it moves', () => {
    // At roughly $2.25 per payout, $25 keeps the cost near 9 percent.
    expect(PAYOUT_THRESHOLD_CENTS).toBeGreaterThanOrEqual(2_500)
  })
})
