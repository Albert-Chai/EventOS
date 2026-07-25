import { eq } from "drizzle-orm";

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
