import { v1 } from '@/lib/api/v1/handler'
import { credentialExportQuerySchema } from '@luciddata/core/validations/client-api'
import { exportCredentialAs } from '@/lib/services/credential-format.service'

export const dynamic = 'force-dynamic'

/** Export a held credential in a standards format: `?format=` and an optional `version=`. */
export const GET = v1<{ id: string }>(async (req, { userId, params }) => {
  const { format, version } = credentialExportQuerySchema.parse(
    Object.fromEntries(req.nextUrl.searchParams)
  )
  return exportCredentialAs(userId, params.id, format, version)
})
