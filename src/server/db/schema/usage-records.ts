import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { primaryId } from "./_shared";
import { events } from "./events";
import { tenants } from "./tenants";
import type { UsageMetric } from "../../billing/plans";

/**
 * The usage ledger (spec §22). **Append-only** — like `visitor_favourites`, it
 * has no `updated_at`/trigger. Rows are written by `recordUsage` for the
 * event-driven metrics (email/SMS/push/QR/API/voucher …); the "live" metrics
 * (events, merchants, team, storage) are counted from their source tables
 * instead and never land here. `period` is a `YYYY-MM` bucket for the monthly
 * metrics, null otherwise. `event_id` is optional — some usage is tenant-wide.
 */
export const usageRecords = pgTable(
  "usage_records",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    metric: text("metric").notNull().$type<UsageMetric>(),
    quantity: integer("quantity").notNull().default(1),
    period: text("period"),
    source: text("source"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("usage_records_tenant_metric_idx").on(table.tenantId, table.metric),
    index("usage_records_period_idx").on(table.tenantId, table.metric, table.period),
  ],
);

export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;
