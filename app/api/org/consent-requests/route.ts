import { NextRequest, NextResponse } from 'next/server'
import { withOrgAuth } from '@/lib/middleware/withOrgAuth'
import { createServiceClient } from '@/lib/supabase/service'

export const GET = withOrgAuth(async (req, { orgId }) => {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('consent_requests')
    .select('*')
    .eq('organization_id', orgId)
    .order('requested_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
})
