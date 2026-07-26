import { NextRequest, NextResponse } from 'next/server'
import { withOrgAuth, type OrgContext } from '@/lib/middleware/withOrgAuth'
import { requireVerifiedOrg } from '@/lib/middleware/requireVerifiedOrg'
import { assertRateLimit, RateLimitError } from '@/lib/services/rate-limit.service'
import { issueCredential } from '@/lib/services/credential.service'
// LD-602: the OpenAPI document is generated from this exact schema.
import { organizationCredentialIssueSchema as IssueSchema } from '@/lib/validations/org-api'

async function handler(req: NextRequest, ctx: OrgContext): Promise<NextResponse> {
  // Confirm the org is a verified issuer before signing anything.
  const verified = await requireVerifiedOrg(ctx.orgId)
  if (!verified.ok) return verified.response
  const org = verified.org

  if (org.org_type !== 'issuer' && org.org_type !== 'both') {
    return NextResponse.json(
      { error: 'Organization is not configured as an issuer' },
      { status: 403 }
    )
  }

  try {
    await assertRateLimit('credentialIssuance', ctx.orgId)
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 })
    }
    throw error
  }

  const body = await req.json().catch(() => null)
  const parsed = IssueSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }

  let credential
  try {
    credential = await issueCredential(
      { id: org.id, name: org.name, domain: org.domain },
      {
        subjectEmail: parsed.data.subject_email,
        schemaType: parsed.data.schema_type,
        label: parsed.data.label,
        claims: parsed.data.claims,
        expiresAt: parsed.data.expires_at ?? null,
      }
    )
  } catch (error) {
    // The plan allowance is enforced inside issueCredential, so the API path
    // cannot bypass it. Surface it as a quota response rather than a 500.
    const message = error instanceof Error ? error.message : 'Could not issue the credential'
    if (/issuance limit/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 402 })
    }
    throw error
  }

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
