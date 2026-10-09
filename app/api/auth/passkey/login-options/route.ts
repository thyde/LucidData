import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  issuePasskeyChallenge,
  PASSKEY_CHALLENGE_COOKIE,
  PASSKEY_CHALLENGE_COOKIE_OPTIONS,
} from '@/lib/services/passkey-challenge.service'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { email } = body

  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Find user by email
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single()

  if (!user) {
    // Return empty options (don't leak that user doesn't exist)
    return NextResponse.json({ options: null })
  }

  const { data: passkeys } = await supabase
    .from('passkeys')
    .select('id, credential_id')
    .eq('user_id', user.id)

  if (!passkeys?.length) {
    return NextResponse.json({ options: null })
  }

  // LD-112: the PRF input for each passkey that can open the vault, so one
  // ceremony both signs in and opens it. An input is a salt, not a secret: the
  // output needs the passkey itself.
  const { data: factors } = await supabase
    .from('recovery_factors')
    .select('passkey_id, salt')
    .eq('user_id', user.id)
    .eq('type', 'passkey_prf')
  const credentialOf = new Map(passkeys.map((p) => [p.id, p.credential_id]))
  const prf: Record<string, string> = {}
  for (const factor of factors ?? []) {
    const credentialId = factor.passkey_id ? credentialOf.get(factor.passkey_id) : undefined
    if (credentialId) prf[credentialId] = factor.salt
  }

  const options = await generateAuthenticationOptions({
    rpID: process.env.NEXT_PUBLIC_RP_ID ?? 'localhost',
    allowCredentials: passkeys.map(p => ({ id: p.credential_id })),
    userVerification: 'preferred',
  })

  // The server keeps the challenge and the account it is for. The cookie only
  // names it, so the verification step can use it once and know whose it is.
  const challengeId = await issuePasskeyChallenge(user.id, 'authentication', options.challenge)
  const cookieStore = await cookies()
  cookieStore.set(PASSKEY_CHALLENGE_COOKIE, challengeId, PASSKEY_CHALLENGE_COOKIE_OPTIONS)

  return NextResponse.json({ options, prf })
}
