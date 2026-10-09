import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { createServiceClient } from '@/lib/supabase/service'
import { consumePasskeyChallenge, PASSKEY_CHALLENGE_COOKIE } from '@/lib/services/passkey-challenge.service'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const refused = () => NextResponse.json({ error: 'Passkey verification failed' }, { status: 400 })

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const challengeId = cookieStore.get(PASSKEY_CHALLENGE_COOKIE)?.value
  if (!challengeId) {
    return NextResponse.json({ error: 'Missing challenge' }, { status: 400 })
  }
  cookieStore.delete(PASSKEY_CHALLENGE_COOKIE)

  // Used up here, whatever happens next, so the same request cannot be sent
  // twice. It also names the account the sign-in was started for.
  const issued = await consumePasskeyChallenge(challengeId, 'authentication')
  if (!issued) return refused()

  const body = await req.json().catch(() => null)
  const credential = body?.credential
  if (typeof credential?.id !== 'string' || credential.id.length === 0) return refused()

  const service = createServiceClient()

  // Only a passkey registered to that account can open it: a valid signature
  // from someone else's passkey proves nothing about this one.
  const { data: account } = await service.from('users').select('id, email').eq('id', issued.userId).maybeSingle()
  if (!account?.email) return refused()

  const { data: passkey } = await service
    .from('passkeys')
    .select('id, credential_id, public_key, counter')
    .eq('credential_id', credential.id)
    .eq('user_id', account.id)
    .maybeSingle()
  if (!passkey) return refused()

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: issued.challenge,
      expectedOrigin: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      expectedRPID: process.env.NEXT_PUBLIC_RP_ID ?? 'localhost',
      credential: {
        id: passkey.credential_id,
        publicKey: Buffer.from(passkey.public_key, 'base64'),
        counter: passkey.counter,
      },
    })
  } catch {
    return refused()
  }

  if (!verification.verified) return refused()

  // Only from the counter this check read: if another sign-in moved it on in
  // the meantime, this one is refused.
  const { data: advanced } = await service
    .from('passkeys')
    .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
    .eq('id', passkey.id)
    .eq('user_id', account.id)
    .eq('counter', passkey.counter)
    .select('id')
    .maybeSingle()
  if (!advanced) return refused()

  // A single-use link for the passkey's owner, and only them. It goes to the
  // browser that has just proved it holds this account's passkey, which
  // exchanges it for a session. Exchanging it here instead would put every
  // passkey sign-in behind one Supabase verification limit for this server's
  // address, which anyone could use up.
  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: account.email,
  })
  const tokenHash = link?.properties?.hashed_token
  if (linkError || !tokenHash) {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }

  return NextResponse.json({ verified: true, token_hash: tokenHash })
}
