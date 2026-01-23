/**
 * Audit Service - Business logic for audit logging
 * Handles hash chain creation, verification, and audit log management
 */

import { auditRepository } from '@/lib/repositories/audit.repository';
import { createAuditHash, verifyHashChain } from '@/lib/crypto/hashing';
import { CreateAuditLogPayload, HashChainEntry } from '@/types';
import { AuditLog } from '@prisma/client';
import { logAuditIntegrityError } from '@/lib/services/error-logger';

export class AuditService {
  /**
   * Get all audit logs for a user
   */
  async getUserAuditLogs(userId: string): Promise<AuditLog[]> {
    return auditRepository.findByUserId(userId);
  }

  /**
   * Get audit logs for a specific vault entry
   */
  async getVaultDataAuditLogs(vaultDataId: string): Promise<AuditLog[]> {
    return auditRepository.findByVaultDataId(vaultDataId);
  }

  /**
   * Create a new audit log entry with hash chain
   */
  async createAuditLogEntry(payload: CreateAuditLogPayload): Promise<AuditLog> {
    // Get the most recent audit log for this user to continue the chain
    const previousLog = await auditRepository.findLatestByUserId(payload.userId);

    const previousHash = previousLog?.currentHash || null;

    // Create the hash for this entry
    const currentHash = createAuditHash(previousHash, {
      eventType: payload.eventType,
      userId: payload.userId,
      timestamp: new Date(),
      action: payload.action,
    });

    return auditRepository.create({
      userId: payload.userId,
      vaultDataId: payload.vaultDataId,
      consentId: payload.consentId,
      eventType: payload.eventType,
      action: payload.action,
      actorId: payload.actorId,
      actorType: payload.actorType,
      actorName: payload.actorName,
      ipAddress: payload.ipAddress,
      userAgent: payload.userAgent,
      method: payload.method,
      success: payload.success ?? true,
      errorMessage: payload.errorMessage,
      previousHash,
      currentHash,
      metadata: payload.metadata,
    });
  }

  /**
   * Verify the integrity of the audit log chain
   */
  async verifyAuditChain(userId: string): Promise<{
    valid: boolean;
    brokenAt?: number;
    totalLogs: number;
  }> {
    const logs = await auditRepository.findByUserId(userId);

    if (logs.length === 0) {
      return { valid: true, totalLogs: 0 };
    }

    const chainEntries: HashChainEntry[] = logs.map((entry) => ({
      currentHash: entry.currentHash,
      previousHash: entry.previousHash,
      eventType: entry.eventType,
      userId: entry.userId,
      timestamp: entry.timestamp,
      action: entry.action,
    }));

    const isValid = verifyHashChain(chainEntries);

    if (!isValid) {
      // Find where the chain breaks
      for (let i = 1; i < chainEntries.length; i++) {
        const prev = chainEntries[i - 1];
        const curr = chainEntries[i];

        if (curr.previousHash !== prev.currentHash) {
          logAuditIntegrityError(new Error('Hash chain break detected'), {
            userId,
            action: 'VERIFY_AUDIT_CHAIN',
            metadata: {
              brokenAt: i,
              previousLog: prev,
              currentLog: curr,
            },
          });

          return {
            valid: false,
            brokenAt: i,
            totalLogs: logs.length,
          };
        }
      }
    }

    return {
      valid: isValid,
      totalLogs: logs.length,
    };
  }

  /**
   * Get audit statistics for a user
   */
  async getUserStats(userId: string): Promise<{
    totalLogs: number;
    byEventType: Record<string, number>;
    recentFailures: number;
    chainValid: boolean;
  }> {
    const logs = await auditRepository.findByUserId(userId);
    const failures = await auditRepository.findFailures(userId);
    const verification = await this.verifyAuditChain(userId);

    const byEventType: Record<string, number> = {};
    logs.forEach((log) => {
      byEventType[log.eventType] = (byEventType[log.eventType] || 0) + 1;
    });

    return {
      totalLogs: logs.length,
      byEventType,
      recentFailures: failures.length,
      chainValid: verification.valid,
    };
  }

  /**
   * Get recent activity for a user
   */
  async getRecentActivity(userId: string, limit: number = 10): Promise<AuditLog[]> {
    const logs = await auditRepository.findByUserId(userId);
    return logs.slice(-limit).reverse();
  }

  /**
   * Clean up old audit logs based on retention policy
   */
  async cleanupOldLogs(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    return auditRepository.deleteOlderThan(cutoffDate);
  }
}

// Export singleton instance
export const auditService = new AuditService();
