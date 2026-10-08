import { v1, readJson } from '@/lib/api/v1/handler'
import { credentialRequestDenySchema } from '@luciddata/core/validations/client-api'
import { denyCredentialRequest } from '@/lib/services/credential-request.service'

export const dynamic = 'force-dynamic'

export const POST = v1<{ id: string }>(async (req, { userId, params }) => {
  const { note } = credentialRequestDenySchema.parse(await readJson(req))
  await denyCredentialRequest(userId, params.id, note)
  return { id: params.id, status: 'denied' }
})
