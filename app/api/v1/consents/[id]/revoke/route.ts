import { v1, readJson, notFound } from '@/lib/api/v1/handler'
import { consentRevokeSchema } from '@luciddata/core/validations/client-api'
import { getConsentById, getConsentStatus, revokeConsent } from '@/lib/services/consent.service'

export const dynamic = 'force-dynamic'

/** Stop future access. Data already delivered stays with the recipient. */
export const POST = v1<{ id: string }>(async (req, { userId, params }) => {
  const { reason } = consentRevokeSchema.parse(await readJson(req))
  if (!(await getConsentById(params.id, userId))) return notFound()
  const consent = await revokeConsent(params.id, userId, reason)
  return { ...consent, status: getConsentStatus(consent) }
})
