/**
 * Vault Repository - Data access layer for vault operations
 * Separates database queries from business logic
 */

import { prisma } from '@/lib/db/prisma';
import { VaultData } from '@prisma/client';
import { BaseRepository } from './base.repository';

export class VaultRepository extends BaseRepository<VaultData> {
  protected model = prisma.vaultData;
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
   * Find vault entries by category
   */
  async findByCategory(userId: string, category: string): Promise<VaultData[]> {
    return prisma.vaultData.findMany({
      where: { userId, category },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Note: create(), update(), delete(), belongsToUser(), and count()
  // are now inherited from BaseRepository

  /**
   * Count vault entries for a user
   */
  async countByUserId(userId: string): Promise<number> {
    return this.count({ userId });
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

  /**
   * Find v1 encrypted entries for migration
   * Returns entries that need to be migrated to v2 envelope encryption
   *
   * @param limit - Maximum number of entries to return
   * @returns Array of v1 vault entries
   */
  async findV1Entries(limit: number = 50): Promise<VaultData[]> {
    return prisma.vaultData.findMany({
      where: {
        OR: [
          { encryptionVersion: 'v1' },
          { keyIv: null }, // v1 entries don't have keyIv
        ],
      },
      take: limit,
      orderBy: { createdAt: 'asc' }, // Migrate oldest first
    });
  }

  /**
   * Count entries by encryption version
   * Useful for migration progress tracking
   *
   * @returns Object with v1 and v2 counts
   */
  async countByEncryptionVersion(): Promise<{ v1: number; v2: number; total: number }> {
    const [v1Count, v2Count, total] = await Promise.all([
      prisma.vaultData.count({
        where: {
          OR: [
            { encryptionVersion: 'v1' },
            { keyIv: null },
          ],
        },
      }),
      prisma.vaultData.count({
        where: {
          AND: [
            { encryptionVersion: 'v2' },
            { keyIv: { not: null } },
          ],
        },
      }),
      prisma.vaultData.count(),
    ]);

    return { v1: v1Count, v2: v2Count, total };
  }
}

// Export singleton instance
export const vaultRepository = new VaultRepository();
