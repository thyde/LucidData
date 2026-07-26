import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * LD-109: an organization must prove it controls its domain before it may reach
 * a person. Unverified organizations are refused outright rather than merely
 * flagged in the interface, so the check cannot be skipped by calling the API
 * directly.
 */
export interface VerifiedOrg {
  id: string
  name: string
  email: string
  domain: string | null
  org_type: string
  verified_at: string | null
}

export type VerifiedOrgResult =
  | { ok: true; org: VerifiedOrg }
  | { ok: false; response: NextResponse }

export async function requireVerifiedOrg(orgId: string): Promise<VerifiedOrgResult> {
  const service = createServiceClient()
  const { data: org } = await service
    .from('organizations')
    .select('id, name, email, domain, org_type, verified_at')
    .eq('id', orgId)
    .maybeSingle()

  if (!org) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Organization not found' }, { status: 404 }),
    }
  }

  if (!org.verified_at) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Verify your domain before contacting people through LucidData' },
        { status: 403 }
      ),
    }
  }

  return { ok: true, org: org as VerifiedOrg }
}

/** How many pending requests one organization may have open with one person. */
export const MAX_PENDING_REQUESTS_PER_USER = 5

/**
 * Cap open requests per user per organization. Without this, a verified but
 * badly behaved organization can flood one person's inbox.
 */
export async function pendingRequestCountReached(
  table: 'consent_requests' | 'credential_requests',
  orgId: string,
  userId: string
): Promise<boolean> {
  const service = createServiceClient()
  const { count, error } = await service
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .eq('status', 'pending')
  if (error) return false
  return (count ?? 0) >= MAX_PENDING_REQUESTS_PER_USER
}
