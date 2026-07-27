import { AppError } from "@/lib/api/errors";
import {
  LIMIT_WARN_RATIO,
  METRICS,
  USAGE_METRICS,
  limitFor,
  planHasFeature,
  usagePeriod,
  usageRatio,
  wouldExceed,
  type MetricUnit,
  type PlanDefinition,
  type PlanFeature,
  type UsageMetric,
} from "@/server/billing/plans";
import type { TenantScopedContext } from "@/server/context";
import { sumStorageBytesForTenant } from "@/server/db/repositories/files.repository";
import { countMembersForTenant } from "@/server/db/repositories/members.repository";
import { countEventsForTenant } from "@/server/db/repositories/events.repository";
import {
  countParticipationsForEvent,
  maxParticipationsForTenant,
} from "@/server/db/repositories/participations.repository";
import { insertUsageRecord, sumUsage } from "@/server/db/repositories/usage-records.repository";
import { getTenantPlan } from "./plan.service";

/**
 * Usage metering and plan-limit enforcement (spec §22).
 *
 * The four "live" metrics (events, merchants-per-event, team members, storage)
 * are counted from their source tables on demand; the event-driven metrics
 * (email/SMS/push/QR/API/voucher …) are summed from the `usage_records` ledger
 * that later phases write via `recordUsage`. Hard metrics block on exceed
 * (`assertWithinLimit`); soft metrics only surface a warning in the dashboard.
 */

export type MetricUsage = {
  metric: UsageMetric;
  label: string;
  unit: MetricUnit;
  perEvent: boolean;
  hard: boolean;
  current: number;
  /** null = unlimited on this plan. */
  limit: number | null;
  ratio: number;
  warn: boolean;
  over: boolean;
};

/** Current value of one metric for a tenant (optionally within an event). */
async function currentUsage(
  tenantId: string,
  metric: UsageMetric,
  eventId: string | undefined,
  now: Date,
): Promise<number> {
  switch (metric) {
    case "events":
      return countEventsForTenant(tenantId);
    case "merchants_per_event":
      return eventId
        ? countParticipationsForEvent(eventId)
        : maxParticipationsForTenant(tenantId);
    case "team_members":
      return countMembersForTenant(tenantId);
    case "storage_bytes":
      return sumStorageBytesForTenant(tenantId);
    default:
      return sumUsage(tenantId, metric, {
        eventId,
        period: METRICS[metric].monthly ? usagePeriod(now) : undefined,
      });
  }
}

/**
 * Usage-vs-limit for the billing dashboard. Defaults to every §22 metric; pass
 * `opts.metrics` to compute only a subset (the platform console asks for just the
 * hard live metrics, so it doesn't fire the ledger-sum queries per tenant).
 *
 * `opts.sequential` runs the per-metric queries one at a time instead of
 * concurrently. The platform console sweeps every tenant, so it uses this to
 * avoid firing a burst of concurrent queries (tenants × metrics) at the shared
 * transaction pooler — which, on the low dev/test connection cap, stalls. A
 * single tenant's dashboard keeps the default concurrent path.
 */
export async function computeUsage(
  tenantId: string,
  plan: PlanDefinition,
  opts: { eventId?: string; metrics?: readonly UsageMetric[]; sequential?: boolean } = {},
): Promise<MetricUsage[]> {
  const now = new Date();
  const list = opts.metrics ?? USAGE_METRICS;

  const computeOne = async (metric: UsageMetric): Promise<MetricUsage> => {
    const meta = METRICS[metric];
    const limit = limitFor(plan, metric);
    const current = await currentUsage(tenantId, metric, opts.eventId, now);
    const ratio = usageRatio(current, limit);
    return {
      metric,
      label: meta.label,
      unit: meta.unit,
      perEvent: meta.perEvent,
      hard: meta.hard,
      current,
      limit,
      ratio,
      warn: limit != null && ratio >= LIMIT_WARN_RATIO,
      over: limit != null && current > limit,
    } satisfies MetricUsage;
  };

  if (opts.sequential) {
    const out: MetricUsage[] = [];
    for (const metric of list) out.push(await computeOne(metric));
    return out;
  }
  return Promise.all(list.map(computeOne));
}

/**
 * Throws `PLAN_LIMIT_REACHED` when adding `delta` would push a **hard** metric
 * over the plan limit. No-op for soft metrics and for unlimited plans. Not
 * exempt for platform admins acting via impersonation — the acting tenant's plan
 * still governs.
 */
export async function assertWithinLimit(
  tenantId: string,
  metric: UsageMetric,
  opts: { eventId?: string; delta?: number } = {},
): Promise<void> {
  const meta = METRICS[metric];
  if (!meta.hard) return;

  const { plan } = await getTenantPlan(tenantId);
  const limit = limitFor(plan, metric);
  if (limit == null) return; // unlimited

  const current = await currentUsage(tenantId, metric, opts.eventId, new Date());
  if (wouldExceed(current, limit, opts.delta ?? 1)) {
    throw new AppError("PLAN_LIMIT_REACHED", {
      message: `${meta.label}: your ${plan.name} plan allows ${limit}. Upgrade to add more.`,
      details: { metric, limit, current, plan: plan.key },
    });
  }
}

/** Throws `PLAN_FEATURE_REQUIRED` when the tenant's plan lacks a gated feature. */
export async function requirePlanFeature(tenantId: string, feature: PlanFeature): Promise<void> {
  const { plan } = await getTenantPlan(tenantId);
  if (!planHasFeature(plan, feature)) {
    throw new AppError("PLAN_FEATURE_REQUIRED", {
      message: `This feature isn't included in your ${plan.name} plan. Upgrade to enable it.`,
      details: { feature, plan: plan.key },
    });
  }
}

/**
 * Appends a metered event to the ledger (spec §22). The write path future phases
 * (email, campaigns, QR, vouchers) call. Live metrics are never recorded here —
 * they're counted from their tables.
 */
export async function recordUsage(
  ctx: TenantScopedContext,
  metric: UsageMetric,
  quantity = 1,
  opts: { eventId?: string; source?: string } = {},
): Promise<void> {
  const meta = METRICS[metric];
  await insertUsageRecord({
    tenantId: ctx.tenant.id,
    eventId: opts.eventId ?? null,
    metric,
    quantity,
    period: meta.monthly ? usagePeriod(new Date()) : null,
    source: opts.source ?? null,
  });
}
