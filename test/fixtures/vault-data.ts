import { VaultData } from '@/types/database.types';

/**
 * Mock vault data entry for testing
 */
export const mockVaultEntry: VaultData = {
  id: 'vault-123',
  user_id: 'user-123',
  category: 'personal',
  label: 'Test Personal Data',
  description: 'Test description for vault data',
  tags: ['test', 'personal'],
  schema_type: 'custom',
  client_ciphertext: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
  encrypted_dek: 'encrypted-dek-key-value',
  dek_salt: '1234567890abcdef',
  expires_at: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

/**
 * Mock vault entry with expiration
 */
export const mockExpiredVaultEntry: VaultData = {
  ...mockVaultEntry,
  id: 'vault-expired',
  label: 'Expired Vault Entry',
  expires_at: '2023-12-31T23:59:59.000Z',
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
    created_at: '2024-01-02T00:00:00.000Z',
    updated_at: '2024-01-02T00:00:00.000Z',
  },
  {
    ...mockVaultEntry,
    id: 'vault-789',
    category: 'health',
    label: 'Medical Records',
    description: 'Health information',
    tags: ['medical', 'health'],
    created_at: '2024-01-03T00:00:00.000Z',
    updated_at: '2024-01-03T00:00:00.000Z',
  },
  {
    ...mockVaultEntry,
    id: 'vault-other-user',
    user_id: 'user-456',
    label: 'Other User Data',
    created_at: '2024-01-04T00:00:00.000Z',
    updated_at: '2024-01-04T00:00:00.000Z',
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
    user_id: userId,
    label: `Vault Entry ${i + 1}`,
    created_at: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
    updated_at: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
  }));
}
