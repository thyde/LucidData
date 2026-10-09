import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * WebAuthn challenges held by the server. Each is issued for one ceremony and
 * one account, and used at most once before it expires, so a copied sign-in
 * request cannot be sent again. The browser's cookie names the challenge by
 * id; it never carries the challenge itself.
 */

export type PasskeyCeremony = 'authentication' | 'registration'

/** How long a person has to answer the passkey prompt. */
export const PASSKEY_CHALLENGE_TTL_SECONDS = 300

export const PASSKEY_CHALLENGE_COOKIE = 'passkey_challenge_id'

export const PASSKEY_CHALLENGE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  maxAge: PASSKEY_CHALLENGE_TTL_SECONDS,
  path: '/',
  sameSite: 'strict',
} as const

const challengeId = z.string().uuid()

/** Record a challenge for one account and ceremony, and return the id the cookie holds. */
export async function issuePasskeyChallenge(
  userId: string,
  purpose: PasskeyCeremony,
  challenge: string
): Promise<string> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('passkey_challenges')
    .insert({
      user_id: userId,
      purpose,
      challenge,
      expires_at: new Date(Date.now() + PASSKEY_CHALLENGE_TTL_SECONDS * 1000).toISOString(),
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/**
 * Use a challenge. It is deleted as it is read, in one statement, so only the
 * first request gets it. Null when it is unknown, already used, expired, or
 * was issued for the other ceremony.
 */
export async function consumePasskeyChallenge(
  id: string,
  purpose: PasskeyCeremony
): Promise<{ challenge: string; userId: string } | null> {
  if (!challengeId.safeParse(id).success) return null
  const service = createServiceClient()
  const { data, error } = await service
    .from('passkey_challenges')
    .delete()
    .eq('id', id)
    .eq('purpose', purpose)
    .gt('expires_at', new Date().toISOString())
    .select('challenge, user_id')
    .maybeSingle()
  if (error) throw error
  return data ? { challenge: data.challenge, userId: data.user_id } : null
}

/** Drop challenges nobody answered in time. */
export async function purgeExpiredPasskeyChallenges(): Promise<number> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('passkey_challenges')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id')
  if (error) throw error
  return (data ?? []).length
}
