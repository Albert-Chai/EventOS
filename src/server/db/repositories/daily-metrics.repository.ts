import { and, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { dailyEventMetrics, dailyMerchantMetrics } from "@/server/db/schema";

/**
 * The daily rollups (spec §8.13). Populated by `runDailyAggregation` via a
 * delete-then-`INSERT … SELECT … GROUP BY` recompute of a single UTC date — so a
 * re-run is idempotent (the cron can safely retry or backfill). Beyond a raw
 * count of each event name, the aggregation adds `unique_visitors` (distinct
 * `anonymous_id`) and `total_events`. All SQL stays in the repository layer.
 */

/** Recomputes `daily_event_metrics` for one UTC date. Returns rows written. */
export async function aggregateEventMetricsForDate(dateStr: string): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`delete from daily_event_metrics where date = ${dateStr}::date`);

    // Per-name counts.
    await tx.execute(sql`
      insert into daily_event_metrics (tenant_id, event_id, date, metric, value)
      select tenant_id, event_id, ${dateStr}::date, name, count(*)::int
      from analytics_events
      where event_id is not null
        and occurred_at >= ${dateStr}::date
        and occurred_at < (${dateStr}::date + 1)
      group by tenant_id, event_id, name
    `);

    // Derived: unique visitors + total events per event.
    await tx.execute(sql`
      insert into daily_event_metrics (tenant_id, event_id, date, metric, value)
      select tenant_id, event_id, ${dateStr}::date, 'unique_visitors',
             count(distinct anonymous_id)::int
      from analytics_events
      where event_id is not null
        and occurred_at >= ${dateStr}::date
        and occurred_at < (${dateStr}::date + 1)
      group by tenant_id, event_id
    `);
    await tx.execute(sql`
      insert into daily_event_metrics (tenant_id, event_id, date, metric, value)
      select tenant_id, event_id, ${dateStr}::date, 'total_events', count(*)::int
      from analytics_events
      where event_id is not null
        and occurred_at >= ${dateStr}::date
        and occurred_at < (${dateStr}::date + 1)
      group by tenant_id, event_id
    `);

    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(dailyEventMetrics)
      .where(eq(dailyEventMetrics.date, dateStr));
    return row?.n ?? 0;
  });
}

/** Recomputes `daily_merchant_metrics` for one UTC date. Returns rows written. */
export async function aggregateMerchantMetricsForDate(dateStr: string): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`delete from daily_merchant_metrics where date = ${dateStr}::date`);

    await tx.execute(sql`
      insert into daily_merchant_metrics
        (tenant_id, event_id, merchant_id, participation_id, date, metric, value)
      select tenant_id, event_id, merchant_id, participation_id, ${dateStr}::date, name, count(*)::int
      from analytics_events
      where participation_id is not null
        and merchant_id is not null
        and event_id is not null
        and occurred_at >= ${dateStr}::date
        and occurred_at < (${dateStr}::date + 1)
      group by tenant_id, event_id, merchant_id, participation_id, name
    `);
    await tx.execute(sql`
      insert into daily_merchant_metrics
        (tenant_id, event_id, merchant_id, participation_id, date, metric, value)
      select tenant_id, event_id, merchant_id, participation_id, ${dateStr}::date,
             'unique_visitors', count(distinct anonymous_id)::int
      from analytics_events
      where participation_id is not null
        and merchant_id is not null
        and event_id is not null
        and occurred_at >= ${dateStr}::date
        and occurred_at < (${dateStr}::date + 1)
      group by tenant_id, event_id, merchant_id, participation_id
    `);

    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(dailyMerchantMetrics)
      .where(eq(dailyMerchantMetrics.date, dateStr));
    return row?.n ?? 0;
  });
}

/** Trend series for one event metric across a date range (inclusive). */
export async function listDailyEventMetric(
  tenantId: string,
  eventId: string,
  metric: string,
  fromDate: string,
  toDate: string,
): Promise<{ date: string; value: number }[]> {
  return db
    .select({ date: dailyEventMetrics.date, value: dailyEventMetrics.value })
    .from(dailyEventMetrics)
    .where(
      and(
        eq(dailyEventMetrics.tenantId, tenantId),
        eq(dailyEventMetrics.eventId, eventId),
        eq(dailyEventMetrics.metric, metric),
        gte(dailyEventMetrics.date, fromDate),
        lte(dailyEventMetrics.date, toDate),
      ),
    )
    .orderBy(dailyEventMetrics.date);
}
