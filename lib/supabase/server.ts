import { AsyncLocalStorage } from 'node:async_hooks';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { Database } from '@/types/database.types';

/**
 * LD-608: a request to the versioned API carries the person's access token in
 * an Authorization header and has no cookies. Inside runWithAccessToken, every
 * createClient() call returns a client that acts as that person, so row level
 * security applies exactly as it does for a browser session and the services
 * the server actions use work unchanged.
 */
const bearer = new AsyncLocalStorage<{ accessToken: string }>();

export function runWithAccessToken<T>(accessToken: string, fn: () => Promise<T>): Promise<T> {
  return bearer.run({ accessToken }, fn);
}

export async function createClient(): Promise<SupabaseClient<Database>> {
  const store = bearer.getStore();
  if (store) {
    return createSupabaseClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${store.accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

/**
 * The access token behind the current request: the bearer token on an API
 * request, or the cookie session's token in the web app.
 */
export async function currentAccessToken(): Promise<string | null> {
  const store = bearer.getStore();
  if (store) return store.accessToken;
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
