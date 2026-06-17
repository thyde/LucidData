import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - PWA assets (sw.js, workbox-*, swe-worker-*, manifest.json): these must be
     *   served directly. The middleware redirects unauthenticated requests to
     *   /login, and a redirect on the service-worker script makes registration
     *   fail with "The script resource is behind a redirect, which is disallowed."
     * - common image files
     */
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|swe-worker-.*\\.js|workbox-.*\\.js|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
