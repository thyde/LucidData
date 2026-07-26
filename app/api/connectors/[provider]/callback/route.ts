import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { FITNESS_CONNECTORS } from '@/lib/connectors/fitness'
import { isConnectorProvider, saveConnection } from '@/lib/services/connector.service'
import { OAuthStateError, verifyState } from '@/lib/services/connector-tokens'
import { errorLogger, ErrorSeverity } from '@/lib/services/error-logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * LD-201: finish an OAuth grant.
 *
 * Three things are checked before a token is stored, and all three matter.
 * The state must verify and not have expired, so a forged or replayed callback
 * is refused. The state's user must match the signed-in session, so a callback
 * captured from one person cannot be completed by another. And the provider in
 * the state must match the route, so a grant for one provider cannot be filed
 * against a different one.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> }
): Promise<NextResponse> {
  const { provider } = await context.params
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
  const settings = `${appUrl}/settings`

  if (!isConnectorProvider(provider)) {
    return NextResponse.redirect(`${settings}?connector=unknown`)
  }

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const denied = url.searchParams.get('error')

  if (denied) return NextResponse.redirect(`${settings}?connector=declined`)
  if (!code || !state) return NextResponse.redirect(`${settings}?connector=invalid`)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${appUrl}/login`)

  let verified
  try {
    verified = verifyState(state)
  } catch (error) {
    if (error instanceof OAuthStateError) {
      return NextResponse.redirect(`${settings}?connector=invalid`)
    }
    throw error
  }

  if (verified.userId !== user.id || verified.provider !== provider) {
    // The grant belongs to somebody else, or to a different provider. Refuse
    // rather than guess.
    return NextResponse.redirect(`${settings}?connector=invalid`)
  }

  const def = FITNESS_CONNECTORS[provider]
  const clientId = process.env[def.clientIdEnv]
  const clientSecret = process.env[def.clientSecretEnv]
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${settings}?connector=unconfigured`)
  }

  try {
    const response = await fetch(def.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${appUrl}/api/connectors/${provider}/callback`,
      }),
    })
    if (!response.ok) throw new Error(`Token exchange returned ${response.status}`)

    const body = (await response.json()) as {
      access_token: string
      refresh_token?: string
      expires_at?: number
      expires_in?: number
      scope?: string
      athlete?: { id?: number }
      user_id?: string
    }

    await saveConnection({
      userId: user.id,
      provider,
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: body.expires_at
        ? new Date(body.expires_at * 1000).toISOString()
        : body.expires_in
          ? new Date(Date.now() + body.expires_in * 1000).toISOString()
          : null,
      scopes: body.scope ? body.scope.split(/[,\s]+/).filter(Boolean) : def.scopes,
      providerAccountId: body.athlete?.id ? String(body.athlete.id) : (body.user_id ?? null),
    })
  } catch (error) {
    // Never log the response body: it holds the tokens.
    errorLogger.log(error, ErrorSeverity.MEDIUM, {
      userId: user.id,
      action: 'CONNECTOR_TOKEN_EXCHANGE_FAILED',
      resource: provider,
    })
    return NextResponse.redirect(`${settings}?connector=failed`)
  }

  return NextResponse.redirect(`${settings}?connector=connected`)
}
