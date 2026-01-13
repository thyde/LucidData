/**
 * Encryption Migration Service
 *
 * Handles migration of vault entries from v1 (legacy) to v2 (envelope) encryption.
 *
 * Migration Strategy:
 * - Batch processing to avoid overwhelming the database
 * - Graceful error handling (skip failed entries, continue migration)
 * - Audit logging for each migration
 * - Progress tracking
 */

import { vaultRepository } from '@/lib/repositories/vault.repository';
import { keyManagement } from '@/lib/crypto/key-management';
import { logCryptoError, logInfo } from '@/lib/services/error-logger';
import { auditService } from '@/lib/services/audit.service';

export interface MigrationStats {
  total: number;
  v1: number;
  v2: number;
  migrated: number;
  failed: number;
  percentageComplete: number;
}

export interface MigrationResult {
  success: boolean;
  migrated: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

export class EncryptionMigrationService {
  /**
   * Get current migration statistics
   * Shows progress of v1 → v2 migration
   */
  async getMigrationStats(): Promise<MigrationStats> {
    const counts = await vaultRepository.countByEncryptionVersion();
    const migrated = counts.v2;
    const percentageComplete = counts.total > 0
      ? Math.round((counts.v2 / counts.total) * 100)
      : 100;

    return {
      total: counts.total,
      v1: counts.v1,
      v2: counts.v2,
      migrated,
      failed: 0, // We don't track failed migrations in DB, only log them
      percentageComplete,
    };
  }

