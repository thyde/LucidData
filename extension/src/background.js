/**
 * LD-205 background worker.
 *
 * Two jobs, both tier 0:
 *   1. Notice when a data export finishes downloading.
 *   2. Hand the file to the LucidData import dialog, in the browser, without
 *      a server round trip.
 *
 * The second is the part that matters. The file is read here and posted to the
 * page, which encrypts it with the user's key before anything is stored. The
 * extension never uploads it.
 */

import { EXPORT_SOURCES, matchExportSource } from './sources.js'
import { analysePage, mergeIntoProfile, summariseProfile, toVaultRecord } from './insight.js'
import { disableGpc, enableGpc, isGpcActive } from './gpc.js'
import { readResourceUrls } from './reader.js'
import { isTierEnabled } from './tiers.js'

const PENDING_KEY = 'pendingExport'
const PROFILE_KEY = 'insightProfile'
/** A provider export can be large, but not this large. Refuse rather than hang. */
const MAX_EXPORT_BYTES = 25 * 1024 * 1024

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await chrome.storage.local.set({ installedAt: Date.now() })
    // Say what was and was not granted, before the user has to ask.
    await chrome.tabs.create({ url: chrome.runtime.getURL('src/options.html') })
  }
})

chrome.downloads.onChanged.addListener(async (delta) => {
  if (delta.state?.current !== 'complete') return

  const [item] = await chrome.downloads.search({ id: delta.id })
  if (!item) return

  const source = matchExportSource(item.url ?? '', item.filename ?? '')
  if (!source) return

  await chrome.storage.local.set({
    [PENDING_KEY]: {
      downloadId: item.id,
      filename: item.filename,
      provider: source.id,
      providerLabel: source.label,
      detectedAt: Date.now(),
    },
  })

  await chrome.action.setBadgeText({ text: '1' })
  await chrome.action.setBadgeBackgroundColor({ color: '#b91c1c' })
})

/**
 * Read the detected file and hand it to the page.
 *
 * `chrome.downloads` gives a path, not contents, so the file is fetched
 * through the download's own file URL. That read happens here and the bytes go
 * straight to the page that asked for them.
 */
async function readPendingExport() {
  const stored = await chrome.storage.local.get(PENDING_KEY)
  const pending = stored[PENDING_KEY]
  if (!pending) return null

  const [item] = await chrome.downloads.search({ id: pending.downloadId })
  if (!item || item.state !== 'complete' || !item.exists) {
    await chrome.storage.local.remove(PENDING_KEY)
    return null
  }

  if (item.fileSize > MAX_EXPORT_BYTES) {
    return {
      error: 'That export is larger than the import assistant can hand over. Import it from the vault page instead.',
    }
  }

  const response = await fetch(`file://${item.filename}`)
  const text = await response.text()
  return {
    filename: pending.filename,
    provider: pending.provider,
    providerLabel: pending.providerLabel,
    text,
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'lucid:get-pending-export') {
    readPendingExport()
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }))
    return true
  }

  if (message?.type === 'lucid:clear-pending-export') {
    chrome.storage.local
      .remove(PENDING_KEY)
      .then(() => chrome.action.setBadgeText({ text: '' }))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }))
    return true
  }

  if (message?.type === 'lucid:list-export-sources') {
    sendResponse({ ok: true, payload: EXPORT_SOURCES })
    return false
  }

  if (message?.type === 'lucid:get-insight') {
    readInsight()
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }))
    return true
  }

  if (message?.type === 'lucid:clear-insight') {
    chrome.storage.local
      .remove(PROFILE_KEY)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }))
    return true
  }

  return false
})

/**
 * LD-206 tracker insight.
 *
 * The whole path is: the browser tells us a navigation finished, we ask the
 * page what it already fetched, and we classify that here. Nothing is sent
 * anywhere to do it, and nothing but a registrable domain is kept.
 */
chrome.webNavigation?.onCompleted.addListener(async (details) => {
  // Sub-frames are already covered by the top document's resource timeline.
  if (details.frameId !== 0) return
  if (!(await isTierEnabled(1))) return

  let resourceUrls = []
  try {
    // `func` rather than `files`: the injected function's return value comes
    // back, and it has no imports, so Chrome can serialize it.
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      func: readResourceUrls,
    })
    resourceUrls = result?.result ?? []
  } catch {
    // A page we cannot read is a page we do not report on. Chrome internal
    // pages and the store are the common cases and neither is interesting.
    return
  }

  const analysis = analysePage(details.url, resourceUrls)
  if (!analysis) return

  const stored = await chrome.storage.local.get(PROFILE_KEY)
  const profile = mergeIntoProfile(stored[PROFILE_KEY], analysis)
  await chrome.storage.local.set({ [PROFILE_KEY]: profile })
})

async function readInsight() {
  if (!(await isTierEnabled(1))) return { enabled: false }
  const stored = await chrome.storage.local.get(PROFILE_KEY)
  const profile = stored[PROFILE_KEY] ?? null
  return {
    enabled: true,
    gpc: await isGpcActive(),
    summary: summariseProfile(profile),
    vaultRecord: profile ? toVaultRecord(profile) : null,
  }
}

/**
 * Keep the opt-out signal tied to the capability that reports on tracking.
 * Turning insight on starts sending GPC; turning it off stops.
 */
chrome.permissions.onAdded.addListener(async () => {
  if (await isTierEnabled(1)) await enableGpc().catch(() => undefined)
})

chrome.permissions.onRemoved.addListener(async () => {
  if (!(await isTierEnabled(1))) {
    await disableGpc().catch(() => undefined)
    // Findings were only meaningful while the capability was on. Keeping them
    // after it is revoked would be keeping browsing data the person withdrew
    // permission for.
    await chrome.storage.local.remove(PROFILE_KEY)
  }
})
