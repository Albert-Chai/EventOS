import { and, asc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  eventBranding,
  eventOperatingHours,
  eventSettings,
  type EventBranding,
  type EventOperatingHours,
  type EventSettings,
  type NewEventOperatingHours,
} from "@/server/db/schema";

/**
 * The event satellites: settings (1:1), branding (1:1), operating hours (1:many).
 *
 * Every read and write is scoped by `tenant_id` as well as `event_id`, even
 * though `event_id` alone is unique — belt and braces, so a mismatched tenant can
 * never touch another tenant's satellite rows (spec §5). The caller derives
 * `tenantId` from `ctx.tenant.id`.
 */

// --- Settings --------------------------------------------------------------

export async function getEventSettings(
  tenantId: string,
  eventId: string,
): Promise<EventSettings | null> {
  const [row] = await db
    .select()
    .from(eventSettings)
    .where(and(eq(eventSettings.eventId, eventId), eq(eventSettings.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

export async function updateEventSettings(
  tenantId: string,
  eventId: string,
  patch: Partial<Omit<EventSettings, "id" | "tenantId" | "eventId" | "createdAt" | "updatedAt">>,
): Promise<EventSettings | null> {
  const [row] = await db
    .update(eventSettings)
    .set(patch)
    .where(and(eq(eventSettings.eventId, eventId), eq(eventSettings.tenantId, tenantId)))
    .returning();
  return row ?? null;
}

// --- Branding --------------------------------------------------------------

export async function getEventBranding(
  tenantId: string,
  eventId: string,
): Promise<EventBranding | null> {
  const [row] = await db
    .select()
    .from(eventBranding)
    .where(and(eq(eventBranding.eventId, eventId), eq(eventBranding.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

export async function updateEventBranding(
  tenantId: string,
  eventId: string,
  patch: Partial<Omit<EventBranding, "id" | "tenantId" | "eventId" | "createdAt" | "updatedAt">>,
): Promise<EventBranding | null> {
  const [row] = await db
    .update(eventBranding)
    .set(patch)
    .where(and(eq(eventBranding.eventId, eventId), eq(eventBranding.tenantId, tenantId)))
    .returning();
  return row ?? null;
}

// --- Operating hours -------------------------------------------------------

export async function listEventOperatingHours(
  tenantId: string,
  eventId: string,
): Promise<EventOperatingHours[]> {
  return db
    .select()
    .from(eventOperatingHours)
    .where(
      and(eq(eventOperatingHours.eventId, eventId), eq(eventOperatingHours.tenantId, tenantId)),
    )
    .orderBy(asc(eventOperatingHours.date));
}

export type OperatingHourInput = {
  date: string;
  opensAt: string | null;
  closesAt: string | null;
  isClosed: boolean;
  note: string | null;
};

/**
 * Replaces the full set of operating-hour rows for an event in one transaction
 * (delete-all + insert). Simpler and less error-prone than diffing, and the row
 * count is tiny (one per event day).
 */
export async function replaceEventOperatingHours(
  tenantId: string,
  eventId: string,
  rows: OperatingHourInput[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(eventOperatingHours)
      .where(
        and(eq(eventOperatingHours.eventId, eventId), eq(eventOperatingHours.tenantId, tenantId)),
      );

    if (rows.length > 0) {
      const values: NewEventOperatingHours[] = rows.map((r) => ({
        tenantId,
        eventId,
        date: r.date,
        opensAt: r.opensAt,
        closesAt: r.closesAt,
        isClosed: r.isClosed,
        note: r.note,
      }));
      await tx.insert(eventOperatingHours).values(values);
    }
  });
}
