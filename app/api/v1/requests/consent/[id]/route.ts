import { v1, readJson } from '@/lib/api/v1/handler'
import { consentRequestResponseSchema } from '@luciddata/core/validations/client-api'
import { respondToConsentRequest } from '@/lib/services/consent-request.service'

export const dynamic = 'force-dynamic'

/** Approve or deny a pending request. Approving creates the consent it asked for. */
export const POST = v1<{ id: string }>(async (req, { userId, params }) => {
  const { response, note } = consentRequestResponseSchema.parse(await readJson(req))
  return respondToConsentRequest(userId, params.id, response, note)
})
