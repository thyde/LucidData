import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export interface AuthContext {
  userId: string
  userEmail: string
}

type AuthHandler = (req: NextRequest, ctx: AuthContext) => Promise<NextResponse>

export function withAuth(handler: AuthHandler) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return handler(req, { userId: user.id, userEmail: user.email ?? '' })
  }
}

type AuthHandlerWithParams<T> = (req: NextRequest, ctx: AuthContext & { params: T }) => Promise<NextResponse>

export function withAuthAndParams<T extends Record<string, string>>(
  handler: AuthHandlerWithParams<T>
) {
  return async (req: NextRequest, { params }: { params: T | Promise<T> }): Promise<NextResponse> => {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const resolvedParams = await params
    return handler(req, { userId: user.id, userEmail: user.email ?? '', params: resolvedParams })
  }
}

// Legacy alias for routes using AuthenticatedHandler type name
export type AuthenticatedHandler = AuthHandler
