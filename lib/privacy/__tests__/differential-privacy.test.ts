import { describe, it, expect } from 'vitest'
import {
  COUNT_SENSITIVITY,
  DEFAULT_EPSILON,
  DEFAULT_EPSILON_BUDGET,
  EpsilonExhaustedError,
  laplaceSample,
  noisyCount,
  remainingEpsilon,
  seededUniform,
  spendEpsilon,
} from '@/lib/privacy/differential-privacy'

describe('seededUniform', () => {
  it('produces the same stream for the same seed', () => {
    const a = seededUniform('pool-1:contributor-count')
    const b = seededUniform('pool-1:contributor-count')
    const first = Array.from({ length: 20 }, () => a())
    const second = Array.from({ length: 20 }, () => b())
    expect(first).toEqual(second)
  })

  it('produces a different stream for a different seed', () => {
    const a = seededUniform('pool-1')
    const b = seededUniform('pool-2')
    expect(a()).not.toBe(b())
  })

  it('stays strictly inside (0, 1) so the log never blows up', () => {
    const uniform = seededUniform('range-check')
    for (let i = 0; i < 5000; i += 1) {
      const value = uniform()
      expect(value).toBeGreaterThan(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('laplaceSample', () => {
  it('centres on zero over many draws', () => {
    const uniform = seededUniform('mean-check')
    let total = 0
    const draws = 20_000
    for (let i = 0; i < draws; i += 1) total += laplaceSample(1, uniform)
    expect(Math.abs(total / draws)).toBeLessThan(0.1)
  })

  it('spreads wider as the scale grows', () => {
    const spread = (scale: number) => {
      const uniform = seededUniform('spread-check')
      let total = 0
      for (let i = 0; i < 5000; i += 1) total += Math.abs(laplaceSample(scale, uniform))
      return total / 5000
    }
    expect(spread(4)).toBeGreaterThan(spread(1))
  })
})

describe('noisyCount', () => {
  it('returns the same answer to the same question, so repetition cannot average the noise away', () => {
    const first = noisyCount(100, { seed: 'pool-1:contributors' })
    const second = noisyCount(100, { seed: 'pool-1:contributors' })
    expect(first.value).toBe(second.value)
  })

  it('stays close to the truth at a usable epsilon', () => {
    const result = noisyCount(500, { epsilon: DEFAULT_EPSILON, seed: 'pool-1:size' })
    expect(Math.abs(result.value - 500)).toBeLessThan(50)
  })

  it('never returns a negative count, which would give away that it was noised', () => {
    for (let i = 0; i < 200; i += 1) {
      const result = noisyCount(0, { epsilon: 0.01, seed: `zero-${i}` })
      expect(result.value).toBeGreaterThanOrEqual(0)
    }
  })

  it('reports what it spent', () => {
    expect(noisyCount(10, { seed: 's' }).epsilonSpent).toBe(DEFAULT_EPSILON)
    expect(noisyCount(10, { epsilon: 1.5, seed: 's' }).epsilonSpent).toBe(1.5)
  })

  it('rejects a non-positive epsilon rather than dividing by zero', () => {
    expect(() => noisyCount(10, { epsilon: 0, seed: 's' })).toThrow()
    expect(() => noisyCount(10, { epsilon: -1, seed: 's' })).toThrow()
  })

  it('adds one unit of sensitivity per person', () => {
    expect(COUNT_SENSITIVITY).toBe(1)
  })
})

describe('the epsilon budget', () => {
  it('reports what is left', () => {
    expect(remainingEpsilon({ spent: 1, budget: DEFAULT_EPSILON_BUDGET })).toBe(4)
  })

  it('accumulates spend', () => {
    let state = { spent: 0, budget: 2 }
    state = spendEpsilon('pool-1', state, 0.5)
    state = spendEpsilon('pool-1', state, 0.5)
    expect(state.spent).toBe(1)
  })

  it('blocks release once exhausted, rather than warning', () => {
    const state = { spent: 4.8, budget: 5 }
    expect(() => spendEpsilon('pool-1', state, 0.5)).toThrow(EpsilonExhaustedError)
  })

  it('allows a spend that exactly consumes the budget', () => {
    const state = spendEpsilon('pool-1', { spent: 4.5, budget: 5 }, 0.5)
    expect(state.spent).toBe(5)
    expect(remainingEpsilon(state)).toBe(0)
  })

  it('rejects a non-positive spend, so a caller cannot mint budget', () => {
    expect(() => spendEpsilon('pool-1', { spent: 1, budget: 5 }, 0)).toThrow()
    expect(() => spendEpsilon('pool-1', { spent: 1, budget: 5 }, -1)).toThrow()
  })
})
