import { describe, it, expect } from 'vitest'
import { scrubLogEntry, scrubLogText } from '@/lib/utils/log-scrub'

const UUID = '6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f'

describe('scrubLogText', () => {
  it('replaces email addresses', () => {
    expect(scrubLogText('No account for jane.doe+test@example.co.uk')).toBe(
      'No account for [email]'
    )
  })

  it('drops query strings and fragments from URLs and paths', () => {
    expect(
      scrubLogText('POST https://www.strava.com/oauth/token?client_secret=abc&code=xyz failed')
    ).toBe('POST https://www.strava.com/oauth/token failed')
    expect(scrubLogText('GET /settings?connector=failed#sources')).toBe('GET /settings')
  })

  it('leaves a question mark in prose alone', () => {
    expect(scrubLogText('Did the provider respond?')).toBe('Did the provider respond?')
  })

  it('redacts bearer tokens and JWTs', () => {
    expect(scrubLogText('Authorization: Bearer abc.def-ghi')).toBe('Authorization: Bearer [redacted]')
    expect(scrubLogText('token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl')).toBe(
      'token [redacted]'
    )
  })

  it('redacts long opaque tokens such as share links but keeps UUIDs', () => {
    const shareToken = 'Qm9vbGVhbkNvbnN0YW50c0FyZU5vdFNlY3JldHNfX19f'
    expect(scrubLogText(`/verify/${shareToken}`)).toBe('/verify/[redacted]')
    expect(scrubLogText(`source ${UUID} failed`)).toBe(`source ${UUID} failed`)
  })

  it('caps the length of a single value', () => {
    expect(scrubLogText('x '.repeat(400)).length).toBeLessThanOrEqual(300)
  })
})

describe('scrubLogEntry', () => {
  it('keeps identifiers, counts, and descriptive fields, and redacts everything else', () => {
    const entry = scrubLogEntry({
      timestamp: '2026-10-05T00:00:00.000Z',
      severity: 'medium',
      message: 'Sync failed for a@b.co',
      userId: UUID,
      action: 'CONNECTOR_SYNC_FAILED',
      resource: 'data_sources',
      metadata: {
        sourceId: UUID,
        payout_id: UUID,
        provider: 'strava',
        attempts: 3,
        retried: false,
        email: 'a@b.co',
        body: '{"access_token":"secret"}',
        resting_heart_rate: '58',
        nested: { anything: true },
      },
    })

    expect(entry.message).toBe('Sync failed for [email]')
    expect(entry.metadata).toEqual({
      sourceId: UUID,
      payout_id: UUID,
      provider: 'strava',
      attempts: 3,
      retried: false,
      email: '[redacted]',
      body: '[redacted]',
      resting_heart_rate: '[redacted]',
      nested: '[redacted]',
    })
  })

  it('trims and scrubs the stack', () => {
    const stack = ['Error: failed for a@b.co', ...Array.from({ length: 20 }, (_, i) => `    at frame${i} (/var/task/x.js:1:1)`)].join('\n')
    const entry = scrubLogEntry({ timestamp: 't', severity: 'high', message: 'm', stack })
    const lines = entry.stack?.split('\n') ?? []
    expect(lines).toHaveLength(8)
    expect(lines[0]).toBe('Error: failed for [email]')
  })
})
