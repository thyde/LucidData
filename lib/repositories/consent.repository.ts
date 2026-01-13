/**
 * Consent Repository - Data access layer for consent operations
 */

import { prisma } from '@/lib/db/prisma';
import { Consent } from '@prisma/client';
import { BaseRepository } from './base.repository';

export class ConsentRepository extends BaseRepository<Consent> {
  protected model = prisma.consent;
  /**
   * Find all consents for a user
   */
  async findByUserId(userId: string): Promise<Consent[]> {
    return prisma.consent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }


  /**
   * Find active consents for a user
   */
  async findActive(userId: string): Promise<Consent[]> {
    const now = new Date();
    return prisma.consent.findMany({
      where: {
        userId,
        revoked: false,
        OR: [{ endDate: null }, { endDate: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find consents for a specific vault entry
   */
  async findByVaultDataId(vaultDataId: string): Promise<Consent[]> {
    return prisma.consent.findMany({
      where: { vaultDataId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Note: create() and update() are inherited from BaseRepository

  /**
   * Revoke a consent
   */
  async revoke(
    id: string,
    reason: string
  ): Promise<Consent> {
    return prisma.consent.update({
      where: { id },
      data: {
        revoked: true,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  }

  // Note: belongsToUser() is inherited from BaseRepository

  /**
   * Count active consents for a user
   */
  async countActive(userId: string): Promise<number> {
    const now = new Date();
    return prisma.consent.count({
      where: {
        userId,
        revoked: false,
        OR: [{ endDate: null }, { endDate: { gt: now } }],
      },
    });
  }

  /**
   * Find expired consents
   */
  async findExpired(): Promise<Consent[]> {
    const now = new Date();
    return prisma.consent.findMany({
      where: {
        revoked: false,
        endDate: {
          lte: now,
        },
      },
    });
  }

  /**
   * Verify if a third party has active consent for vault data
   */
  async hasActiveConsent(
    vaultDataId: string,
    grantedTo: string
  ): Promise<boolean> {
    const now = new Date();
    const consent = await prisma.consent.findFirst({
      where: {
        vaultDataId,
        grantedTo,
        revoked: false,
        OR: [{ endDate: null }, { endDate: { gt: now } }],
      },
    });
    return consent !== null;
  }
}

// Export singleton instance
export const consentRepository = new ConsentRepository();
