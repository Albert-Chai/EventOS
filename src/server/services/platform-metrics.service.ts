import { DEFAULT_PLAN_KEY, getPlan, PLANS, type PlanTier } from "@/server/billing/plans";
import {
  platformAnalyticsTotals,
  platformEventsByName,
  platformEventsPerTenant,
  type NameCount,
  type TenantEngagement,
} from "@/server/db/repositories/analytics-events.repository";
import {
  listRecentInvoicesAcrossTenants,
  platformInvoiceTotals,
  type InvoiceWithTenant,
} from "@/server/db/repositories/invoices.repository";
import { listAllSubscriptions } from "@/server/db/repositories/subscriptions.repository";
import { listTenants } from "@/server/db/repositories/tenants.repository";
import type { Subscription } from "@/server/db/schema";
import {
  countUsageFlags,
  planDistribution,
  type PlanDistributionRow,
} from "@/server/platform/summary";
import type { UsageMetric } from "@/server/billing/plans";
import { getTenantPlan } from "./plan.service";
import { computeUsage, type MetricUsage } from "./usage.service";

/**
 * Read-only assemblers for the platform-admin console (spec §4.1; see
 * `docs/platform-admin-plan.md`). Each combines the platform-wide repository
 * reads with the code plan definitions. No `ctx` — these are the §3.2
 * platform-authority axis and are **always** called from a page that has already
 * run `requirePlatformAdminOrRedirect` (like `listTenants()` today). Kept apart
 * from `platform.service.ts` (super-admin management) so each stays focused.
 */

// --- Billing ---------------------------------------------------------------

export type TenantBillingRow = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  suspended: boolean;
  planKey: PlanTier;
  planName: string;
  priceCents: number | null;
  currency: string;
  /** Subscription status, or "default" when the tenant has no subscription row. */
  status: string;
  paying: boolean;
  periodEnd: Date | null;
};

export type PlatformBilling = {
  rows: TenantBillingRow[];
  distribution: PlanDistributionRow[];
  payingCount: number;
  /** Sum of paid invoices — the simulated revenue. */
  revenueCents: number;
  paidInvoiceCount: number;
  recentInvoices: InvoiceWithTenant[];
};

export async function getPlatformBilling(): Promise<PlatformBilling> {
  // Sequential, not Promise.all: these admin sweeps run rarely over tiny data,
  // and the shared transaction pooler stalls on a burst of concurrent queries at
  // the low dev/test connection cap. A few serial round-trips is the safe trade.
  const tenants = await listTenants();
  const subs = await listAllSubscriptions();
  const totals = await platformInvoiceTotals();
  const recentInvoices = await listRecentInvoicesAcrossTenants(10);

  const subByTenant = new Map<string, Subscription>(subs.map((s) => [s.tenantId, s]));

  const rows: TenantBillingRow[] = tenants.map((t) => {
    const sub = subByTenant.get(t.id) ?? null;
    const plan = getPlan(sub?.planKey ?? DEFAULT_PLAN_KEY) ?? PLANS[DEFAULT_PLAN_KEY];
    // "Paying" = an active subscription on a priced plan — not the default Starter
    // fallback (no subscription row) and not Enterprise's null custom price.
    const paying = Boolean(sub && sub.status === "active" && plan.priceCents != null);
    return {
      tenantId: t.id,
      tenantName: t.name,
      tenantSlug: t.slug,
      suspended: t.status === "suspended",
      planKey: plan.key,
      planName: plan.name,
      priceCents: plan.priceCents,
      currency: plan.currency,
      status: sub?.status ?? "default",
      paying,
      periodEnd: sub?.currentPeriodEnd ?? null,
    };
  });

  return {
    rows,
    distribution: planDistribution(rows.map((r) => r.planKey)),
    payingCount: rows.filter((r) => r.paying).length,
    revenueCents: totals.amountCents,
    paidInvoiceCount: totals.paidCount,
    recentInvoices,
  };
}

// --- Usage -----------------------------------------------------------------

export type TenantUsageRow = {
  tenantId: string;
  tenantName: string;
  planName: string;
  /** The hard, non-per-event metrics (events, team, storage) — the capacity view. */
  metrics: MetricUsage[];
  over: number;
  warn: number;
};

export type PlatformUsage = {
  rows: TenantUsageRow[];
  tenantsOverLimit: number;
  totalEvents: number;
  totalStorageBytes: number;
};

// The platform capacity view: the hard limits that aren't per-event. Requesting
// only these keeps `computeUsage` to three queries per tenant (it otherwise runs
// the seven ledger-sum queries too), so a whole-platform sweep stays light.
const CAPACITY_METRICS: readonly UsageMetric[] = ["events", "team_members", "storage_bytes"];

const currentOf = (row: TenantUsageRow, metric: string): number =>
  row.metrics.find((m) => m.metric === metric)?.current ?? 0;

export async function getPlatformUsage(): Promise<PlatformUsage> {
  const tenants = await listTenants();

  // Sequential over tenants (and sequential within `computeUsage`): a whole-
  // platform sweep would otherwise fire tenants × metrics concurrent queries at
  // the shared pooler, which stalls on the low dev/test connection cap.
  const rows: TenantUsageRow[] = [];
  for (const t of tenants) {
    const { plan } = await getTenantPlan(t.id);
    const metrics = await computeUsage(t.id, plan, { metrics: CAPACITY_METRICS, sequential: true });
    const { over, warn } = countUsageFlags(metrics);
    rows.push({ tenantId: t.id, tenantName: t.name, planName: plan.name, metrics, over, warn });
  }

  return {
    rows,
    tenantsOverLimit: rows.filter((r) => r.over > 0).length,
    totalEvents: rows.reduce((s, r) => s + currentOf(r, "events"), 0),
    totalStorageBytes: rows.reduce((s, r) => s + currentOf(r, "storage_bytes"), 0),
  };
}

// --- Analytics -------------------------------------------------------------

export type PlatformAnalytics = {
  totalEvents: number;
  uniqueVisitors: number;
  byName: NameCount[];
  perTenant: TenantEngagement[];
};

export async function getPlatformAnalytics(): Promise<PlatformAnalytics> {
  // Sequential (see getPlatformBilling) — avoid a concurrent burst at the pooler.
  const totals = await platformAnalyticsTotals();
  const byName = await platformEventsByName(8);
  const perTenant = await platformEventsPerTenant();
  return {
    totalEvents: totals.totalEvents,
    uniqueVisitors: totals.uniqueVisitors,
    byName,
    perTenant,
  };
}
