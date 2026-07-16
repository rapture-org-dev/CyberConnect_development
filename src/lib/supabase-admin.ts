import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client for webhooks / system jobs (bypasses RLS).
 * Requires SUPABASE_SERVICE_ROLE_KEY — never expose to the browser.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required for GitHub webhooks')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
