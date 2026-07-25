import type { MetricUnit, PlanFeature } from "@/server/billing/plans";

/** Human labels for plan entitlements, shown on the plan cards. */
const FEATURE_LABELS: Record<PlanFeature, string> = {
  csv_import: "CSV import",
  custom_branding: "Custom branding",
  featured_listings: "Featured listings",
  vouchers: "Vouchers",
  campaigns: "Campaigns",
  custom_domain: "Custom domain",
  data_export: "Data exports",
  merchant_self_service: "Merchant self-service",
  white_label: "White-label",
  api_access: "API access",
  sponsor_module: "Sponsor module",
};

export function featureLabel(feature: PlanFeature): string {
  return FEATURE_LABELS[feature] ?? feature;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  const rounded = i === 0 || value >= 100 ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded} ${units[i]}`;
}

export function formatMetricValue(value: number, unit: MetricUnit): string {
  return unit === "bytes" ? formatBytes(value) : value.toLocaleString();
}
