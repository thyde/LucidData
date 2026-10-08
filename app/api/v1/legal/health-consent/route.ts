import { v1, readJson } from '@/lib/api/v1/handler'
import { healthConsentGrantSchema } from '@luciddata/core/validations/client-api'
import {
  getLegalStatus,
  grantHealthDataConsent,
  withdrawHealthDataConsent,
} from '@/lib/services/legal.service'

export const dynamic = 'force-dynamic'

/**
 * Consent to LucidData storing health data, which Washington's My Health My
 * Data Act requires separately from the terms. Health entries are refused
 * until it is given.
 */
export const POST = v1(async (req, { userId }) => {
  const { source } = healthConsentGrantSchema.parse(await readJson(req).catch(() => ({})))
  await grantHealthDataConsent(userId, source)
  return getLegalStatus(userId)
})

/**
 * Withdraw that consent. New health data is refused and every source is
 * disconnected; entries already stored stay until the person deletes them.
 */
export const DELETE = v1(async (_req, { userId }) => {
  const { disconnected } = await withdrawHealthDataConsent(userId)
  return { ...(await getLegalStatus(userId)), disconnected }
})
