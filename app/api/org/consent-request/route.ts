import { NextResponse } from 'next/server'
import { withOrgAuth } from '@/lib/middleware/withOrgAuth'
import {
  pendingRequestCountReached,
  requireVerifiedOrg,
} from '@/lib/middleware/requireVerifiedOrg'
import { createServiceClient } from '@/lib/supabase/service'
import { createNotification } from '@/lib/services/notification.service'
import { assertRateLimit, RateLimitError } from '@/lib/services/rate-limit.service'
import { NEUTRAL_LOOKUP_RESPONSE, withConstantTime } from '@/lib/utils/enumeration'
import { z } from 'zod'
import { dataCategorySchema } from '@/lib/validations/marketplace'

const ConsentRequestSchema = z.object({
  user_email: z.string().email(),
  purpose: z.string().min(10).max(500),
  access_level: z.enum(['read', 'export', 'verify']),
  data_category: dataCategorySchema.optional(),
  expires_in_days: z.number().min(1).max(365).default(30),
})

/**
 * Ask a person for access to their data.
 *
 * LD-109: the organization must be domain-verified, the endpoint is rate
 * limited, open requests per person are capped, and the response is identical in
 * status, body, and timing whether or not the account exists.
 */
export const POST = withOrgAuth(async (req, { orgId, orgName }) => {
  const verified = await requireVerifiedOrg(orgId)
  if (!verified.ok) return verified.response

  try {
    await assertRateLimit('consentRequest', orgId)
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 })
    }
    throw error
  }

  const body = await req.json().catch(() => null)
  const result = ConsentRequestSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const { user_email, purpose, access_level, data_category, expires_in_days } = result.data

  // Everything past this point resolves to one response shape inside one timing
  // envelope, so a caller cannot tell a hit from a miss.
  const failure = await withConstantTime(async (): Promise<NextResponse | null> => {
    const supabase = createServiceClient()
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .ilike('email', user_email)
      .maybeSingle()

    if (!user) return null

    // Deliberately indistinguishable from the no-such-user case: saying a
    // per-person cap was hit would confirm the account exists.
    if (await pendingRequestCountReached('consent_requests', orgId, user.id)) return null

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expires_in_days)

    const { data: request, error } = await supabase
      .from('consent_requests')
      .insert({
        organization_id: orgId,
        user_id: user.id,
        purpose,
        access_level,
        data_category: data_category ?? null,
        expires_at: expiresAt.toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ error: 'Could not submit the request' }, { status: 500 })
    }

    await createNotification({
      userId: user.id,
      type: 'consent_request',
      title: 'New data access request',
      message: `${orgName} requested ${access_level} access${
        data_category ? ` to your ${data_category} data` : ''
      }.`,
      relatedEntityId: request.id,
      relatedEntityType: 'consent_request',
      email: user_email,
    })

    return null
  })

  if (failure) return failure

  return NextResponse.json(NEUTRAL_LOOKUP_RESPONSE.body, {
    status: NEUTRAL_LOOKUP_RESPONSE.status,
  })
})
