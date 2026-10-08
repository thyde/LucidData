import { v1, readJson } from '@/lib/api/v1/handler'
import { legalAcceptSchema } from '@luciddata/core/validations/client-api'
import { acceptDocuments, getLegalStatus } from '@/lib/services/legal.service'

export const dynamic = 'force-dynamic'

/**
 * Which versions of the terms and privacy policy the person accepted, which
 * are outstanding, and whether they consent to storing health data. A client
 * should block use until nothing is outstanding, as the web app does.
 */
export const GET = v1(async (_req, { userId }) => getLegalStatus(userId))

/** Accept the current versions of the named documents. */
export const POST = v1(async (req, { userId }) => {
  const { documents } = legalAcceptSchema.parse(await readJson(req))
  await acceptDocuments(userId, documents)
  return getLegalStatus(userId)
})
