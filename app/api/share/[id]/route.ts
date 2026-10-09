import { NextResponse, type NextRequest } from 'next/server'
import { openHealthShare } from '@/lib/services/health-share.service'
import { assertRateLimit, clientKeyFromHeaders, RateLimitError } from '@/lib/services/rate-limit.service'

/**
 * LD-305: the ciphertext behind a shared health summary, for whoever holds the
 * link. The key is in the link's fragment, which never reaches this route, so
 * what it returns is unreadable without the link. Revoked and expired shares
 * return nothing but their state.
 */

const SHARE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
}

function reply(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: HEADERS })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertRateLimit('verification', clientKeyFromHeaders(request.headers))
  } catch (error) {
    if (error instanceof RateLimitError) return reply({ state: 'rate_limited' }, 429)
    throw error
  }

  const { id } = await params
  if (!SHARE_ID.test(id)) return reply({ state: 'missing' }, 404)

  const share = await openHealthShare(id.toLowerCase())
  if (share.state === 'missing') return reply({ state: 'missing' }, 404)
  if (share.state !== 'open') return reply({ state: share.state }, 410)
  return reply(
    { state: 'open', ciphertext: share.ciphertext, expiresAt: share.expiresAt, createdAt: share.createdAt },
    200
  )
}
