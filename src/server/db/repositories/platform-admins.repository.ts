import { count, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { platformAdmins, profiles, type PlatformAdmin } from "@/server/db/schema";

/**
 * Platform super-admins (spec §4.1). User-scoped, not tenant-scoped.
 */

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: platformAdmins.userId })
    .from(platformAdmins)
    .where(eq(platformAdmins.userId, userId))
    .limit(1);
  return Boolean(row);
}

export type PlatformAdminWithEmail = PlatformAdmin & { email: string | null };

export async function listPlatformAdmins(): Promise<PlatformAdminWithEmail[]> {
  return db
    .select({
      userId: platformAdmins.userId,
      grantedBy: platformAdmins.grantedBy,
      grantedAt: platformAdmins.grantedAt,
      note: platformAdmins.note,
      createdAt: platformAdmins.createdAt,
      updatedAt: platformAdmins.updatedAt,
      email: profiles.email,
    })
    .from(platformAdmins)
    .leftJoin(profiles, eq(profiles.id, platformAdmins.userId))
    .orderBy(platformAdmins.grantedAt);
}

export async function grantPlatformAdmin(input: {
  userId: string;
  grantedBy: string;
  note?: string;
}): Promise<void> {
  await db
    .insert(platformAdmins)
    .values({ userId: input.userId, grantedBy: input.grantedBy, note: input.note ?? null })
    .onConflictDoNothing({ target: platformAdmins.userId });
}

export async function revokePlatformAdmin(userId: string): Promise<void> {
  await db.delete(platformAdmins).where(eq(platformAdmins.userId, userId));
}

export async function countPlatformAdmins(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(platformAdmins);
  return row?.value ?? 0;
}
