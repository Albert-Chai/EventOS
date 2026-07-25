/**
 * Plans, usage metrics, and limit math (spec §9 pricing, §22 usage control).
 *
 * This module is the **typed source of truth** the seed writes into the `plans`
 * table and the enforcement code reads back. Like permissions (§14), the *shape*
 * of a plan lives in code; the `plans` rows are the catalog `/platform/plans`
 * renders and subscriptions reference by `key`. Pure — no `db`, no I/O — so the
 * limit math is unit-testable in isolation.
 */

// --- Usage metrics (§22) -----------------------------------------------------

export const USAGE_METRICS = [
  "events",
  "merchants_per_event",
  "team_members",
  "storage_bytes",
  "email_sends",
  "sms_sends",
  "push_sends",
  "qr_scans",
  "api_calls",
  "voucher_claims",
  "voucher_redemptions",
] as const;

export type UsageMetric = (typeof USAGE_METRICS)[number];

export type MetricKind = "live" | "ledger";
export type MetricUnit = "count" | "bytes";

type MetricMeta = {
  label: string;
  /** `live` = counted from source tables now; `ledger` = summed from usage_records. */
  kind: MetricKind;
  unit: MetricUnit;
  /** Resets each calendar month (keyed by a `YYYY-MM` period). */
  monthly: boolean;
  /** Blocks the action on exceed (vs. warn-only in the dashboard). */
  hard: boolean;
  /** Scoped to a single event rather than the whole tenant. */
  perEvent: boolean;
};

export const METRICS: Record<UsageMetric, MetricMeta> = {
  events: { label: "Active events", kind: "live", unit: "count", monthly: false, hard: true, perEvent: false },
  merchants_per_event: { label: "Merchants per event", kind: "live", unit: "count", monthly: false, hard: true, perEvent: true },
  team_members: { label: "Team members", kind: "live", unit: "count", monthly: false, hard: true, perEvent: false },
  storage_bytes: { label: "Storage", kind: "live", unit: "bytes", monthly: false, hard: true, perEvent: false },
  email_sends: { label: "Emails / month", kind: "ledger", unit: "count", monthly: true, hard: false, perEvent: false },
  sms_sends: { label: "SMS / month", kind: "ledger", unit: "count", monthly: true, hard: false, perEvent: false },
  push_sends: { label: "Push / month", kind: "ledger", unit: "count", monthly: true, hard: false, perEvent: false },
  qr_scans: { label: "QR scans", kind: "ledger", unit: "count", monthly: false, hard: false, perEvent: false },
  api_calls: { label: "API calls / month", kind: "ledger", unit: "count", monthly: true, hard: false, perEvent: false },
  voucher_claims: { label: "Voucher claims", kind: "ledger", unit: "count", monthly: false, hard: false, perEvent: false },
  voucher_redemptions: { label: "Voucher redemptions", kind: "ledger", unit: "count", monthly: false, hard: false, perEvent: false },
};

export function isUsageMetric(value: string): value is UsageMetric {
  return (USAGE_METRICS as readonly string[]).includes(value);
}

// --- Features (entitlements) -------------------------------------------------

export const PLAN_FEATURES = [
  "csv_import",
  "custom_branding",
  "featured_listings",
  "vouchers",
  "campaigns",
  "custom_domain",
  "data_export",
  "merchant_self_service",
  "white_label",
  "api_access",
  "sponsor_module",
] as const;

export type PlanFeature = (typeof PLAN_FEATURES)[number];

// --- Status unions (used by the schema via `import type`) --------------------

export type BillingInterval = "per_event" | "monthly" | "custom";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "paused";
export type InvoiceStatus = "draft" | "open" | "paid" | "void";

export type FeaturedPlacementType =
  | "homepage_featured"
  | "category_featured"
  | "search_boost"
  | "map_highlight"
  | "sponsored_merchant"
  | "recommended_merchant";

export type FeaturedPaymentStatus = "included" | "pending" | "paid" | "waived";

export const FEATURED_PLACEMENT_TYPES: readonly FeaturedPlacementType[] = [
  "homepage_featured",
  "category_featured",
  "search_boost",
  "map_highlight",
  "sponsored_merchant",
  "recommended_merchant",
];

// --- Plans -------------------------------------------------------------------

