import { PLAN_TIERS, PLANS, type PlanTier } from "@/server/billing/plans";
import type { MetricUsage } from "@/server/services/usage.service";

/**
 * Pure summarizers for the platform-admin console (see
 * `docs/platform-admin-plan.md`). Kept free of `db` so the rows → summary logic
 * is deterministic and unit-tested; the service does the I/O and hands these the
 * plain data.
 */

export type PlanDistributionRow = { key: PlanTier; name: string; count: number };

/**
 * Tenants grouped by plan tier, in canonical tier order, **zero-filled** — a tier
 * with no tenants still appears (so the UI shows the full ladder). Unknown keys
 * are ignored (a plan tier is always one of `PLAN_TIERS`).
 */
export function planDistribution(planKeys: string[]): PlanDistributionRow[] {
  const counts = new Map<PlanTier, number>(PLAN_TIERS.map((t) => [t, 0]));
  for (const key of planKeys) {
    if (counts.has(key as PlanTier)) counts.set(key as PlanTier, counts.get(key as PlanTier)! + 1);
  }
  return PLAN_TIERS.map((key) => ({ key, name: PLANS[key].name, count: counts.get(key)! }));
}

/**
 * How many of a tenant's metrics are over the limit vs merely near it (warn).
 * `computeUsage` already flags each metric; this just tallies. `over` and `warn`
 * are counted independently — an over-limit metric is also near it, but we report
 * it only as `over` so the two counts don't double-count the same metric.
 */
export function countUsageFlags(usage: MetricUsage[]): { over: number; warn: number } {
  let over = 0;
  let warn = 0;
  for (const u of usage) {
    if (u.over) over += 1;
    else if (u.warn) warn += 1;
  }
  return { over, warn };
}
