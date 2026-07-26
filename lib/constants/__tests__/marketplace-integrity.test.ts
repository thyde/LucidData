import { describe, it, expect } from 'vitest'
import {
  ASSURANCE_LABEL,
  MAX_CONTRIBUTIONS_PER_POOL_PER_WINDOW,
  MAX_CONTRIBUTIONS_PER_WINDOW,
  PAYOUT_REVIEW_THRESHOLD_CENTS,
  VELOCITY_WINDOW_HOURS,
  vouchedShare,
  type AssuranceLevel,
} from '../marketplace-integrity'
import { PAYOUT_THRESHOLD_CENTS } from '../marketplace-economics'

describe('velocity limits', () => {
  it('allows more contributions across all pools than into any single pool', () => {
    // Otherwise the per-pool limit is unreachable, which would make it
    // decorative rather than a control.
    expect(MAX_CONTRIBUTIONS_PER_WINDOW).toBeGreaterThan(
      MAX_CONTRIBUTIONS_PER_POOL_PER_WINDOW
    )
  })

  it('sits far above what a real person contributes in a day', () => {
    // A person working through a backlog in one sitting must not be stopped.
    // Fifty entries is unusual and legitimate; the limit has to clear it.
    expect(MAX_CONTRIBUTIONS_PER_POOL_PER_WINDOW).toBeGreaterThanOrEqual(50)
  })

  it('measures over a day rather than an hour', () => {
    expect(VELOCITY_WINDOW_HOURS).toBe(24)
  })
})

describe('payout review threshold', () => {
  it('is above the threshold at which payouts are sent at all', () => {
    // A review threshold below the payout threshold would hold every payout,
    // which is a broken product rather than a fraud control.
    expect(PAYOUT_REVIEW_THRESHOLD_CENTS).toBeGreaterThan(PAYOUT_THRESHOLD_CENTS)
  })

  it('is well above a year of ordinary contributor earnings', () => {
    // Section 7 of the roadmap models an engaged contributor at roughly $125 a
    // year. A threshold near that would hold honest people constantly.
    const modelledAnnualEarningsCents = 12_450
    expect(PAYOUT_REVIEW_THRESHOLD_CENTS).toBeGreaterThan(modelledAnnualEarningsCents)
  })
})

describe('assurance mix', () => {
  it('reports the vouched share of a mixed pool', () => {
    expect(
      vouchedShare({ issuerVouched: 25, providerSourced: 25, selfAsserted: 50 })
    ).toBe(0.25)
  })

  it('reports zero for an empty pool rather than dividing by zero', () => {
    expect(vouchedShare({ issuerVouched: 0, providerSourced: 0, selfAsserted: 0 })).toBe(0)
  })

  it('reports a fully vouched pool as one', () => {
    expect(vouchedShare({ issuerVouched: 10, providerSourced: 0, selfAsserted: 0 })).toBe(1)
  })

  it('does not count provider-sourced records as vouched for', () => {
    // A connector proves where a record came from, not that anyone stands
    // behind it. Conflating the two would let a pool of fitness imports read as
    // verified.
    expect(vouchedShare({ issuerVouched: 0, providerSourced: 10, selfAsserted: 0 })).toBe(0)
  })

  it('labels every level', () => {
    const levels: AssuranceLevel[] = ['issuer_vouched', 'provider_sourced', 'self_asserted']
    for (const level of levels) {
      expect(ASSURANCE_LABEL[level]?.length).toBeGreaterThan(0)
    }
  })
})
