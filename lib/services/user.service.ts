import * as userRepo from '@/lib/repositories/user.repository'
import type { User } from '@/types/database.types'

export async function getUserProfile(userId: string): Promise<User | null> {
  return userRepo.findUserById(userId)
}

export async function updateUserProfile(userId: string, updates: {
  display_name?: string
  key_salt?: string
  key_hint?: string
}): Promise<User> {
  return userRepo.updateUser(userId, updates)
}
