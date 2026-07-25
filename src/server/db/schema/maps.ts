import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { events } from "./events";
import { files } from "./files";
import { tenants } from "./tenants";

/**
 * Maps and their floors (spec §8.6, §12–13). A `map` is a named set of floor
 * plans for an event (e.g. a building); a `map_floor` is one floor with an
 * uploaded image that booths are plotted on. The spec supports multiple floors
 * and multiple images per event, so both tables exist.
 *
 * For MVP the organizer UI manages floors under one auto-created default map per
 * event; the multi-map-set surface is deferred (docs/phase-4-plan.md §8).
 */
export const maps = pgTable(
  "maps",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Event map"),
    description: text("description"),
    displayOrder: integer("display_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("maps_tenant_idx").on(table.tenantId),
    index("maps_event_idx").on(table.eventId),
  ],
);

export type EventMap = typeof maps.$inferSelect;
export type NewEventMap = typeof maps.$inferInsert;

/**
 * One floor of a map. `image_file_id → files` is the uploaded floor plan (the
 * media pass fills it). `image_width`/`image_height` are the natural pixel dims,
 * captured on upload, so the coordinate editor can show the true aspect ratio —
 * booth coordinates themselves are normalized 0..1, so rendering never depends
 * on them.
 */
export const mapFloors = pgTable(
  "map_floors",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    mapId: uuid("map_id")
      .notNull()
      .references(() => maps.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    imageFileId: uuid("image_file_id").references(() => files.id, { onDelete: "set null" }),
    imageWidth: integer("image_width"),
    imageHeight: integer("image_height"),
    displayOrder: integer("display_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("map_floors_tenant_idx").on(table.tenantId),
    index("map_floors_event_idx").on(table.eventId),
    index("map_floors_map_idx").on(table.mapId),
  ],
);

export type MapFloor = typeof mapFloors.$inferSelect;
export type NewMapFloor = typeof mapFloors.$inferInsert;
