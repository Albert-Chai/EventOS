import { date, index, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { events } from "./events";
import { tenants } from "./tenants";

/**
 * Daily rollup of `analytics_events` per event (spec §8.13). One **tall** row per
 * `(event, date, metric)`, where `metric` is a raw event name (e.g.
 * `merchant_viewed`) or a derived `ROLLUP_METRICS` key (`unique_visitors`,
 * `total_events`). Upserted by `runDailyAggregation`, so it carries the
 * `updated_at` trigger (unlike the append-only raw log). It backs per-day trend
 * charts; the dashboards themselves read the raw log so their totals always match
 * it.
 */
export const dailyEventMetrics = pgTable(
  "daily_event_metrics",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    metric: text("metric").notNull(),
    value: integer("value").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    unique("daily_event_metrics_event_date_metric_uq").on(table.eventId, table.date, table.metric),
    index("daily_event_metrics_tenant_idx").on(table.tenantId),
    index("daily_event_metrics_event_date_idx").on(table.eventId, table.date),
  ],
);

export type DailyEventMetric = typeof dailyEventMetrics.$inferSelect;
export type NewDailyEventMetric = typeof dailyEventMetrics.$inferInsert;
