import { index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId } from "./_shared";
import { events } from "./events";
import { merchants } from "./merchants";
import { merchantEventParticipations } from "./participations";
import { tenants } from "./tenants";
import { visitors } from "./visitors";

/**
 * A visitor's saved merchant (spec §8.8 "Favourite merchants"). Append/delete
 * only — one row per (visitor, participation). Carries `tenant_id` + `event_id`
 * (derived from the public URL, never a client value) so reads scope to the event
 * and future analytics aggregate per tenant. Cascades on both visitor and event
 * delete.
 */
export const visitorFavourites = pgTable(
  "visitor_favourites",
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("visitor_favourites_visitor_participation_uq").on(
      table.visitorId,
      table.participationId,
    ),
    index("visitor_favourites_visitor_event_idx").on(table.visitorId, table.eventId),
    index("visitor_favourites_tenant_idx").on(table.tenantId),
    index("visitor_favourites_participation_idx").on(table.participationId),
  ],
);

export type VisitorFavourite = typeof visitorFavourites.$inferSelect;
export type NewVisitorFavourite = typeof visitorFavourites.$inferInsert;
