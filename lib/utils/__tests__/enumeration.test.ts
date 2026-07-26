import { describe, it, expect, vi } from 'vitest'
import {
  NEUTRAL_LOOKUP_RESPONSE,
  ENUMERATION_FLOOR_MS,
  withConstantTime,
} from '@/lib/utils/enumeration'

describe('NEUTRAL_LOOKUP_RESPONSE', () => {
  it('is a single accepted shape that reveals nothing about the account', () => {
    expect(NEUTRAL_LOOKUP_RESPONSE.status).toBe(202)
    const body = JSON.stringify(NEUTRAL_LOOKUP_RESPONSE.body)
    expect(body).not.toMatch(/not found|does not exist|unknown user/i)
  })
})

describe('withConstantTime', () => {
  it('pads a fast path up to the floor', async () => {
    vi.useFakeTimers()
    try {
      const promise = withConstantTime(async () => 'done', 500)
      await vi.advanceTimersByTimeAsync(499)
      let settled = false
      void promise.then(() => {
        settled = true
      })
      await Promise.resolve()
      expect(settled).toBe(false)

      await vi.advanceTimersByTimeAsync(2)
      await expect(promise).resolves.toBe('done')
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns the work result unchanged', async () => {
    await expect(withConstantTime(async () => ({ hit: true }), 0)).resolves.toEqual({
      hit: true,
    })
  })

  it('still pads when the work throws, so a failure is not faster', async () => {
    const started = Date.now()
    await expect(
      withConstantTime(async () => {
        throw new Error('boom')
      }, 60)
    ).rejects.toThrow('boom')
    expect(Date.now() - started).toBeGreaterThanOrEqual(55)
  })

  it('uses a floor long enough to absorb a database write', () => {
    expect(ENUMERATION_FLOOR_MS).toBeGreaterThanOrEqual(200)
  })
})
