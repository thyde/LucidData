import { v1 } from '@/lib/api/v1/handler'
import { listHeldCredentials } from '@/lib/services/credential.service'

export const dynamic = 'force-dynamic'

/**
 * Credentials issued to the person, claimed and claimable, each with its
 * issuer and a fresh check of the issuer's signature.
 */
export const GET = v1(async (_req, { userId, email }) => listHeldCredentials(userId, email))
