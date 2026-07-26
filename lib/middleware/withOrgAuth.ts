import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hashApiKey } from '@/lib/utils/api-key'

export interface OrgContext {
  orgId: string
  orgName: string
  orgEmail: string
}

type OrgHandler = (req: NextRequest, ctx: OrgContext) => Promise<NextResponse>

export function withOrgAuth(handler: OrgHandler) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = authHeader.slice(7)
    if (!apiKey.startsWith('lk_live_')) {
      return NextResponse.json({ error: 'Invalid API key format' }, { status: 401 })
    }

    const hash = hashApiKey(apiKey)
    const supabase = createServiceClient()
    const { data: key } = await supabase
      .from('organization_api_keys')
      .select('id, organization_id, expires_at')
      .eq('key_hash', hash)
      .eq('status', 'active')
      .maybeSingle()

    if (!key || (key.expires_at && new Date(key.expires_at) <= new Date())) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, email')
      .eq('id', key.organization_id)
      .maybeSingle()

    if (!org) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })

    const { error: usageError } = await supabase
      .from('organization_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', key.id)
    if (usageError) {
      return NextResponse.json({ error: 'Could not authenticate API key' }, { status: 503 })
    }

    return handler(req, { orgId: org.id, orgName: org.name, orgEmail: org.email })
  }
}
