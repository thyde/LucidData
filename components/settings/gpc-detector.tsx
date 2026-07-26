'use client'

import { useEffect } from 'react'
import { recordGpcFromBrowserAction } from '@/lib/actions/privacy-signal.actions'

/**
 * LD-302: some browsers expose navigator.globalPrivacyControl even when the
 * Sec-GPC header does not survive to the server (a proxy or CDN can strip it).
 * This reports the property once per mount; the server records and audits it
 * only the first time, so repeat reports are harmless.
 *
 * Renders nothing.
 */
export function GpcDetector() {
  useEffect(() => {
    const signal = (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl
    if (signal !== true) return
    void recordGpcFromBrowserAction().catch(() => {
      // Best-effort: the header path also records the signal.
    })
  }, [])

  return null
}
