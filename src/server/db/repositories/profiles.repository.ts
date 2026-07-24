import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { profiles, type NewProfile, type Profile } from "@/server/db/schema";

/**
 * Repository layer — the ONLY place that imports `db`.
 *
 * Isolation contract (spec §5, and the reason this layer exists):
 * once tenant-scoped tables arrive in Phase 1, every function here takes an
 * `AuthenticatedContext` and derives `tenant_id` from it. No function ever
 * accepts a caller-supplied tenant id, and no query omits the tenant predicate.
 *
 * `profiles` is user-scoped rather than tenant-scoped — a user can belong to
 * several tenants — so Phase 0's functions key on the authenticated user id.
 */

export async function findProfileById(userId: string): Promise<Profile | null> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  return profile ?? null;
}

export async function findProfileByEmail(email: string): Promise<Profile | null> {
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.email, email.toLowerCase()))
    .limit(1);
  return profile ?? null;
}

/**
 * Idempotent upsert. The `on_auth_user_created` trigger normally creates the
 * row; this covers users that predate the trigger and keeps the seed script
 * re-runnable.
 */
export async function upsertProfile(input: NewProfile): Promise<Profile> {
  const [profile] = await db
    .insert(profiles)
    .values({ ...input, email: input.email.toLowerCase() })
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        email: input.email.toLowerCase(),
        displayName: input.displayName ?? null,
        avatarUrl: input.avatarUrl ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return profile;
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<Profile, "displayName" | "avatarUrl" | "locale">>,
): Promise<Profile | null> {
  const [profile] = await db
    .update(profiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(profiles.id, userId))
    .returning();

  return profile ?? null;
}
