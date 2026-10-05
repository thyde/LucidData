'use client'

import { useEffect } from 'react'
import { redactAnalyticsEvent } from '@/lib/analytics/redact'

declare global {
  interface Window {
    va?: (name: string, value?: unknown) => void
    vaq?: [string, unknown][]
  }
}

export const ANALYTICS_SCRIPT_SRC = '/_vercel/insights/script.js'

/**
 * Vercel Web Analytics, loaded by hand rather than through @vercel/analytics so
 * every event passes the public-page allowlist before it is sent.
 */
export function PrivacyAnalytics() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production') return
    if (!window.va) {
      window.va = (name, value) => {
        ;(window.vaq ??= []).push([name, value])
      }
    }
    // Queued before the script loads, so it applies from the first page view.
    window.va('beforeSend', redactAnalyticsEvent)
    if (document.head.querySelector(`script[src="${ANALYTICS_SCRIPT_SRC}"]`)) return
    const script = document.createElement('script')
    script.src = ANALYTICS_SCRIPT_SRC
    script.defer = true
    document.head.appendChild(script)
  }, [])

  return null
}
