import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { visitors, type NewVisitor, type Visitor } from "@/server/db/schema";

/**
 * Visitors — anonymous, cookie-backed identities (spec §8.8). Keyed on an opaque
 * `anonymous_id`; not tenant-scoped. Written only by the visitor service.
 */

export async function findVisitorByAnonymousId(anonymousId: string): Promise<Visitor | null> {
  const [row] = await db
    .select()
    .from(visitors)
    .where(eq(visitors.anonymousId, anonymousId))
    .limit(1);
  return row ?? null;
}

export async function insertVisitor(input: NewVisitor): Promise<Visitor> {
  const [row] = await db
    .insert(visitors)
    .values(input)
    // A racing double-insert on the same cookie resolves to the existing row.
    .onConflictDoUpdate({
      target: visitors.anonymousId,
      set: { lastActiveAt: new Date() },
    })
    .returning();
  return row;
}

export async function touchVisitorLastActive(id: string): Promise<void> {
  await db.update(visitors).set({ lastActiveAt: new Date() }).where(eq(visitors.id, id));
}

/**
 * The account-linked visitor row (Phase 10). Keyed on the authenticated user's
 * id, which is what makes a visitor account portable across devices — a second
 * browser has a different `anonymous_id` but resolves to the same visitor.
 *
 * A user-scoped query, like `listMembershipsForUser`: the caller derives
 * `userId` from the session, never from a client value.
 */
export async function findVisitorByUserId(userId: string): Promise<Visitor | null> {
  const [row] = await db.select().from(visitors).where(eq(visitors.userId, userId)).limit(1);
  return row ?? null;
}

/**
 * Claims an existing (anonymous) visitor row for an account, so someone who
 * favourited a few stalls before signing up keeps them.
 *
 * `visitors_user_id_uq` (partial unique, 0021) is what guarantees one row per
 * account under a race; this returns null if the row was claimed meanwhile so
 * the caller can re-resolve rather than fail.
 */
export async function linkVisitorToUser(
  visitorId: string,
  patch: { userId: string; displayName?: string | null; email?: string | null },
): Promise<Visitor | null> {
  const [row] = await db
    .update(visitors)
    .set({
      userId: patch.userId,
      displayName: patch.displayName ?? null,
      email: patch.email ?? null,
      lastActiveAt: new Date(),
    })
    .where(and(eq(visitors.id, visitorId), isNull(visitors.userId)))
    .returning();
  return row ?? null;
}
