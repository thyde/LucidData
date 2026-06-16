// Lightweight in-memory fixed-window rate limiter. Per-instance only — adequate
// for basic abuse protection on public endpoints in this MVP. Replace with a
// shared store (e.g. Redis) for multi-instance production deployments.

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** Returns true if the action is allowed under the limit for the given key. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (bucket.count >= limit) return false
  bucket.count += 1
  return true
}

/** Best-effort client IP from common proxy headers. */
export function clientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  )
}
