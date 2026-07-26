import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'crypto'
import {
  isJobName,
  runScheduledJobs,
  type JobName,
} from '@/lib/services/scheduled-jobs.service'

// Jobs talk to Stripe and Postgres, so keep this on the Node runtime.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * LD-601 scheduled job runner endpoint.
 *
 * Invoked by an external scheduler (Vercel Cron or a Supabase scheduled
 * function). Authenticated by a shared secret in the Authorization header, not
 * by a user session, so it must reject anything unauthenticated. Every job is
 * idempotent, so a duplicate invocation is harmless.
 */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // Fail closed: with no secret configured the endpoint is unusable rather than open.
  if (!secret) return false

  const header = req.headers.get('authorization') ?? ''
  const prefix = 'Bearer '
  if (!header.startsWith(prefix)) return false
  const presented = header.slice(prefix.length)

  const a = Buffer.from(presented)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const requested = new URL(req.url).searchParams.get('job')
  let only: JobName | undefined
  if (requested) {
    if (!isJobName(requested)) {
      return NextResponse.json({ error: 'Unknown job' }, { status: 400 })
    }
    only = requested
  }

  const results = await runScheduledJobs(only)
  return NextResponse.json({ results })
}

export async function POST(req: NextRequest) {
  return handle(req)
}

// Vercel Cron issues GET requests.
export async function GET(req: NextRequest) {
  return handle(req)
}
