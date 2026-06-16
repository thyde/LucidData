import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { createServiceClient } from '@/lib/supabase/service'
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
    .select('credential_id')
    .eq('user_id', user.id)

  if (!passkeys?.length) {
    return NextResponse.json({ options: null })
  }

  const options = await generateAuthenticationOptions({
    rpID: process.env.NEXT_PUBLIC_RP_ID ?? 'localhost',
    allowCredentials: passkeys.map(p => ({ id: p.credential_id })),
    userVerification: 'preferred',
  })

  const cookieStore = await cookies()
  cookieStore.set('passkey_challenge', options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 300,
    path: '/',
    sameSite: 'strict',
  })
  // Store email in cookie for verification step
  cookieStore.set('passkey_email', email, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 300,
    path: '/',
    sameSite: 'strict',
  })

  return NextResponse.json({ options })
}
