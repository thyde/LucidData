import { v1, readJson, notFound } from '@/lib/api/v1/handler'
import { consentExtendSchema } from '@luciddata/core/validations/client-api'
import { extendConsent, getConsentById, getConsentStatus } from '@/lib/services/consent.service'

export const dynamic = 'force-dynamic'

export const POST = v1<{ id: string }>(async (req, { userId, params }) => {
  const { end_date } = consentExtendSchema.parse(await readJson(req))
  if (!(await getConsentById(params.id, userId))) return notFound()
  const consent = await extendConsent(params.id, userId, end_date)
  return { ...consent, status: getConsentStatus(consent) }
})
