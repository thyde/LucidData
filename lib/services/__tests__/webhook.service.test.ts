import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * LD-602: a webhook goes to a URL the organization controls, over a network we
 * do not, to a system we have not reviewed. These tests cover the two things
 * that makes dangerous: what the payload carries, and where we are willing to
 * send it.
 */

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: () => ({}) }),
}))

vi.mock('@/lib/services/error-logger', () => ({
  ErrorSeverity: { LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' },
  errorLogger: { log: vi.fn() },
}))

const {
  MAX_DELIVERY_ATTEMPTS,
  SIGNATURE_TOLERANCE_SECONDS,
  WEBHOOK_EVENTS,
  WebhookPayloadError,
  WebhookUrlError,
  assertDeliverableUrl,
  assertResolvesPublicly,
  isPrivateAddress,
  assertNoPersonalData,
  backoffMsForAttempt,
  buildPayload,
  isWebhookEvent,
  signatureHeader,
  signPayload,
  verifySignature,
} = await import('@/lib/services/webhook.service')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('a payload never carries personal data', () => {
  it('builds a payload of identifiers and timestamps only', () => {
    const payload = buildPayload({
      id: '11111111-1111-4111-8111-111111111111',
      event: 'consent_request.approved',
      organizationId: '22222222-2222-4222-8222-222222222222',
      resourceType: 'consent_request',
      resourceId: '33333333-3333-4333-8333-333333333333',
    })
    expect(Object.keys(payload).sort()).toEqual([
      'apiVersion',
      'event',
      'id',
      'occurredAt',
      'organizationId',
      'resource',
    ])
  })

  it.each([
    ['user_id', { user_id: 'u-1' }],
    ['email', { email: 'person@example.com' }],
    ['data_category', { data_category: 'health' }],
    ['purpose', { purpose: 'research' }],
    ['claims', { claims: { degree: 'bachelor' } }],
    ['ciphertext', { ciphertext: 'abc' }],
  ])('refuses a payload carrying %s', (_label, extra) => {
    expect(() => assertNoPersonalData(extra)).toThrow(WebhookPayloadError)
  })

  it('refuses a forbidden key nested inside another object', () => {
    // A nested field is just as visible to the recipient as a top-level one.
    expect(() => assertNoPersonalData({ resource: { meta: { email: 'a@b.com' } } })).toThrow(
      WebhookPayloadError
    )
  })

  it('refuses a forbidden key inside an array', () => {
    expect(() => assertNoPersonalData({ items: [{ ok: 1 }, { user_id: 'u-1' }] })).toThrow(
      WebhookPayloadError
    )
  })

  it('is case insensitive, so userId does not slip past user_id', () => {
    expect(() => assertNoPersonalData({ userId: 'u-1' })).toThrow(WebhookPayloadError)
    expect(() => assertNoPersonalData({ SubjectId: 'u-1' })).toThrow(WebhookPayloadError)
  })

  it('allows the identifiers a recipient needs to call back', () => {
    expect(() =>
      assertNoPersonalData({
        id: 'x',
        organizationId: 'o',
        resource: { type: 'consent_request', id: 'r' },
        occurredAt: '2026-07-26T00:00:00.000Z',
      })
    ).not.toThrow()
  })
})

describe('signatures', () => {
  const secret = 'whsec_test'
  const body = '{"event":"consent_request.approved"}'
  const now = 1_800_000_000

  it('verifies a signature it produced', () => {
    const header = signatureHeader(secret, body, now)
    expect(verifySignature(secret, body, header, now)).toBe(true)
  })

  it('rejects a tampered body', () => {
    const header = signatureHeader(secret, body, now)
    expect(verifySignature(secret, `${body} `, header, now)).toBe(false)
  })

  it('rejects a different secret', () => {
    const header = signatureHeader(secret, body, now)
    expect(verifySignature('whsec_other', body, header, now)).toBe(false)
  })

  it('rejects a stale signature, so an old body cannot be replayed', () => {
    const header = signatureHeader(secret, body, now)
    expect(verifySignature(secret, body, header, now + SIGNATURE_TOLERANCE_SECONDS + 1)).toBe(
      false
    )
  })

  it('rejects a future timestamp just as firmly', () => {
    const header = signatureHeader(secret, body, now)
    expect(verifySignature(secret, body, header, now - SIGNATURE_TOLERANCE_SECONDS - 1)).toBe(
      false
    )
  })

  it('rejects a signature whose timestamp was swapped', () => {
    // The timestamp is inside the signed material, so moving it invalidates it.
    const signature = signPayload(secret, body, now)
    expect(verifySignature(secret, body, `t=${now + 10},v1=${signature}`, now)).toBe(false)
  })

  it('rejects a malformed header rather than throwing', () => {
    expect(verifySignature(secret, body, 'garbage', now)).toBe(false)
    expect(verifySignature(secret, body, 't=abc,v1=def', now)).toBe(false)
    expect(verifySignature(secret, body, `t=${now}`, now)).toBe(false)
  })
})

describe('where we are willing to send', () => {
  it('accepts an ordinary https endpoint', () => {
    expect(assertDeliverableUrl('https://api.example.com/hooks').hostname).toBe(
      'api.example.com'
    )
  })

  it('refuses plain http', () => {
    expect(() => assertDeliverableUrl('http://api.example.com/hooks')).toThrow(WebhookUrlError)
  })

  it.each([
    ['localhost', 'https://localhost/hooks'],
    ['loopback', 'https://127.0.0.1/hooks'],
    ['private class A', 'https://10.1.2.3/hooks'],
    ['private class B', 'https://172.16.0.1/hooks'],
    ['private class C', 'https://192.168.1.1/hooks'],
    ['carrier grade NAT', 'https://100.64.0.1/hooks'],
    ['cloud metadata', 'https://169.254.169.254/latest/meta-data/'],
    ['internal suffix', 'https://db.internal/hooks'],
    ['bare host', 'https://intranet/hooks'],
    ['IPv6 loopback', 'https://[::1]/hooks'],
    ['IPv6 unique local', 'https://[fd00::1]/hooks'],
  ])('refuses %s, which our servers can reach and the caller cannot', (_label, url) => {
    expect(() => assertDeliverableUrl(url)).toThrow(WebhookUrlError)
  })

  it('refuses embedded credentials', () => {
    expect(() => assertDeliverableUrl('https://user:pass@example.com/hooks')).toThrow(
      WebhookUrlError
    )
  })

  it('refuses a string that is not a URL', () => {
    expect(() => assertDeliverableUrl('not a url')).toThrow(WebhookUrlError)
  })
})

describe('where a name actually points', () => {
  // The URL check only sees the string the caller typed. An attacker controls
  // their own DNS, so a perfectly ordinary hostname can resolve to the cloud
  // metadata endpoint. These cover the resolved address rather than the name.

  it('accepts a host that resolves to public addresses', async () => {
    await expect(
      assertResolvesPublicly('hooks.example.com', async () => ['93.184.216.34'])
    ).resolves.toBeUndefined()
  })

  it.each([
    ['cloud metadata', '169.254.169.254'],
    ['loopback', '127.0.0.1'],
    ['private class A', '10.0.0.7'],
    ['private class B', '172.20.1.1'],
    ['private class C', '192.168.0.5'],
    ['carrier grade NAT', '100.100.1.1'],
    ['unspecified', '0.0.0.0'],
    ['IPv6 unique local', 'fd00::1'],
    ['IPv4-mapped private', '::ffff:10.0.0.1'],
  ])('refuses a public-looking host resolving to %s', async (_label, address) => {
    await expect(
      assertResolvesPublicly('hooks.example.com', async () => [address])
    ).rejects.toThrow(WebhookUrlError)
  })

  it('refuses when any one address in the set is private', async () => {
    // A name can return several records. One private answer is enough, because
    // we do not control which the connection picks.
    await expect(
      assertResolvesPublicly('hooks.example.com', async () => ['93.184.216.34', '10.0.0.1'])
    ).rejects.toThrow(WebhookUrlError)
  })

  it('refuses a host that does not resolve', async () => {
    await expect(
      assertResolvesPublicly('hooks.example.com', async () => [])
    ).rejects.toThrow(WebhookUrlError)
  })

  it('refuses when the resolver itself fails', async () => {
    await expect(
      assertResolvesPublicly('hooks.example.com', async () => {
        throw new Error('SERVFAIL')
      })
    ).rejects.toThrow(WebhookUrlError)
  })

  it('does not resolve an address literal, which was already checked', async () => {
    let called = false
    await assertResolvesPublicly('93.184.216.34', async () => {
      called = true
      return []
    })

    expect(called).toBe(false)
  })
})

describe('private address ranges', () => {
  it.each([
    '0.0.0.0',
    '10.255.255.255',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '100.64.0.1',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
  ])('treats %s as private', (address) => {
    expect(isPrivateAddress(address)).toBe(true)
  })

  it.each(['1.1.1.1', '8.8.8.8', '93.184.216.34', '172.32.0.1', '192.169.0.1', '2606:4700::1'])(
    'treats %s as public',
    (address) => {
      expect(isPrivateAddress(address)).toBe(false)
    }
  )
})

describe('retry schedule', () => {
  it('backs off exponentially and then holds', () => {
    expect(backoffMsForAttempt(1)).toBe(30_000)
    expect(backoffMsForAttempt(2)).toBe(60_000)
    expect(backoffMsForAttempt(3)).toBe(120_000)
    expect(backoffMsForAttempt(50)).toBe(6 * 60 * 60 * 1000)
  })

  it('gives up eventually rather than retrying forever', () => {
    expect(MAX_DELIVERY_ATTEMPTS).toBeGreaterThan(3)
    expect(MAX_DELIVERY_ATTEMPTS).toBeLessThan(20)
  })
})

describe('event names', () => {
  it('recognizes a known event and rejects anything else', () => {
    expect(isWebhookEvent('consent_request.approved')).toBe(true)
    expect(isWebhookEvent('vault.read')).toBe(false)
  })

  it('never exposes a vault event, because vault content is not ours to announce', () => {
    for (const event of WEBHOOK_EVENTS) {
      expect(event.startsWith('vault')).toBe(false)
    }
  })
})
