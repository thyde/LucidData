import tiers from '@/extension/tiers.json'
import manifest from '@/extension/manifest.json'

/**
 * LD-205 extension capability model, as the application sees it.
 *
 * `extension/tiers.json` is the single source. The extension reads it at
 * runtime, this module types it for the trust centre, and a test asserts it
 * matches `extension/manifest.json`. Widening the manifest without saying so
 * here fails the build, which is the only reason the published permission list
 * can be trusted.
 */

export interface ExtensionTier {
  id: number
  spec: string
  name: string
  capability: string
  granted: string
  permissions: string[]
  origins: string[]
  reason: string
}

export const EXTENSION_TIERS: ExtensionTier[] = tiers.tiers
export const EXTENSION_INSTALL_PERMISSIONS: string[] = tiers.installPermissions
export const EXTENSION_INSTALL_HOSTS: string[] = tiers.installHostPermissions
export const EXTENSION_VERSION: string = manifest.version

/**
 * Permissions that would let the extension observe general browsing. None of
 * these may appear in the install set, and a test enforces that.
 */
export const BROWSING_PERMISSIONS = [
  'tabs',
  'history',
  'webNavigation',
  'webRequest',
  'browsingData',
  'bookmarks',
  'cookies',
  'declarativeNetRequestFeedback',
] as const

/** Plain-language description of each install-time permission. */
export const INSTALL_PERMISSION_REASONS: Record<string, string> = {
  downloads:
    'Sees the name and address of files your browser saves, so a finished export can be spotted. It cannot read pages or history.',
  storage: 'Remembers which capabilities you turned on, on your device. Nothing else.',
}

/**
 * The distribution position, stated rather than implied. The extension is in
 * this repository and is not yet in any browser store.
 */
export const EXTENSION_AVAILABILITY =
  'The extension is built and reviewable in the open, and is not yet published to a browser store. Until it is, it can be loaded unpacked from the repository.'

/**
 * LD-206 commitments. Each one is enforced by a test rather than by intent, so
 * this list is a description of behaviour and not a policy.
 */
export const LD206_COMMITMENTS = [
  'Only the registrable domain of a collector is kept. Never a path, a query string, or a fragment, which is where session tokens and email addresses live.',
  'Which sites you visited is never written to your vault. A saved summary holds counts and company names.',
  'Health, finance, legal, adult, government, and support sites produce no record at all. Not a filtered one, none, because the visit itself would be the disclosure.',
  'Subdomains are collapsed to the organization, so a record cannot say which product you used.',
  'While tracker insight is on, the extension sends the Global Privacy Control signal. Reporting who tracks you while staying silent about your opt-out would be incoherent.',
] as const
