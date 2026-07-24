import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { env } from "@/config/env";

/**
 * Server-side Supabase client bound to the request's cookie jar.
 *
 * Sessions are stored in HTTP-only cookies (spec §8.1) which this adapter reads
 * and refreshes. Call this per request — never cache the returned client, since
 * it closes over one request's cookies.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. The middleware refreshes the
            // session on every request, so this is safe to swallow here.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Bypasses RLS and every user-facing guard.
 *
 * Restricted to administrative work that has no user session: the seed script
 * and, later, platform-admin operations. Never call this from a route that
 * serves visitor or organizer traffic.
 */
export function createServiceRoleClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
