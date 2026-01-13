/**
 * Integration Tests for Vault Service
 *
 * These tests use REAL encryption and REAL database connections
 * (unlike the API route tests which mock everything)
 *
 * Purpose: Validate that the full encrypt → store → retrieve → decrypt flow works correctly
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { vaultService } from '@/lib/services/vault.service';
import { keyManagement } from '@/lib/crypto/key-management';

// Create a separate Prisma instance for integration tests
const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

describe('Vault Service Integration Tests', () => {
  const TEST_USER_ID = 'test-integration-user-' + Date.now();
  const TEST_USER_EMAIL = `integration-test-${Date.now()}@example.com`;
  let createdEntryIds: string[] = [];

  beforeAll(async () => {
    console.log('🔐 Integration tests using ENCRYPTION_KEY:', process.env.ENCRYPTION_KEY?.substring(0, 10) + '...');
    console.log('📊 Integration tests using DATABASE:', process.env.DATABASE_URL?.replace(/:[^:]*@/, ':***@'));

    // Create test user in database to satisfy foreign key constraint
    await prisma.user.create({
      data: {
        id: TEST_USER_ID,
        email: TEST_USER_EMAIL,
      },
    });
    console.log('👤 Created test user:', TEST_USER_ID);
  });

  beforeEach(async () => {
    // Clean up ALL vault entries for test user before each test to ensure isolation
    await prisma.vaultData.deleteMany({
      where: { userId: TEST_USER_ID },
    });
    // Reset created entries list
    createdEntryIds = [];
  });

  afterAll(async () => {
    // Clean up all test entries and test user
    console.log('🧹 Cleaning up test data...');

    // Delete vault entries (will cascade delete related data)
    await prisma.vaultData.deleteMany({
      where: {
        OR: [
          { userId: TEST_USER_ID },
          { id: { in: createdEntryIds } },
        ],
      },
    });

    // Delete test user (will cascade delete any remaining related data)
    await prisma.user.delete({
      where: { id: TEST_USER_ID },
    }).catch(() => {
      // User might not exist if beforeAll failed
      console.log('⚠️  Test user already deleted or never created');
    });

    await prisma.$disconnect();
    console.log('✅ Cleanup complete');
  });

  describe('Create and Retrieve Flow', () => {
    it('should create an encrypted entry and retrieve it decrypted', async () => {
      // Create vault entry
      const payload = {
        label: 'Integration Test Entry',
        category: 'personal' as const,
        dataType: 'json' as const,
        description: 'Test description',
        tags: ['test', 'integration'],
        data: {
          testField: 'test value',
          nested: {
            field: 'nested value',
          },
        },
      };

      const created = await vaultService.createVaultData(TEST_USER_ID, payload);
      createdEntryIds.push(created.id);

      // Verify entry was created with encrypted fields
      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.userId).toBe(TEST_USER_ID);
      expect(created.label).toBe(payload.label);
      expect(created.category).toBe(payload.category);
      expect(created.encryptedData).toBeDefined();
      expect(created.encryptedKey).toBeDefined();
      expect(created.iv).toContain(':'); // Should have format: iv:authTag
      expect(created.keyIv).toContain(':'); // Should have format: iv:authTag
      expect(created.encryptionVersion).toBe('v2');

      // Verify encrypted data is NOT the same as plaintext
      expect(created.encryptedData).not.toContain('test value');
      expect(created.encryptedData).not.toContain('nested value');

      // Retrieve and decrypt entry
      const entries = await vaultService.getUserVaultData(TEST_USER_ID);

      expect(entries).toHaveLength(1);
      const decrypted = entries[0];

      // Verify decrypted data matches original
      expect(decrypted.id).toBe(created.id);
      expect(decrypted.label).toBe(payload.label);
      expect(decrypted.category).toBe(payload.category);
      expect(decrypted.description).toBe(payload.description);
      expect(decrypted.tags).toEqual(payload.tags);
      expect(decrypted.data).toEqual(payload.data);
      expect(decrypted.error).toBeUndefined();
    });

    it('should retrieve a single entry by ID', async () => {
      // Create entry
      const payload = {
        label: 'Single Entry Test',
        category: 'health' as const,
        dataType: 'json' as const,
        data: { bloodPressure: '120/80' },
      };

      const created = await vaultService.createVaultData(TEST_USER_ID, payload);
      createdEntryIds.push(created.id);

      // Retrieve by ID
      const decrypted = await vaultService.getVaultDataById(created.id, TEST_USER_ID);

      expect(decrypted).not.toBeNull();
      expect(decrypted!.id).toBe(created.id);
      expect(decrypted!.data).toEqual(payload.data);
    });

    it('should return null for non-existent entry', async () => {
      const result = await vaultService.getVaultDataById('non-existent-id', TEST_USER_ID);
      expect(result).toBeNull();
    });

    it('should throw error when accessing another user\'s entry', async () => {
      // Create entry for TEST_USER_ID
      const payload = {
        label: 'Private Entry',
        category: 'personal' as const,
        dataType: 'json' as const,
        data: { secret: 'data' },
      };

      const created = await vaultService.createVaultData(TEST_USER_ID, payload);
      createdEntryIds.push(created.id);

      // Try to access with different user ID
      await expect(
        vaultService.getVaultDataById(created.id, 'different-user-id')
      ).rejects.toThrow('Unauthorized access to vault data');
    });
  });

  describe('Update Flow', () => {
    it('should update entry with new encrypted data', async () => {
      // Create initial entry
      const initial = {
        label: 'Original Label',
        category: 'personal' as const,
        dataType: 'json' as const,
        data: { version: 1, content: 'original' },
      };

      const created = await vaultService.createVaultData(TEST_USER_ID, initial);
      createdEntryIds.push(created.id);

      // Update entry
      const updated = await vaultService.updateVaultData(
        created.id,
        TEST_USER_ID,
        {
          label: 'Updated Label',
          category: 'financial',
          data: { version: 2, content: 'updated' },
        }
      );

      // Verify database entry was updated with new encryption
      expect(updated.label).toBe('Updated Label');
      expect(updated.category).toBe('financial');
      expect(updated.encryptionVersion).toBe('v2');

      // Verify encrypted data changed (new DEK was used)
      expect(updated.encryptedData).not.toBe(created.encryptedData);
      expect(updated.encryptedKey).not.toBe(created.encryptedKey);

      // Retrieve and verify decrypted data
      const decrypted = await vaultService.getVaultDataById(updated.id, TEST_USER_ID);
      expect(decrypted!.data).toEqual({ version: 2, content: 'updated' });
    });

    it('should update metadata without re-encrypting data', async () => {
      // Create entry
      const payload = {
        label: 'Test Entry',
        category: 'personal' as const,
        dataType: 'json' as const,
        data: { important: 'data' },
      };

      const created = await vaultService.createVaultData(TEST_USER_ID, payload);
      createdEntryIds.push(created.id);

      // Update only metadata (no data field)
      const updated = await vaultService.updateVaultData(
        created.id,
        TEST_USER_ID,
        {
          label: 'Updated Label Only',
          description: 'New description',
          tags: ['updated', 'tag'],
        }
      );

      // Verify encrypted data did NOT change
      expect(updated.encryptedData).toBe(created.encryptedData);
      expect(updated.encryptedKey).toBe(created.encryptedKey);

      // But metadata did change
      expect(updated.label).toBe('Updated Label Only');
      expect(updated.description).toBe('New description');
      expect(updated.tags).toEqual(['updated', 'tag']);
    });
  });

  describe('Multiple Entries', () => {
    it('should create multiple entries with unique encryption keys', async () => {
      // Create 3 entries
      const entries = await Promise.all([
        vaultService.createVaultData(TEST_USER_ID, {
          label: 'Entry 1',
          category: 'personal' as const,
          dataType: 'json' as const,
          data: { id: 1 },
        }),
        vaultService.createVaultData(TEST_USER_ID, {
          label: 'Entry 2',
          category: 'health' as const,
          dataType: 'json' as const,
          data: { id: 2 },
        }),
        vaultService.createVaultData(TEST_USER_ID, {
          label: 'Entry 3',
          category: 'financial' as const,
          dataType: 'json' as const,
          data: { id: 3 },
        }),
      ]);

      entries.forEach(e => createdEntryIds.push(e.id));

      // Verify each has unique encryption
      expect(entries[0].encryptedKey).not.toBe(entries[1].encryptedKey);
      expect(entries[1].encryptedKey).not.toBe(entries[2].encryptedKey);
      expect(entries[0].encryptedKey).not.toBe(entries[2].encryptedKey);

      // Retrieve all entries
      const decrypted = await vaultService.getUserVaultData(TEST_USER_ID);

      expect(decrypted).toHaveLength(3);

      // Verify all decrypt correctly
      const labels = decrypted.map(e => e.label).sort();
      expect(labels).toEqual(['Entry 1', 'Entry 2', 'Entry 3']);

      const dataIds = decrypted.map(e => e.data?.id).sort();
      expect(dataIds).toEqual([1, 2, 3]);
    });
  });

  describe('Delete Flow', () => {
    it('should delete a vault entry', async () => {
      // Create entry
      const created = await vaultService.createVaultData(TEST_USER_ID, {
        label: 'To Be Deleted',
        category: 'other' as const,
        dataType: 'json' as const,
        data: { temp: true },
      });

      // Delete entry
      await vaultService.deleteVaultData(created.id, TEST_USER_ID);

      // Verify entry no longer exists
      const result = await vaultService.getVaultDataById(created.id, TEST_USER_ID);
      expect(result).toBeNull();
    });

    it('should throw error when deleting another user\'s entry', async () => {
      // Create entry
      const created = await vaultService.createVaultData(TEST_USER_ID, {
        label: 'Protected Entry',
        category: 'personal' as const,
        dataType: 'json' as const,
        data: { protected: true },
      });
      createdEntryIds.push(created.id);

      // Try to delete with different user ID
      await expect(
        vaultService.deleteVaultData(created.id, 'different-user-id')
      ).rejects.toThrow('Unauthorized access to vault data');
    });
  });

  describe('Encryption Key Handling', () => {
    it('should handle decryption gracefully when encryption fails', async () => {
      // Create entry normally
      const created = await vaultService.createVaultData(TEST_USER_ID, {
        label: 'Test Entry',
        category: 'personal' as const,
        dataType: 'json' as const,
        data: { test: 'data' },
      });
      createdEntryIds.push(created.id);

      // Corrupt the encrypted data in the database to simulate decryption failure
      await prisma.vaultData.update({
        where: { id: created.id },
        data: { encryptedData: 'corrupted-data' },
      });

      // Try to retrieve - should return entry with error flag instead of throwing
      const entries = await vaultService.getUserVaultData(TEST_USER_ID);

      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe(created.id);
      expect(entries[0].label).toBe('Test Entry'); // Metadata still available
      expect(entries[0].data).toBeNull(); // Data is null due to decryption failure
      expect(entries[0].error).toBe('Decryption failed');
    });
  });

  describe('Envelope Encryption Validation', () => {
    it('should use v2 envelope encryption for all new entries', async () => {
      const created = await vaultService.createVaultData(TEST_USER_ID, {
        label: 'v2 Test',
        category: 'personal' as const,
        dataType: 'json' as const,
        data: { version: 'v2' },
      });
      createdEntryIds.push(created.id);

      // Verify v2 encryption markers
      expect(created.encryptionVersion).toBe('v2');
      expect(created.encryptedKey).toBeDefined(); // DEK encrypted by KEK
      expect(created.keyIv).toBeDefined(); // IV for DEK encryption
      expect(created.keyIv).toContain(':'); // Format: iv:authTag
    });

    it('should verify each entry has unique DEK', async () => {
      // Create 2 entries with identical data
      const payload = {
        label: 'Identical Data',
        category: 'personal' as const,
        dataType: 'json' as const,
        data: { same: 'data' },
      };

      const entry1 = await vaultService.createVaultData(TEST_USER_ID, payload);
      const entry2 = await vaultService.createVaultData(TEST_USER_ID, payload);

      createdEntryIds.push(entry1.id, entry2.id);

      // Even with identical input, DEKs should be different
      expect(entry1.encryptedKey).not.toBe(entry2.encryptedKey);

      // And thus encrypted data should be different
      expect(entry1.encryptedData).not.toBe(entry2.encryptedData);

      // But both should decrypt to the same value
      const entries = await vaultService.getUserVaultData(TEST_USER_ID);
      const data1 = entries.find(e => e.id === entry1.id)?.data;
      const data2 = entries.find(e => e.id === entry2.id)?.data;
      expect(data1).toEqual(data2);
    });
  });

  describe('Statistics', () => {
    it('should return accurate user statistics', async () => {
      // Create entries across different categories
      const entries = [
        { category: 'personal' as const, count: 2 },
        { category: 'health' as const, count: 3 },
        { category: 'financial' as const, count: 1 },
      ];

      for (const { category, count } of entries) {
        for (let i = 0; i < count; i++) {
          const created = await vaultService.createVaultData(TEST_USER_ID, {
            label: `${category} entry ${i + 1}`,
            category,
            dataType: 'json' as const,
            data: { index: i },
          });
          createdEntryIds.push(created.id);
        }
      }

      // Get stats
      const stats = await vaultService.getUserStats(TEST_USER_ID);

      expect(stats.totalEntries).toBe(6);
      expect(stats.byCategory).toEqual({
        personal: 2,
        health: 3,
        financial: 1,
      });
    });
  });
});
