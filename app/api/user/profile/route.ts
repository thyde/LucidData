import { withAuth } from '@/lib/middleware/withAuth'
import { getUserProfile, updateUserProfile } from '@/lib/services/user.service'
import { NextResponse } from 'next/server'

export const GET = withAuth(async (_req, { userId }) => {
  const profile = await getUserProfile(userId)
  return NextResponse.json({ data: { key_salt: profile?.key_salt } })
})

export const PATCH = withAuth(async (req, { userId }) => {
  const body = await req.json()
  const { key_salt, key_hint, display_name } = body as {
    key_salt?: string
    key_hint?: string
    display_name?: string
  }
  const updated = await updateUserProfile(userId, { key_salt, key_hint, display_name })
  return NextResponse.json({ data: updated })
})
