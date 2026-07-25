import { boolean, date, index, pgTable, text, time, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { events } from "./events";
import { tenants } from "./tenants";

/**
 * Per-date operating hours (spec §8.3: "Daily opening hours"). A 1:many child of
 * `events` — one row per calendar date the event runs. Modelled per-date rather
 * than per-weekday because festivals run specific dates, and a date may be marked
 * closed (a dark day mid-run) without deleting the row.
 *
 * `date`/`time` are stored as SQL `date`/`time` (returned as strings) so there is
 * no timezone ambiguity — the event's own `timezone` column is the reference.
 */
export const eventOperatingHours = pgTable(
  "event_operating_hours",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),

    date: date("date").notNull(),
    opensAt: time("opens_at"),
    closesAt: time("closes_at"),
    isClosed: boolean("is_closed").notNull().default(false),
    note: text("note"),

    ...timestamps,
  },
  (table) => [
    unique("event_operating_hours_event_date_uq").on(table.eventId, table.date),
    index("event_operating_hours_tenant_idx").on(table.tenantId),
    index("event_operating_hours_event_idx").on(table.eventId),
  ],
);

export type EventOperatingHours = typeof eventOperatingHours.$inferSelect;
export type NewEventOperatingHours = typeof eventOperatingHours.$inferInsert;
