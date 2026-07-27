import { z } from "zod";

import { parseSearchParams, withApi } from "@/lib/api/handler";
import { requireCronAuth } from "@/lib/api/cron-auth";
import {
  runDailyAggregation,
  yesterdayKey,
} from "@/server/services/analytics-aggregation.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  // Backfill a specific UTC day; defaults to yesterday (the nightly target).
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),
});

/**
 * The daily aggregation job (spec §34 Phase 7). Recomputes the `daily_*_metrics`
 * rollups for one UTC date from the raw log. Guarded by `CRON_SECRET`
 * (`requireCronAuth`). Idempotent, so a retry or backfill is safe. Scheduled via
 * `vercel.json`, inert until the secret is set and deployed.
 */
export const GET = withApi(async ({ request }) => {
  requireCronAuth(request);
  const { date } = parseSearchParams(request, querySchema);
  const target = date ?? yesterdayKey(new Date());
  return runDailyAggregation(target);
});
