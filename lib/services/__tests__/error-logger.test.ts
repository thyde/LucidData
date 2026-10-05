import { describe, it, expect, vi, afterEach } from 'vitest'
import { errorLogger, ErrorSeverity } from '@/lib/services/error-logger'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('errorLogger in production', () => {
  it('writes one scrubbed JSON line instead of dropping the event', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    errorLogger.log(new Error('Refresh failed for jane@example.com'), ErrorSeverity.HIGH, {
      action: 'CONNECTOR_REFRESH_FAILED',
      metadata: { sourceId: 'src-1', token: 'abc' },
    })

    expect(error).toHaveBeenCalledTimes(1)
    const line = JSON.parse(error.mock.calls[0][0] as string)
    expect(line).toMatchObject({
      severity: 'high',
      message: 'Refresh failed for [email]',
      action: 'CONNECTOR_REFRESH_FAILED',
      metadata: { sourceId: 'src-1', token: '[redacted]' },
    })
  })

  it('uses warn for low and medium severity', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    errorLogger.log(new Error('minor'), ErrorSeverity.LOW)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()
  })
})

describe('errorLogger in tests', () => {
  it('stays silent', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    errorLogger.log(new Error('quiet'), ErrorSeverity.CRITICAL)

    expect(error).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })
})
