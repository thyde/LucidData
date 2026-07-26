import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * LD-205 tier permission behaviour.
 *
 * The claim that matters is "turning a capability off removes the browser
 * permission, not just a flag". These tests drive the real module against a
 * fake `chrome` so that claim is checked rather than asserted in prose.
 */

const tiersJson = readFileSync(join(process.cwd(), 'extension/tiers.json'), 'utf8')
const TIER_MODEL = JSON.parse(tiersJson) as {
  tiers: { id: number; permissions: string[]; origins: string[] }[]
}

function tierPermissions(id: number) {
  const tier = TIER_MODEL.tiers.find((entry) => entry.id === id)!
  return { permissions: tier.permissions, origins: tier.origins }
}

interface FakeChrome {
  granted: { permissions: Set<string>; origins: Set<string> }
  storage: Map<string, unknown>
  requestResult: boolean
  requests: unknown[]
  removals: unknown[]
}

let fake: FakeChrome

function installFakeChrome() {
  fake = {
    granted: { permissions: new Set(), origins: new Set() },
    storage: new Map(),
    requestResult: true,
    requests: [],
    removals: [],
  }

  const chrome = {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    permissions: {
      contains: vi.fn(async ({ permissions = [], origins = [] }) => {
        return (
          permissions.every((p: string) => fake.granted.permissions.has(p)) &&
          origins.every((o: string) => fake.granted.origins.has(o))
        )
      }),
      request: vi.fn(async (request: { permissions?: string[]; origins?: string[] }) => {
        fake.requests.push(request)
        if (!fake.requestResult) return false
        for (const p of request.permissions ?? []) fake.granted.permissions.add(p)
        for (const o of request.origins ?? []) fake.granted.origins.add(o)
        return true
      }),
      remove: vi.fn(async (request: { permissions?: string[]; origins?: string[] }) => {
        fake.removals.push(request)
        for (const p of request.permissions ?? []) fake.granted.permissions.delete(p)
        for (const o of request.origins ?? []) fake.granted.origins.delete(o)
        return true
      }),
    },
    storage: {
      local: {
        get: vi.fn(async (key: string | null) => {
          if (key === null) return Object.fromEntries(fake.storage)
          return fake.storage.has(key) ? { [key]: fake.storage.get(key) } : {}
        }),
        set: vi.fn(async (values: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(values)) fake.storage.set(k, v)
        }),
        remove: vi.fn(async (key: string) => {
          fake.storage.delete(key)
        }),
      },
    },
  }

  vi.stubGlobal('chrome', chrome)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ json: async () => JSON.parse(tiersJson) }))
  )
}

async function loadModule() {
  vi.resetModules()
  return import('@/extension/src/tiers.js') as Promise<{
    isTierEnabled: (id: number) => Promise<boolean>
    enableTier: (id: number) => Promise<boolean>
    disableTier: (id: number) => Promise<boolean>
    tierStates: () => Promise<{ id: number; enabled: boolean }[]>
  }>
}

describe('extension capability tiers', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    installFakeChrome()
  })

  it('reports tier 0 as always on, because it needs nothing beyond install', async () => {
    const { isTierEnabled } = await loadModule()
    expect(await isTierEnabled(0)).toBe(true)
  })

  it('reports a browsing tier as off before anything is granted', async () => {
    const { isTierEnabled } = await loadModule()
    expect(await isTierEnabled(1)).toBe(false)
  })

  it('asks the browser for the permission when a tier is enabled', async () => {
    const { enableTier, isTierEnabled } = await loadModule()

    expect(await enableTier(1)).toBe(true)
    expect(fake.requests).toEqual([tierPermissions(1)])
    expect(await isTierEnabled(1)).toBe(true)
  })

  it('leaves the tier off and stores nothing when the prompt is declined', async () => {
    fake.requestResult = false
    const { enableTier, isTierEnabled } = await loadModule()

    expect(await enableTier(1)).toBe(false)
    expect(await isTierEnabled(1)).toBe(false)
    expect(fake.storage.size).toBe(0)
  })

  // The claim the whole tier model rests on.
  it('removes the browser permission when a tier is turned off', async () => {
    const { enableTier, disableTier, isTierEnabled } = await loadModule()

    await enableTier(1)
    expect(await isTierEnabled(1)).toBe(true)

    await disableTier(1)
    expect(fake.removals).toEqual([tierPermissions(1)])
    expect(await isTierEnabled(1)).toBe(false)
    expect(fake.granted.permissions.has('webNavigation')).toBe(false)
  })

  it('keeps a shared permission while another enabled tier still needs it', async () => {
    const { enableTier, disableTier, isTierEnabled } = await loadModule()

    await enableTier(1)
    await enableTier(2)

    await disableTier(1)
    // Tier 2 still needs webNavigation and scripting, so removing them would
    // silently break it. Only what tier 1 alone required goes.
    const [removal] = fake.removals as { permissions: string[]; origins: string[] }[]
    expect(removal.permissions).not.toContain('webNavigation')
    expect(removal.permissions).not.toContain('scripting')
    expect(removal.permissions).toContain('declarativeNetRequestWithHostAccess')
    expect(removal.origins).toEqual([])
    expect(fake.granted.permissions.has('webNavigation')).toBe(true)
    expect(await isTierEnabled(2)).toBe(true)

    await disableTier(2)
    expect(fake.granted.permissions.has('webNavigation')).toBe(false)
    expect(fake.granted.permissions.has('scripting')).toBe(false)
    expect(await isTierEnabled(2)).toBe(false)
  })

  it('enabling tracker insight does not enable browsing contribution', async () => {
    const { enableTier } = await loadModule()

    await enableTier(1)
    // The browser permission overlaps, but the opt-in does not: tier 2 has no
    // stored enablement, so nothing claims the user agreed to sell anything.
    expect(fake.storage.has('tier:1')).toBe(true)
    expect(fake.storage.has('tier:2')).toBe(false)
  })

  it('reads enablement from the browser rather than its own storage', async () => {
    const { enableTier, isTierEnabled } = await loadModule()

    await enableTier(1)
    // The browser revoked it from its own settings page, behind our back.
    fake.granted.permissions.delete('webNavigation')

    expect(await isTierEnabled(1)).toBe(false)
  })

  it('reports every tier with its live state', async () => {
    const { tierStates } = await loadModule()
    const states = await tierStates()

    expect(states.map((tier) => tier.id)).toEqual([0, 1, 2])
    expect(states.find((tier) => tier.id === 0)!.enabled).toBe(true)
    expect(states.find((tier) => tier.id === 1)!.enabled).toBe(false)
  })

  it('refuses an unknown tier rather than silently doing nothing', async () => {
    const { enableTier } = await loadModule()
    await expect(enableTier(9)).rejects.toThrow(/Unknown capability tier/)
  })
})
