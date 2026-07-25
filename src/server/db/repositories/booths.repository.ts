import { and, asc, eq, ne, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  boothAssignments,
  booths,
  merchantEventParticipations,
  merchants,
  zones,
  type Booth,
  type NewBooth,
} from "@/server/db/schema";

/**
 * Booths — physical slots on the floor plan (spec §8.6). Organizer reads are
 * tenant-scoped and join the active assignment (the merchant currently in the
 * booth); the public map read links a booth to a merchant only when the
 * assignment is active AND the participation is approved AND the merchant is
 * active — the same "filter by public status" seam as Phase 2/3.
 */

// --- Organizer (tenant-scoped) --------------------------------------------

export type BoothWithAssignment = Booth & {
  zoneName: string | null;
  zoneColor: string | null;
  assignmentId: string | null;
  assignmentStatus: string | null;
  merchantId: string | null;
  merchantName: string | null;
  participationId: string | null;
  approvalStatus: string | null;
};

/** Every booth in an event, with its zone and current (active) assignment. */
export async function listBoothsForEvent(
  tenantId: string,
  eventId: string,
): Promise<BoothWithAssignment[]> {
  return db
    .select({
      id: booths.id,
      tenantId: booths.tenantId,
      eventId: booths.eventId,
      zoneId: booths.zoneId,
      mapFloorId: booths.mapFloorId,
      boothNumber: booths.boothNumber,
      name: booths.name,
      x: booths.x,
      y: booths.y,
      width: booths.width,
      height: booths.height,
      rotation: booths.rotation,
      status: booths.status,
      createdAt: booths.createdAt,
      updatedAt: booths.updatedAt,
      zoneName: zones.name,
      zoneColor: zones.color,
      assignmentId: boothAssignments.id,
      assignmentStatus: boothAssignments.status,
      merchantId: boothAssignments.merchantId,
      merchantName: merchants.name,
      participationId: boothAssignments.participationId,
      approvalStatus: merchantEventParticipations.approvalStatus,
    })
    .from(booths)
    .leftJoin(zones, eq(zones.id, booths.zoneId))
    .leftJoin(
      boothAssignments,
      and(eq(boothAssignments.boothId, booths.id), ne(boothAssignments.status, "cancelled")),
    )
    .leftJoin(merchants, eq(merchants.id, boothAssignments.merchantId))
    .leftJoin(
      merchantEventParticipations,
      eq(merchantEventParticipations.id, boothAssignments.participationId),
    )
    .where(and(eq(booths.tenantId, tenantId), eq(booths.eventId, eventId)))
    .orderBy(asc(booths.boothNumber));
}

