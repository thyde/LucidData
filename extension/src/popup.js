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
  'https://luciddatabank.com/*': 'https://luciddatabank.com',
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
  } else {
    block.hidden = false
    idle.hidden = true
    const name = (pending.filename ?? '').split(/[\\/]/).pop()
    document.getElementById('pending-text').textContent =
      `${pending.providerLabel} export ready: ${name}`
  }

  await renderInsight()
}

/**
 * LD-206. Reads the summary the background worker already computed on this
 * device. Nothing here fetches or sends anything.
 */
async function renderInsight() {
  const section = document.getElementById('insight')
  const result = await chrome.runtime.sendMessage({ type: 'lucid:get-insight' })
  const payload = result?.payload

  if (!payload?.enabled || !payload.summary || payload.summary.siteCount === 0) {
    section.hidden = true
    return
  }

  const { summary } = payload
  section.hidden = false

  const reach = Math.round(summary.reach * 100)
  document.getElementById('insight-headline').textContent = summary.topCompany
    ? `${summary.topCompany.company} was on ${reach}% of the ${summary.siteCount} sites you visited.`
    : `${summary.collectorCount} collectors across ${summary.siteCount} sites.`

  const list = document.getElementById('insight-list')
  list.replaceChildren()
  for (const company of summary.companies.slice(0, 5)) {
    const item = document.createElement('li')
    item.textContent = `${company.company} — ${company.sites} of ${summary.siteCount} sites`
    list.append(item)
  }

  const skipped = document.getElementById('insight-skipped')
  if (summary.skipped > 0) {
    skipped.hidden = false
    skipped.textContent = `${summary.skipped} visit${summary.skipped === 1 ? ' was' : 's were'} left out. Health, finance, legal, adult, and support sites are excluded by default.`
  } else {
    skipped.hidden = true
  }
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

document.getElementById('open-dashboard').addEventListener('click', async () => {
  const origin = await appOrigin()
  await chrome.tabs.create({ url: `${origin}/dashboard` })
  window.close()
})

await render()