  /**
   * Migrate a single vault entry from v1 to v2
   *
   * @param vaultDataId - ID of the vault entry to migrate
   * @param userId - User ID for audit logging
   * @returns true if successful, false otherwise
   */
  async migrateEntry(vaultDataId: string, userId: string): Promise<boolean> {
    try {
      // Fetch the entry
      const entry = await vaultRepository.findById(vaultDataId);
      if (!entry) {
        logCryptoError(new Error('Entry not found'), {
          userId,
          action: 'MIGRATE_ENTRY',
          resource: vaultDataId,
        });
        return false;
      }

      // Check if already v2
      if (entry.encryptionVersion === 'v2' && entry.keyIv) {
        logInfo(`Entry ${vaultDataId} already migrated to v2`, { userId });
        return true;
      }

      // Parse v1 encryption data
      const [ivHex, authTagHex] = entry.iv.split(':');

      // Migrate using key management service
      const v2Result = keyManagement.migrateToEnvelopeEncryption(
        entry.encryptedData,
        ivHex,
        authTagHex
      );

      // Update the entry with v2 encryption data
      await vaultRepository.update(entry.id, {
        encryptedData: v2Result.encryptedData,
        encryptedKey: v2Result.encryptedDek,
        iv: `${v2Result.dataIv}:${v2Result.dataAuthTag}`,
        keyIv: `${v2Result.dekIv}:${v2Result.dekAuthTag}`,
        encryptionVersion: v2Result.encryptionVersion,
      });

      // Create audit log for migration
      await auditService.logEvent({
        userId: entry.userId,
        eventType: 'data_updated',
        action: 'Migrated vault entry from v1 to v2 encryption',
        actorId: 'system',
        actorType: 'system',
        actorName: 'Encryption Migration Service',
        vaultDataId: entry.id,
        success: true,
        metadata: {
          fromVersion: 'v1',
          toVersion: 'v2',
          migrationTimestamp: new Date().toISOString(),
        },
      });

      logInfo(`Successfully migrated entry ${vaultDataId} to v2`, {
        userId: entry.userId,
        vaultDataId,
      });

      return true;
    } catch (error) {
      logCryptoError(error, {
        userId,
        action: 'MIGRATE_ENTRY',
        resource: vaultDataId,
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
      return false;
    }
  }

  /**
   * Migrate a batch of v1 entries to v2
   *
   * @param batchSize - Number of entries to migrate in this batch
   * @returns Migration result with success/failure counts
   */
  async migrateBatch(batchSize: number = 50): Promise<MigrationResult> {
    const errors: Array<{ id: string; error: string }> = [];
    let migrated = 0;
    let failed = 0;

    try {
      // Get batch of v1 entries
      const v1Entries = await vaultRepository.findV1Entries(batchSize);

      if (v1Entries.length === 0) {
        logInfo('No v1 entries found to migrate');
        return { success: true, migrated: 0, failed: 0, errors: [] };
      }

      logInfo(`Starting migration of ${v1Entries.length} entries`);

      // Migrate each entry
      for (const entry of v1Entries) {
        const success = await this.migrateEntry(entry.id, entry.userId);

        if (success) {
          migrated++;
        } else {
          failed++;
          errors.push({
            id: entry.id,
            error: 'Migration failed - see logs for details',
          });
        }
      }

      logInfo(`Batch migration complete: ${migrated} migrated, ${failed} failed`);

      return {
        success: failed === 0,
        migrated,
        failed,
        errors,
      };
    } catch (error) {
      logCryptoError(error, {
        userId: 'system',
        action: 'MIGRATE_BATCH',
        metadata: {
          batchSize,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      return {
        success: false,
        migrated,
        failed,
        errors: [
          ...errors,
          { id: 'batch', error: error instanceof Error ? error.message : 'Unknown error' },
        ],
      };
    }
  }

  /**
   * Schedule background migration
   * Migrates all v1 entries in batches with delays
   *
   * @param options - Migration options
   * @returns Final migration statistics
   */
  async scheduleBackgroundMigration(options: {
    batchSize?: number;
    delayBetweenBatches?: number; // milliseconds
    maxBatches?: number;
  } = {}): Promise<MigrationStats> {
    const {
      batchSize = 50,
      delayBetweenBatches = 1000, // 1 second
      maxBatches = 1000, // Safety limit
    } = options;

    logInfo('Starting background migration', { batchSize, delayBetweenBatches, maxBatches });

    let batchCount = 0;
    let totalMigrated = 0;
    let totalFailed = 0;

    while (batchCount < maxBatches) {
      // Get current stats
      const stats = await this.getMigrationStats();

      // Check if migration is complete
      if (stats.v1 === 0) {
        logInfo('All entries migrated to v2', {
          totalMigrated,
          totalFailed,
          batches: batchCount,
        });
        return stats;
      }

      // Migrate a batch
      const result = await this.migrateBatch(batchSize);
      totalMigrated += result.migrated;
      totalFailed += result.failed;
      batchCount++;

      // If no entries were migrated, we're done
      if (result.migrated === 0) {
        logInfo('No more entries to migrate', {
          totalMigrated,
          totalFailed,
          batches: batchCount,
        });
        break;
      }

      // Delay before next batch (avoid overwhelming DB)
      if (delayBetweenBatches > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    if (batchCount >= maxBatches) {
      logInfo('Max batches reached, stopping migration', {
        totalMigrated,
        totalFailed,
        batches: batchCount,
      });
    }

    // Return final stats
    return this.getMigrationStats();
  }

  /**
   * Verify that a vault entry is properly encrypted with v2
   * Useful for testing and validation
   *
   * @param vaultDataId - Entry to verify
   * @returns true if entry is valid v2, false otherwise
   */
  async verifyV2Entry(vaultDataId: string): Promise<boolean> {
    try {
      const entry = await vaultRepository.findById(vaultDataId);

      if (!entry) {
        return false;
      }

      // Check v2 fields are present
      if (!entry.keyIv || entry.encryptionVersion !== 'v2') {
        return false;
      }

      // Verify format
      const dataParts = entry.iv.split(':');
      const dekParts = entry.keyIv.split(':');

      if (dataParts.length !== 2 || dekParts.length !== 2) {
        return false;
      }

      return true;
    } catch (error) {
      logCryptoError(error, {
        userId: 'system',
        action: 'VERIFY_V2_ENTRY',
        resource: vaultDataId,
      });
      return false;
    }
  }
}

// Export singleton instance
export const encryptionMigrationService = new EncryptionMigrationService();
