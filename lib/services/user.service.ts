import * as userRepo from '@/lib/repositories/user.repository'
import type { User } from '@/types/database.types'

export async function getUserProfile(userId: string): Promise<User | null> {
  return userRepo.findUserById(userId)
}

/**
 * Display details only. The key salt is set once, through `claimKeySalt` in the
 * account service, because replacing it would make the vault undecryptable.
 */
export async function updateUserProfile(userId: string, updates: {
  display_name?: string
  key_hint?: string
}): Promise<User> {
  return userRepo.updateUser(userId, updates)
}
