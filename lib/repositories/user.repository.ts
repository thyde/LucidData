/**
 * User Repository - Database operations for users
 * Handles user record management
 */

import { prisma } from '@/lib/db/prisma';
import { User } from '@prisma/client';

export class UserRepository {
  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Create a new user
   */
  async create(data: { id: string; email: string }): Promise<User> {
    return prisma.user.create({
      data,
    });
  }

  /**
   * Upsert user (create if not exists, update if exists)
   */
  async upsert(data: { id: string; email: string }): Promise<User> {
    return prisma.user.upsert({
      where: { id: data.id },
      update: { email: data.email },
      create: data,
    });
  }

  /**
   * Update user
   */
  async update(id: string, data: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete user
   */
  async delete(id: string): Promise<void> {
    await prisma.user.delete({
      where: { id },
    });
  }
}

export const userRepository = new UserRepository();
