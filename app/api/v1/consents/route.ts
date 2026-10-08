import { v1, readJson } from '@/lib/api/v1/handler'
import { consentCreateSchema } from '@luciddata/core/validations/client-api'
import { createConsent, getConsentStatus, getUserConsents } from '@/lib/services/consent.service'
import type { Consent } from '@/types/database.types'

export const dynamic = 'force-dynamic'

/** A consent with whether it is active, revoked, or expired, worked out now. */
function withStatus(consent: Consent) {
  return { ...consent, status: getConsentStatus(consent) }
}

export const GET = v1(async (_req, { userId }) => (await getUserConsents(userId)).map(withStatus))

export const POST = v1(
  async (req, { userId }) => {
    const input = consentCreateSchema.parse(await readJson(req))
    return withStatus(await createConsent(userId, { ...input, consent_type: 'explicit' }))
  },
  { status: 201 }
)
