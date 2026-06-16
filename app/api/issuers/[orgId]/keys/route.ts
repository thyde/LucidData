import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimit, clientIp } from '@/lib/utils/rate-limit'

/**
 * Public issuer key directory. Lets external verifiers fetch an issuer's active
 * Ed25519 public keys to independently verify credential signatures.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
): Promise<NextResponse> {
  const ip = clientIp(req.headers)
  if (!rateLimit(`issuer-keys:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const { orgId } = await params
  const service = createServiceClient()

  const { data: org } = await service
    .from('organizations')
    .select('id, name, domain, verified_at')
    .eq('id', orgId)
    .maybeSingle()
  if (!org) {
    return NextResponse.json({ error: 'Issuer not found' }, { status: 404 })
  }

  const { data: keys } = await service
    .from('issuer_keys')
    .select('key_id, alg, public_key, created_at')
    .eq('organization_id', orgId)
    .eq('status', 'active')

  return NextResponse.json({
    issuer: { id: org.id, name: org.name, domain: org.domain, verified: Boolean(org.verified_at) },
    keys: (keys ?? []).map((k) => ({
      key_id: k.key_id,
      alg: k.alg,
      public_key: k.public_key,
      encoding: 'base64-der-spki',
      created_at: k.created_at,
    })),
  })
}
