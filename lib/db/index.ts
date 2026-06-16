// Database access is via Supabase client -- see lib/supabase/
// Import createClient from lib/supabase/server for server-side queries
// Import createClient from lib/supabase/client for browser-side queries
export { createClient as createServerClient } from '@/lib/supabase/server'
export { createClient as createBrowserClient } from '@/lib/supabase/client'
export { createServiceClient } from '@/lib/supabase/service'
