import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  featuredPlacements,
  type FeaturedPlacement,
  type NewFeaturedPlacement,
} from "@/server/db/schema";

/**
 * Featured placements (spec §8.7). A placement with a null `ends_at` is "open"
 * (currently featured) — the partial unique index guarantees at most one per
 * participation. Unfeaturing sets `ends_at` rather than deleting, so the history
 * is kept. Everything is tenant-scoped.
 */

export async function insertPlacement(input: NewFeaturedPlacement): Promise<FeaturedPlacement> {
  const [row] = await db.insert(featuredPlacements).values(input).returning();
  return row;
}

export async function findOpenPlacement(
  tenantId: string,
  participationId: string,
): Promise<FeaturedPlacement | null> {
  const [row] = await db
    .select()
    .from(featuredPlacements)
    .where(
      and(
        eq(featuredPlacements.tenantId, tenantId),
        eq(featuredPlacements.participationId, participationId),
        isNull(featuredPlacements.endsAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Closes any open placement for a participation (sets `ends_at`). */
export async function closeOpenPlacements(
  tenantId: string,
  participationId: string,
  endsAt: Date,
): Promise<boolean> {
  const rows = await db
    .update(featuredPlacements)
    .set({ endsAt })
    .where(
      and(
        eq(featuredPlacements.tenantId, tenantId),
        eq(featuredPlacements.participationId, participationId),
        isNull(featuredPlacements.endsAt),
      ),
    )
    .returning({ id: featuredPlacements.id });
  return rows.length > 0;
}

/** Participation ids currently featured in an event — for badges and the boost. */
export async function listOpenParticipationIdsForEvent(eventId: string): Promise<string[]> {
  const rows = await db
    .select({ id: featuredPlacements.participationId })
    .from(featuredPlacements)
    .where(and(eq(featuredPlacements.eventId, eventId), isNull(featuredPlacements.endsAt)));
  return rows.map((r) => r.id);
}
