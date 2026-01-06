/**
 * Consent Repository - Data access layer for consent operations
 */

import { prisma } from '@/lib/db/prisma';
import { Consent } from '@prisma/client';

export class ConsentRepository {
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
   * Find a single consent by ID
   */
  async findById(id: string): Promise<Consent | null> {
    return prisma.consent.findUnique({
      where: { id },
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

  /**
   * Create a new consent
   */
  async create(data: {
    userId: string;
    vaultDataId?: string | null;
    grantedTo: string;
    grantedToName: string;
    grantedToEmail?: string;
    accessLevel: string;
    purpose: string;
    endDate?: Date;
    consentType?: string;
    termsVersion?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<Consent> {
    return prisma.consent.create({
      data,
    });
  }

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

  /**
   * Check if a consent belongs to a user
   */
  async belongsToUser(id: string, userId: string): Promise<boolean> {
    const consent = await prisma.consent.findUnique({
      where: { id },
      select: { userId: true },
    });
    return consent?.userId === userId;
  }

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
