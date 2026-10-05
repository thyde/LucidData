import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { ANALYTICS_SCRIPT_SRC, PrivacyAnalytics } from '@/components/common/privacy-analytics'
import { redactAnalyticsEvent } from '@/lib/analytics/redact'

function analyticsScripts() {
  return document.head.querySelectorAll(`script[src="${ANALYTICS_SCRIPT_SRC}"]`)
}

beforeEach(() => {
  analyticsScripts().forEach((node) => node.remove())
  delete window.va
  delete window.vaq
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('PrivacyAnalytics', () => {
  it('loads nothing outside the production deployment', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview')
    render(<PrivacyAnalytics />)
    expect(analyticsScripts()).toHaveLength(0)
    expect(window.va).toBeUndefined()
  })

  it('registers the redaction hook before loading the script once', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    render(<PrivacyAnalytics />)
    render(<PrivacyAnalytics />)

    expect(analyticsScripts()).toHaveLength(1)
    expect(window.vaq?.[0]).toEqual(['beforeSend', redactAnalyticsEvent])
  })
})
