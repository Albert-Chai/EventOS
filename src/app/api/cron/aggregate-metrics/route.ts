import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { env } from "@/config/env";
import { AppError } from "@/lib/api/errors";
import { parseSearchParams, withApi } from "@/lib/api/handler";
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

/** Constant-time bearer-token check against CRON_SECRET. */
function authorized(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The daily aggregation job (spec §34 Phase 7). Recomputes the `daily_*_metrics`
 * rollups for one UTC date from the raw log. Guarded by `CRON_SECRET`: a
 * missing secret is `503 NOT_CONFIGURED` (the feature isn't wired in this
 * environment), a wrong one is `401`. Idempotent, so a retry or backfill is safe.
 * Scheduling is via `vercel.json`, inert until the secret is set and deployed.
 */
export const GET = withApi(async ({ request }) => {
  if (!env.CRON_SECRET) {
    throw new AppError("NOT_CONFIGURED", {
      message: "CRON_SECRET is not set; the aggregation job is disabled.",
    });
  }
  if (!authorized(request)) {
    throw new AppError("UNAUTHENTICATED", { message: "Invalid cron credentials." });
  }

  const { date } = parseSearchParams(request, querySchema);
  const target = date ?? yesterdayKey(new Date());
  return runDailyAggregation(target);
});
