import { Consent } from '@prisma/client';

/**
 * Mock consent entry for testing (active consent)
 */
export const mockConsent: Consent = {
  id: 'consent-123',
  userId: 'user-123',
  vaultDataId: 'vault-123',
  grantedTo: 'org-12345',
  grantedToName: 'Acme Healthcare',
  grantedToEmail: 'contact@acme.com',
  accessLevel: 'read',
  purpose: 'For medical records verification and compliance purposes',
  startDate: new Date('2026-01-01T00:00:00.000Z'),
  endDate: new Date('2026-12-31T23:59:59.000Z'),
  revoked: false,
  revokedAt: null,
  revokedReason: null,
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  termsVersion: '1.0',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

/**
 * Mock consent with expired endDate
 */
export const mockExpiredConsent: Consent = {
  ...mockConsent,
  id: 'consent-expired',
  grantedToName: 'Expired Corp',
  grantedTo: 'org-expired',
  endDate: new Date('2023-12-31T23:59:59.000Z'), // Already expired
  createdAt: new Date('2023-01-01T00:00:00.000Z'),
  updatedAt: new Date('2023-01-01T00:00:00.000Z'),
};

/**
 * Mock consent that has been revoked
 */
export const mockRevokedConsent: Consent = {
  ...mockConsent,
  id: 'consent-revoked',
  grantedToName: 'Revoked Inc',
  grantedTo: 'org-revoked',
  revoked: true,
  revokedAt: new Date('2026-06-15T10:30:00.000Z'),
  revokedReason: 'Service no longer needed',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-06-15T10:30:00.000Z'),
};

/**
 * Mock consent with no expiration (indefinite)
 */
export const mockIndefiniteConsent: Consent = {
  ...mockConsent,
  id: 'consent-indefinite',
  grantedToName: 'Indefinite Systems',
  grantedTo: 'org-indefinite',
  endDate: null,
  createdAt: new Date('2026-02-01T00:00:00.000Z'),
  updatedAt: new Date('2026-02-01T00:00:00.000Z'),
};

/**
 * Mock consent with no associated vault data
 */
export const mockGeneralConsent: Consent = {
  ...mockConsent,
  id: 'consent-general',
  vaultDataId: null,
  grantedToName: 'General Access Co',
  grantedTo: 'org-general',
  purpose: 'General data access for analytics and reporting purposes',
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  updatedAt: new Date('2026-03-01T00:00:00.000Z'),
};

/**
 * Array of mock consent entries
 */
export const mockConsentList: Consent[] = [
  mockConsent,
  mockExpiredConsent,
  mockRevokedConsent,
  mockIndefiniteConsent,
];

/**
 * Factory function to create custom mock consent entries
 */
export function createMockConsent(
  overrides: Partial<Consent> = {}
): Consent {
  return {
    ...mockConsent,
    ...overrides,
  };
}

/**
 * Create a consent that expires soon (within specified days)
 * Useful for testing expiration warnings
 */
export function createExpiringSoonConsent(daysUntilExpiry: number = 5): Consent {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + daysUntilExpiry);

  return createMockConsent({
    id: `consent-expiring-${daysUntilExpiry}`,
    grantedToName: 'Expiring Soon Corp',
    grantedTo: 'org-expiring',
    endDate: expiryDate,
    revoked: false,
  });
}

/**
 * Create an active consent (not expired, not revoked)
 */
export function createActiveConsent(overrides: Partial<Consent> = {}): Consent {
  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 6); // 6 months in future

  return createMockConsent({
    endDate: futureDate,
    revoked: false,
    revokedAt: null,
    revokedReason: null,
    ...overrides,
  });
}

/**
 * Create multiple mock consent entries with sequential IDs
 */
export function createMockConsentList(
  count: number,
  userId: string = 'user-123'
): Consent[] {
  return Array.from({ length: count }, (_, i) => ({
    ...mockConsent,
    id: `consent-${i + 1}`,
    userId,
    grantedToName: `Organization ${i + 1}`,
    grantedTo: `org-${i + 1}`,
    purpose: `Purpose for organization ${i + 1} access`,
    createdAt: new Date(`2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`),
    updatedAt: new Date(`2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`),
  }));
}
