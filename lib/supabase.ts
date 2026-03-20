import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export function getBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function getServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll called from a Server Component — cookies cannot be set.
            // This is safe to ignore if you have middleware refreshing sessions.
          }
        },
      },
    }
  )
}

// Service role client — server-side only. Never import this in client components.
// Used by cron jobs and admin mutation routes that need to bypass RLS.
// Lazy singleton so it is not instantiated at build time (when env vars aren't set).
let _serviceRoleClient: ReturnType<typeof createClient> | null = null;
export function getServiceClient() {
  if (!_serviceRoleClient) {
    _serviceRoleClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }
  return _serviceRoleClient;
}
// Keep backward-compatible export used by some routes
// Cast to `any` to avoid Supabase generic inference issues when no DB type param is provided.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const serviceRoleClient = new Proxy({} as any, {
  get(_target, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getServiceClient() as any)[prop];
  },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;
