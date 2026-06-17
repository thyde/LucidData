import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { addOrgMember } from '@/lib/middleware/withOrgMember'
import { generateApiKey } from '@/lib/utils/api-key'
import { z } from 'zod'

const RegisterSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  website: z.string().url().optional(),
  org_type: z.enum(['issuer', 'verifier', 'both']).optional(),
  data_buyer: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const body = await req.json()
  const result = RegisterSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid input', details: result.error.flatten() }, { status: 400 })
  }

  const { name, email, website, org_type, data_buyer } = result.data
  const { key, hash } = generateApiKey()

  const supabase = createServiceClient()
  const { data: org, error } = await supabase
    .from('organizations')
    .insert({ name, email, website, api_key_hash: hash, org_type: org_type ?? 'verifier', data_buyer: data_buyer ?? false })
    .select('id, name, email, org_type, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'An organization with this email already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // If a signed-in user created this org from the portal, make them the owner so
  // they can manage it without the API key.
  const sessionClient = await createClient()
  const { data: { user } } = await sessionClient.auth.getUser()
  if (user) {
    await addOrgMember(org.id, user.id, 'owner')
  }

  // Return the API key ONCE — it is never stored in plaintext again
  return NextResponse.json({
    organization: org,
    api_key: key,
    message: 'Save this API key now. It will not be shown again.',
  }, { status: 201 })
}
