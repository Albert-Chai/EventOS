import {
  aggregateEventMetricsForDate,
  aggregateMerchantMetricsForDate,
} from "@/server/db/repositories/daily-metrics.repository";

export { toDateKey, yesterdayKey } from "@/lib/date-keys";

/**
 * The daily aggregation job (spec §34 Phase 7). Recomputes the `daily_*_metrics`
 * rollups for one UTC date from the raw `analytics_events` log. Idempotent — the
 * repository deletes the date's rollup rows and re-inserts from a `GROUP BY`, so
 * the cron can safely retry or backfill. Live scheduling is deferred (documented
 * `vercel.json` cron), like the status scheduler; the route is guarded by
 * `CRON_SECRET`.
 */

export type AggregationResult = {
  date: string;
  eventRows: number;
  merchantRows: number;
};

/** Runs the rollup for a single UTC date (`YYYY-MM-DD`). */
export async function runDailyAggregation(dateStr: string): Promise<AggregationResult> {
  const [eventRows, merchantRows] = await Promise.all([
    aggregateEventMetricsForDate(dateStr),
    aggregateMerchantMetricsForDate(dateStr),
  ]);
  return { date: dateStr, eventRows, merchantRows };
}
