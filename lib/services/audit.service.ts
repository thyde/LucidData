import * as auditRepo from '@/lib/repositories/audit.repository'
import { createAuditHash } from '@/lib/crypto/hashing'
import type { AuditLog } from '@/types/database.types'

interface CreateAuditEntryParams {
  userId: string
  eventType: string
  action: string
  vaultDataId?: string
  consentId?: string
  actorId?: string
  actorType?: 'user' | 'system' | 'buyer'
  actorName?: string
  ipAddress?: string
  userAgent?: string
  method?: string
  success?: boolean
  errorMessage?: string
  metadata?: Record<string, unknown>
}

export async function createAuditEntry(params: CreateAuditEntryParams): Promise<AuditLog> {
  const latest = await auditRepo.findLatestAuditLog(params.userId)
  const previousHash = latest?.current_hash ?? null

  const timestamp = new Date()
  const hashData = {
    userId: params.userId,
    eventType: params.eventType,
    action: params.action,
    timestamp,
  }
  const currentHash = createAuditHash(previousHash, hashData)

  return auditRepo.createAuditLog({
    user_id: params.userId,
    vault_data_id: params.vaultDataId,
    consent_id: params.consentId,
    event_type: params.eventType,
    action: params.action,
    actor_id: params.actorId ?? params.userId,
    actor_type: params.actorType ?? 'user',
    actor_name: params.actorName,
    ip_address: params.ipAddress,
    user_agent: params.userAgent,
    method: params.method,
    success: params.success ?? true,
    error_message: params.errorMessage,
    previous_hash: previousHash,
    current_hash: currentHash,
    metadata: (params.metadata as import('@/types/database.types').Json) ?? null,
    timestamp: timestamp.toISOString(),
  })
}

/** The most recent entries, for display. */
export async function getAuditLogs(userId: string): Promise<AuditLog[]> {
  return auditRepo.findAuditLogsByUserId(userId)
}

/** Every entry, oldest first, for an export. */
export async function getAllAuditLogs(userId: string): Promise<AuditLog[]> {
  return auditRepo.findAllAuditLogs(userId)
}

/**
 * Check a whole log.
 *
 * Every entry's hash must match what it covers, including the hash of the
 * entry before it, and every entry must point at an entry that exists. So a
 * changed entry fails its own hash, a reordered one fails because its link is
 * part of its hash, and a removed one leaves the next entry pointing at
 * nothing. Given only part of a log this fails for the same reason: verify the
 * whole thing, with verifyUserAuditChain.
 *
 * Two entries may point at the same predecessor. Two requests can append at
 * once, and entries written before 2026-10-09 by scheduled jobs could not see
 * the latest entry and started a second chain. Neither alters a recorded
 * event, so neither is reported as tampering.
 */
export function verifyAuditChain(
  logs: readonly Pick<
    AuditLog,
    'user_id' | 'event_type' | 'action' | 'timestamp' | 'previous_hash' | 'current_hash'
  >[]
): boolean {
  const recorded = new Set(logs.map((log) => log.current_hash))
  return logs.every((log) => {
    const previous = log.previous_hash ?? null
    if (previous !== null && !recorded.has(previous)) return false
    return (
      createAuditHash(previous, {
        userId: log.user_id,
        eventType: log.event_type,
        action: log.action,
        timestamp: new Date(log.timestamp),
      }) === log.current_hash
    )
  })
}

/** Read the person's whole audit chain and check it. */
export async function verifyUserAuditChain(userId: string): Promise<boolean> {
  return verifyAuditChain(await auditRepo.findAuditChain(userId))
}
