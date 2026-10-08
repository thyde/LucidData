'use server'

import { guarded, type ActionFailure } from '@/lib/actions/action-result'
import { createClient } from '@/lib/supabase/server'
import {
  createHolderShare,
  listSharesForUser,
  revokeShare,
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
): Promise<CreateShareResult | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    const result = await createHolderShare(userId, credentialId, disclosedClaims, options)
    return { shareId: result.share.id, token: result.token }
  })
}

export async function getMySharesAction(): Promise<CredentialShare[] | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    return listSharesForUser(userId)
  })
}

export async function revokeShareAction(shareId: string): Promise<void | ActionFailure> {
  return guarded(async () => {
    const userId = await getAuthenticatedUserId()
    await revokeShare(userId, shareId)
  })
}
