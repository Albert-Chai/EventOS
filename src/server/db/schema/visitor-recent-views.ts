import { index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { events } from "./events";
import { merchants } from "./merchants";
import { merchantEventParticipations } from "./participations";
import { tenants } from "./tenants";
import { visitors } from "./visitors";

/**
 * A visitor's recently-viewed merchants (spec §8.8). One row per (visitor,
 * participation); `viewed_at` is bumped on a re-view (upsert), so a merchant
 * moves to the top of the list rather than duplicating. Carries `tenant_id` +
 * `event_id` (from the public URL) and cascades on visitor and event delete.
 */
export const visitorRecentViews = pgTable(
  "visitor_recent_views",
  {
    id: primaryId(),
    visitorId: uuid("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
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
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    unique("visitor_recent_views_visitor_participation_uq").on(
      table.visitorId,
      table.participationId,
    ),
    index("visitor_recent_views_visitor_event_idx").on(table.visitorId, table.eventId),
    index("visitor_recent_views_tenant_idx").on(table.tenantId),
  ],
);

export type VisitorRecentView = typeof visitorRecentViews.$inferSelect;
export type NewVisitorRecentView = typeof visitorRecentViews.$inferInsert;
