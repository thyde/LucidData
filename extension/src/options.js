import { disableTier, enableTier, loadTiers, tierStates } from './tiers.js'
import { EXPORT_SOURCES } from './sources.js'

/**
 * LD-205 consent surface.
 *
 * Reads the browser's permission state on every render rather than trusting a
 * stored flag, so what this page shows is what the browser actually holds.
 */

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag)
  Object.assign(node, props)
  for (const child of children) {
    node.append(child)
  }
  return node
}

async function renderInstallPermissions() {
  const { installPermissions, installHostPermissions } = await loadTiers()
  const list = document.getElementById('install-permissions')
  list.replaceChildren()

  const described = {
    downloads:
      'Downloads. Sees the name and address of files your browser saves, so a finished export can be spotted.',
    storage: 'Storage. Remembers which capabilities you turned on. Nothing else.',
  }

  for (const permission of installPermissions) {
    list.append(el('li', { textContent: described[permission] ?? permission }))
  }
  list.append(
    el('li', {
      textContent: `Access to ${installHostPermissions.join(' and ')} only, so a detected export can be handed to your vault.`,
    })
  )
}

async function renderTiers() {
  const states = await tierStates()
  const list = document.getElementById('tiers')
  list.replaceChildren()

  for (const tier of states) {
    const heading = el('h3', { textContent: `${tier.name} (${tier.spec})` })
    const status = el('p', {
      className: tier.enabled ? 'status status-on' : 'status status-off',
      textContent: tier.enabled ? 'On' : 'Off',
    })
    const capability = el('p', { textContent: tier.capability })
    const reason = el('p', { className: 'note', textContent: tier.reason })
    const granted = el('p', { className: 'note', textContent: `Granted: ${tier.granted}` })

    const item = el('li', { className: 'tier' }, [heading, status, capability, reason, granted])

    if (tier.permissions.length > 0 || tier.origins.length > 0) {
      const button = el('button', {
        type: 'button',
        textContent: tier.enabled ? `Turn off ${tier.name.toLowerCase()}` : `Turn on ${tier.name.toLowerCase()}`,
      })
      button.addEventListener('click', async () => {
        button.disabled = true
        try {
          if (tier.enabled) {
            await disableTier(tier.id)
          } else {
            await enableTier(tier.id)
          }
        } finally {
          await renderTiers()
        }
      })
      item.append(button)
    }

    list.append(item)
  }
}

function renderSources() {
  const list = document.getElementById('sources')
  list.replaceChildren()

  for (const source of EXPORT_SOURCES) {
    const steps = el(
      'ol',
      {},
      source.steps.map((step) => el('li', { textContent: step }))
    )
    const item = el('li', { className: 'source' }, [
      el('h3', { textContent: source.label }),
      steps,
    ])
    if (source.requestUrl) {
      const link = el('a', { href: source.requestUrl, textContent: `Open ${source.label}` })
      link.target = '_blank'
      link.rel = 'noreferrer'
      item.append(link)
    }
    list.append(item)
  }
}

// The browser can revoke a permission from its own settings page, so re-read
// rather than assuming this page is the only way it changes.
chrome.permissions.onAdded.addListener(() => renderTiers())
chrome.permissions.onRemoved.addListener(() => renderTiers())

await renderInstallPermissions()
await renderTiers()
renderSources()
