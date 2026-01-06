/**
 * Centralized enums for type-safe constants
 * Replaces magic strings throughout the application
 */

/**
 * Vault data categories
 */
export enum VaultCategory {
  PERSONAL = 'personal',
  HEALTH = 'health',
  FINANCIAL = 'financial',
  CREDENTIALS = 'credentials',
  DOCUMENTS = 'documents',
  OTHER = 'other',
}

/**
 * Data types stored in vault
 */
export enum VaultDataType {
  JSON = 'json',
  CREDENTIAL = 'credential',
  DOCUMENT = 'document',
  TEXT = 'text',
}

/**
 * Consent access levels
 */
export enum ConsentAccessLevel {
  READ = 'read',
  EXPORT = 'export',
  VERIFY = 'verify',
}

/**
 * Consent types
 */
export enum ConsentType {
  EXPLICIT = 'explicit',
  IMPLIED = 'implied',
}

/**
 * Audit log event types
 */
export enum AuditEventType {
  // Data operations
  DATA_CREATED = 'data_created',
  DATA_UPDATED = 'data_updated',
  DATA_DELETED = 'data_deleted',
  DATA_ACCESSED = 'data_accessed',
  DATA_EXPORTED = 'data_exported',

  // Consent operations
  CONSENT_GRANTED = 'consent_granted',
  CONSENT_REVOKED = 'consent_revoked',
  CONSENT_ACCESSED = 'consent_accessed',

  // Audit operations
  AUDIT_ACCESSED = 'audit_accessed',

  // System events
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  SECURITY_EVENT = 'security_event',
}

/**
 * Actor types for audit logs
 */
export enum ActorType {
  USER = 'user',
  SYSTEM = 'system',
  BUYER = 'buyer', // Third-party with consent
  ADMIN = 'admin',
}

/**
 * Schema types for data portability
 */
export enum SchemaType {
  JSON_LD = 'JSON-LD',
  VERIFIABLE_CREDENTIAL = 'VerifiableCredential',
  FHIR = 'FHIR', // Healthcare data standard
  CUSTOM = 'custom',
}

/**
 * Export request status
 */
export enum ExportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Export formats
 */
export enum ExportFormat {
  JSON_LD = 'JSON-LD',
  VERIFIABLE_CREDENTIAL = 'VerifiableCredential',
  CSV = 'CSV',
  JSON = 'JSON',
}
