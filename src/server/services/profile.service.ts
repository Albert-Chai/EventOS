import { AppError } from "@/lib/api/errors";
import type { AuthenticatedContext } from "@/server/context";
import {
  findProfileById,
  updateProfile,
  upsertProfile,
} from "@/server/db/repositories/profiles.repository";
import type { Profile } from "@/server/db/schema";

/**
 * Service layer — business logic. Never imports `db` directly; goes through
 * repositories (spec §10.2: "business logic must not be embedded directly
 * inside UI components", and the same applies in reverse to data access).
 */

/**
 * Returns the signed-in user's profile, healing the row if the auth trigger
 * did not fire (users created before the migration, or via the Supabase
 * dashboard).
 */
export async function getOrCreateProfile(ctx: AuthenticatedContext): Promise<Profile> {
  const existing = await findProfileById(ctx.user.id);
  if (existing) return existing;

  ctx.log.warn("profile.missing_backfilled", { userId: ctx.user.id });

  return upsertProfile({
    id: ctx.user.id,
    email: ctx.user.email,
  });
}

export async function updateOwnProfile(
  ctx: AuthenticatedContext,
  patch: { displayName?: string | null; locale?: string },
): Promise<Profile> {
  const updated = await updateProfile(ctx.user.id, patch);
  if (!updated) {
    throw new AppError("NOT_FOUND", { message: "Profile not found." });
  }

  ctx.log.info("profile.updated", { userId: ctx.user.id });
  return updated;
}
