/**
 * Consent Service - Business logic for consent management
 * Handles consent creation, revocation, and verification
 */

import { consentRepository } from '@/lib/repositories/consent.repository';
import { vaultRepository } from '@/lib/repositories/vault.repository';
import { CreateConsentPayload, RevokeConsentPayload } from '@/types';
import { Consent } from '@prisma/client';

export class ConsentService {
  /**
   * Get all consents for a user
   */
  async getUserConsents(userId: string): Promise<Consent[]> {
    return consentRepository.findByUserId(userId);
  }

  /**
   * Get active consents for a user
   */
  async getActiveConsents(userId: string): Promise<Consent[]> {
    return consentRepository.findActive(userId);
  }

  /**
   * Get a single consent by ID
   */
  async getConsentById(id: string, userId: string): Promise<Consent | null> {
    const consent = await consentRepository.findById(id);

    if (!consent) {
      return null;
    }

    // Verify ownership
    if (consent.userId !== userId) {
      throw new Error('Unauthorized access to consent');
    }

    return consent;
  }

  /**
   * Create a new consent
   */
  async createConsent(
    userId: string,
    payload: CreateConsentPayload,
    requestInfo?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<Consent> {
    // Verify vault data ownership if provided
    if (payload.vaultDataId) {
      const belongsToUser = await vaultRepository.belongsToUser(
        payload.vaultDataId,
        userId
      );
      if (!belongsToUser) {
        throw new Error('Invalid vault data reference');
      }
    }

    return consentRepository.create({
      userId,
      vaultDataId: payload.vaultDataId,
      grantedTo: payload.grantedTo,
      grantedToName: payload.grantedToName,
      grantedToEmail: payload.grantedToEmail,
      accessLevel: payload.accessLevel,
      purpose: payload.purpose,
      endDate: payload.endDate,
      consentType: payload.consentType || 'explicit',
      termsVersion: payload.termsVersion || '1.0',
      ipAddress: requestInfo?.ipAddress,
      userAgent: requestInfo?.userAgent,
    });
  }

  /**
   * Revoke a consent
   */
  async revokeConsent(
    id: string,
    userId: string,
    payload: RevokeConsentPayload
  ): Promise<Consent> {
    // Verify ownership
    const belongsToUser = await consentRepository.belongsToUser(id, userId);
    if (!belongsToUser) {
      throw new Error('Unauthorized access to consent');
    }

    return consentRepository.revoke(id, payload.revokedReason);
  }

  /**
   * Verify if a third party has active consent
   */
  async verifyConsent(
    vaultDataId: string,
    grantedTo: string
  ): Promise<boolean> {
    return consentRepository.hasActiveConsent(vaultDataId, grantedTo);
  }

  /**
   * Get consent statistics for a user
   */
  async getUserStats(userId: string): Promise<{
    totalConsents: number;
    activeConsents: number;
    revokedConsents: number;
    expiredConsents: number;
  }> {
    const allConsents = await consentRepository.findByUserId(userId);
    const activeCount = await consentRepository.countActive(userId);

    const now = new Date();
    const revokedCount = allConsents.filter((c) => c.revoked).length;
    const expiredCount = allConsents.filter(
      (c) => !c.revoked && c.endDate && c.endDate <= now
    ).length;

    return {
      totalConsents: allConsents.length,
      activeConsents: activeCount,
      revokedConsents: revokedCount,
      expiredConsents: expiredCount,
    };
  }

  /**
   * Auto-expire consents (to be called by cron job)
   */
  async processExpiredConsents(): Promise<number> {
    const expired = await consentRepository.findExpired();

    // In a real implementation, we might want to:
    // 1. Notify users of expired consents
    // 2. Trigger audit log entries
    // 3. Clean up related data

    return expired.length;
  }
}

// Export singleton instance
export const consentService = new ConsentService();
