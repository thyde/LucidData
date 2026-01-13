/**
 * Encryption Migration Service Tests
 *
 * Tests for v1 → v2 encryption migration functionality.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EncryptionMigrationService } from '../encryption-migration.service';
import { vaultRepository } from '@/lib/repositories/vault.repository';
import { keyManagement } from '@/lib/crypto/key-management';
import { auditService } from '@/lib/services/audit.service';
import type { VaultData } from '@prisma/client';

// Mock dependencies
vi.mock('@/lib/repositories/vault.repository', () => ({
  vaultRepository: {
    countByEncryptionVersion: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    findV1Entries: vi.fn(),
  },
}));

vi.mock('@/lib/services/audit.service', () => ({
  auditService: {
    logEvent: vi.fn(),
  },
}));

vi.mock('@/lib/crypto/key-management', () => ({
  keyManagement: {
    migrateToEnvelopeEncryption: vi.fn(),
  },
}));

describe('EncryptionMigrationService', () => {
  let migrationService: EncryptionMigrationService;

  beforeEach(() => {
    migrationService = new EncryptionMigrationService();
    vi.clearAllMocks();
  });

  describe('getMigrationStats', () => {
    it('should return correct migration statistics', async () => {
      // Mock repository response
      vi.mocked(vaultRepository.countByEncryptionVersion).mockResolvedValue({
        v1: 30,
        v2: 70,
        total: 100,
      });

      const stats = await migrationService.getMigrationStats();

      expect(stats).toEqual({
        total: 100,
        v1: 30,
        v2: 70,
        migrated: 70,
        failed: 0,
        percentageComplete: 70,
      });
    });

    it('should handle 100% migration complete', async () => {
      vi.mocked(vaultRepository.countByEncryptionVersion).mockResolvedValue({
        v1: 0,
        v2: 100,
        total: 100,
      });

      const stats = await migrationService.getMigrationStats();

      expect(stats.percentageComplete).toBe(100);
      expect(stats.v1).toBe(0);
    });

    it('should handle empty database', async () => {
      vi.mocked(vaultRepository.countByEncryptionVersion).mockResolvedValue({
        v1: 0,
        v2: 0,
        total: 0,
      });

      const stats = await migrationService.getMigrationStats();

      expect(stats.percentageComplete).toBe(100); // 0/0 = 100%
      expect(stats.total).toBe(0);
    });
  });

  describe('migrateEntry', () => {
    it('should successfully migrate a v1 entry to v2', async () => {
      // Create mock v1 entry
      const mockV1Entry: VaultData = {
        id: 'entry-1',
        userId: 'user-1',
        category: 'personal',
        dataType: 'json',
        label: 'Test Entry',
        description: 'Test',
        tags: [],
        encryptedData: 'encrypted-hex-data',
        encryptedKey: 'encrypted-key',
        iv: 'iv-hex:authtag-hex',
        keyIv: null,
        encryptionVersion: 'v1',
        schemaType: null,
        schemaVersion: '1.0',
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: null,
      };

      // Mock keyManagement migration
      vi.mocked(keyManagement.migrateToEnvelopeEncryption).mockReturnValue({
        encryptedData: 'new-encrypted-data',
        encryptedDek: 'encrypted-dek',
        dataIv: 'new-iv',
        dataAuthTag: 'new-authtag',
        dekIv: 'dek-iv',
        dekAuthTag: 'dek-authtag',
        encryptionVersion: 'v2',
      });

      // Mock repository methods
      vi.mocked(vaultRepository.findById).mockResolvedValue(mockV1Entry);
      vi.mocked(vaultRepository.update).mockResolvedValue({
        ...mockV1Entry,
        encryptionVersion: 'v2',
        keyIv: 'dek-iv:dek-authtag',
      });

      // Mock audit service
      vi.mocked(auditService.logEvent).mockResolvedValue({
        id: 'audit-1',
        userId: 'user-1',
        vaultDataId: 'entry-1',
        consentId: null,
        eventType: 'data_updated',
        action: 'Migrated vault entry from v1 to v2 encryption',
        actorId: 'system',
        actorType: 'system',
        actorName: 'Encryption Migration Service',
        ipAddress: null,
        userAgent: null,
        method: null,
        success: true,
        errorMessage: null,
        previousHash: null,
        currentHash: 'hash',
        metadata: {},
        timestamp: new Date(),
      } as any);

      const result = await migrationService.migrateEntry('entry-1', 'user-1');

      expect(result).toBe(true);
      expect(vaultRepository.findById).toHaveBeenCalledWith('entry-1');
      expect(vaultRepository.update).toHaveBeenCalled();
      expect(auditService.logEvent).toHaveBeenCalled();
    });

    it('should skip already migrated v2 entries', async () => {
      // Create mock v2 entry
      const mockV2Entry: VaultData = {
        id: 'entry-2',
        userId: 'user-1',
        category: 'personal',
        dataType: 'json',
        label: 'Test Entry',
        description: 'Test',
        tags: [],
        encryptedData: 'encrypted-hex-data',
        encryptedKey: 'encrypted-key',
        iv: 'iv-hex:authtag-hex',
        keyIv: 'dek-iv:dek-authtag',
        encryptionVersion: 'v2',
        schemaType: null,
        schemaVersion: '1.0',
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: null,
      };

      vi.mocked(vaultRepository.findById).mockResolvedValue(mockV2Entry);

      const result = await migrationService.migrateEntry('entry-2', 'user-1');

      expect(result).toBe(true);
      expect(vaultRepository.update).not.toHaveBeenCalled();
    });

    it('should return false if entry not found', async () => {
      vi.mocked(vaultRepository.findById).mockResolvedValue(null);

      const result = await migrationService.migrateEntry('nonexistent', 'user-1');

      expect(result).toBe(false);
    });

    it('should handle migration errors gracefully', async () => {
      const mockV1Entry: VaultData = {
        id: 'entry-3',
        userId: 'user-1',
        category: 'personal',
        dataType: 'json',
        label: 'Test Entry',
        description: 'Test',
        tags: [],
        encryptedData: 'encrypted-hex-data',
        encryptedKey: 'encrypted-key',
        iv: 'iv-hex:authtag-hex',
        keyIv: null,
        encryptionVersion: 'v1',
        schemaType: null,
        schemaVersion: '1.0',
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: null,
      };

      vi.mocked(vaultRepository.findById).mockResolvedValue(mockV1Entry);
      vi.mocked(vaultRepository.update).mockRejectedValue(new Error('Database error'));

      const result = await migrationService.migrateEntry('entry-3', 'user-1');

      expect(result).toBe(false);
    });
  });

  describe('migrateBatch', () => {
    it('should migrate a batch of entries', async () => {
      const mockV1Entries: VaultData[] = [
        {
          id: 'entry-1',
          userId: 'user-1',
          category: 'personal',
          dataType: 'json',
          label: 'Entry 1',
          description: null,
          tags: [],
          encryptedData: 'data1',
          encryptedKey: 'key1',
          iv: 'iv1:tag1',
          keyIv: null,
          encryptionVersion: 'v1',
          schemaType: null,
          schemaVersion: '1.0',
          createdAt: new Date(),
          updatedAt: new Date(),
          expiresAt: null,
        },
        {
          id: 'entry-2',
          userId: 'user-2',
          category: 'personal',
          dataType: 'json',
          label: 'Entry 2',
          description: null,
          tags: [],
          encryptedData: 'data2',
          encryptedKey: 'key2',
          iv: 'iv2:tag2',
          keyIv: null,
          encryptionVersion: 'v1',
          schemaType: null,
          schemaVersion: '1.0',
          createdAt: new Date(),
          updatedAt: new Date(),
          expiresAt: null,
        },
      ];

      // Mock keyManagement migration
      vi.mocked(keyManagement.migrateToEnvelopeEncryption).mockReturnValue({
        encryptedData: 'new-encrypted-data',
        encryptedDek: 'encrypted-dek',
        dataIv: 'new-iv',
        dataAuthTag: 'new-authtag',
        dekIv: 'dek-iv',
        dekAuthTag: 'dek-authtag',
        encryptionVersion: 'v2',
      });

      vi.mocked(vaultRepository.findV1Entries).mockResolvedValue(mockV1Entries);
      vi.mocked(vaultRepository.findById).mockImplementation(async (id) => {
        return mockV1Entries.find(e => e.id === id) || null;
      });
      vi.mocked(vaultRepository.update).mockResolvedValue(mockV1Entries[0]);
      vi.mocked(auditService.logEvent).mockResolvedValue({} as any);

      const result = await migrationService.migrateBatch(2);

      expect(result.migrated).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty batch', async () => {
      vi.mocked(vaultRepository.findV1Entries).mockResolvedValue([]);

      const result = await migrationService.migrateBatch(10);

      expect(result.migrated).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.success).toBe(true);
    });

    it('should continue after individual entry failures', async () => {
      const mockEntries: VaultData[] = [
        {
          id: 'good-entry',
          userId: 'user-1',
          encryptionVersion: 'v1',
          keyIv: null,
          iv: 'iv:tag',
        } as VaultData,
        {
          id: 'bad-entry',
          userId: 'user-2',
          encryptionVersion: 'v1',
          keyIv: null,
          iv: 'iv:tag',
        } as VaultData,
      ];

      // Mock keyManagement migration
      vi.mocked(keyManagement.migrateToEnvelopeEncryption).mockReturnValue({
        encryptedData: 'new-encrypted-data',
        encryptedDek: 'encrypted-dek',
        dataIv: 'new-iv',
        dataAuthTag: 'new-authtag',
        dekIv: 'dek-iv',
        dekAuthTag: 'dek-authtag',
        encryptionVersion: 'v2',
      });

      vi.mocked(vaultRepository.findV1Entries).mockResolvedValue(mockEntries);
      vi.mocked(vaultRepository.findById).mockImplementation(async (id) => {
        if (id === 'bad-entry') {
          throw new Error('Database error');
        }
        return mockEntries.find(e => e.id === id) || null;
      });
      vi.mocked(vaultRepository.update).mockResolvedValue({} as any);
      vi.mocked(auditService.logEvent).mockResolvedValue({} as any);

      const result = await migrationService.migrateBatch(2);

      expect(result.migrated).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('scheduleBackgroundMigration', () => {
    it('should stop when all entries migrated', async () => {
      // First call: has v1 entries
      // Second call: all migrated
      vi.mocked(vaultRepository.countByEncryptionVersion)
        .mockResolvedValueOnce({ v1: 10, v2: 0, total: 10 })
        .mockResolvedValueOnce({ v1: 0, v2: 10, total: 10 });

      vi.mocked(vaultRepository.findV1Entries).mockResolvedValue([]);

      const stats = await migrationService.scheduleBackgroundMigration({
        batchSize: 5,
        delayBetweenBatches: 0,
        maxBatches: 10,
      });

      expect(stats.v1).toBe(0);
      expect(stats.percentageComplete).toBe(100);
    });

    it('should respect maxBatches limit', async () => {
      // Always return some v1 entries (simulate incomplete migration)
      vi.mocked(vaultRepository.countByEncryptionVersion).mockResolvedValue({
        v1: 100,
        v2: 0,
        total: 100,
      });

      const mockEntry: VaultData = {
        id: 'entry-1',
        userId: 'user-1',
        category: 'personal',
        dataType: 'json',
        label: 'Test Entry',
        description: null,
        tags: [],
        encryptedData: 'data1',
        encryptedKey: 'key1',
        iv: 'iv1:tag1',
        keyIv: null,
        encryptionVersion: 'v1',
        schemaType: null,
        schemaVersion: '1.0',
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: null,
      };

      // Mock keyManagement migration
      vi.mocked(keyManagement.migrateToEnvelopeEncryption).mockReturnValue({
        encryptedData: 'new-encrypted-data',
        encryptedDek: 'encrypted-dek',
        dataIv: 'new-iv',
        dataAuthTag: 'new-authtag',
        dekIv: 'dek-iv',
        dekAuthTag: 'dek-authtag',
        encryptionVersion: 'v2',
      });

      vi.mocked(vaultRepository.findV1Entries).mockResolvedValue([mockEntry]);
      vi.mocked(vaultRepository.findById).mockResolvedValue(mockEntry);
      vi.mocked(vaultRepository.update).mockResolvedValue(mockEntry);
      vi.mocked(auditService.logEvent).mockResolvedValue({} as any);

      const stats = await migrationService.scheduleBackgroundMigration({
        batchSize: 1,
        delayBetweenBatches: 0,
        maxBatches: 3,
      });

      // Should stop after 3 batches
      expect(vaultRepository.findV1Entries).toHaveBeenCalledTimes(3);
    });
  });

  describe('verifyV2Entry', () => {
    it('should return true for valid v2 entry', async () => {
      const mockV2Entry: VaultData = {
        id: 'entry-1',
        encryptionVersion: 'v2',
        keyIv: 'dek-iv:dek-tag',
        iv: 'data-iv:data-tag',
      } as VaultData;

      vi.mocked(vaultRepository.findById).mockResolvedValue(mockV2Entry);

      const isValid = await migrationService.verifyV2Entry('entry-1');

      expect(isValid).toBe(true);
    });

    it('should return false for v1 entry', async () => {
      const mockV1Entry: VaultData = {
        id: 'entry-1',
        encryptionVersion: 'v1',
        keyIv: null,
        iv: 'iv:tag',
      } as VaultData;

      vi.mocked(vaultRepository.findById).mockResolvedValue(mockV1Entry);

      const isValid = await migrationService.verifyV2Entry('entry-1');

      expect(isValid).toBe(false);
    });

    it('should return false for invalid v2 format', async () => {
      const mockInvalidEntry: VaultData = {
        id: 'entry-1',
        encryptionVersion: 'v2',
        keyIv: 'invalid-format', // Missing colon separator
        iv: 'data-iv:data-tag',
      } as VaultData;

      vi.mocked(vaultRepository.findById).mockResolvedValue(mockInvalidEntry);

      const isValid = await migrationService.verifyV2Entry('entry-1');

      expect(isValid).toBe(false);
    });

    it('should return false if entry not found', async () => {
      vi.mocked(vaultRepository.findById).mockResolvedValue(null);

      const isValid = await migrationService.verifyV2Entry('nonexistent');

      expect(isValid).toBe(false);
    });
  });
});
