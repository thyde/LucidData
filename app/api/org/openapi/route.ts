import { NextResponse } from 'next/server'
import { buildOpenApiDocument } from '@/lib/services/openapi.service'

/**
 * LD-602: the organization API specification, generated from the same Zod
 * schemas the handlers validate against.
 *
 * Public on purpose. An integrator should be able to read the contract before
 * asking anyone for a key, and there is nothing sensitive in a description of
 * endpoints that all require authentication.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return NextResponse.json(buildOpenApiDocument(baseUrl), {
    headers: { 'cache-control': 'public, max-age=300' },
  })
}
