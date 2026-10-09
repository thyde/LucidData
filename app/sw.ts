/// <reference lib="webworker" />

import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { NetworkOnly, Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Supabase responses carry account data, and Turnstile breaks if its script is cached.
    { matcher: ({ sameOrigin }) => !sameOrigin, handler: new NetworkOnly() },
    // A shared summary must stop opening the moment it is revoked, offline included.
    {
      matcher: ({ sameOrigin, url: { pathname } }) => sameOrigin && pathname.startsWith('/api/share/'),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  disableDevLogs: true,
})

// Earlier workers filled this cache with cross-origin responses; nothing reads it now.
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.delete('cross-origin'))
})

serwist.addEventListeners()