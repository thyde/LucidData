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

export async function getAuditLogs(userId: string): Promise<AuditLog[]> {
  return auditRepo.findAuditLogsByUserId(userId)
}

export function verifyAuditChain(logs: AuditLog[]): boolean {
  // logs should be in ascending timestamp order for verification
  const sorted = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  for (let i = 0; i < sorted.length; i++) {
    const log = sorted[i]
    const prevHash = i === 0 ? null : sorted[i - 1].current_hash
    const expected = createAuditHash(prevHash, {
      userId: log.user_id,
      eventType: log.event_type,
      action: log.action,
      timestamp: new Date(log.timestamp),
    })
    if (expected !== log.current_hash) return false
  }
  return true
}
