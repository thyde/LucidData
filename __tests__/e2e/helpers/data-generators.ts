/**
 * E2E Test Helpers - Data Generators
 *
 * Factory functions for generating test data.
 */

/**
 * Generate random vault entry data
 */
export function generateVaultEntry(overrides?: Partial<VaultEntryData>): VaultEntryData {
  const timestamp = Date.now();

  return {
    label: `Test Entry ${timestamp}`,
    category: 'personal',
    description: 'Test description',
    tags: ['test', 'e2e'],
    data: { key: 'value', timestamp },
    dataType: 'json',
    schemaType: '',
    schemaVersion: '1.0',
    ...overrides,
  };
}

/**
 * Generate random consent data
 */
export function generateConsent(overrides?: Partial<ConsentData>): ConsentData {
  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 6);

  return {
    vaultDataId: '', // Will be set by test
    grantedTo: `Third Party ${Date.now()}`,
    purpose: 'Testing consent management',
    scope: ['read'],
    endDate: futureDate.toISOString(),
    ...overrides,
  };
}

/**
 * Generate multiple vault entries
 */
export function generateVaultEntries(count: number): VaultEntryData[] {
  return Array.from({ length: count }, (_, i) =>
    generateVaultEntry({
      label: `Test Entry ${i + 1}`,
      tags: [`test-${i}`],
    })
  );
}

/**
 * Vault entry data structure
 */
export interface VaultEntryData {
  label: string;
  category: 'personal' | 'health' | 'financial' | 'credentials' | 'other';
  description: string;
  tags: string[];
  data: Record<string, any>;
  dataType: 'json' | 'credential' | 'document';
  schemaType: string;
  schemaVersion: string;
  expiresAt?: string;
}

/**
 * Consent data structure
 */
export interface ConsentData {
  vaultDataId: string;
  grantedTo: string;
  purpose: string;
  scope: string[];
  endDate: string;
}

/**
 * Random string generator
 */
export function randomString(length: number = 10): string {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}

/**
 * Random category generator
 */
export function randomCategory(): VaultEntryData['category'] {
  const categories: VaultEntryData['category'][] = [
    'personal',
    'health',
    'financial',
    'credentials',
    'other',
  ];
  return categories[Math.floor(Math.random() * categories.length)];
}
