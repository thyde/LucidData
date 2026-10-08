import { NextResponse } from 'next/server'
import { buildClientApiDocument } from '@/lib/api/v1/openapi'

/**
 * LD-608: the client API specification, generated from the schemas the
 * handlers validate against. Public, like the organization API's: a
 * description of endpoints that all require a token holds nothing sensitive.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return NextResponse.json(buildClientApiDocument(baseUrl), {
    headers: { 'cache-control': 'public, max-age=300' },
  })
}
