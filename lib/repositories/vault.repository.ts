/**
 * Vault Repository - Data access layer for vault operations
 * Separates database queries from business logic
 */

import { prisma } from '@/lib/db/prisma';
import { VaultData } from '@prisma/client';

export class VaultRepository {
  /**
   * Find all vault entries for a user
   */
  async findByUserId(userId: string): Promise<VaultData[]> {
    return prisma.vaultData.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find a single vault entry by ID
   */
  async findById(id: string): Promise<VaultData | null> {
    return prisma.vaultData.findUnique({
      where: { id },
    });
  }

  /**
   * Find vault entries by category
   */
  async findByCategory(userId: string, category: string): Promise<VaultData[]> {
    return prisma.vaultData.findMany({
      where: { userId, category },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Create a new vault entry
   */
  async create(data: {
    userId: string;
    category: string;
    dataType: string;
    label: string;
    description?: string;
    tags: string[];
    encryptedData: string;
    encryptedKey: string;
    iv: string;
    schemaType?: string;
    schemaVersion?: string;
    expiresAt?: Date;
  }): Promise<VaultData> {
    return prisma.vaultData.create({
      data,
    });
  }

  /**
   * Update a vault entry
   */
  async update(
    id: string,
    data: {
      label?: string;
      category?: string;
      description?: string;
      tags?: string[];
      encryptedData?: string;
      iv?: string;
      expiresAt?: Date;
    }
  ): Promise<VaultData> {
    return prisma.vaultData.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete a vault entry
   */
  async delete(id: string): Promise<VaultData> {
    return prisma.vaultData.delete({
      where: { id },
    });
  }

  /**
   * Check if a vault entry belongs to a user
   */
  async belongsToUser(id: string, userId: string): Promise<boolean> {
    const entry = await prisma.vaultData.findUnique({
      where: { id },
      select: { userId: true },
    });
    return entry?.userId === userId;
  }

  /**
   * Count vault entries for a user
   */
  async countByUserId(userId: string): Promise<number> {
    return prisma.vaultData.count({
      where: { userId },
    });
  }

  /**
   * Find expired entries
   */
  async findExpired(): Promise<VaultData[]> {
    return prisma.vaultData.findMany({
      where: {
        expiresAt: {
          lte: new Date(),
        },
      },
    });
  }
}

// Export singleton instance
export const vaultRepository = new VaultRepository();
