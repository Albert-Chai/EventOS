import { index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { plans } from "./plans";
import { subscriptions } from "./subscriptions";
import { tenants } from "./tenants";
import type { InvoiceStatus } from "../../billing/plans";

/**
 * An invoice record (spec §12, §22). Written on a (simulated) plan change; the
 * `amount_cents`/`plan_key` snapshot the charge so a later price edit never
 * rewrites history. `external_ref` reserves the Stripe invoice id. `number` is a
 * human, globally-unique reference.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    planKey: text("plan_key")
      .notNull()
      .references(() => plans.key),
    number: text("number").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("MYR"),
    status: text("status").notNull().default("open").$type<InvoiceStatus>(),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    externalRef: text("external_ref"),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    unique("invoices_number_uq").on(table.number),
    index("invoices_tenant_idx").on(table.tenantId),
  ],
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
