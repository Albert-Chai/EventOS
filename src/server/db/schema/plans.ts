import { boolean, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import type { BillingInterval, PlanFeature, PlanLimits } from "../../billing/plans";

/**
 * The plan catalog (spec §9, §12). NOT tenant-scoped — this is the platform's
 * price list, seeded from `server/billing/plans.ts` and rendered by
 * `/platform/plans`. Subscriptions reference a plan by its natural `key`
 * (`starter` … `enterprise`), the same stable-string-key approach as `roles`.
 *
 * `limits` (a `{ metric: number }` map; an omitted metric ⇒ unlimited) and
 * `features` (entitlement keys) are stored as data so a platform admin could edit
 * a plan later, but the metric list and default values live in code.
 */
export const plans = pgTable("plans", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  /** Minor unit (sen for MYR). `null` = custom pricing (Enterprise). */
  priceCents: integer("price_cents"),
  currency: text("currency").notNull().default("MYR"),
  billingInterval: text("billing_interval")
    .notNull()
    .default("per_event")
    .$type<BillingInterval>(),
  limits: jsonb("limits").notNull().default({}).$type<PlanLimits>(),
  features: text("features").array().notNull().default([]).$type<PlanFeature[]>(),
  analyticsRetentionDays: integer("analytics_retention_days"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
