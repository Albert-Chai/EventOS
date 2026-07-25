import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { events } from "./events";
import { tenants } from "./tenants";

/**
 * A zone within an event (spec §8.6) — a named, coloured grouping of booths
 * ("Food Court", "Hall A"). Tenant-scoped and event-scoped; a visitor filters
 * the map by zone. `color` is a hex string used on the map + legend.
 */
export const zones = pgTable(
  "zones",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color"),
    displayOrder: integer("display_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("zones_tenant_idx").on(table.tenantId),
    index("zones_event_idx").on(table.eventId),
  ],
);

export type Zone = typeof zones.$inferSelect;
export type NewZone = typeof zones.$inferInsert;
