import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { addOrgMember } from '@/lib/middleware/withOrgMember'
import { assertRateLimit, RateLimitError } from '@/lib/services/rate-limit.service'
import { z } from 'zod'

const RegisterSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  website: z.string().url().optional(),
  org_type: z.enum(['issuer', 'verifier', 'both']).optional(),
  data_buyer: z.boolean().optional(),
})

/**
 * LD-109: organization registration requires a signed-in account.
 *
 * This endpoint used to accept an anonymous POST and hand back a working API
 * key, which made it a phishing channel wearing LucidData branding. Now the
 * creator must be authenticated, becomes the owner in the same request, and
 * gets NO API key here. Keys are issued from the portal only after domain
 * verification succeeds.
 */
export async function POST(req: NextRequest) {
  const sessionClient = await createClient()
  const {
    data: { user },
  } = await sessionClient.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in before registering an organization' },
      { status: 401 }
    )
  }

  try {
    await assertRateLimit('orgRegistration', user.id)
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 })
    }
    throw error
  }

  const body = await req.json().catch(() => null)
  const result = RegisterSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: result.error.flatten() },
      { status: 400 }
    )
  }

  const { name, email, website, org_type, data_buyer } = result.data

  const supabase = createServiceClient()
  const { data: org, error } = await supabase
    .from('organizations')
    .insert({
      name,
      email,
      website,
      // Placeholder, never a usable key: one is issued only after verification.
      api_key_hash: `pending-verification:${crypto.randomUUID()}`,
      org_type: org_type ?? 'verifier',
      data_buyer: data_buyer ?? false,
    })
    .select('id, name, email, org_type, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'An organization with this email already exists' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await addOrgMember(org.id, user.id, 'owner')

  return NextResponse.json(
    {
      organization: org,
      message:
        'Organization created. Verify your domain to issue an API key and start contacting people.',
    },
    { status: 201 }
  )
}
