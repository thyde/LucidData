import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { userService } from '@/lib/services/user.service';

export type AuthenticatedHandler = (
  request: NextRequest,
  context: { userId: string; userEmail: string }
) => Promise<NextResponse>;

/**
 * Higher-order function to wrap API route handlers with authentication
 * Eliminates duplicate auth checking code across all API routes
 *
 * @param handler - The API route handler to wrap
 * @returns Wrapped handler with authentication
 *
 * @example
 * export const GET = withAuth(async (request, { userId }) => {
 *   // userId is guaranteed to be available here
 *   return NextResponse.json({ data: 'protected' });
 * });
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest) => {
    try {
      const supabase = await createClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }

      // Ensure user exists in application database
      // This syncs Supabase auth users with our users table
      await userService.ensureUserExists(user.id, user.email || '');

      // Call the wrapped handler with user context
      return await handler(request, {
        userId: user.id,
        userEmail: user.email || '',
      });
    } catch (error) {
      console.error('Auth middleware error:', error);
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }
  };
}

/**
 * Variant of withAuth that also provides route parameters
 * Useful for dynamic routes like /api/vault/[id]
 */
export function withAuthAndParams<T extends Record<string, string>>(
  handler: (
    request: NextRequest,
    context: { userId: string; userEmail: string; params: T }
  ) => Promise<NextResponse>
) {
  return async (request: NextRequest, { params }: { params: T }) => {
    try {
      const supabase = await createClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }

      // Ensure user exists in application database
      await userService.ensureUserExists(user.id, user.email || '');

      return await handler(request, {
        userId: user.id,
        userEmail: user.email || '',
        params,
      });
    } catch (error) {
      console.error('Auth middleware error:', error);
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }
  };
}
