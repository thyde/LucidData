/**
 * LD-205 tier state.
 *
 * The rule this module exists to enforce: a tier is on when the browser says
 * the permission is held, not when our own storage says so. Anything else
 * would let the extension claim a capability it does not have, or keep a
 * permission after the user turned the feature off.
 */

const TIERS_URL = chrome.runtime.getURL('tiers.json')

let cached = null

export async function loadTiers() {
  if (cached) return cached
  const response = await fetch(TIERS_URL)
  cached = await response.json()
  return cached
}

export async function tierById(id) {
  const { tiers } = await loadTiers()
  const tier = tiers.find((entry) => entry.id === id)
  if (!tier) throw new Error(`Unknown capability tier: ${id}`)
  return tier
}

/**
 * Ask the browser, not our own storage. Tier 0 is always on because its
 * permissions are in the install set.
 */
export async function isTierEnabled(id) {
  const tier = await tierById(id)
  if (tier.permissions.length === 0 && tier.origins.length === 0) return true
  return chrome.permissions.contains({
    permissions: tier.permissions,
    origins: tier.origins,
  })
}

/**
 * Request a tier. Returns false when the user declines, and writes nothing in
 * that case, so a declined prompt leaves no trace of an enabled feature.
 */
export async function enableTier(id) {
  const tier = await tierById(id)
  if (tier.permissions.length === 0 && tier.origins.length === 0) return true

  const granted = await chrome.permissions.request({
    permissions: tier.permissions,
    origins: tier.origins,
  })
  if (!granted) return false

  await chrome.storage.local.set({ [`tier:${id}`]: { enabledAt: Date.now() } })
  return true
}

/**
 * Turn a tier off by removing the browser permission.
 *
 * Two tiers can share a permission, so it is only removed once no other
 * enabled tier still needs it. Removing a permission another live tier depends
 * on would silently break that tier.
 */
export async function disableTier(id) {
  const { tiers } = await loadTiers()
  const tier = tiers.find((entry) => entry.id === id)
  if (!tier) throw new Error(`Unknown capability tier: ${id}`)

  await chrome.storage.local.remove(`tier:${id}`)
  if (tier.permissions.length === 0 && tier.origins.length === 0) return true

  const stored = await chrome.storage.local.get(null)
  const stillNeeded = new Set()
  const originsNeeded = new Set()
  for (const other of tiers) {
    if (other.id === id) continue
    if (!stored[`tier:${other.id}`]) continue
    for (const permission of other.permissions) stillNeeded.add(permission)
    for (const origin of other.origins) originsNeeded.add(origin)
  }

  const permissions = tier.permissions.filter((p) => !stillNeeded.has(p))
  const origins = tier.origins.filter((o) => !originsNeeded.has(o))
  if (permissions.length === 0 && origins.length === 0) return true

  return chrome.permissions.remove({ permissions, origins })
}

export async function tierStates() {
  const { tiers } = await loadTiers()
  const states = []
  for (const tier of tiers) {
    states.push({ ...tier, enabled: await isTierEnabled(tier.id) })
  }
  return states
}
