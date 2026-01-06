import { VaultData } from '@prisma/client';

/**
 * Mock vault data entry for testing
 */
export const mockVaultEntry: VaultData = {
  id: 'vault-123',
  userId: 'user-123',
  category: 'personal',
  dataType: 'json',
  label: 'Test Personal Data',
  description: 'Test description for vault data',
  tags: ['test', 'personal'],
  encryptedData: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
  encryptedKey: 'encrypted-dek-key-value',
  iv: '1234567890abcdef1234567890abcdef',
  schemaType: 'JSON-LD',
  schemaVersion: '1.0',
  expiresAt: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
};

/**
 * Mock vault entry with expiration
 */
export const mockExpiredVaultEntry: VaultData = {
  ...mockVaultEntry,
  id: 'vault-expired',
  label: 'Expired Vault Entry',
  expiresAt: new Date('2023-12-31T23:59:59.000Z'), // Already expired
};

/**
 * Array of mock vault entries for different users and categories
 */
export const mockVaultEntries: VaultData[] = [
  mockVaultEntry,
  {
    ...mockVaultEntry,
    id: 'vault-456',
    category: 'financial',
    label: 'Financial Data',
    description: 'Bank account information',
    tags: ['financial', 'bank'],
    createdAt: new Date('2024-01-02T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  },
  {
    ...mockVaultEntry,
    id: 'vault-789',
    category: 'medical',
    label: 'Medical Records',
    description: 'Health information',
    tags: ['medical', 'health'],
    createdAt: new Date('2024-01-03T00:00:00.000Z'),
    updatedAt: new Date('2024-01-03T00:00:00.000Z'),
  },
  {
    ...mockVaultEntry,
    id: 'vault-other-user',
    userId: 'user-456', // Different user
    label: 'Other User Data',
    createdAt: new Date('2024-01-04T00:00:00.000Z'),
    updatedAt: new Date('2024-01-04T00:00:00.000Z'),
  },
];

/**
 * Factory function to create custom mock vault entries
 */
export function createMockVaultEntry(
  overrides: Partial<VaultData> = {}
): VaultData {
  return {
    ...mockVaultEntry,
    ...overrides,
  };
}

/**
 * Create multiple mock vault entries with sequential IDs
 */
export function createMockVaultEntries(count: number, userId: string = 'user-123'): VaultData[] {
  return Array.from({ length: count }, (_, i) => ({
    ...mockVaultEntry,
    id: `vault-${i + 1}`,
    userId,
    label: `Vault Entry ${i + 1}`,
    createdAt: new Date(`2024-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`),
    updatedAt: new Date(`2024-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`),
  }));
}
