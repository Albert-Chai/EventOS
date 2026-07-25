import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { events } from "./events";
import { merchants } from "./merchants";
import { merchantEventParticipations } from "./participations";
import { tenants } from "./tenants";
import type { FeaturedPaymentStatus, FeaturedPlacementType } from "../../billing/plans";

/**
 * A featured merchant placement (spec §8.7). Tenant + event scoped. Granting a
 * placement is gated by the tenant's plan (`featured_listings` entitlement) and
 * audited. It also sets the participation's `featured_rank`, which the Phase 5
 * directory already orders by, so a featured merchant rises without changing that
 * query. `created_by` gets its `auth.users` FK in the hand-written migration; the
 * "one open placement per participation" partial unique index (`ends_at IS NULL`)
 * lives there too.
 */
export const featuredPlacements = pgTable(
  "featured_placements",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    participationId: uuid("participation_id")
      .notNull()
      .references(() => merchantEventParticipations.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    placementType: text("placement_type")
      .notNull()
      .default("homepage_featured")
      .$type<FeaturedPlacementType>(),
    rankPriority: integer("rank_priority").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    paymentStatus: text("payment_status")
      .notNull()
      .default("included")
      .$type<FeaturedPaymentStatus>(),
    notes: text("notes"),
    createdBy: uuid("created_by"),
    ...timestamps,
  },
  (table) => [
    index("featured_placements_event_idx").on(table.eventId),
    index("featured_placements_tenant_idx").on(table.tenantId),
    index("featured_placements_participation_idx").on(table.participationId),
  ],
);

export type FeaturedPlacement = typeof featuredPlacements.$inferSelect;
export type NewFeaturedPlacement = typeof featuredPlacements.$inferInsert;
