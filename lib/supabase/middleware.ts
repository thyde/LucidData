import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * LD-302: forward a detected Global Privacy Control signal to server code as a
 * normalized request header. Middleware runs on every request and cannot write
 * to the database, so detection happens here and recording happens once in the
 * dashboard layout.
 */
const GPC_FORWARD_HEADER = 'x-lucid-gpc';

export { GPC_FORWARD_HEADER };

export function detectGpc(request: NextRequest): boolean {
  return request.headers.get('sec-gpc')?.trim() === '1';
}

export async function updateSession(request: NextRequest) {
  // Carry the normalized signal on the request the app sees. Every request is
  // stamped, so a stale value from a client-supplied header cannot leak through.
  request.headers.set(GPC_FORWARD_HEADER, detectGpc(request) ? '1' : '0');

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshing the auth token
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected routes
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/register') &&
    !request.nextUrl.pathname.startsWith('/signup') &&
    !request.nextUrl.pathname.startsWith('/forgot-password') &&
    !request.nextUrl.pathname.startsWith('/recover-vault') &&
    !request.nextUrl.pathname.startsWith('/verify') &&
    !request.nextUrl.pathname.startsWith('/for-individuals') &&
    !request.nextUrl.pathname.startsWith('/for-business') &&
    !request.nextUrl.pathname.startsWith('/pricing') &&
    !request.nextUrl.pathname.startsWith('/trust') &&
    !request.nextUrl.pathname.startsWith('/api/auth') &&
    !request.nextUrl.pathname.startsWith('/api/supabase') &&
    !request.nextUrl.pathname.startsWith('/api/org') &&
    !request.nextUrl.pathname.startsWith('/api/issuers') &&
    !request.nextUrl.pathname.startsWith('/api/stripe') &&
    !request.nextUrl.pathname.startsWith('/api/cron') &&
    request.nextUrl.pathname !== '/'
  ) {
    // Redirect to login if accessing protected route, preserve original path
    const url = request.nextUrl.clone();
    const originalPath = request.nextUrl.pathname;
    url.pathname = '/login';
    url.searchParams.set('redirectedFrom', originalPath);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
