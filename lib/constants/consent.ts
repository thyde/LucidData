/**
 * Consent access levels
 */
export enum AccessLevel {
  READ = 'read',
  EXPORT = 'export',
  VERIFY = 'verify',
}

/**
 * Access level options for UI components
 */
export const ACCESS_LEVELS = [
  {
    value: AccessLevel.READ,
    label: 'Read',
    description: 'View data only',
  },
  {
    value: AccessLevel.EXPORT,
    label: 'Export',
    description: 'Download copies of data',
  },
  {
    value: AccessLevel.VERIFY,
    label: 'Verify',
    description: 'Verify data authenticity',
  },
] as const;

/**
 * Consent status
 */
export enum ConsentStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}
