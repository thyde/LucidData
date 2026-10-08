import { v1 } from '@/lib/api/v1/handler'
import { getAuditLogs, verifyAuditChain } from '@/lib/services/audit.service'

export const dynamic = 'force-dynamic'

/** The person's audit log, and whether its hash chain verifies. */
export const GET = v1(async (_req, { userId }) => {
  const logs = await getAuditLogs(userId)
  return { logs, chain_valid: verifyAuditChain(logs) }
})
