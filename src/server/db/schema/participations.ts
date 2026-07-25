import { index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import type { ParticipationStatus } from "../../merchants/status";
import { primaryId, timestamps } from "./_shared";
import { events } from "./events";
import { merchants } from "./merchants";
import { tenants } from "./tenants";

/**
 * A merchant's participation in one event (spec §8.4) — the unit the approval
 * workflow runs on. One row per (event, merchant). Carries the listing's title
 * and description; the products hang off it as `listing_items`.
 *
 * The single `approval_status` (see `src/server/merchants/status.ts`) is the
 * whole lifecycle, `withdrawn` included — the spec's separate `participation_status`
 * is folded in to avoid two overlapping state columns (see plan §7). `featured_rank`
 * is reserved for Phase 6. `reviewed_by → auth.users` is a hand-written FK.
 */
export const merchantEventParticipations = pgTable(
  "merchant_event_participations",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    listingTitle: text("listing_title"),
    listingDescription: text("listing_description"),
    approvalStatus: text("approval_status").notNull().default("draft").$type<ParticipationStatus>(),
    featuredRank: integer("featured_rank"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by"),
    reviewNote: text("review_note"),
    ...timestamps,
  },
  (table) => [
    unique("merchant_event_participations_event_merchant_uq").on(table.eventId, table.merchantId),
    index("merchant_event_participations_tenant_idx").on(table.tenantId),
    index("merchant_event_participations_event_idx").on(table.eventId),
    index("merchant_event_participations_merchant_idx").on(table.merchantId),
  ],
);

export type MerchantEventParticipation = typeof merchantEventParticipations.$inferSelect;
export type NewMerchantEventParticipation = typeof merchantEventParticipations.$inferInsert;
