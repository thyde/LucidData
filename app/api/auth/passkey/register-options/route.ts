import { generateRegistrationOptions } from '@simplewebauthn/server'
import { withAuth } from '@/lib/middleware/withAuth'
import { createClient } from '@/lib/supabase/server'
import {
  issuePasskeyChallenge,
  PASSKEY_CHALLENGE_COOKIE,
  PASSKEY_CHALLENGE_COOKIE_OPTIONS,
} from '@/lib/services/passkey-challenge.service'
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
    rpName: 'LucidData',
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

  const challengeId = await issuePasskeyChallenge(userId, 'registration', options.challenge)
  const cookieStore = await cookies()
  cookieStore.set(PASSKEY_CHALLENGE_COOKIE, challengeId, PASSKEY_CHALLENGE_COOKIE_OPTIONS)

  return NextResponse.json({ options })
})
