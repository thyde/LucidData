import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { createServiceClient } from '@/lib/supabase/service'
import { Passkey } from '@/types/database.types'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const challenge = cookieStore.get('passkey_challenge')?.value
  const email = cookieStore.get('passkey_email')?.value

  if (!challenge || !email) {
    return NextResponse.json({ error: 'Missing challenge or email' }, { status: 400 })
  }
  cookieStore.delete('passkey_challenge')
  cookieStore.delete('passkey_email')

  const body = await req.json()
  const { credential } = body

  const supabase = createServiceClient()

  // Find passkey by credential ID
  const { data: passkey } = await supabase
    .from('passkeys')
    .select('id, credential_id, public_key, counter, user_id')
    .eq('credential_id', credential.id)
    .single() as { data: Pick<Passkey, 'id' | 'credential_id' | 'public_key' | 'counter' | 'user_id'> | null }

  if (!passkey) {
    return NextResponse.json({ error: 'Passkey not found' }, { status: 400 })
  }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      expectedRPID: process.env.NEXT_PUBLIC_RP_ID ?? 'localhost',
      credential: {
        id: passkey.credential_id,
        publicKey: Buffer.from(passkey.public_key, 'base64'),
        counter: passkey.counter,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
  }

  if (!verification.verified) {
    return NextResponse.json({ error: 'Not verified' }, { status: 400 })
  }

  // Update counter
  await supabase
    .from('passkeys')
    .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
    .eq('credential_id', credential.id)

  // Issue Supabase session via magic link
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }

  return NextResponse.json({
    verified: true,
    token: linkData.properties.hashed_token,
    email,
  })
}
