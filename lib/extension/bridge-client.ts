'use client'

/**
 * LD-205 page side of the extension bridge.
 *
 * The extension's content script runs only on this origin and answers a
 * request/response protocol over `window.postMessage`. This module is the
 * page's half of it.
 *
 * Every call resolves. A missing extension is the normal case, not an error,
 * so `isExtensionPresent` answers false after a short wait rather than
 * throwing or hanging the page.
 */

const REQUEST = 'lucid-extension:request'
const RESPONSE = 'lucid-extension:response'
const TIMEOUT_MS = 1500

export interface PendingExport {
  filename: string
  provider: string
  providerLabel: string
  text: string
}

interface BridgeReply<T> {
  ok: boolean
  payload?: T
  error?: string
}

function ask<T>(action: string): Promise<BridgeReply<T> | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)

  const id = `${action}:${Math.random().toString(36).slice(2)}`

  return new Promise((resolve) => {
    let settled = false

    function onMessage(event: MessageEvent) {
      if (event.source !== window) return
      if (event.origin !== window.location.origin) return
      const data = event.data
      if (!data || data.channel !== RESPONSE || data.id !== id) return
      settled = true
      window.removeEventListener('message', onMessage)
      resolve(data as BridgeReply<T>)
    }

    window.addEventListener('message', onMessage)
    window.postMessage({ channel: REQUEST, id, action }, window.location.origin)

    setTimeout(() => {
      if (settled) return
      window.removeEventListener('message', onMessage)
      resolve(null)
    }, TIMEOUT_MS)
  })
}

export async function isExtensionPresent(): Promise<boolean> {
  const reply = await ask<{ version: string }>('ping')
  return Boolean(reply?.ok)
}

/**
 * Ask for a detected export. Returns null when there is no extension, no
 * pending file, or the extension refused, all of which are ordinary.
 */
export async function getPendingExport(): Promise<PendingExport | null> {
  const reply = await ask<PendingExport | { error: string } | null>('get-pending-export')
  if (!reply?.ok || !reply.payload) return null
  if ('error' in reply.payload) return null
  return reply.payload
}

export async function clearPendingExport(): Promise<void> {
  await ask('clear-pending-export')
}
