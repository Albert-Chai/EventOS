import { and, desc, eq, isNull, lte, gte, or, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  type AdBooking,
  adBookings,
  files,
  type NewAdBooking,
  sponsors,
} from "@/server/db/schema";
import type { AdSlot } from "@/server/ads/slots";

/**
 * Ad bookings (flights). Organiser-facing reads are tenant-scoped on a
 * `tenantId` derived from context (§1 rule 3). The one public read
 * (`listLiveBookingsForSlot`) is the §1 rule 6 shape: it filters by *servability*
 * — the caller has already resolved the event through `findPublicEvent`, so a
 * draft or private event never reaches here.
 */

/** A booking joined to what the visitor surface needs to render it. */
export type ServableAd = {
  id: string;
  sponsorId: string;
  sponsorName: string;
  slot: AdSlot;
  altText: string | null;
  clickUrl: string | null;
  weight: number;
  creativeBucket: string | null;
  creativePath: string | null;
};

/**
 * `status = 'active'` AND now inside the flight window (a null bound is
 * open-ended). This predicate is the SQL mirror of `isBookingLive()` — change
 * one and you must change the other.
 */
function livePredicate(now: Date) {
  return and(
    eq(adBookings.status, "active"),
    or(isNull(adBookings.startsAt), lte(adBookings.startsAt, now)),
    or(isNull(adBookings.endsAt), gte(adBookings.endsAt, now)),
  );
}

/** Public: every servable booking for one event + slot, with its creative. */
export async function listLiveBookingsForSlot(
  eventId: string,
  slot: AdSlot,
  now: Date,
): Promise<ServableAd[]> {
  const rows = await db
    .select({
      id: adBookings.id,
      sponsorId: adBookings.sponsorId,
      sponsorName: sponsors.name,
      slot: adBookings.slot,
      altText: adBookings.altText,
      clickUrl: adBookings.clickUrl,
      weight: adBookings.weight,
      creativeBucket: files.bucket,
      creativePath: files.path,
    })
    .from(adBookings)
    .innerJoin(sponsors, eq(sponsors.id, adBookings.sponsorId))
    .leftJoin(files, eq(files.id, adBookings.creativeFileId))
    .where(and(eq(adBookings.eventId, eventId), eq(adBookings.slot, slot), livePredicate(now)));

  return rows.map((r) => ({ ...r, slot: r.slot as AdSlot }));
}

/**
 * Public: one booking by id, for the click redirect and the impression beacon.
 * Returns the row's own `tenant_id`/`event_id` so the caller derives attribution
 * from the record, never from the request (the `/q` → `resolveScan` pattern).
 */
export async function findServableBookingById(
  id: string,
  now: Date,
): Promise<{
  id: string;
  tenantId: string;
  eventId: string;
  sponsorId: string;
  slot: AdSlot;
  clickUrl: string | null;
} | null> {
  const [row] = await db
    .select({
      id: adBookings.id,
      tenantId: adBookings.tenantId,
      eventId: adBookings.eventId,
      sponsorId: adBookings.sponsorId,
      slot: adBookings.slot,
      clickUrl: adBookings.clickUrl,
    })
    .from(adBookings)
    .where(and(eq(adBookings.id, id), livePredicate(now)))
    .limit(1);
  return row ? { ...row, slot: row.slot as AdSlot } : null;
}

// --- organiser-facing (tenant-scoped) --------------------------------------

export async function insertBooking(input: NewAdBooking): Promise<AdBooking> {
  const [row] = await db.insert(adBookings).values(input).returning();
  return row;
}

export type BookingWithSponsor = AdBooking & { sponsorName: string };

export async function listBookingsForEvent(
  tenantId: string,
  eventId: string,
): Promise<BookingWithSponsor[]> {
  const rows = await db
    .select({ booking: adBookings, sponsorName: sponsors.name })
    .from(adBookings)
    .innerJoin(sponsors, eq(sponsors.id, adBookings.sponsorId))
    .where(and(eq(adBookings.tenantId, tenantId), eq(adBookings.eventId, eventId)))
    .orderBy(desc(adBookings.createdAt));
  return rows.map((r) => ({ ...r.booking, sponsorName: r.sponsorName }));
}

export async function findBookingById(
  tenantId: string,
  id: string,
): Promise<AdBooking | null> {
  const [row] = await db
    .select()
    .from(adBookings)
    .where(and(eq(adBookings.tenantId, tenantId), eq(adBookings.id, id)))
    .limit(1);
  return row ?? null;
}

export async function updateBooking(
  tenantId: string,
  id: string,
  patch: Partial<NewAdBooking>,
): Promise<AdBooking | null> {
  const [row] = await db
    .update(adBookings)
    .set(patch)
    .where(and(eq(adBookings.tenantId, tenantId), eq(adBookings.id, id)))
    .returning();
  return row ?? null;
}

/** Active-booking count for an event — used for the plan/usage surface. */
export async function countActiveBookingsForEvent(
  tenantId: string,
  eventId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adBookings)
    .where(
      and(
        eq(adBookings.tenantId, tenantId),
        eq(adBookings.eventId, eventId),
        eq(adBookings.status, "active"),
      ),
    );
  return row?.n ?? 0;
}
