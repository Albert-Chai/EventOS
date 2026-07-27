import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { primaryId } from "./_shared";
import { booths } from "./booths";
import { events } from "./events";
import { listingItems } from "./listing-items";
import { merchants } from "./merchants";
import { merchantEventParticipations } from "./participations";
import { tenants } from "./tenants";
import { visitors } from "./visitors";
import { zones } from "./zones";
import type { AnalyticsEventName } from "../../analytics/taxonomy";

/**
 * The raw analytics event log (spec §25). **Append-only** — like `usage_records`
 * and `visitor_favourites`, it has no `updated_at`/trigger. Every dashboard reads
 * live from this table, so its numbers match the log by construction; the
 * `daily_*_metrics` rollups are a derived view of it.
 *
 * `tenant_id` + `event_id` are always **server-derived** (from the public URL
 * slug via `findPublicEvent`, or from the resolved server seam) — never a client
 * value (the §6 public-reads seam applied to writes). `anonymous_id` is the
 * `eventos_vid` cookie, the key for unique-visitor counts; a `visitors` row is
 * *not* created just to track (browsing still writes no visitor row). The
 * entity-id columns mirror the §25 property list so later phases (booth/item/
 * voucher events) populate them without a migration; Phase 7 leaves most null.
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").references(() => merchants.id, { onDelete: "cascade" }),
    participationId: uuid("participation_id").references(() => merchantEventParticipations.id, {
      onDelete: "cascade",
    }),
    itemId: uuid("item_id").references(() => listingItems.id, { onDelete: "cascade" }),
    boothId: uuid("booth_id").references(() => booths.id, { onDelete: "cascade" }),
    zoneId: uuid("zone_id").references(() => zones.id, { onDelete: "cascade" }),
    visitorId: uuid("visitor_id").references(() => visitors.id, { onDelete: "set null" }),
    // The eventos_vid cookie value — the unique-visitor key. Text, not an FK: a
    // `visitors` row may never exist for a browse-only session.
    anonymousId: text("anonymous_id"),
    // Campaign attribution lands in Phase 8; the column exists now for taxonomy
    // completeness, without an FK until the `campaigns` table exists.
    campaignId: uuid("campaign_id"),
    name: text("name").notNull().$type<AnalyticsEventName>(),
    source: text("source"),
    deviceType: text("device_type"),
    browser: text("browser"),
    referrer: text("referrer"),
    // Event-specific extras: search `q`, applied filter keys, share channel, …
    props: jsonb("props"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("analytics_events_tenant_idx").on(table.tenantId),
    index("analytics_events_event_name_idx").on(table.eventId, table.name),
    index("analytics_events_event_time_idx").on(table.eventId, table.occurredAt),
    index("analytics_events_participation_idx").on(table.participationId),
    index("analytics_events_merchant_idx").on(table.merchantId),
  ],
);

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;
