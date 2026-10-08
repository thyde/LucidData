import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildAuthorizeUrl, FITNESS_CONNECTORS } from '@/lib/connectors/fitness'
import { isConnectorProvider } from '@/lib/services/connector.service'
import { signState } from '@/lib/services/connector-tokens'
import { hasHealthDataConsent } from '@/lib/services/legal.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * LD-201: start an OAuth grant for a provider.
 *
 * The state is signed, single-purpose, and short-lived. Without that, anyone
 * who can make a signed-in person's browser hit our callback could attach their
 * own provider account to that person's vault.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> }
): Promise<NextResponse> {
  const { provider } = await context.params
  if (!isConnectorProvider(provider)) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 })
  }

  const def = FITNESS_CONNECTORS[provider]
  if (def.retired) {
    return NextResponse.json({ error: def.retired.reason }, { status: 410 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin

  // LD-110: every connector brings in health data, so no grant starts before
  // the person has consented to us storing it.
  if (!(await hasHealthDataConsent(user.id))) {
    const settings = new URL('/settings', appUrl)
    settings.searchParams.set('health_consent', 'required')
    settings.hash = 'health-data-consent'
    return NextResponse.redirect(settings)
  }

  const clientId = process.env[def.clientIdEnv]
  if (!clientId) {
    return NextResponse.json(
      { error: 'This provider is not configured in this environment' },
      { status: 503 }
    )
  }

  const redirectUri = `${appUrl}/api/connectors/${provider}/callback`

  const url = buildAuthorizeUrl(provider, {
    clientId,
    redirectUri,
    state: signState({ userId: user.id, provider }),
  })

  return NextResponse.redirect(url)
}
