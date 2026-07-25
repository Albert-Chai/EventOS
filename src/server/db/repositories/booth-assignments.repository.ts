import { and, eq, ne } from "drizzle-orm";

import { db } from "@/server/db";
import {
  boothAssignments,
  booths,
  zones,
  type BoothAssignment,
  type NewBoothAssignment,
} from "@/server/db/schema";

/**
 * Booth assignments — the link between a booth and a merchant's participation
 * (spec §12). The organizer creates and cancels them (tenant-scoped); the
 * merchant confirms their own (membership-scoped). One active assignment per
 * booth / per participation is enforced by partial unique indexes in 0009, so
 * the "active" lookups below return at most one row.
 */

// --- Organizer (tenant-scoped) --------------------------------------------

export async function findAssignmentById(
  tenantId: string,
  id: string,
): Promise<BoothAssignment | null> {
  const [row] = await db
    .select()
    .from(boothAssignments)
    .where(and(eq(boothAssignments.id, id), eq(boothAssignments.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

export async function findActiveAssignmentForBooth(
  tenantId: string,
  boothId: string,
): Promise<BoothAssignment | null> {
  const [row] = await db
    .select()
    .from(boothAssignments)
    .where(
      and(
        eq(boothAssignments.tenantId, tenantId),
        eq(boothAssignments.boothId, boothId),
        ne(boothAssignments.status, "cancelled"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findActiveAssignmentForParticipation(
  tenantId: string,
  participationId: string,
): Promise<BoothAssignment | null> {
  const [row] = await db
    .select()
    .from(boothAssignments)
    .where(
      and(
        eq(boothAssignments.tenantId, tenantId),
        eq(boothAssignments.participationId, participationId),
        ne(boothAssignments.status, "cancelled"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertAssignment(input: NewBoothAssignment): Promise<BoothAssignment> {
  const [row] = await db.insert(boothAssignments).values(input).returning();
  return row;
}

export async function updateAssignment(
  tenantId: string,
  id: string,
  patch: Partial<Pick<BoothAssignment, "status" | "confirmedAt" | "note">>,
): Promise<BoothAssignment | null> {
  const [row] = await db
    .update(boothAssignments)
    .set(patch)
    .where(and(eq(boothAssignments.id, id), eq(boothAssignments.tenantId, tenantId)))
    .returning();
  return row ?? null;
}

// --- Assigned-booth detail (shared shape for portal + review) -------------

export type AssignedBooth = {
  assignmentId: string;
  assignmentStatus: string;
  confirmedAt: Date | null;
  note: string | null;
  boothId: string;
  boothNumber: string;
  boothName: string | null;
  boothStatus: string;
  zoneName: string | null;
  zoneColor: string | null;
};

function assignedBoothColumns() {
  return {
    assignmentId: boothAssignments.id,
    assignmentStatus: boothAssignments.status,
    confirmedAt: boothAssignments.confirmedAt,
    note: boothAssignments.note,
    boothId: booths.id,
    boothNumber: booths.boothNumber,
    boothName: booths.name,
    boothStatus: booths.status,
    zoneName: zones.name,
    zoneColor: zones.color,
  };
}

/** The active assigned booth for a participation, scoped to the tenant. */
export async function findAssignedBoothForParticipation(
  tenantId: string,
  participationId: string,
): Promise<AssignedBooth | null> {
  const [row] = await db
    .select(assignedBoothColumns())
    .from(boothAssignments)
    .innerJoin(booths, eq(booths.id, boothAssignments.boothId))
    .leftJoin(zones, eq(zones.id, booths.zoneId))
    .where(
      and(
        eq(boothAssignments.tenantId, tenantId),
        eq(boothAssignments.participationId, participationId),
        ne(boothAssignments.status, "cancelled"),
      ),
    )
    .limit(1);
  return row ?? null;
}

// --- Merchant (membership-scoped) -----------------------------------------

/** One assignment, scoped to the merchant that owns it — the merchant seam. */
export async function findAssignmentForMerchant(
  merchantId: string,
  id: string,
): Promise<BoothAssignment | null> {
  const [row] = await db
    .select()
    .from(boothAssignments)
    .where(and(eq(boothAssignments.id, id), eq(boothAssignments.merchantId, merchantId)))
    .limit(1);
  return row ?? null;
}

/** The active assigned booth for one of the merchant's participations. */
export async function findAssignedBoothForMerchantParticipation(
  merchantId: string,
  participationId: string,
): Promise<AssignedBooth | null> {
  const [row] = await db
    .select(assignedBoothColumns())
    .from(boothAssignments)
    .innerJoin(booths, eq(booths.id, boothAssignments.boothId))
    .leftJoin(zones, eq(zones.id, booths.zoneId))
    .where(
      and(
        eq(boothAssignments.merchantId, merchantId),
        eq(boothAssignments.participationId, participationId),
        ne(boothAssignments.status, "cancelled"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function updateAssignmentForMerchant(
  merchantId: string,
  id: string,
  patch: Partial<Pick<BoothAssignment, "status" | "confirmedAt">>,
): Promise<BoothAssignment | null> {
  const [row] = await db
    .update(boothAssignments)
    .set(patch)
    .where(and(eq(boothAssignments.id, id), eq(boothAssignments.merchantId, merchantId)))
    .returning();
  return row ?? null;
}
