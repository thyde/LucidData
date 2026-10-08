import { v1, readJson } from '@/lib/api/v1/handler'
import { stepUpRequestSchema } from '@luciddata/core/validations/client-api'
import { requestStepUp } from '@/lib/services/session-security.service'

export const dynamic = 'force-dynamic'

/**
 * Exchange a fresh password proof for a single-use grant for one action.
 *
 * The proof is the access token of a password sign-in the device made in the
 * last two minutes, never the password. That session is ended once checked,
 * so a proof works once, and the session making this request is never
 * accepted as its own proof.
 */
export const POST = v1(async (req, { userId }) => {
  const { action, proof } = stepUpRequestSchema.parse(await readJson(req))
  return { token: await requestStepUp(userId, action, proof) }
})
