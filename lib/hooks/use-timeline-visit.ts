'use client'

import { useEffect } from 'react'
import { recordTimelineVisitAction } from '@/lib/actions/metrics.actions'

const VISIT_KEY = 'lucid:timeline-visit'
let countedThisPage = false

function localDay(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * LD-214: count the first time each day the timeline opens in this browser.
 * The server adds one to a daily total and keeps nothing about who or what,
 * so the once-a-day rule lives here. Storage that cannot be read still
 * counts once a page load rather than on every render.
 */
export function useTimelineVisit(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const today = localDay()
    try {
      if (window.localStorage.getItem(VISIT_KEY) === today) return
      window.localStorage.setItem(VISIT_KEY, today)
    } catch {
      if (countedThisPage) return
    }
    countedThisPage = true
    recordTimelineVisitAction().catch(() => undefined)
  }, [enabled])
}
