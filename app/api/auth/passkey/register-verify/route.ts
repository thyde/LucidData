import { verifyRegistrationResponse } from '@simplewebauthn/server'
import { withAuth } from '@/lib/middleware/withAuth'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const POST = withAuth(async (req, { userId }) => {
  const cookieStore = await cookies()
  const challenge = cookieStore.get('passkey_challenge')?.value
  if (!challenge) {
    return NextResponse.json({ error: 'No challenge found' }, { status: 400 })
  }
  cookieStore.delete('passkey_challenge')

  const body = await req.json()
  const { credential, deviceName } = body

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      expectedRPID: process.env.NEXT_PUBLIC_RP_ID ?? 'localhost',
    })
  } catch (err) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'Not verified' }, { status: 400 })
  }

  const { credential: cred } = verification.registrationInfo

  const supabase = await createClient()
  const { error } = await supabase.from('passkeys').insert({
    user_id: userId,
    credential_id: cred.id,
    public_key: Buffer.from(cred.publicKey).toString('base64'),
    counter: cred.counter,
    device_name: deviceName ?? null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ verified: true })
})
