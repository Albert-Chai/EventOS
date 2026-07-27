import { date, index, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { events } from "./events";
import { merchants } from "./merchants";
import { merchantEventParticipations } from "./participations";
import { tenants } from "./tenants";

/**
 * Daily rollup of `analytics_events` per merchant-in-event (spec §8.13). Keyed on
 * `participation_id` — a merchant's identity *within an event* — with `event_id`
 * and `merchant_id` carried for filtering. Same tall `(…, date, metric)` shape and
 * upsert/trigger contract as `daily_event_metrics`.
 */
export const dailyMerchantMetrics = pgTable(
  "daily_merchant_metrics",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    participationId: uuid("participation_id")
      .notNull()
      .references(() => merchantEventParticipations.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    metric: text("metric").notNull(),
    value: integer("value").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    unique("daily_merchant_metrics_participation_date_metric_uq").on(
      table.participationId,
      table.date,
      table.metric,
    ),
    index("daily_merchant_metrics_tenant_idx").on(table.tenantId),
    index("daily_merchant_metrics_merchant_date_idx").on(table.merchantId, table.date),
  ],
);

export type DailyMerchantMetric = typeof dailyMerchantMetrics.$inferSelect;
export type NewDailyMerchantMetric = typeof dailyMerchantMetrics.$inferInsert;
