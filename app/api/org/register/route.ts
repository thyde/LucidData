import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateApiKey } from '@/lib/utils/api-key'
import { z } from 'zod'

const RegisterSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  website: z.string().url().optional(),
})

export async function POST(req: NextRequest) {
  const body = await req.json()
  const result = RegisterSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid input', details: result.error.flatten() }, { status: 400 })
  }

  const { name, email, website } = result.data
  const { key, hash } = generateApiKey()

  const supabase = createServiceClient()
  const { data: org, error } = await supabase
    .from('organizations')
    .insert({ name, email, website, api_key_hash: hash })
    .select('id, name, email, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'An organization with this email already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Return the API key ONCE — it is never stored in plaintext again
  return NextResponse.json({
    organization: org,
    api_key: key,
    message: 'Save this API key — it will not be shown again.',
  }, { status: 201 })
}
