import { Consent } from '@/types/database.types';

/**
 * Mock consent entry for testing (active consent)
 */
export const mockConsent: Consent = {
  id: 'consent-123',
  user_id: 'user-123',
  vault_data_id: 'vault-123',
  granted_to: 'org-12345',
  granted_to_name: 'Acme Healthcare',
  granted_to_email: 'contact@acme.com',
  access_level: 'read',
  purpose: 'For medical records verification and compliance purposes',
  start_date: '2026-01-01T00:00:00.000Z',
  end_date: '2026-12-31T23:59:59.000Z',
  revoked: false,
  revoked_at: null,
  revoked_reason: null,
  consent_type: 'explicit',
  ip_address: '192.168.1.1',
  user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  terms_version: '1.0',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

/**
 * Mock consent with expired end_date
 */
export const mockExpiredConsent: Consent = {
  ...mockConsent,
  id: 'consent-expired',
  granted_to_name: 'Old Data Corp',
  granted_to: 'org-expired',
  end_date: '2023-12-31T23:59:59.000Z',
  created_at: '2023-01-01T00:00:00.000Z',
  updated_at: '2023-01-01T00:00:00.000Z',
};

/**
 * Mock consent that has been revoked
 */
export const mockRevokedConsent: Consent = {
  ...mockConsent,
  id: 'consent-revoked',
  granted_to_name: 'Cancelled Services Inc',
  granted_to: 'org-revoked',
  revoked: true,
  revoked_at: '2026-06-15T10:30:00.000Z',
  revoked_reason: 'Service no longer needed',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-06-15T10:30:00.000Z',
};

/**
 * Mock consent with no expiration (indefinite)
 */
export const mockIndefiniteConsent: Consent = {
  ...mockConsent,
  id: 'consent-indefinite',
  granted_to_name: 'Indefinite Systems',
  granted_to: 'org-indefinite',
  end_date: null,
  created_at: '2026-02-01T00:00:00.000Z',
  updated_at: '2026-02-01T00:00:00.000Z',
};

/**
 * Mock consent with no associated vault data
 */
export const mockGeneralConsent: Consent = {
  ...mockConsent,
  id: 'consent-general',
  vault_data_id: null,
  granted_to_name: 'General Access Co',
  granted_to: 'org-general',
  purpose: 'General data access for analytics and reporting purposes',
  created_at: '2026-03-01T00:00:00.000Z',
  updated_at: '2026-03-01T00:00:00.000Z',
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
 */
export function createExpiringSoonConsent(daysUntilExpiry: number = 5): Consent {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + daysUntilExpiry);

  return createMockConsent({
    id: `consent-expiring-${daysUntilExpiry}`,
    granted_to_name: 'Expiring Soon Corp',
    granted_to: 'org-expiring',
    end_date: expiryDate.toISOString(),
    revoked: false,
  });
}

/**
 * Create an active consent (not expired, not revoked)
 */
export function createActiveConsent(overrides: Partial<Consent> = {}): Consent {
  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 6);

  return createMockConsent({
    end_date: futureDate.toISOString(),
    revoked: false,
    revoked_at: null,
    revoked_reason: null,
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
    user_id: userId,
    granted_to_name: `Organization ${i + 1}`,
    granted_to: `org-${i + 1}`,
    purpose: `Purpose for organization ${i + 1} access`,
    created_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
    updated_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
  }));
}
