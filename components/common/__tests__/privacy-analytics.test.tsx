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

  it('loads nothing on a shared summary, whose key is in the address', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    window.history.replaceState(null, '', '/share/3f2a0c4e-1b5d-4c6e-8f70-9a1b2c3d4e5f#AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8')
    try {
      render(<PrivacyAnalytics />)
      expect(analyticsScripts()).toHaveLength(0)
      expect(window.va).toBeUndefined()
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })
})
