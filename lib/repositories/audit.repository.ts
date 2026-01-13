/**
 * Audit Repository - Data access layer for audit log operations
 */

import { prisma } from '@/lib/db/prisma';
import { AuditLog } from '@prisma/client';
import { BaseRepository } from './base.repository';

export class AuditRepository extends BaseRepository<AuditLog> {
  protected model = prisma.auditLog;
  /**
   * Find all audit logs for a user
   */
  async findByUserId(userId: string): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: { userId },
      orderBy: { timestamp: 'asc' },
    });
  }

  /**
   * Find audit logs for a specific vault entry
   */
  async findByVaultDataId(vaultDataId: string): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: { vaultDataId },
      orderBy: { timestamp: 'asc' },
    });
  }

  /**
   * Find audit logs for a specific consent
   */
  async findByConsentId(consentId: string): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: { consentId },
      orderBy: { timestamp: 'asc' },
    });
  }

  /**
   * Find the most recent audit log for a user
   */
  async findLatestByUserId(userId: string): Promise<AuditLog | null> {
    return prisma.auditLog.findFirst({
      where: { userId },
      orderBy: { timestamp: 'desc' },
    });
  }

  // Note: create() is inherited from BaseRepository

  /**
   * Count audit logs for a user
   */
  async countByUserId(userId: string): Promise<number> {
    return this.count({ userId });
  }

  /**
   * Find audit logs by event type
   */
  async findByEventType(userId: string, eventType: string): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: { userId, eventType },
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Find audit logs in a date range
   */
  async findByDateRange(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: {
        userId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { timestamp: 'asc' },
    });
  }

  /**
   * Find failed operations
   */
  async findFailures(userId: string): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: {
        userId,
        success: false,
      },
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Delete old audit logs (for retention policy)
   */
  async deleteOlderThan(date: Date): Promise<number> {
    const result = await prisma.auditLog.deleteMany({
      where: {
        timestamp: {
          lt: date,
        },
      },
    });
    return result.count;
  }
}

// Export singleton instance
export const auditRepository = new AuditRepository();
