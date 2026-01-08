/**
 * Audit event types for tracking user actions and system events
 */
export enum AuditEventType {
  // Vault events
  VAULT_CREATED = 'VAULT_CREATED',
  VAULT_UPDATED = 'VAULT_UPDATED',
  VAULT_DELETED = 'VAULT_DELETED',
  VAULT_ACCESSED = 'VAULT_ACCESSED',

  // Consent events
  CONSENT_GRANTED = 'CONSENT_GRANTED',
  CONSENT_REVOKED = 'CONSENT_REVOKED',
  CONSENT_EXTENDED = 'CONSENT_EXTENDED',
  CONSENT_ACCESSED = 'CONSENT_ACCESSED',

  // Export events
  EXPORT_REQUESTED = 'EXPORT_REQUESTED',
  EXPORT_COMPLETED = 'EXPORT_COMPLETED',
  EXPORT_FAILED = 'EXPORT_FAILED',

  // Authentication events
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',

  // Security events
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  AUDIT_INTEGRITY_VIOLATION = 'AUDIT_INTEGRITY_VIOLATION',
}

/**
 * Audit event severity levels
 */
export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}
