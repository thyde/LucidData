import { generateRegistrationOptions } from '@simplewebauthn/server'
import { withAuth } from '@/lib/middleware/withAuth'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const POST = withAuth(async (req, { userId, userEmail }) => {
  const supabase = await createClient()

  // Get existing passkey credential IDs to exclude
  const { data: existing } = await supabase
    .from('passkeys')
    .select('credential_id')
    .eq('user_id', userId)

  const options = await generateRegistrationOptions({
    rpName: 'Lucid Data Bank',
    rpID: process.env.NEXT_PUBLIC_RP_ID ?? 'localhost',
    userName: userEmail,
    attestationType: 'none',
    excludeCredentials: (existing ?? []).map(p => ({
      id: p.credential_id,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })

  const cookieStore = await cookies()
  cookieStore.set('passkey_challenge', options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 300,
    path: '/',
    sameSite: 'strict',
  })

  return NextResponse.json({ options })
})
