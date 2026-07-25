import { boolean, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { plans } from "./plans";
import { tenants } from "./tenants";
import type { SubscriptionStatus } from "../../billing/plans";

/**
 * A tenant's current subscription (spec §8.2, §12). **One per tenant**
 * (`unique(tenant_id)`): a plan change updates this row, and the `invoices` trail
 * records the history. `external_ref` reserves the Stripe subscription id for
 * when real payments land — null for the simulated flow.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    planKey: text("plan_key")
      .notNull()
      .references(() => plans.key),
    status: text("status").notNull().default("active").$type<SubscriptionStatus>(),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    externalRef: text("external_ref"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("subscriptions_tenant_uq").on(table.tenantId),
    index("subscriptions_plan_idx").on(table.planKey),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
