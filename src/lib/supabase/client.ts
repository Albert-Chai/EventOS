import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/config/env";

/**
 * Browser Supabase client.
 *
 * Used for auth flows only (OAuth redirect kick-off, password recovery
 * completion). It must NEVER be used to read application data — with RLS
 * disabled by design (see CLAUDE.md), the database trusts the application
 * layer, so all data access goes through server-side repositories.
 */
export function createClient() {
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
