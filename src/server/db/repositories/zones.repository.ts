import { and, asc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { zones, type NewZone, type Zone } from "@/server/db/schema";

/**
 * Zones — a named grouping of booths within an event (spec §8.6). Organizer
 * reads are tenant-scoped; the public map reads by resolved event id (the caller
 * has already checked event visibility, like `listPublicParticipations`).
 */

// --- Organizer (tenant-scoped) --------------------------------------------

export async function listZonesForEvent(tenantId: string, eventId: string): Promise<Zone[]> {
  return db
    .select()
    .from(zones)
    .where(and(eq(zones.tenantId, tenantId), eq(zones.eventId, eventId)))
    .orderBy(asc(zones.displayOrder), asc(zones.name));
}

export async function findZoneById(tenantId: string, id: string): Promise<Zone | null> {
  const [row] = await db
    .select()
    .from(zones)
    .where(and(eq(zones.id, id), eq(zones.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

export async function insertZone(input: NewZone): Promise<Zone> {
  const [row] = await db.insert(zones).values(input).returning();
  return row;
}

export async function updateZone(
  tenantId: string,
  id: string,
  patch: Partial<Pick<Zone, "name" | "description" | "color" | "displayOrder">>,
): Promise<Zone | null> {
  const [row] = await db
    .update(zones)
    .set(patch)
    .where(and(eq(zones.id, id), eq(zones.tenantId, tenantId)))
    .returning();
  return row ?? null;
}

export async function deleteZone(tenantId: string, id: string): Promise<Zone | null> {
  const [row] = await db
    .delete(zones)
    .where(and(eq(zones.id, id), eq(zones.tenantId, tenantId)))
    .returning();
  return row ?? null;
}

// --- Public (anonymous visitor) -------------------------------------------

/** Zones for the public map. Event visibility is enforced by the caller. */
export async function listZonesForEventPublic(eventId: string): Promise<Zone[]> {
  return db
    .select()
    .from(zones)
    .where(eq(zones.eventId, eventId))
    .orderBy(asc(zones.displayOrder), asc(zones.name));
}
