/**
 * Centralized type definitions
 * All application types in one location for consistency
 */

import { User, VaultData, Consent, AuditLog, ExportRequest } from '@prisma/client';
import {
  VaultCategory,
  VaultDataType,
  ConsentAccessLevel,
  ConsentType,
  AuditEventType,
  ActorType,
  SchemaType,
  ExportStatus,
  ExportFormat,
} from '@/lib/constants/enums';

/**
 * ============================================================================
 * Prisma model types (re-export for convenience)
 * ============================================================================
 */
export type { User, VaultData, Consent, AuditLog, ExportRequest };

/**
 * ============================================================================
 * Vault Types
 * ============================================================================
 */

/**
 * Decrypted vault data (what the API returns)
 */
export interface DecryptedVaultData {
  id: string;
  label: string;
  category: VaultCategory | string;
  description: string;
  dataType: VaultDataType | string;
  tags: string[];
  schemaType: SchemaType | string | null;
  schemaVersion: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  data: Record<string, unknown> | null;
  error?: string; // If decryption failed
}

/**
 * Vault data creation payload
 */
export interface CreateVaultDataPayload {
  label: string;
  category: VaultCategory | string;
  dataType: VaultDataType | string;
  description?: string;
  tags?: string[];
  data: Record<string, unknown>;
  schemaType?: SchemaType | string;
  schemaVersion?: string;
  expiresAt?: Date;
}

/**
 * Vault data update payload
 */
export interface UpdateVaultDataPayload {
  label?: string;
  category?: VaultCategory | string;
  description?: string;
  tags?: string[];
  data?: Record<string, unknown>;
  expiresAt?: Date;
}

/**
 * ============================================================================
 * Consent Types
 * ============================================================================
 */

/**
 * Consent creation payload
 */
export interface CreateConsentPayload {
  vaultDataId?: string | null;
  grantedTo: string;
  grantedToName: string;
  grantedToEmail?: string;
  accessLevel: ConsentAccessLevel | string;
  purpose: string;
  endDate?: Date;
  consentType?: ConsentType | string;
  termsVersion?: string;
}

/**
 * Consent with vault data (populated)
 */
export interface ConsentWithVaultData extends Consent {
  vaultData?: VaultData | null;
}

/**
 * Consent revocation payload
 */
export interface RevokeConsentPayload {
  revokedReason: string;
}

/**
 * ============================================================================
 * Audit Log Types
 * ============================================================================
 */

/**
 * Audit log entry creation payload
 */
export interface CreateAuditLogPayload {
  userId: string;
  vaultDataId?: string;
  consentId?: string;
  eventType: AuditEventType | string;
  action: string;
  actorId: string;
  actorType: ActorType | string;
  actorName?: string;
  ipAddress?: string;
  userAgent?: string;
  method?: string;
  success?: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Audit log with chain validation
 */
export interface AuditLogWithValidation extends AuditLog {
  chainValid: boolean;
}

/**
 * Hash chain entry (for verification)
 */
export interface HashChainEntry {
  currentHash: string;
  previousHash: string | null;
  eventType: string;
  userId: string;
  timestamp: Date;
  action: string;
}

/**
 * ============================================================================
 * Export Types
 * ============================================================================
 */

/**
 * Export request creation payload
 */
export interface CreateExportRequestPayload {
  format: ExportFormat | string;
  includeCategories?: (VaultCategory | string)[];
  includeAuditLog?: boolean;
}

/**
 * Export data structure
 */
export interface ExportData {
  user: {
    id: string;
    email: string;
    createdAt: Date;
  };
  vaultData: DecryptedVaultData[];
  consents?: Consent[];
  auditLogs?: AuditLog[];
  exportedAt: Date;
  format: ExportFormat | string;
}

/**
 * ============================================================================
 * Authentication Types
 * ============================================================================
 */

/**
 * Authenticated user context (from middleware)
 */
export interface AuthContext {
  userId: string;
  userEmail: string;
}

/**
 * Auth context with params (for dynamic routes)
 */
export interface AuthContextWithParams<T extends Record<string, string>> extends AuthContext {
  params: T;
}

/**
 * Login credentials
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Registration payload
 */
export interface RegisterPayload extends LoginCredentials {
  confirmPassword: string;
}

/**
 * ============================================================================
 * API Response Types
 * ============================================================================
 */

/**
 * Standard API success response
 */
export interface ApiSuccessResponse<T = unknown> {
  data: T;
  message?: string;
}

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

/**
 * ============================================================================
 * Encryption Types
 * ============================================================================
 */

/**
 * Encrypted data result
 */
export interface EncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
}

/**
 * Encryption key info
 */
export interface KeyInfo {
  keyId: string;
  algorithm: string;
  createdAt: Date;
}

/**
 * ============================================================================
 * UI Component Types
 * ============================================================================
 */

/**
 * Data fetch state (for UI hooks)
 */
export interface DataFetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Form state
 */
export interface FormState {
  submitting: boolean;
  errors: Record<string, string>;
  success: boolean;
}

/**
 * Toast notification
 */
export interface ToastNotification {
  id: string;
  title: string;
  description?: string;
  variant: 'default' | 'success' | 'error' | 'warning';
  duration?: number;
}

/**
 * ============================================================================
 * Utility Types
 * ============================================================================
 */

/**
 * Make all properties of T required and non-nullable
 */
export type DeepRequired<T> = {
  [P in keyof T]-?: DeepRequired<NonNullable<T[P]>>;
};

/**
 * Make specific keys of T optional
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Extract the awaited type from a Promise
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;
