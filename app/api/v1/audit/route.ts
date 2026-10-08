import { v1 } from '@/lib/api/v1/handler'
import { getAuditLogs, verifyUserAuditChain } from '@/lib/services/audit.service'

export const dynamic = 'force-dynamic'

/** The person's latest audit entries, and whether the whole hash chain verifies. */
export const GET = v1(async (_req, { userId }) => {
  const [logs, chainValid] = await Promise.all([getAuditLogs(userId), verifyUserAuditChain(userId)])
  return { logs, chain_valid: chainValid }
})
