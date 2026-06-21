import { NextRequest, NextResponse } from 'next/server'
import { withOrgAuth } from '@/lib/middleware/withOrgAuth'
import { createServiceClient } from '@/lib/supabase/service'
import { createNotification } from '@/lib/services/notification.service'
import { z } from 'zod'

const ConsentRequestSchema = z.object({
  user_email: z.string().email(),
  purpose: z.string().min(10).max(500),
  access_level: z.enum(['read', 'export', 'verify']),
  data_category: z.string().optional(),
  expires_in_days: z.number().min(1).max(365).default(30),
})

export const POST = withOrgAuth(async (req, { orgId, orgName }) => {
  const body = await req.json()
  const result = ConsentRequestSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid input', details: result.error.flatten() }, { status: 400 })
  }

  const { user_email, purpose, access_level, data_category, expires_in_days } = result.data
  const supabase = createServiceClient()

  // Find user by email
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', user_email)
    .single()

  if (!user) {
    // Don't leak existence — return same response
    return NextResponse.json({
      id: null,
      message: 'Request submitted. If this user exists, they will be notified.',
    }, { status: 202 })
  }

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
    .select('id, status, requested_at, expires_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await createNotification({
    userId: user.id,
    type: 'consent_request',
    title: 'New data access request',
    message: `${orgName} requested ${access_level} access${data_category ? ` to your ${data_category} data` : ''}.`,
    relatedEntityId: request.id,
    relatedEntityType: 'consent_request',
    email: user_email,
  })

  return NextResponse.json({
    request,
    message: 'Consent request submitted. The user will be notified.',
  }, { status: 201 })
})
