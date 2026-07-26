import { describe, it, expect, beforeEach, vi } from 'vitest'

const createAuditEntry = vi.fn()
const selectResult = vi.fn()
const updateSpy = vi.fn()

vi.mock('@/lib/services/audit.service', () => ({
  createAuditEntry: (...a: unknown[]) => createAuditEntry(...a),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        update: (patch: unknown) => {
          updateSpy(patch)
          return chain
        },
        eq: () => chain,
        maybeSingle: () => Promise.resolve(selectResult()),
        then: (resolve: (value: { error: null }) => unknown) => resolve({ error: null }),
      }
      return chain
    },
  }),
}))

const {
  parseGpcHeader,
  getUniversalOptOut,
  recordUniversalOptOut,
  overrideUniversalOptOut,
  restoreUniversalOptOut,
  assertNotUniversallyOptedOut,
} = await import('@/lib/services/privacy-signal.service')

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      universal_opt_out: false,
      universal_opt_out_source: null,
      universal_opt_out_at: null,
      universal_opt_out_override_at: null,
      ...overrides,
    },
    error: null,
  }
}

beforeEach(() => {
  createAuditEntry.mockReset().mockResolvedValue(undefined)
  updateSpy.mockReset()
  selectResult.mockReset().mockReturnValue(userRow())
})

describe('parseGpcHeader', () => {
  it('treats only the exact value 1 as opted out', () => {
    expect(parseGpcHeader('1')).toBe(true)
    expect(parseGpcHeader(' 1 ')).toBe(true)
    expect(parseGpcHeader('0')).toBe(false)
    expect(parseGpcHeader('true')).toBe(false)
    expect(parseGpcHeader(null)).toBe(false)
    expect(parseGpcHeader(undefined)).toBe(false)
  })
})

describe('recordUniversalOptOut', () => {
  it('sets the flag and audits once on first detection', async () => {
    const changed = await recordUniversalOptOut('user-1', 'gpc_header')

    expect(changed).toBe(true)
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ universal_opt_out: true, universal_opt_out_source: 'gpc_header' })
    )
    expect(createAuditEntry).toHaveBeenCalledTimes(1)
  })

  it('writes nothing on a repeat request once the flag is set', async () => {
    selectResult.mockReturnValue(
      userRow({ universal_opt_out: true, universal_opt_out_source: 'gpc_header' })
    )

    const changed = await recordUniversalOptOut('user-1', 'gpc_header')

    expect(changed).toBe(false)
    expect(updateSpy).not.toHaveBeenCalled()
    expect(createAuditEntry).not.toHaveBeenCalled()
  })

  it('respects a deliberate override rather than re-applying the signal', async () => {
    selectResult.mockReturnValue(
      userRow({ universal_opt_out: false, universal_opt_out_override_at: '2026-07-25T00:00:00Z' })
    )

    const changed = await recordUniversalOptOut('user-1', 'gpc_header')

    expect(changed).toBe(false)
    expect(updateSpy).not.toHaveBeenCalled()
    expect(createAuditEntry).not.toHaveBeenCalled()
  })
})

describe('overrideUniversalOptOut', () => {
  it('records the opt-in as its own distinct event', async () => {
    await overrideUniversalOptOut('user-1')

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        universal_opt_out: false,
        universal_opt_out_override_at: expect.any(String),
      })
    )
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'universal_opt_out_overridden' })
    )
  })
})

describe('restoreUniversalOptOut', () => {
  it('clears the override and turns the opt-out back on', async () => {
    await restoreUniversalOptOut('user-1')

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        universal_opt_out: true,
        universal_opt_out_override_at: null,
      })
    )
    expect(createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'universal_opt_out_restored' })
    )
  })
})

describe('assertNotUniversallyOptedOut', () => {
  it('allows the action when no signal is active', async () => {
    await expect(assertNotUniversallyOptedOut('user-1')).resolves.toBeUndefined()
  })

  it('refuses with a reason the user can act on', async () => {
    selectResult.mockReturnValue(userRow({ universal_opt_out: true }))
    await expect(assertNotUniversallyOptedOut('user-1')).rejects.toThrow(
      /universal opt-out signal/i
    )
  })
})

describe('getUniversalOptOut', () => {
  it('reports the detected state', async () => {
    selectResult.mockReturnValue(
      userRow({
        universal_opt_out: true,
        universal_opt_out_source: 'gpc_navigator',
        universal_opt_out_at: '2026-07-25T00:00:00Z',
      })
    )

    await expect(getUniversalOptOut('user-1')).resolves.toEqual({
      optedOut: true,
      source: 'gpc_navigator',
      detectedAt: '2026-07-25T00:00:00Z',
      overriddenAt: null,
    })
  })
})
