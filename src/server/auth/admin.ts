import { createServiceRoleClient } from "./supabase";

/**
 * Thin helpers over the Supabase Admin API for the few places that must resolve
 * an email to a user id or provision a user — tenant creation and invitation
 * acceptance. Uses the service-role client, so callers MUST already be behind a
 * platform-admin or tenant-permission gate.
 */

export type AdminUserLookup = { id: string; email: string } | null;

/** Finds an existing auth user by email, or null. Case-insensitive. */
export async function findAuthUserByEmail(email: string): Promise<AdminUserLookup> {
  const supabase = createServiceRoleClient();
  const target = email.toLowerCase();

  // The admin API has no direct get-by-email, so page until found. Tenants are
  // small in Phase 1; if this ever gets hot, back it with a profiles lookup.
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match?.email) return { id: match.id, email: match.email };

    if (data.users.length < perPage) return null;
    page += 1;
    if (page > 50) return null; // hard stop; ~10k users
  }
}
