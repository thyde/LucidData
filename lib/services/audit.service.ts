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
 * Check a whole chain, from its first entry.
 *
 * Entries are taken in the order their hashes link them, not by timestamp,
 * because two events in the same millisecond tie. The chain must start once,
 * never branch, reach every entry, and every hash must match what it covers.
 * Given only part of a chain this fails, because the oldest entry it holds
 * points at one it does not: verify the whole thing, with verifyUserAuditChain.
 */
export function verifyAuditChain(
  logs: readonly Pick<
    AuditLog,
    'user_id' | 'event_type' | 'action' | 'timestamp' | 'previous_hash' | 'current_hash'
  >[]
): boolean {
  if (logs.length === 0) return true
  const next = new Map<string | null, (typeof logs)[number]>()
  for (const log of logs) {
    const link = log.previous_hash ?? null
    // Two entries after the same one is a branch, which an append-only chain never has.
    if (next.has(link)) return false
    next.set(link, log)
  }

  let previous: string | null = null
  let reached = 0
  for (let log = next.get(null); log; log = next.get(previous)) {
    const expected = createAuditHash(previous, {
      userId: log.user_id,
      eventType: log.event_type,
      action: log.action,
      timestamp: new Date(log.timestamp),
    })
    if (expected !== log.current_hash) return false
    previous = log.current_hash
    reached++
  }
  return reached === logs.length
}

/** Read the person's whole audit chain and check it. */
export async function verifyUserAuditChain(userId: string): Promise<boolean> {
  return verifyAuditChain(await auditRepo.findAuditChain(userId))
}
