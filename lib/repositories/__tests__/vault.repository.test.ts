import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock } from '@/test/mocks/prisma';
import {
  mockVaultEntry,
  mockVaultEntries,
  mockExpiredVaultEntry,
  createMockVaultEntry,
  createMockVaultEntries,
} from '@/test/fixtures/vault-data';

// Mock the Prisma client - must be before imports that use it
vi.mock('@/lib/db/prisma', () => ({
  prisma: prismaMock,
}));

import { VaultRepository } from '../vault.repository';

describe('VaultRepository', () => {
  let repository: VaultRepository;

  beforeEach(() => {
    repository = new VaultRepository();
    vi.clearAllMocks();
  });

  describe('findByUserId', () => {
    it('should return all vault entries for a user', async () => {
      const userId = 'user-123';
      const userEntries = mockVaultEntries.filter((e) => e.userId === userId);

      prismaMock.vaultData.findMany.mockResolvedValue(userEntries);

      const result = await repository.findByUserId(userId);

      expect(result).toEqual(userEntries);
      expect(prismaMock.vaultData.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return empty array when user has no vault entries', async () => {
      const userId = 'user-no-data';

      prismaMock.vaultData.findMany.mockResolvedValue([]);

      const result = await repository.findByUserId(userId);

      expect(result).toEqual([]);
      expect(prismaMock.vaultData.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should order results by createdAt descending', async () => {
      const userId = 'user-123';
      const entries = createMockVaultEntries(5, userId);

      prismaMock.vaultData.findMany.mockResolvedValue(entries);

      await repository.findByUserId(userId);

      expect(prismaMock.vaultData.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should handle database errors', async () => {
      const userId = 'user-123';

      prismaMock.vaultData.findMany.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(repository.findByUserId(userId)).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('findById', () => {
    it('should return a single vault entry by ID', async () => {
      const id = 'vault-123';

      prismaMock.vaultData.findUnique.mockResolvedValue(mockVaultEntry);

      const result = await repository.findById(id);

      expect(result).toEqual(mockVaultEntry);
      expect(prismaMock.vaultData.findUnique).toHaveBeenCalledWith({
        where: { id },
      });
    });

    it('should return null when entry does not exist', async () => {
      const id = 'nonexistent-id';

      prismaMock.vaultData.findUnique.mockResolvedValue(null);

      const result = await repository.findById(id);

      expect(result).toBeNull();
      expect(prismaMock.vaultData.findUnique).toHaveBeenCalledWith({
        where: { id },
      });
    });

    it('should handle database errors', async () => {
      const id = 'vault-123';

      prismaMock.vaultData.findUnique.mockRejectedValue(
        new Error('Database error')
      );

      await expect(repository.findById(id)).rejects.toThrow('Database error');
    });
  });

  describe('findByCategory', () => {
    it('should filter vault entries by category correctly', async () => {
      const userId = 'user-123';
      const category = 'financial';
      const financialEntries = mockVaultEntries.filter(
        (e) => e.userId === userId && e.category === category
      );

      prismaMock.vaultData.findMany.mockResolvedValue(financialEntries);

      const result = await repository.findByCategory(userId, category);

      expect(result).toEqual(financialEntries);
      expect(prismaMock.vaultData.findMany).toHaveBeenCalledWith({
        where: { userId, category },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return empty array when no entries match category', async () => {
      const userId = 'user-123';
      const category = 'nonexistent-category';

      prismaMock.vaultData.findMany.mockResolvedValue([]);

      const result = await repository.findByCategory(userId, category);

      expect(result).toEqual([]);
    });

    it('should order results by createdAt descending', async () => {
      const userId = 'user-123';
      const category = 'personal';

      prismaMock.vaultData.findMany.mockResolvedValue([mockVaultEntry]);

      await repository.findByCategory(userId, category);

      expect(prismaMock.vaultData.findMany).toHaveBeenCalledWith({
        where: { userId, category },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('create', () => {
    it('should insert a new vault entry', async () => {
      const newEntry = {
        userId: 'user-123',
        category: 'personal',
        dataType: 'json',
        label: 'New Entry',
        description: 'Test description',
        tags: ['test'],
        encryptedData: 'encrypted-data',
        encryptedKey: 'encrypted-key',
        iv: 'initialization-vector',
        schemaType: 'JSON-LD',
        schemaVersion: '1.0',
        expiresAt: new Date('2025-01-01'),
      };

      const createdEntry = createMockVaultEntry({
        ...newEntry,
        id: 'vault-new',
      });

      prismaMock.vaultData.create.mockResolvedValue(createdEntry);

      const result = await repository.create(newEntry);

      expect(result).toEqual(createdEntry);
      expect(prismaMock.vaultData.create).toHaveBeenCalledWith({
        data: newEntry,
      });
    });

    it('should create entry without optional fields', async () => {
      const minimalEntry = {
        userId: 'user-123',
        category: 'personal',
        dataType: 'json',
        label: 'Minimal Entry',
        tags: [],
        encryptedData: 'encrypted-data',
        encryptedKey: 'encrypted-key',
        iv: 'initialization-vector',
      };

      const createdEntry = createMockVaultEntry({
        ...minimalEntry,
        id: 'vault-minimal',
        description: null,
        schemaType: null,
        schemaVersion: null,
        expiresAt: null,
      });

      prismaMock.vaultData.create.mockResolvedValue(createdEntry);

      const result = await repository.create(minimalEntry);

      expect(result).toBeDefined();
      expect(result.description).toBeNull();
      expect(result.schemaType).toBeNull();
    });

    it('should handle database errors during creation', async () => {
      const newEntry = {
        userId: 'user-123',
        category: 'personal',
        dataType: 'json',
        label: 'New Entry',
        tags: [],
        encryptedData: 'encrypted-data',
        encryptedKey: 'encrypted-key',
        iv: 'initialization-vector',
      };

      prismaMock.vaultData.create.mockRejectedValue(
        new Error('Unique constraint violation')
      );

      await expect(repository.create(newEntry)).rejects.toThrow(
        'Unique constraint violation'
      );
    });
  });

  describe('update', () => {
    it('should modify an existing vault entry', async () => {
      const id = 'vault-123';
      const updates = {
        label: 'Updated Label',
        description: 'Updated description',
        tags: ['updated', 'test'],
      };

      const updatedEntry = createMockVaultEntry({
        ...mockVaultEntry,
        ...updates,
        updatedAt: new Date(),
      });

      prismaMock.vaultData.update.mockResolvedValue(updatedEntry);

      const result = await repository.update(id, updates);

      expect(result.label).toBe('Updated Label');
      expect(result.description).toBe('Updated description');
      expect(result.tags).toEqual(['updated', 'test']);
      expect(prismaMock.vaultData.update).toHaveBeenCalledWith({
        where: { id },
        data: updates,
      });
    });

    it('should update encrypted data and IV', async () => {
      const id = 'vault-123';
      const updates = {
        encryptedData: 'new-encrypted-data',
        iv: 'new-initialization-vector',
      };

      const updatedEntry = createMockVaultEntry({
        ...mockVaultEntry,
        ...updates,
      });

      prismaMock.vaultData.update.mockResolvedValue(updatedEntry);

      const result = await repository.update(id, updates);

      expect(result.encryptedData).toBe('new-encrypted-data');
      expect(result.iv).toBe('new-initialization-vector');
    });

    it('should update expiration date', async () => {
      const id = 'vault-123';
      const newExpiration = new Date('2025-12-31');
      const updates = {
        expiresAt: newExpiration,
      };

      const updatedEntry = createMockVaultEntry({
        ...mockVaultEntry,
        expiresAt: newExpiration,
      });

      prismaMock.vaultData.update.mockResolvedValue(updatedEntry);

      const result = await repository.update(id, updates);

      expect(result.expiresAt).toEqual(newExpiration);
    });

    it('should handle database errors during update', async () => {
      const id = 'nonexistent-id';
      const updates = { label: 'Updated Label' };

      prismaMock.vaultData.update.mockRejectedValue(
        new Error('Record not found')
      );

      await expect(repository.update(id, updates)).rejects.toThrow(
        'Record not found'
      );
    });
  });

  describe('delete', () => {
    it('should remove an entry', async () => {
      const id = 'vault-123';

      prismaMock.vaultData.delete.mockResolvedValue(mockVaultEntry);

      const result = await repository.delete(id);

      expect(result).toEqual(mockVaultEntry);
      expect(prismaMock.vaultData.delete).toHaveBeenCalledWith({
        where: { id },
      });
    });

    it('should handle deletion of non-existent entry', async () => {
      const id = 'nonexistent-id';

      prismaMock.vaultData.delete.mockRejectedValue(
        new Error('Record not found')
      );

      await expect(repository.delete(id)).rejects.toThrow('Record not found');
    });

    it('should handle database errors during deletion', async () => {
      const id = 'vault-123';

      prismaMock.vaultData.delete.mockRejectedValue(
        new Error('Database error')
      );

      await expect(repository.delete(id)).rejects.toThrow('Database error');
    });
  });

  describe('belongsToUser', () => {
    it('should validate ownership when entry belongs to user', async () => {
      const id = 'vault-123';
      const userId = 'user-123';

      prismaMock.vaultData.findUnique.mockResolvedValue({
        userId,
      } as any);

      const result = await repository.belongsToUser(id, userId);

      expect(result).toBe(true);
      expect(prismaMock.vaultData.findUnique).toHaveBeenCalledWith({
        where: { id },
        select: { userId: true },
      });
    });

    it('should return false when entry belongs to different user', async () => {
      const id = 'vault-123';
      const userId = 'user-456';

      prismaMock.vaultData.findUnique.mockResolvedValue({
        userId: 'user-123',
      } as any);

      const result = await repository.belongsToUser(id, userId);

      expect(result).toBe(false);
    });

    it('should return false when entry does not exist', async () => {
      const id = 'nonexistent-id';
      const userId = 'user-123';

      prismaMock.vaultData.findUnique.mockResolvedValue(null);

      const result = await repository.belongsToUser(id, userId);

      expect(result).toBe(false);
    });

    it('should only select userId field for efficiency', async () => {
      const id = 'vault-123';
      const userId = 'user-123';

      prismaMock.vaultData.findUnique.mockResolvedValue({
        userId,
      } as any);

      await repository.belongsToUser(id, userId);

      expect(prismaMock.vaultData.findUnique).toHaveBeenCalledWith({
        where: { id },
        select: { userId: true },
      });
    });
  });

  describe('countByUserId', () => {
    it('should return correct count of entries for a user', async () => {
      const userId = 'user-123';
      const expectedCount = 5;

      prismaMock.vaultData.count.mockResolvedValue(expectedCount);

      const result = await repository.countByUserId(userId);

      expect(result).toBe(expectedCount);
      expect(prismaMock.vaultData.count).toHaveBeenCalledWith({
        where: { userId },
      });
    });

    it('should return 0 when user has no entries', async () => {
      const userId = 'user-no-data';

      prismaMock.vaultData.count.mockResolvedValue(0);

      const result = await repository.countByUserId(userId);

      expect(result).toBe(0);
    });

    it('should handle database errors', async () => {
      const userId = 'user-123';

      prismaMock.vaultData.count.mockRejectedValue(
        new Error('Database error')
      );

      await expect(repository.countByUserId(userId)).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('findExpired', () => {
    it('should return only expired entries', async () => {
      const expiredEntries = [mockExpiredVaultEntry];

      prismaMock.vaultData.findMany.mockResolvedValue(expiredEntries);

      const result = await repository.findExpired();

      expect(result).toEqual(expiredEntries);
      expect(prismaMock.vaultData.findMany).toHaveBeenCalledWith({
        where: {
          expiresAt: {
            lte: expect.any(Date),
          },
        },
      });
    });

    it('should return empty array when no entries are expired', async () => {
      prismaMock.vaultData.findMany.mockResolvedValue([]);

      const result = await repository.findExpired();

      expect(result).toEqual([]);
    });

    it('should use lte (less than or equal) for date comparison', async () => {
      prismaMock.vaultData.findMany.mockResolvedValue([]);

      await repository.findExpired();

      const call = prismaMock.vaultData.findMany.mock.calls[0][0];
      expect(call?.where?.expiresAt).toHaveProperty('lte');
    });

    it('should handle database errors', async () => {
      prismaMock.vaultData.findMany.mockRejectedValue(
        new Error('Database error')
      );

      await expect(repository.findExpired()).rejects.toThrow('Database error');
    });
  });

  describe('integration scenarios', () => {
    it('should support complete CRUD workflow', async () => {
      const userId = 'user-123';

      // Create
      const newEntry = {
        userId,
        category: 'personal',
        dataType: 'json',
        label: 'Test Entry',
        tags: ['test'],
        encryptedData: 'encrypted-data',
        encryptedKey: 'encrypted-key',
        iv: 'iv',
      };

      const createdEntry = createMockVaultEntry({
        ...newEntry,
        id: 'vault-new',
      });

      prismaMock.vaultData.create.mockResolvedValue(createdEntry);
      const created = await repository.create(newEntry);
      expect(created.id).toBe('vault-new');

      // Read
      prismaMock.vaultData.findUnique.mockResolvedValue(createdEntry);
      const found = await repository.findById('vault-new');
      expect(found).toEqual(createdEntry);

      // Update
      const updatedEntry = { ...createdEntry, label: 'Updated Label' };
      prismaMock.vaultData.update.mockResolvedValue(updatedEntry);
      const updated = await repository.update('vault-new', {
        label: 'Updated Label',
      });
      expect(updated.label).toBe('Updated Label');

      // Delete
      prismaMock.vaultData.delete.mockResolvedValue(updatedEntry);
      const deleted = await repository.delete('vault-new');
      expect(deleted).toBeDefined();

      // Verify calls
      expect(prismaMock.vaultData.create).toHaveBeenCalled();
      expect(prismaMock.vaultData.findUnique).toHaveBeenCalled();
      expect(prismaMock.vaultData.update).toHaveBeenCalled();
      expect(prismaMock.vaultData.delete).toHaveBeenCalled();
    });

    it('should handle multi-user data isolation', async () => {
      const user1 = 'user-123';
      const user2 = 'user-456';

      const user1Entries = createMockVaultEntries(3, user1);
      const user2Entries = createMockVaultEntries(2, user2);

      // User 1 can only see their entries
      prismaMock.vaultData.findMany.mockResolvedValue(user1Entries);
      const user1Data = await repository.findByUserId(user1);
      expect(user1Data).toHaveLength(3);
      expect(user1Data.every((e) => e.userId === user1)).toBe(true);

      // User 2 can only see their entries
      prismaMock.vaultData.findMany.mockResolvedValue(user2Entries);
      const user2Data = await repository.findByUserId(user2);
      expect(user2Data).toHaveLength(2);
      expect(user2Data.every((e) => e.userId === user2)).toBe(true);
    });
  });
});
