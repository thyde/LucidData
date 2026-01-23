import { createBrowserClient } from '@supabase/ssr';

/**
 * Creates a Supabase client for browser use
 *
 * Connects directly to Supabase for proper cookie-based session management.
 * For local development, uses NEXT_PUBLIC_SUPABASE_URL from environment.
 * For network access from remote devices, update NEXT_PUBLIC_SUPABASE_URL to use
 * your network IP (e.g., http://192.168.8.159:54321) instead of localhost.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
