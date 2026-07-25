import { doublePrecision, index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import type { BoothStatus } from "../../booths/status";
import { primaryId, timestamps } from "./_shared";
import { events } from "./events";
import { mapFloors } from "./maps";
import { tenants } from "./tenants";
import { zones } from "./zones";

/**
 * A booth (spec §8.6) — a physical slot on the floor plan. Belongs to an event,
 * optionally to a zone and a map floor. `x`/`y`/`width`/`height` are normalized
 * **0..1** to the floor image so a booth renders at any display size; `rotation`
 * is in degrees.
 *
 * `status` is a `text` union driven by the machine in `src/server/booths/status.ts`
 * and is kept in step with the active `booth_assignment`. Case-insensitive
 * booth-number uniqueness *within an event* is a partial expression index in the
 * hand-written migration.
 */
export const booths = pgTable(
  "booths",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    zoneId: uuid("zone_id").references(() => zones.id, { onDelete: "set null" }),
    mapFloorId: uuid("map_floor_id").references(() => mapFloors.id, { onDelete: "set null" }),
    boothNumber: text("booth_number").notNull(),
    name: text("name"),
    x: doublePrecision("x").notNull().default(0.5),
    y: doublePrecision("y").notNull().default(0.5),
    width: doublePrecision("width").notNull().default(0.06),
    height: doublePrecision("height").notNull().default(0.06),
    rotation: doublePrecision("rotation").notNull().default(0),
    status: text("status").notNull().default("available").$type<BoothStatus>(),
    ...timestamps,
  },
  (table) => [
    index("booths_tenant_idx").on(table.tenantId),
    index("booths_event_idx").on(table.eventId),
    index("booths_zone_idx").on(table.zoneId),
    index("booths_floor_idx").on(table.mapFloorId),
  ],
);

export type Booth = typeof booths.$inferSelect;
export type NewBooth = typeof booths.$inferInsert;
