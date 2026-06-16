'use server'

import { createClient } from '@/lib/supabase/server'
import {
  createShare,
  listSharesForUser,
  revokeShare,
  type CreatedShare,
} from '@/lib/services/share.service'
import type { CredentialShare } from '@/types/database.types'

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user.id
}

export interface CreateShareResult {
  shareId: string
  token: string
}

export async function createShareAction(
  credentialId: string,
  disclosedClaims: string[],
  options: { expiresInDays?: number; verifierEmail?: string } = {}
): Promise<CreateShareResult> {
  const userId = await getAuthenticatedUserId()
  if (disclosedClaims.length === 0) {
    throw new Error('Select at least one field to share')
  }

  const expiresAt = options.expiresInDays
    ? new Date(Date.now() + options.expiresInDays * 86_400_000).toISOString()
    : null

  const result: CreatedShare = await createShare(userId, credentialId, disclosedClaims, {
    expiresAt,
    verifierEmail: options.verifierEmail ?? null,
  })
  return { shareId: result.share.id, token: result.token }
}

export async function getMySharesAction(): Promise<CredentialShare[]> {
  const userId = await getAuthenticatedUserId()
  return listSharesForUser(userId)
}

export async function revokeShareAction(shareId: string): Promise<void> {
  const userId = await getAuthenticatedUserId()
  await revokeShare(userId, shareId)
}
