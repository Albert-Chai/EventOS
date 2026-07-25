import { index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { events } from "./events";
import { tenants } from "./tenants";

/**
 * Per-event branding (spec §8.3: theme, colors, logo, cover). A 1:1 satellite of
 * `events`, created with the event so a read never misses.
 *
 * `logo_file_id` / `cover_file_id` are reserved for the Storage upload flow that
 * lands with merchant media in Phase 3 (see docs/phase-2-plan.md §7). Until then
 * branding is theme + colors; the file columns exist so nothing is renamed later.
 */
export const eventBranding = pgTable(
  "event_branding",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),

    theme: text("theme").notNull().default("classic"),
    primaryColor: text("primary_color").notNull().default("#0f172a"),
    secondaryColor: text("secondary_color"),
    accentColor: text("accent_color"),
    logoFileId: uuid("logo_file_id"),
    coverFileId: uuid("cover_file_id"),

    ...timestamps,
  },
  (table) => [
    unique("event_branding_event_uq").on(table.eventId),
    index("event_branding_tenant_idx").on(table.tenantId),
  ],
);

export type EventBranding = typeof eventBranding.$inferSelect;
export type NewEventBranding = typeof eventBranding.$inferInsert;

/** Named themes the branding form offers. `text` union, widened as needed. */
export const EVENT_THEMES = ["classic", "vibrant", "minimal", "night"] as const;
export type EventTheme = (typeof EVENT_THEMES)[number];
