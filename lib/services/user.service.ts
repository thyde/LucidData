/**
 * User Service - Business logic for user management
 * Handles user synchronization between Supabase auth and application database
 */

import { userRepository } from '@/lib/repositories/user.repository';
import { User } from '@prisma/client';

export class UserService {
  /**
   * Ensure user exists in database
   * Creates user if they don't exist (e.g., after Supabase signup)
   *
   * This is called from auth middleware to sync Supabase auth users
   * with the application database.
   */
  async ensureUserExists(userId: string, email: string): Promise<User> {
    return userRepository.upsert({ id: userId, email });
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    return userRepository.findById(userId);
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    return userRepository.findByEmail(email);
  }

  /**
   * Update user
   */
  async updateUser(
    userId: string,
    data: { email?: string; encryptionKeyHash?: string }
  ): Promise<User> {
    return userRepository.update(userId, data);
  }

  /**
   * Delete user and all associated data
   */
  async deleteUser(userId: string): Promise<void> {
    await userRepository.delete(userId);
  }
}

export const userService = new UserService();
