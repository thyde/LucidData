import { loadTiers } from './tiers.js'

/**
 * LD-205 popup.
 *
 * Reports whether an export is waiting and sends the user to their vault to
 * import it. The file itself is never read here; that happens only when the
 * vault page asks for it, so a file sits untouched unless the user acts.
 */

const APP_ORIGINS = {
  'http://localhost:3000/*': 'http://localhost:3000',
  'https://lucid-data.vercel.app/*': 'https://lucid-data.vercel.app',
}

async function appOrigin() {
  const { installHostPermissions } = await loadTiers()
  // Prefer the deployed app. Local is only useful to someone running it.
  const production = installHostPermissions.find((pattern) => pattern.startsWith('https://'))
  return APP_ORIGINS[production ?? installHostPermissions[0]]
}

async function render() {
  const stored = await chrome.storage.local.get('pendingExport')
  const pending = stored.pendingExport
  const block = document.getElementById('pending')
  const idle = document.getElementById('idle')

  if (!pending) {
    block.hidden = true
    idle.hidden = false
    return
  }

  block.hidden = false
  idle.hidden = true
  const name = (pending.filename ?? '').split(/[\\/]/).pop()
  document.getElementById('pending-text').textContent =
    `${pending.providerLabel} export ready: ${name}`
}

document.getElementById('open-import').addEventListener('click', async () => {
  const origin = await appOrigin()
  await chrome.tabs.create({ url: `${origin}/vault?import=extension` })
  window.close()
})

document.getElementById('dismiss').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'lucid:clear-pending-export' })
  await render()
})

document.getElementById('open-options').addEventListener('click', (event) => {
  event.preventDefault()
  chrome.runtime.openOptionsPage()
})

await render()