export const PLAN_TIERS = ["starter", "growth", "professional", "enterprise"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

/** A limit that is absent means **unlimited** for that metric. */
export type PlanLimits = Partial<Record<UsageMetric, number>>;

export type PlanDefinition = {
  key: PlanTier;
  name: string;
  description: string;
  /** In the currency's minor unit (sen for MYR). `null` = custom pricing. */
  priceCents: number | null;
  currency: string;
  billingInterval: BillingInterval;
  sortOrder: number;
  limits: PlanLimits;
  features: readonly PlanFeature[];
  /** Days of analytics retention; `null` = unlimited. */
  analyticsRetentionDays: number | null;
};

const GB = 1024 * 1024 * 1024;

export const PLANS: Record<PlanTier, PlanDefinition> = {
  starter: {
    key: "starter",
    name: "Starter",
    description: "One event, the public site, directory, and basic map.",
    priceCents: 99_900,
    currency: "MYR",
    billingInterval: "per_event",
    sortOrder: 0,
    limits: {
      events: 1,
      merchants_per_event: 50,
      team_members: 3,
      storage_bytes: 1 * GB,
      email_sends: 1_000,
      sms_sends: 0,
      push_sends: 0,
      qr_scans: 10_000,
      api_calls: 0,
      voucher_claims: 0,
      voucher_redemptions: 0,
    },
    features: ["csv_import"],
    analyticsRetentionDays: 30,
  },
  growth: {
    key: "growth",
    name: "Growth",
    description: "Custom branding, featured listings, vouchers, and campaigns.",
    priceCents: 299_900,
    currency: "MYR",
    billingInterval: "per_event",
    sortOrder: 1,
    limits: {
      events: 3,
      merchants_per_event: 200,
      team_members: 10,
      storage_bytes: 10 * GB,
      email_sends: 25_000,
      sms_sends: 2_000,
      push_sends: 50_000,
      qr_scans: 100_000,
      api_calls: 0,
      voucher_claims: 50_000,
      voucher_redemptions: 50_000,
    },
    features: [
      "csv_import",
      "custom_branding",
      "featured_listings",
      "vouchers",
      "campaigns",
      "custom_domain",
      "data_export",
      "merchant_self_service",
    ],
    analyticsRetentionDays: 180,
  },
  professional: {
    key: "professional",
    name: "Professional",
    description: "White-label, sponsor module, API access, and multiple maps.",
    priceCents: 799_900,
    currency: "MYR",
    billingInterval: "per_event",
    sortOrder: 2,
    limits: {
      events: 10,
      merchants_per_event: 1_000,
      team_members: 30,
      storage_bytes: 100 * GB,
      email_sends: 100_000,
      sms_sends: 10_000,
      push_sends: 500_000,
      qr_scans: 1_000_000,
      api_calls: 1_000_000,
      voucher_claims: 500_000,
      voucher_redemptions: 500_000,
    },
    features: [
      "csv_import",
      "custom_branding",
      "featured_listings",
      "vouchers",
      "campaigns",
      "custom_domain",
      "data_export",
      "merchant_self_service",
      "white_label",
      "api_access",
      "sponsor_module",
    ],
    analyticsRetentionDays: 365,
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    description: "Multiple events, SSO, SLA, and custom integrations. Unlimited usage.",
    priceCents: null,
    currency: "MYR",
    billingInterval: "custom",
    sortOrder: 3,
    limits: {}, // everything unlimited
    features: PLAN_FEATURES,
    analyticsRetentionDays: null,
  },
};

export const PLAN_LIST: readonly PlanDefinition[] = PLAN_TIERS.map((k) => PLANS[k]);

/** The plan a tenant sits on before it ever picks one. */
export const DEFAULT_PLAN_KEY: PlanTier = "starter";

export function isPlanTier(value: string): value is PlanTier {
  return (PLAN_TIERS as readonly string[]).includes(value);
}

export function getPlan(key: string): PlanDefinition | null {
  return isPlanTier(key) ? PLANS[key] : null;
}

// --- Limit math (pure) -------------------------------------------------------

/** Above this fraction of a limit, the dashboard shows a soft warning (§22). */
export const LIMIT_WARN_RATIO = 0.8;

/** `null` limit ⇒ unlimited ⇒ ratio 0. Otherwise current/limit, min 0. */
export function usageRatio(current: number, limit: number | null | undefined): number {
  if (limit == null) return 0; // unlimited
  if (limit <= 0) return current > 0 ? Infinity : 0;
  return Math.max(0, current / limit);
}

/** True when adding `delta` to `current` would cross a finite limit. */
export function wouldExceed(
  current: number,
  limit: number | null | undefined,
  delta = 1,
): boolean {
  if (limit == null) return false; // unlimited
  return current + delta > limit;
}

/** The plan limit for a metric, or `null` (unlimited) when the plan omits it. */
export function limitFor(plan: PlanDefinition, metric: UsageMetric): number | null {
  const value = plan.limits[metric];
  return value == null ? null : value;
}

export function planHasFeature(plan: PlanDefinition, feature: PlanFeature): boolean {
  return plan.features.includes(feature);
}

/** `YYYY-MM` bucket for a monthly metric. Pass the clock in — keeps it pure. */
export function usagePeriod(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** "RM999" / "RM2,999" from sen; "Custom" when unpriced. */
export function formatPlanPrice(priceCents: number | null, currency = "MYR"): string {
  if (priceCents == null) return "Custom";
  const symbol = currency === "MYR" ? "RM" : `${currency} `;
  const major = priceCents / 100;
  const whole = Number.isInteger(major) ? major.toString() : major.toFixed(2);
  return `${symbol}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
