import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

// Cookie-session Supabase client for client components. Only auth flows use
// it (sign in/out, OAuth, password reset) — data reads/writes stay on the
// API routes.
export function getSupabaseBrowser(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      throw new Error('Supabase env vars are not set. Copy .env.example to .env.local and fill in values.')
    }
    _client = createBrowserClient(url, key)
  }
  return _client
}