/** Case-insensitive booth-number check within an event (mirrors the 0009 index). */
export async function boothNumberExists(
  tenantId: string,
  eventId: string,
  boothNumber: string,
  excludeId?: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: booths.id })
    .from(booths)
    .where(
      and(
        eq(booths.tenantId, tenantId),
        eq(booths.eventId, eventId),
        eq(sql`lower(${booths.boothNumber})`, boothNumber.toLowerCase()),
        excludeId ? ne(booths.id, excludeId) : undefined,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function findBoothById(tenantId: string, id: string): Promise<Booth | null> {
  const [row] = await db
    .select()
    .from(booths)
    .where(and(eq(booths.id, id), eq(booths.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

export async function insertBooth(input: NewBooth): Promise<Booth> {
  const [row] = await db.insert(booths).values(input).returning();
  return row;
}

export async function updateBooth(
  tenantId: string,
  id: string,
  patch: Partial<
    Pick<
      Booth,
      | "boothNumber"
      | "name"
      | "zoneId"
      | "mapFloorId"
      | "x"
      | "y"
      | "width"
      | "height"
      | "rotation"
      | "status"
    >
  >,
): Promise<Booth | null> {
  const [row] = await db
    .update(booths)
    .set(patch)
    .where(and(eq(booths.id, id), eq(booths.tenantId, tenantId)))
    .returning();
  return row ?? null;
}

export async function deleteBooth(tenantId: string, id: string): Promise<Booth | null> {
  const [row] = await db
    .delete(booths)
    .where(and(eq(booths.id, id), eq(booths.tenantId, tenantId)))
    .returning();
  return row ?? null;
}

/**
 * The booth number a merchant occupies for an event (public), for the "find on
 * map" deep-link. Only returns when the assignment is active and the listing is
 * approved — the same public seam as the map read.
 */
export async function findPublicBoothNumberForMerchant(
  eventId: string,
  merchantSlug: string,
): Promise<string | null> {
  const [row] = await db
    .select({ boothNumber: booths.boothNumber })
    .from(booths)
    .innerJoin(
      boothAssignments,
      and(eq(boothAssignments.boothId, booths.id), ne(boothAssignments.status, "cancelled")),
    )
    .innerJoin(
      merchantEventParticipations,
      and(
        eq(merchantEventParticipations.id, boothAssignments.participationId),
        eq(merchantEventParticipations.approvalStatus, "approved"),
      ),
    )
    .innerJoin(
      merchants,
      and(
        eq(merchants.id, boothAssignments.merchantId),
        eq(sql`lower(${merchants.slug})`, merchantSlug.toLowerCase()),
        eq(merchants.status, "active"),
      ),
    )
    .where(eq(booths.eventId, eventId))
    .limit(1);
  return row?.boothNumber ?? null;
}

/** Whether an event has any booths — cheap check for showing the public map link. */
export async function eventHasBooths(eventId: string): Promise<boolean> {
  const rows = await db
    .select({ id: booths.id })
    .from(booths)
    .where(eq(booths.eventId, eventId))
    .limit(1);
  return rows.length > 0;
}

/** Count for plan limits / dashboards (tenant-scoped). */
export async function countBoothsForEvent(tenantId: string, eventId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(booths)
    .where(and(eq(booths.tenantId, tenantId), eq(booths.eventId, eventId)));
  return row?.count ?? 0;
}

// --- Public (anonymous visitor) -------------------------------------------

export type PublicBooth = {
  id: string;
  boothNumber: string;
  name: string | null;
  zoneId: string | null;
  mapFloorId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  status: string;
  /** Set only when the booth links to a publicly-visible merchant. */
  merchantSlug: string | null;
  merchantName: string | null;
  listingTitle: string | null;
  merchantCategoryId: string | null;
};

/**
 * Booths for the public map. Joins the active assignment → participation →
 * merchant, but only exposes the merchant when the participation is `approved`
 * and the merchant is active. Otherwise the booth renders as an unlinked shape.
 */
export async function listBoothsForEventPublic(eventId: string): Promise<PublicBooth[]> {
  const rows = await db
    .select({
      id: booths.id,
      boothNumber: booths.boothNumber,
      name: booths.name,
      zoneId: booths.zoneId,
      mapFloorId: booths.mapFloorId,
      x: booths.x,
      y: booths.y,
      width: booths.width,
      height: booths.height,
      rotation: booths.rotation,
      status: booths.status,
      approvalStatus: merchantEventParticipations.approvalStatus,
      listingTitle: merchantEventParticipations.listingTitle,
      merchantSlug: merchants.slug,
      merchantName: merchants.name,
      merchantStatus: merchants.status,
      merchantDeletedAt: merchants.deletedAt,
      merchantCategoryId: merchants.categoryId,
    })
    .from(booths)
    .leftJoin(
      boothAssignments,
      and(eq(boothAssignments.boothId, booths.id), ne(boothAssignments.status, "cancelled")),
    )
    .leftJoin(
      merchantEventParticipations,
      eq(merchantEventParticipations.id, boothAssignments.participationId),
    )
    .leftJoin(merchants, eq(merchants.id, boothAssignments.merchantId))
    .where(eq(booths.eventId, eventId))
    .orderBy(asc(booths.boothNumber));

  return rows.map((r) => {
    const linkable =
      r.approvalStatus === "approved" &&
      r.merchantStatus === "active" &&
      r.merchantDeletedAt === null &&
      Boolean(r.merchantSlug);
    return {
      id: r.id,
      boothNumber: r.boothNumber,
      name: r.name,
      zoneId: r.zoneId,
      mapFloorId: r.mapFloorId,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      rotation: r.rotation,
      status: r.status,
      merchantSlug: linkable ? r.merchantSlug : null,
      merchantName: linkable ? r.merchantName : null,
      listingTitle: linkable ? r.listingTitle : null,
      merchantCategoryId: linkable ? r.merchantCategoryId : null,
    };
  });
}
