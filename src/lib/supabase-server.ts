import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Creates a server-side Supabase client for Server Actions and Server Components.
 * This client uses cookies for authentication, ensuring that data access is 
 * bound to the current user's session.
 *
 * Performance note: this uses the Supabase REST API with the anon key (HTTP), not raw Postgres
 * pools. If you add direct `pg` access or long-lived workers, use the Supabase **pooler**
 * connection string (Supavisor, typically port `6543`, transaction mode) on serverless hosts so
 * concurrent sheet/import workloads do not exhaust DB connections. Monitor Disk IO / compute in
 * the Supabase dashboard; run `VACUUM ANALYZE` on high-churn `*_rows` tables from the SQL editor
 * if autovacuum falls behind.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // The `set` method was called from a Server Component.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // The `remove` method was called from a Server Component.
          }
        },
      },
    }
  )
}
