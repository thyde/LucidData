import { v1, readJson } from '@/lib/api/v1/handler'
import { credentialRequestFulfillSchema } from '@luciddata/core/validations/client-api'
import { fulfillCredentialRequest } from '@/lib/services/credential-request.service'

export const dynamic = 'force-dynamic'

/** Answer a request by sharing chosen fields of credentials the person holds. */
export const POST = v1<{ id: string }>(async (req, { userId, params }) => {
  const { selections } = credentialRequestFulfillSchema.parse(await readJson(req))
  return fulfillCredentialRequest(
    userId,
    params.id,
    selections.map((selection) => ({
      credentialId: selection.credential_id,
      disclosedClaims: selection.disclosed_claims,
    }))
  )
})
