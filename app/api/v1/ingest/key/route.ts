import { v1, readJson } from '@/lib/api/v1/handler'
import { ingestionKeyPublishSchema } from '@luciddata/core/validations/client-api'
import { getIngestionKey, publishIngestionKey } from '@/lib/services/ingestion.service'
import { UserFacingError } from '@/lib/actions/action-result'

export const dynamic = 'force-dynamic'

/** The published public key and the wrapped private half, which only the person's master key opens. */
export const GET = v1(async (_req, { userId }) => {
  const key = await getIngestionKey(userId)
  return { public_key: key.publicKey, wrapped_private_key: key.wrappedPrivateKey, salt: key.salt }
})

/**
 * Publish the ingestion keypair, once. Replacing it would strand every record
 * already sealed to the old key, so a second publish is refused.
 */
export const PUT = v1(async (req, { userId }) => {
  const input = ingestionKeyPublishSchema.parse(await readJson(req))
  const stored = await publishIngestionKey(userId, {
    publicKey: input.public_key,
    wrappedPrivateKey: input.wrapped_private_key,
    salt: input.salt,
  })
  if (!stored) throw new UserFacingError('An ingestion key is already published', 'conflict')
  return { published: true }
})
