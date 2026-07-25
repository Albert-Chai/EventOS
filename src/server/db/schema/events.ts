import { doublePrecision, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { EventType, EventVisibility } from "../../events/event-types";
import type { EventStatus } from "../../events/status";
import { primaryId, softDelete, timestamps } from "./_shared";
import { tenants } from "./tenants";

/**
 * Events (spec §8.3, §12). The first tenant-scoped *domain* table: every row
 * carries `tenant_id` and is reached only through the repository layer with a
 * tenant id derived from `ctx.tenant.id` — never from the request.
 *
 * `status`, `visibility`, and `event_type` are `text` with a documented union
 * (see `_shared.ts`); the status machine lives in `src/server/events/status.ts`.
 * Case-insensitive slug uniqueness *within a tenant* is a partial expression
 * index in the hand-written migration (Drizzle cannot express `lower(slug)`).
 * The `created_by → auth.users` FK is hand-written too (cross-schema).
 *
 * `start_at`/`end_at` are nullable: a draft may exist before its dates are set
 * (spec §19 lists "event dates configured" as a checklist step). Publishing
 * refuses until they are present — see `event.service.ts`.
 */
export const events = pgTable(
  "events",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    eventType: text("event_type").notNull().default("other").$type<EventType>(),
    shortDescription: text("short_description"),
    description: text("description"),
    venueName: text("venue_name"),
    venueAddress: text("venue_address"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    timezone: text("timezone").notNull().default("Asia/Kuala_Lumpur"),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    status: text("status").notNull().default("draft").$type<EventStatus>(),
    visibility: text("visibility").notNull().default("public").$type<EventVisibility>(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    // FK to auth.users is added in the hand-written migration (cross-schema).
    createdBy: uuid("created_by"),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    // Tenant-leading composite for the organizer's event list (filtered by status).
    index("events_tenant_status_idx").on(table.tenantId, table.status),
    index("events_start_idx").on(table.startAt),
  ],
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
