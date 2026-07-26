import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  BROWSING_PERMISSIONS,
  EXTENSION_INSTALL_HOSTS,
  EXTENSION_INSTALL_PERMISSIONS,
  EXTENSION_TIERS,
  INSTALL_PERMISSION_REASONS,
} from '@/lib/constants/extension'

/**
 * LD-205: the install-time permission set is a public promise, so it is pinned
 * here. Widening the manifest without changing this test is the exact mistake
 * this file exists to catch, because a user cannot audit a permission list
 * that quietly grew between releases.
 */
const manifest = JSON.parse(
  readFileSync(join(process.cwd(), 'extension/manifest.json'), 'utf8')
) as {
  manifest_version: number
  permissions: string[]
  optional_permissions: string[]
  host_permissions: string[]
  optional_host_permissions: string[]
  content_scripts: { matches: string[] }[]
  background: { service_worker: string }
}

const tiers = JSON.parse(
  readFileSync(join(process.cwd(), 'extension/tiers.json'), 'utf8')
) as {
  installPermissions: string[]
  installHostPermissions: string[]
  tiers: { id: number; permissions: string[]; origins: string[]; reason: string }[]
}

describe('extension manifest', () => {
  it('is Manifest V3', () => {
    expect(manifest.manifest_version).toBe(3)
  })

  // The pin. Changing this list is a deliberate act, not a side effect.
  it('grants exactly downloads and storage at install', () => {
    expect([...manifest.permissions].sort()).toEqual(['downloads', 'storage'])
  })

  it('holds no permission that can observe general browsing', () => {
    for (const permission of BROWSING_PERMISSIONS) {
      expect(
        manifest.permissions,
        `${permission} must not be an install-time permission`
      ).not.toContain(permission)
    }
  })

  it('reaches only this application at install', () => {
    expect(manifest.host_permissions).toEqual([
      'http://localhost:3000/*',
      'https://lucid-data.vercel.app/*',
    ])
  })

  it('keeps all-sites access optional, so the browser withholds it until asked', () => {
    expect(manifest.optional_host_permissions).toContain('<all_urls>')
    expect(manifest.host_permissions).not.toContain('<all_urls>')
  })

  it('declares every browsing permission a later tier needs as optional', () => {
    const needed = new Set(tiers.tiers.flatMap((tier) => tier.permissions))
    for (const permission of needed) {
      expect(
        manifest.optional_permissions,
        `${permission} is needed by a tier and must be optional`
      ).toContain(permission)
      expect(manifest.permissions).not.toContain(permission)
    }
  })

  it('runs its content script only on this application', () => {
    for (const script of manifest.content_scripts) {
      expect(script.matches).toEqual(manifest.host_permissions)
    }
  })
})

describe('extension tier model', () => {
  it('matches the manifest, so the published list cannot drift', () => {
    expect(tiers.installPermissions).toEqual(manifest.permissions)
    expect(tiers.installHostPermissions).toEqual(manifest.host_permissions)
  })

  it('is exposed to the application unchanged', () => {
    expect(EXTENSION_INSTALL_PERMISSIONS).toEqual(tiers.installPermissions)
    expect(EXTENSION_INSTALL_HOSTS).toEqual(tiers.installHostPermissions)
    expect(EXTENSION_TIERS).toHaveLength(tiers.tiers.length)
  })

  it('gives tier 0 no permission beyond the install set', () => {
    const tier0 = EXTENSION_TIERS.find((tier) => tier.id === 0)
    expect(tier0).toBeDefined()
    expect(tier0!.permissions).toEqual([])
    expect(tier0!.origins).toEqual([])
  })

  it('never bundles the contribution tier with the insight tier', () => {
    const insight = EXTENSION_TIERS.find((tier) => tier.id === 1)
    const contribution = EXTENSION_TIERS.find((tier) => tier.id === 2)
    expect(insight!.granted).toMatch(/separate opt-in/i)
    expect(contribution!.granted).toMatch(/never bundled/i)
  })

  it('states a reason for every capability that needs a permission', () => {
    for (const tier of EXTENSION_TIERS) {
      expect(tier.reason.length).toBeGreaterThan(30)
      expect(tier.capability.length).toBeGreaterThan(20)
    }
  })

  it('describes every install-time permission in plain language', () => {
    for (const permission of EXTENSION_INSTALL_PERMISSIONS) {
      expect(
        INSTALL_PERMISSION_REASONS[permission],
        `${permission} needs a published reason`
      ).toBeTruthy()
    }
  })
})
