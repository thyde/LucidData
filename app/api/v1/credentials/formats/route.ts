import { v1 } from '@/lib/api/v1/handler'
import { describeFormats } from '@/lib/credentials/formats'

export const dynamic = 'force-dynamic'

/** The standards formats a credential can be exported into. */
export const GET = v1(async () => describeFormats())
