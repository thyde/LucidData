/**
 * LD-205 page bridge.
 *
 * Runs only on the LucidData origin, which is the only host permission the
 * extension holds at install. It lets the vault import dialog ask for a
 * detected export and receive it in the page, where the existing browser-side
 * pipeline encrypts it before anything is stored.
 *
 * Messages are checked against `event.source === window` and the origin, so a
 * framed third party cannot ask for the file.
 */

const REQUEST = 'lucid-extension:request'
const RESPONSE = 'lucid-extension:response'

window.addEventListener('message', async (event) => {
  if (event.source !== window) return
  if (event.origin !== window.location.origin) return

  const data = event.data
  if (!data || data.channel !== REQUEST) return

  const reply = (payload) =>
    window.postMessage({ channel: RESPONSE, id: data.id, ...payload }, window.location.origin)

  try {
    if (data.action === 'ping') {
      reply({ ok: true, payload: { version: chrome.runtime.getManifest().version } })
      return
    }

    if (data.action === 'get-pending-export') {
      const result = await chrome.runtime.sendMessage({ type: 'lucid:get-pending-export' })
      reply(result)
      return
    }

    if (data.action === 'clear-pending-export') {
      const result = await chrome.runtime.sendMessage({ type: 'lucid:clear-pending-export' })
      reply(result)
      return
    }

    // LD-206. The page asks for the summary; the extension never pushes it,
    // and there is no path that sends it anywhere else.
    if (data.action === 'get-insight') {
      const result = await chrome.runtime.sendMessage({ type: 'lucid:get-insight' })
      reply(result)
      return
    }

    if (data.action === 'clear-insight') {
      const result = await chrome.runtime.sendMessage({ type: 'lucid:clear-insight' })
      reply(result)
      return
    }

    reply({ ok: false, error: `Unknown action: ${data.action}` })
  } catch (error) {
    reply({ ok: false, error: String(error) })
  }
})

// Announce presence so the page can show the import assistant without polling.
window.postMessage(
  { channel: RESPONSE, id: 'announce', ok: true, payload: { present: true } },
  window.location.origin
)
