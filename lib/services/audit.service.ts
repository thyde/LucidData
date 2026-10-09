import * as auditRepo from '@/lib/repositories/audit.repository'
import { createAuditHash } from '@/lib/crypto/hashing'
import type { AuditLog, Json } from '@/types/database.types'

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

/** The event type of the entry that lists the ends of branches written before 2026-10-09. */
export const SEAL_EVENT = 'audit_chain_sealed'

/**
 * Append an entry to the person's chain. The database links it to the
 * current head and hashes it, as createAuditHash does, under a lock on that
 * head, so appends made at the same moment take turns and the chain cannot
 * branch.
 */
export async function createAuditEntry(params: CreateAuditEntryParams): Promise<AuditLog> {
  return auditRepo.appendAuditLog({
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
    metadata: (params.metadata as Json) ?? null,
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

type ChainLink = Pick<AuditLog, 'user_id' | 'event_type' | 'action' | 'timestamp' | 'previous_hash' | 'current_hash'>

const SEALED = /^Sealed \d+ earlier branch ends? of this log: (.+)$/

/** The ends a sealing entry lists in its action, or null if it lists none it can name. */
export function sealedEnds(action: string): string[] | null {
  const match = SEALED.exec(action)
  if (!match) return null
  const ends = match[1].split(', ').filter(Boolean)
  return ends.length > 0 ? ends : null
}

/** Whether following links back from an entry reaches the head. */
function descendsFrom(log: ChainLink, head: string, byHash: Map<string, ChainLink>): boolean {
  let cursor = log
  for (let steps = 0; steps <= byHash.size; steps++) {
    const previous = cursor.previous_hash
    if (!previous) return false
    if (previous === head) return true
    const next = byHash.get(previous)
    if (!next) return false
    cursor = next
  }
  return false
}

/**
 * Check a whole log.
 *
 * Every entry's hash must match what it covers, including the hash of the
 * entry before it, and every entry must point at an entry that exists. So a
 * changed entry fails its own hash, a reordered one fails because its link is
 * part of its hash, and a removed entry is caught whenever a later entry
 * pointed at it. Given only part of a log this fails for the same reason:
 * verify the whole thing, with verifyUserAuditChain.
 *
 * Since 2026-10-09 the database refuses an entry that does not link to the
 * person's head, so the chain no longer branches. Branches written before
 * that are allowed, and their ends are listed in a sealing entry whose action
 * the hash covers; each listed end must still be there.
 *
 * Given the head, read before the log, the check also covers what nothing
 * points at: the head must be present, and every other end must be sealed or
 * have been appended after the head was read. So removing the newest entry,
 * or the end of an old branch, shows too. Only these fields are hashed: the
 * link, the event type, the person, the time, and the action.
 */
export function verifyAuditChain(logs: readonly ChainLink[], head?: string | null): boolean {
  const recorded = new Set(logs.map((log) => log.current_hash))
  const intact = logs.every((log) => {
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
  if (!intact) return false

  const sealed = new Set<string>()
  for (const log of logs) {
    if (log.event_type !== SEAL_EVENT) continue
    const ends = sealedEnds(log.action)
    if (!ends || ends.some((end) => !recorded.has(end))) return false
    for (const end of ends) sealed.add(end)
  }

  if (head === undefined) return true
  if (head === null) return logs.length === 0
  if (!recorded.has(head)) return false

  const linked = new Set(logs.map((log) => log.previous_hash).filter((hash): hash is string => Boolean(hash)))
  const byHash = new Map(logs.map((log) => [log.current_hash, log]))
  return logs.every(
    (log) =>
      linked.has(log.current_hash) ||
      log.current_hash === head ||
      sealed.has(log.current_hash) ||
      descendsFrom(log, head, byHash)
  )
}

/** The hash the person's next entry links to, as their own session reads it. */
export async function getOwnChainHead(userId: string): Promise<string | null> {
  return auditRepo.findOwnChainHead(userId)
}

/** Read the person's head, then their whole audit chain, and check it. */
export async function verifyUserAuditChain(userId: string): Promise<boolean> {
  // The head first: an entry appended while the log is read then descends from it.
  const head = await auditRepo.findOwnChainHead(userId)
  return verifyAuditChain(await auditRepo.findAuditChain(userId), head)
}
