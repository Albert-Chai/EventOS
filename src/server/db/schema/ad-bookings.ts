import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { events } from "./events";
import { files } from "./files";
import { sponsors } from "./sponsors";
import { tenants } from "./tenants";
import type { AdBookingStatus, AdSlot } from "../../ads/slots";

/**
 * One ad **flight**: this sponsor, in this slot, on this event, between these
 * dates (docs/phase-9-sponsor-ads-plan.md).
 *
 * Liveness is never a stored flag — it's `status = 'active'` **and** `now`
 * inside the window, computed identically by `isBookingLive()` in code and by
 * the predicate in `ad-bookings.repository.ts` (the same `pure ↔ SQL` split as
 * `eventPhase ↔ phaseExpr`). A null bound is open-ended on that side.
 *
 * Deliberately **no impression/click counters**: Phase 7's rule holds — the
 * report reads live from `analytics_events`, so the numbers match the raw log
 * by construction rather than drifting from it.
 *
 * `weight` is the rotation weight when several live bookings share one slot.
 * `click_url` is validated as http(s) before storage (`isValidClickUrl`) and is
 * only ever reached through `/s/[id]`, so no raw sponsor URL is rendered into
 * the page. `created_by` gets its `auth.users` FK in the hand-written migration.
 */
export const adBookings = pgTable(
  "ad_bookings",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    sponsorId: uuid("sponsor_id")
      .notNull()
      .references(() => sponsors.id, { onDelete: "cascade" }),
    slot: text("slot").notNull().$type<AdSlot>(),
    creativeFileId: uuid("creative_file_id").references(() => files.id, { onDelete: "set null" }),
    altText: text("alt_text"),
    clickUrl: text("click_url"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    weight: integer("weight").notNull().default(1),
    status: text("status").notNull().default("draft").$type<AdBookingStatus>(),
    createdBy: uuid("created_by"),
    ...timestamps,
  },
  (table) => [
    index("ad_bookings_tenant_idx").on(table.tenantId),
    index("ad_bookings_sponsor_idx").on(table.sponsorId),
    // The serving query: every live booking for one event + slot.
    index("ad_bookings_event_slot_idx").on(table.eventId, table.slot, table.status),
  ],
);

export type AdBooking = typeof adBookings.$inferSelect;
export type NewAdBooking = typeof adBookings.$inferInsert;
