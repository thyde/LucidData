import { describe, it, expect } from 'vitest'
import {
  isDuplicateContribution,
  shouldHoldPayout,
  PAYOUT_HOLD_REASON,
} from '../marketplace-integrity.service'
import { PAYOUT_REVIEW_THRESHOLD_CENTS } from '@/lib/constants/marketplace-integrity'

describe('recognising a duplicate contribution', () => {
  // The unique index is the control. This only decides whether we can turn its
  // error into something a person can act on, so it has to be specific: a
  // different unique violation must not be reported as a duplicate
  // contribution, because that would hide a real bug behind a friendly message.

  it('recognises the contribution index firing', () => {
    expect(
      isDuplicateContribution({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "uq_pool_contrib_entry_once"',
      })
    ).toBe(true)
  })

  it('does not claim an unrelated unique violation is a duplicate contribution', () => {
    expect(
      isDuplicateContribution({
        code: '23505',
        message: 'duplicate key value violates unique constraint "users_email_key"',
      })
    ).toBe(false)
  })

  it('ignores errors that are not unique violations', () => {
    expect(
      isDuplicateContribution({ code: '23503', message: 'uq_pool_contrib_entry_once' })
    ).toBe(false)
  })

  it.each([[null], [undefined], ['a string'], [42], [new Error('boom')]])(
    'is safe on %s',
    (value) => {
      expect(isDuplicateContribution(value)).toBe(false)
    }
  )
})

describe('deciding to hold a payout', () => {
  it('holds a balance at the threshold', () => {
    expect(shouldHoldPayout(PAYOUT_REVIEW_THRESHOLD_CENTS)).toBe(true)
  })

  it('holds a balance above the threshold', () => {
    expect(shouldHoldPayout(PAYOUT_REVIEW_THRESHOLD_CENTS + 1)).toBe(true)
  })

  it('lets an ordinary balance through', () => {
    expect(shouldHoldPayout(PAYOUT_REVIEW_THRESHOLD_CENTS - 1)).toBe(false)
    expect(shouldHoldPayout(2500)).toBe(false)
  })

  it('explains the hold without accusing the person', () => {
    // The contributor sees this. Most holds will be honest people having a good
    // month, so the wording states the fact and nothing more.
    expect(PAYOUT_HOLD_REASON).toMatch(/review/i)
    expect(PAYOUT_HOLD_REASON).not.toMatch(/fraud|suspicious|abuse|violation/i)
  })
})
