import { v1, notFound } from '@/lib/api/v1/handler'
import { getConsentById, getConsentStatus } from '@/lib/services/consent.service'

export const dynamic = 'force-dynamic'

export const GET = v1<{ id: string }>(async (_req, { userId, params }) => {
  const consent = await getConsentById(params.id, userId)
  return consent ? { ...consent, status: getConsentStatus(consent) } : notFound()
})
