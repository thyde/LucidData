/**
 * LD-501 differential privacy for aggregates.
 *
 * k-anonymity protects a row-level release. It does nothing about a buyer who
 * asks the same aggregate question repeatedly and watches the answer move as
 * one person joins or leaves. Laplace noise plus a per-pool epsilon budget is
 * what closes that gap: each answer is slightly wrong, and the pool runs out of
 * answers before the errors average away.
 *
 * Noise is drawn from a seeded generator so a given query on a given pool
 * returns the same answer twice. Re-rolling the noise per call would let a
 * buyer average it out with repetition, which defeats the point.
 */

import { createHash } from 'crypto'

/** Per-query epsilon. Smaller means more noise and more privacy. */
export const DEFAULT_EPSILON = 0.5

/** Total epsilon a pool may spend before aggregate release stops. */
export const DEFAULT_EPSILON_BUDGET = 5

/** A count changes by at most 1 when one person is added or removed. */
export const COUNT_SENSITIVITY = 1

export class EpsilonExhaustedError extends Error {
  constructor(public readonly poolId: string) {
    super('This pool has reached its privacy budget. No further aggregates can be released.')
    this.name = 'EpsilonExhaustedError'
  }
}

/**
 * A uniform generator seeded from a stable string, so the same question against
 * the same pool always draws the same noise.
 */
export function seededUniform(seed: string): () => number {
  let state = createHash('sha256').update(seed).digest().readUInt32BE(0) || 1
  return () => {
    // xorshift32. Small, fast, and deterministic across platforms.
    state ^= state << 13
    state >>>= 0
    state ^= state >> 17
    state ^= state << 5
    state >>>= 0
    // Keep it strictly inside (0, 1) so the log below never sees zero.
    return (state + 1) / 4294967297
  }
}

/**
 * Inverse-transform sample from Laplace(0, scale). Split-uniform form, so the
 * sign is drawn independently of the magnitude.
 */
export function laplaceSample(scale: number, uniform: () => number): number {
  const u = uniform() - 0.5
  return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u))
}

export interface NoisyCount {
  value: number
  epsilonSpent: number
}

/**
 * A count with Laplace noise at the given epsilon. Never returns a negative
 * count: a buyer reading "-2 contributors" learns the answer was noised and can
 * start reasoning backwards from it.
 */
export function noisyCount(
  trueCount: number,
  options: { epsilon?: number; seed: string }
): NoisyCount {
  const epsilon = options.epsilon ?? DEFAULT_EPSILON
  if (epsilon <= 0) throw new Error('Epsilon must be greater than zero')
  const scale = COUNT_SENSITIVITY / epsilon
  const noise = laplaceSample(scale, seededUniform(options.seed))
  return { value: Math.max(0, Math.round(trueCount + noise)), epsilonSpent: epsilon }
}

export interface BudgetState {
  spent: number
  budget: number
}

export function remainingEpsilon(state: BudgetState): number {
  return Math.max(0, state.budget - state.spent)
}

/**
 * Spend epsilon, or refuse. Exhaustion has to block release rather than warn:
 * a budget that can be overdrawn is not a budget.
 */
export function spendEpsilon(
  poolId: string,
  state: BudgetState,
  epsilon: number = DEFAULT_EPSILON
): BudgetState {
  if (epsilon <= 0) throw new Error('Epsilon must be greater than zero')
  if (remainingEpsilon(state) < epsilon) throw new EpsilonExhaustedError(poolId)
  return { spent: Number((state.spent + epsilon).toFixed(6)), budget: state.budget }
}
