import { v1, notFound } from '@/lib/api/v1/handler'
import { claimCredential } from '@/lib/services/credential.service'

export const dynamic = 'force-dynamic'

/** Claim a credential addressed to the person's verified email. */
export const POST = v1<{ id: string }>(async (_req, { userId, email, params }) => {
  return (await claimCredential(params.id, userId, email)) ?? notFound()
})
