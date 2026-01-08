/**
 * Vault data categories
 */
export enum VaultCategory {
  PERSONAL = 'personal',
  HEALTH = 'health',
  FINANCIAL = 'financial',
  CREDENTIALS = 'credentials',
  OTHER = 'other',
}

/**
 * Vault category options for UI components
 */
export const VAULT_CATEGORIES = [
  { value: VaultCategory.PERSONAL, label: 'Personal' },
  { value: VaultCategory.HEALTH, label: 'Health' },
  { value: VaultCategory.FINANCIAL, label: 'Financial' },
  { value: VaultCategory.CREDENTIALS, label: 'Credentials' },
  { value: VaultCategory.OTHER, label: 'Other' },
] as const;

/**
 * Data types for vault entries
 */
export enum DataType {
  JSON = 'json',
  CREDENTIAL = 'credential',
  DOCUMENT = 'document',
}
