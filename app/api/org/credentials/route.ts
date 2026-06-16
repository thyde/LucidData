import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withOrgAuth, type OrgContext } from '@/lib/middleware/withOrgAuth'
import { createServiceClient } from '@/lib/supabase/service'
import { issueCredential } from '@/lib/services/credential.service'

const IssueSchema = z.object({
  subject_email: z.string().email(),
  schema_type: z.string().min(1),
  label: z.string().min(1).max(200),
  claims: z.record(z.string(), z.unknown()),
  expires_at: z.string().datetime().optional(),
})

async function handler(req: NextRequest, ctx: OrgContext): Promise<NextResponse> {
  const body = await req.json().catch(() => null)
  const parsed = IssueSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }

  // Confirm the org is a verified issuer before signing anything.
  const service = createServiceClient()
  const { data: org } = await service
    .from('organizations')
    .select('id, name, domain, org_type, verified_at')
    .eq('id', ctx.orgId)
    .single()
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }
  if (org.org_type !== 'issuer' && org.org_type !== 'both') {
    return NextResponse.json({ error: 'Organization is not configured as an issuer' }, { status: 403 })
  }
  if (!org.verified_at) {
    return NextResponse.json({ error: 'Verify your domain before issuing credentials' }, { status: 403 })
  }

  const credential = await issueCredential(
    { id: org.id, name: org.name, domain: org.domain },
    {
      subjectEmail: parsed.data.subject_email,
      schemaType: parsed.data.schema_type,
      label: parsed.data.label,
      claims: parsed.data.claims,
      expiresAt: parsed.data.expires_at ?? null,
    }
  )

  return NextResponse.json(
    {
      id: credential.id,
      label: credential.label,
      subject_email: credential.subject_email,
      schema_type: credential.schema_type,
      status: credential.status,
      issued_at: credential.issued_at,
      expires_at: credential.expires_at,
      key_id: credential.key_id,
      signature: credential.signature,
    },
    { status: 201 }
  )
}

export const POST = withOrgAuth(handler)
