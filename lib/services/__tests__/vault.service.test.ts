import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock } from '@/test/mocks/prisma';
import {
  mockVaultEntry,
  mockVaultEntries,
  createMockVaultEntry,
} from '@/test/fixtures/vault-data';
import * as encryptionModule from '@/lib/crypto/encryption';

// Mock dependencies
vi.mock('@/lib/db/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('@/lib/services/error-logger', () => ({
  logCryptoError: vi.fn(),
}));

// Import after mocks
import { VaultService } from '../vault.service';
import { vaultRepository } from '@/lib/repositories/vault.repository';

describe('VaultService', () => {
  let service: VaultService;
  const userId = 'user-123';
  const masterKey = Buffer.from('test-master-key-32-bytes-long!', 'utf-8');

  beforeEach(() => {
    service = new VaultService();
    vi.clearAllMocks();

    // Mock getMasterKey to return test key
    vi.spyOn(encryptionModule, 'getMasterKey').mockReturnValue(masterKey);
  });

  describe('getUserVaultData', () => {
    it('should decrypt all entries for a user', async () => {
      const testData = { sensitive: 'data', value: 123 };
      const encryptedEntry = createMockVaultEntry({
        userId,
        encryptedData: 'encrypted-data',
        iv: 'iv-hex:authtag-hex',
      });

      prismaMock.vaultData.findMany.mockResolvedValue([encryptedEntry]);

      vi.spyOn(encryptionModule, 'decrypt').mockReturnValue(JSON.stringify(testData));

      const result = await service.getUserVaultData(userId);

      expect(result).toHaveLength(1);
      expect(result[0].data).toEqual(testData);
      expect(result[0].id).toBe(encryptedEntry.id);
      expect(result[0].label).toBe(encryptedEntry.label);
      expect(encryptionModule.decrypt).toHaveBeenCalledWith(
        encryptedEntry.encryptedData,
        masterKey,
        'iv-hex',
        'authtag-hex'
      );
    });

    it('should handle decryption failures gracefully', async () => {
      const encryptedEntry = createMockVaultEntry({
        userId,
        encryptedData: 'corrupted-data',
        iv: 'iv:tag',
      });

      prismaMock.vaultData.findMany.mockResolvedValue([encryptedEntry]);
      vi.spyOn(encryptionModule, 'decrypt').mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const result = await service.getUserVaultData(userId);

      expect(result).toHaveLength(1);
      expect(result[0].data).toBeNull();
      expect(result[0].error).toBe('Decryption failed');
      expect(result[0].id).toBe(encryptedEntry.id);
      expect(result[0].label).toBe(encryptedEntry.label);
    });

    it('should return empty array when user has no entries', async () => {
      prismaMock.vaultData.findMany.mockResolvedValue([]);

      const result = await service.getUserVaultData(userId);

      expect(result).toEqual([]);
    });

    it('should decrypt multiple entries correctly', async () => {
      const entries = [
        createMockVaultEntry({ id: 'vault-1', userId, iv: 'iv1:tag1' }),
        createMockVaultEntry({ id: 'vault-2', userId, iv: 'iv2:tag2' }),
        createMockVaultEntry({ id: 'vault-3', userId, iv: 'iv3:tag3' }),
      ];

      prismaMock.vaultData.findMany.mockResolvedValue(entries);
      vi.spyOn(encryptionModule, 'decrypt').mockReturnValue(JSON.stringify({ data: 'test' }));

      const result = await service.getUserVaultData(userId);

      expect(result).toHaveLength(3);
      expect(result.every((r) => r.data !== null)).toBe(true);
      expect(encryptionModule.decrypt).toHaveBeenCalledTimes(3);
    });

    it('should handle mix of successful and failed decryptions', async () => {
      const entries = [
        createMockVaultEntry({ id: 'vault-1', userId, iv: 'iv1:tag1' }),
        createMockVaultEntry({ id: 'vault-2', userId, iv: 'iv2:tag2' }),
      ];

      prismaMock.vaultData.findMany.mockResolvedValue(entries);

      vi.spyOn(encryptionModule, 'decrypt')
        .mockReturnValueOnce(JSON.stringify({ data: 'success' }))
        .mockImplementationOnce(() => {
          throw new Error('Decryption failed');
        });

      const result = await service.getUserVaultData(userId);

      expect(result).toHaveLength(2);
      expect(result[0].data).toEqual({ data: 'success' });
      expect(result[1].data).toBeNull();
      expect(result[1].error).toBe('Decryption failed');
    });
  });

  describe('getVaultDataById', () => {
    it('should return decrypted entry when found and authorized', async () => {
      const testData = { personal: 'information' };
      const entry = createMockVaultEntry({
        id: 'vault-123',
        userId,
        iv: 'iv:tag',
      });

      prismaMock.vaultData.findUnique.mockResolvedValue(entry);
      vi.spyOn(encryptionModule, 'decrypt').mockReturnValue(JSON.stringify(testData));

      const result = await service.getVaultDataById('vault-123', userId);

      expect(result).not.toBeNull();
      expect(result?.data).toEqual(testData);
      expect(result?.id).toBe('vault-123');
    });

    it('should return null when entry does not exist', async () => {
      prismaMock.vaultData.findUnique.mockResolvedValue(null);

      const result = await service.getVaultDataById('nonexistent', userId);

      expect(result).toBeNull();
    });

    it('should throw error on unauthorized access', async () => {
      const entry = createMockVaultEntry({
        id: 'vault-123',
        userId: 'other-user',
      });

      prismaMock.vaultData.findUnique.mockResolvedValue(entry);

      await expect(
        service.getVaultDataById('vault-123', userId)
      ).rejects.toThrow('Unauthorized access to vault data');
    });

    it('should handle decryption failure gracefully', async () => {
      const entry = createMockVaultEntry({
        id: 'vault-123',
        userId,
        iv: 'iv:tag',
      });

      prismaMock.vaultData.findUnique.mockResolvedValue(entry);
      vi.spyOn(encryptionModule, 'decrypt').mockImplementation(() => {
        throw new Error('Decryption error');
      });

      const result = await service.getVaultDataById('vault-123', userId);

      expect(result).not.toBeNull();
      expect(result?.data).toBeNull();
      expect(result?.error).toBe('Decryption failed');
    });

    it('should verify ownership before attempting decryption', async () => {
      const entry = createMockVaultEntry({
        userId: 'different-user',
      });

      prismaMock.vaultData.findUnique.mockResolvedValue(entry);

      await expect(
        service.getVaultDataById('vault-123', userId)
      ).rejects.toThrow('Unauthorized access to vault data');

      expect(encryptionModule.decrypt).not.toHaveBeenCalled();
    });
  });

  describe('createVaultData', () => {
    it('should encrypt and store new vault entry', async () => {
      const payload = {
        category: 'personal',
        dataType: 'json',
        label: 'My Data',
        description: 'Test description',
        tags: ['test', 'personal'],
        data: { sensitive: 'information', value: 42 },
      };

      const encrypted = {
        encrypted: 'encrypted-data-hex',
        iv: 'iv-hex',
        authTag: 'auth-tag-hex',
      };

      vi.spyOn(encryptionModule, 'encrypt').mockReturnValue(encrypted);

      const createdEntry = createMockVaultEntry({
        userId,
        ...payload,
        encryptedData: encrypted.encrypted,
        iv: `${encrypted.iv}:${encrypted.authTag}`,
      });

      prismaMock.vaultData.create.mockResolvedValue(createdEntry);

      const result = await service.createVaultData(userId, payload);

      expect(encryptionModule.encrypt).toHaveBeenCalledWith(
        JSON.stringify(payload.data),
        masterKey
      );

      expect(prismaMock.vaultData.create).toHaveBeenCalledWith({
        data: {
          userId,
          category: payload.category,
          dataType: payload.dataType,
          label: payload.label,
          description: payload.description,
          tags: payload.tags,
          encryptedData: encrypted.encrypted,
          encryptedKey: 'master-key-1',
          iv: `${encrypted.iv}:${encrypted.authTag}`,
          schemaType: undefined,
          schemaVersion: undefined,
          expiresAt: undefined,
        },
      });

      expect(result).toEqual(createdEntry);
    });

    it('should handle optional fields correctly', async () => {
      const payload = {
        category: 'financial',
        dataType: 'json',
        label: 'Bank Info',
        data: { account: '123456' },
        schemaType: 'JSON-LD',
        schemaVersion: '1.0',
        expiresAt: new Date('2025-12-31'),
      };

      vi.spyOn(encryptionModule, 'encrypt').mockReturnValue({
        encrypted: 'enc',
        iv: 'iv',
        authTag: 'tag',
      });

      const createdEntry = createMockVaultEntry();
      prismaMock.vaultData.create.mockResolvedValue(createdEntry);

      await service.createVaultData(userId, payload);

      expect(prismaMock.vaultData.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          schemaType: 'JSON-LD',
          schemaVersion: '1.0',
          expiresAt: payload.expiresAt,
        }),
      });
    });

    it('should default tags to empty array if not provided', async () => {
      const payload = {
        category: 'personal',
        dataType: 'json',
        label: 'No Tags',
        data: { test: 'data' },
      };

      vi.spyOn(encryptionModule, 'encrypt').mockReturnValue({
        encrypted: 'enc',
        iv: 'iv',
        authTag: 'tag',
      });

      const createdEntry = createMockVaultEntry();
      prismaMock.vaultData.create.mockResolvedValue(createdEntry);

      await service.createVaultData(userId, payload);

      expect(prismaMock.vaultData.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tags: [],
        }),
      });
    });

    it('should serialize data to JSON string before encryption', async () => {
      const complexData = {
        user: { name: 'John', age: 30 },
        items: [1, 2, 3],
        nested: { deep: { value: true } },
      };

      const payload = {
        category: 'personal',
        dataType: 'json',
        label: 'Complex Data',
        data: complexData,
      };

      vi.spyOn(encryptionModule, 'encrypt').mockReturnValue({
        encrypted: 'enc',
        iv: 'iv',
        authTag: 'tag',
      });

      const createdEntry = createMockVaultEntry();
      prismaMock.vaultData.create.mockResolvedValue(createdEntry);

      await service.createVaultData(userId, payload);

      expect(encryptionModule.encrypt).toHaveBeenCalledWith(
        JSON.stringify(complexData),
        masterKey
      );
    });
  });

  describe('updateVaultData', () => {
    const entryId = 'vault-123';

    it('should update vault entry when authorized', async () => {
      const payload = {
        label: 'Updated Label',
        category: 'updated-category',
        description: 'Updated description',
        tags: ['updated'],
      };

      prismaMock.vaultData.findUnique.mockResolvedValue({ userId } as any);

      const updatedEntry = createMockVaultEntry({
        id: entryId,
        ...payload,
      });
      prismaMock.vaultData.update.mockResolvedValue(updatedEntry);

      const result = await service.updateVaultData(entryId, userId, payload);

      expect(prismaMock.vaultData.update).toHaveBeenCalledWith({
        where: { id: entryId },
        data: expect.objectContaining({
          label: payload.label,
          category: payload.category,
          description: payload.description,
          tags: payload.tags,
        }),
      });

      expect(result).toEqual(updatedEntry);
    });

    it('should re-encrypt data when data is provided in update', async () => {
      const payload = {
        label: 'Updated',
        data: { new: 'data', updated: true },
      };

      prismaMock.vaultData.findUnique.mockResolvedValue({ userId } as any);

      const encrypted = {
        encrypted: 'new-encrypted-data',
        iv: 'new-iv',
        authTag: 'new-tag',
      };
      vi.spyOn(encryptionModule, 'encrypt').mockReturnValue(encrypted);

      const updatedEntry = createMockVaultEntry();
      prismaMock.vaultData.update.mockResolvedValue(updatedEntry);

      await service.updateVaultData(entryId, userId, payload);

      expect(encryptionModule.encrypt).toHaveBeenCalledWith(
        JSON.stringify(payload.data),
        masterKey
      );

      expect(prismaMock.vaultData.update).toHaveBeenCalledWith({
        where: { id: entryId },
        data: expect.objectContaining({
          encryptedData: encrypted.encrypted,
          iv: `${encrypted.iv}:${encrypted.authTag}`,
        }),
      });
    });

    it('should throw error on unauthorized access', async () => {
      const payload = { label: 'Updated' };

      prismaMock.vaultData.findUnique.mockResolvedValue({ userId: 'other-user' } as any);

      await expect(
        service.updateVaultData(entryId, userId, payload)
      ).rejects.toThrow('Unauthorized access to vault data');

      expect(prismaMock.vaultData.update).not.toHaveBeenCalled();
    });

    it('should update without re-encrypting when data is not provided', async () => {
      const payload = {
        label: 'New Label',
        description: 'New description',
      };

      prismaMock.vaultData.findUnique.mockResolvedValue({ userId } as any);

      const updatedEntry = createMockVaultEntry();
      prismaMock.vaultData.update.mockResolvedValue(updatedEntry);

      await service.updateVaultData(entryId, userId, payload);

      expect(encryptionModule.encrypt).not.toHaveBeenCalled();
      expect(prismaMock.vaultData.update).toHaveBeenCalledWith({
        where: { id: entryId },
        data: expect.not.objectContaining({
          encryptedData: expect.anything(),
        }),
      });
    });

    it('should update expiration date', async () => {
      const newExpiration = new Date('2025-12-31');
      const payload = {
        expiresAt: newExpiration,
      };

      prismaMock.vaultData.findUnique.mockResolvedValue({ userId } as any);

      const updatedEntry = createMockVaultEntry();
      prismaMock.vaultData.update.mockResolvedValue(updatedEntry);

      await service.updateVaultData(entryId, userId, payload);

      expect(prismaMock.vaultData.update).toHaveBeenCalledWith({
        where: { id: entryId },
        data: expect.objectContaining({
          expiresAt: newExpiration,
        }),
      });
    });

    it('should verify ownership before attempting update', async () => {
      prismaMock.vaultData.findUnique.mockResolvedValue(null);

      await expect(
        service.updateVaultData(entryId, userId, { label: 'Test' })
      ).rejects.toThrow('Unauthorized access to vault data');
    });
  });

  describe('deleteVaultData', () => {
    const entryId = 'vault-123';

    it('should delete entry when authorized', async () => {
      prismaMock.vaultData.findUnique.mockResolvedValue({ userId } as any);
      prismaMock.vaultData.delete.mockResolvedValue(mockVaultEntry);

      await service.deleteVaultData(entryId, userId);

      expect(prismaMock.vaultData.delete).toHaveBeenCalledWith({
        where: { id: entryId },
      });
    });

    it('should throw error on unauthorized access', async () => {
      prismaMock.vaultData.findUnique.mockResolvedValue({ userId: 'other-user' } as any);

      await expect(
        service.deleteVaultData(entryId, userId)
      ).rejects.toThrow('Unauthorized access to vault data');

      expect(prismaMock.vaultData.delete).not.toHaveBeenCalled();
    });

    it('should throw error when entry does not exist', async () => {
      prismaMock.vaultData.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteVaultData(entryId, userId)
      ).rejects.toThrow('Unauthorized access to vault data');
    });

    it('should verify ownership before attempting deletion', async () => {
      prismaMock.vaultData.findUnique.mockResolvedValue({ userId: 'wrong-user' } as any);

      await expect(
        service.deleteVaultData(entryId, userId)
      ).rejects.toThrow('Unauthorized access to vault data');

      expect(prismaMock.vaultData.delete).not.toHaveBeenCalled();
    });
  });

  describe('getUserStats', () => {
    it('should calculate correct statistics', async () => {
      const entries = [
        createMockVaultEntry({ category: 'personal' }),
        createMockVaultEntry({ category: 'personal' }),
        createMockVaultEntry({ category: 'financial' }),
        createMockVaultEntry({ category: 'medical' }),
        createMockVaultEntry({ category: 'financial' }),
      ];

      prismaMock.vaultData.findMany.mockResolvedValue(entries);

      const stats = await service.getUserStats(userId);

      expect(stats.totalEntries).toBe(5);
      expect(stats.byCategory).toEqual({
        personal: 2,
        financial: 2,
        medical: 1,
      });
    });

    it('should return zero stats for user with no entries', async () => {
      prismaMock.vaultData.findMany.mockResolvedValue([]);

      const stats = await service.getUserStats(userId);

      expect(stats.totalEntries).toBe(0);
      expect(stats.byCategory).toEqual({});
    });

    it('should handle single category correctly', async () => {
      const entries = [
        createMockVaultEntry({ category: 'personal' }),
        createMockVaultEntry({ category: 'personal' }),
        createMockVaultEntry({ category: 'personal' }),
      ];

      prismaMock.vaultData.findMany.mockResolvedValue(entries);

      const stats = await service.getUserStats(userId);

      expect(stats.totalEntries).toBe(3);
      expect(stats.byCategory).toEqual({
        personal: 3,
      });
    });

    it('should count all unique categories', async () => {
      const entries = [
        createMockVaultEntry({ category: 'cat1' }),
        createMockVaultEntry({ category: 'cat2' }),
        createMockVaultEntry({ category: 'cat3' }),
        createMockVaultEntry({ category: 'cat4' }),
      ];

      prismaMock.vaultData.findMany.mockResolvedValue(entries);

      const stats = await service.getUserStats(userId);

      expect(stats.totalEntries).toBe(4);
      expect(Object.keys(stats.byCategory)).toHaveLength(4);
    });
  });

  describe('integration scenarios', () => {
    it('should support complete CRUD workflow with encryption', async () => {
      const testData = { secret: 'value' };

      // Create
      vi.spyOn(encryptionModule, 'encrypt').mockReturnValue({
        encrypted: 'enc',
        iv: 'iv',
        authTag: 'tag',
      });

      const createdEntry = createMockVaultEntry({
        id: 'new-vault',
        userId,
        encryptedData: 'enc',
        iv: 'iv:tag',
      });
      prismaMock.vaultData.create.mockResolvedValue(createdEntry);

      const created = await service.createVaultData(userId, {
        category: 'test',
        dataType: 'json',
        label: 'Test',
        data: testData,
      });

      expect(created.id).toBe('new-vault');

      // Read
      prismaMock.vaultData.findUnique.mockResolvedValue(createdEntry);
      vi.spyOn(encryptionModule, 'decrypt').mockReturnValue(JSON.stringify(testData));

      const retrieved = await service.getVaultDataById('new-vault', userId);
      expect(retrieved?.data).toEqual(testData);

      // Update
      prismaMock.vaultData.findUnique.mockResolvedValue({ userId } as any);
      prismaMock.vaultData.update.mockResolvedValue(createdEntry);

      await service.updateVaultData('new-vault', userId, { label: 'Updated' });

      // Delete
      await service.deleteVaultData('new-vault', userId);

      expect(prismaMock.vaultData.delete).toHaveBeenCalled();
    });

    it('should enforce authorization across all operations', async () => {
      const unauthorizedUser = 'unauthorized-user';

      // Get by ID - unauthorized
      prismaMock.vaultData.findUnique.mockResolvedValue({
        userId: 'owner',
      } as any);

      await expect(
        service.getVaultDataById('vault-123', unauthorizedUser)
      ).rejects.toThrow('Unauthorized');

      // Update - unauthorized
      await expect(
        service.updateVaultData('vault-123', unauthorizedUser, { label: 'Test' })
      ).rejects.toThrow('Unauthorized');

      // Delete - unauthorized
      await expect(
        service.deleteVaultData('vault-123', unauthorizedUser)
      ).rejects.toThrow('Unauthorized');
    });
  });
});
