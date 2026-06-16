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
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, email, verified_at')
      .eq('api_key_hash', hash)
      .single()

    if (!org) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    return handler(req, { orgId: org.id, orgName: org.name, orgEmail: org.email })
  }
}
