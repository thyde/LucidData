import { NextResponse } from 'next/server'
import { withOrgAuth } from '@/lib/middleware/withOrgAuth'
import { createServiceClient } from '@/lib/supabase/service'

export const GET = withOrgAuth(async (req, { orgId }) => {
  const url = new URL(req.url)
  const userEmail = url.searchParams.get('user_email')
  const category = url.searchParams.get('category')

  if (!userEmail) {
    return NextResponse.json({ error: 'user_email query param required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Find user
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', userEmail)
    .single()

  if (!user) {
    return NextResponse.json({ has_consent: false }, { status: 200 })
  }

  const now = new Date().toISOString()
  const query = supabase
    .from('consents')
    .select('id, access_level, end_date, vault_data_id, data_category, vault:vault_data(category)')
    .eq('user_id', user.id)
    .eq('granted_to', orgId)
    .eq('revoked', false)
    .or(`end_date.is.null,end_date.gt.${now}`)

  const { data: consents } = await query.order('created_at', { ascending: false })

  const matching = (consents ?? []).filter((consent) => {
    if (!category) return true
    if (consent.data_category) return consent.data_category === category
    if (consent.vault_data_id) {
      const vault = Array.isArray(consent.vault) ? consent.vault[0] : consent.vault
      return vault?.category === category
    }
    return true
  })

  if (matching.length === 0) {
    return NextResponse.json({ has_consent: false }, { status: 200 })
  }

  const active = matching[0]
  return NextResponse.json({
    has_consent: true,
    access_level: active.access_level,
    expires_at: active.end_date,
    consent_id: active.id,
  })
})
