import { v1, readJson } from '@/lib/api/v1/handler'
import { shareCreateSchema } from '@luciddata/core/validations/client-api'
import { createHolderShare, listSharesForUser } from '@/lib/services/share.service'

export const dynamic = 'force-dynamic'

export const GET = v1(async (_req, { userId }) => listSharesForUser(userId))

/**
 * Share chosen fields of a held credential through a link. The token comes
 * back once and is never stored in a form that can be read again.
 */
export const POST = v1(
  async (req, { userId }) => {
    const input = shareCreateSchema.parse(await readJson(req))
    const created = await createHolderShare(userId, input.credential_id, input.disclosed_claims, {
      expiresInDays: input.expires_in_days,
      verifierEmail: input.verifier_email,
    })
    return { share: created.share, token: created.token }
  },
  { status: 201 }
)
