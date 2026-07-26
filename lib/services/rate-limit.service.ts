import { createServiceClient } from '@/lib/supabase/service'
import { errorLogger, ErrorSeverity } from '@/lib/services/error-logger'

/**
 * LD-109 rate limiting.
 *
 * Counting happens in Postgres, not in process memory, so the limit holds across
 * serverless instances rather than being one bucket per cold start.
 *
 * Buckets are keyed on something the caller cannot trivially rotate: an
 * organization id for authenticated API traffic, and the client IP for
 * unauthenticated endpoints.
 */

export interface RateLimit {
  /** Fixed window length in seconds. */
  windowSeconds: number
  /** Requests permitted per window. */
  limit: number
}

export const RATE_LIMITS = {
  /** New organizations per account. Registration is expensive to abuse. */
  orgRegistration: { windowSeconds: 3600, limit: 3 },
  /** Consent requests an organization may send per hour. */
  consentRequest: { windowSeconds: 3600, limit: 100 },
  /** Credential requests an organization may send per hour. */
  credentialRequest: { windowSeconds: 3600, limit: 100 },
  /** Credential issuance calls per hour, on top of the plan quota. */
  credentialIssuance: { windowSeconds: 3600, limit: 500 },
  /** Public verification lookups per client per hour. */
  verification: { windowSeconds: 3600, limit: 300 },
  /** Invitation sends per organization per hour. */
  orgInvitation: { windowSeconds: 3600, limit: 50 },
} as const satisfies Record<string, RateLimit>

export type RateLimitName = keyof typeof RATE_LIMITS

export class RateLimitError extends Error {
  constructor(message = 'Too many requests. Try again shortly.') {
    super(message)
    this.name = 'RateLimitError'
  }
}

/**
 * Consume one token. Returns true while inside the limit.
 *
 * Fails open on a store error: a database problem must not take the product
 * offline, and the store is a throttle rather than an authorization control.
 * Every failure is logged so a silently broken limiter is visible.
 */
export async function consumeRateLimit(
  name: RateLimitName,
  subject: string
): Promise<boolean> {
  const { windowSeconds, limit } = RATE_LIMITS[name]
  try {
    const service = createServiceClient()
    const { data, error } = await service.rpc('consume_rate_limit', {
      p_bucket: `${name}:${subject}`,
      p_window_seconds: windowSeconds,
      p_limit: limit,
    })
    if (error) throw error
    return data !== false
  } catch (error) {
    errorLogger.log(error, ErrorSeverity.MEDIUM, {
      action: 'RATE_LIMIT_STORE_UNAVAILABLE',
      resource: name,
    })
    return true
  }
}

/** Consume one token or throw. Use at the top of a guarded operation. */
export async function assertRateLimit(
  name: RateLimitName,
  subject: string
): Promise<void> {
  const allowed = await consumeRateLimit(name, subject)
  if (!allowed) throw new RateLimitError()
}

/**
 * Best-effort client identity for unauthenticated endpoints. Falls back to a
 * single shared bucket rather than allowing an unlimited unkeyed path.
 */
export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return headers.get('x-real-ip')?.trim() || 'unknown-client'
}

/** Drop counters from windows that can no longer be consulted. */
export async function purgeExpiredRateLimits(): Promise<number> {
  const service = createServiceClient()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await service
    .from('rate_limit_counters')
    .delete()
    .lt('window_start', cutoff)
    .select('bucket')
  if (error) throw error
  return (data ?? []).length
}
