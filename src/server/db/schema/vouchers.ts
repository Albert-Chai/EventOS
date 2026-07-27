import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { primaryId, softDelete, timestamps } from "./_shared";
import { events } from "./events";
import { files } from "./files";
import { merchants } from "./merchants";
import { tenants } from "./tenants";
import type { VoucherStatus, VoucherType } from "../../vouchers/status";

/**
 * A claimable promotion (spec §34 Phase 8). Tenant + event scoped;
 * `merchant_id` is **nullable** — null means an event-wide voucher, set means it
 * belongs to one merchant's listing (and only that merchant can redeem it).
 *
 * `claimed_count` / `redeemed_count` are denormalized counters maintained inside
 * the claim/redeem transactions (which lock this row) — they are what
 * `total_quantity` is checked against, so the count and the limit are decided
 * under the same lock and a limited voucher can never be over-issued. The
 * `voucher_claims` / `voucher_redemptions` rows remain authoritative.
 *
 * `created_by` gets its `auth.users` FK in the hand-written migration.
 */
export const vouchers = pgTable(
  "vouchers",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").references(() => merchants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    terms: text("terms"),
    voucherType: text("voucher_type").notNull().default("discount_percent").$type<VoucherType>(),
    discountPercent: integer("discount_percent"),
    discountAmountCents: integer("discount_amount_cents"),
    currency: text("currency").notNull().default("MYR"),
    minSpendCents: integer("min_spend_cents"),
    imageFileId: uuid("image_file_id").references(() => files.id, { onDelete: "set null" }),
    status: text("status").notNull().default("draft").$type<VoucherStatus>(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** Null = unlimited. */
    totalQuantity: integer("total_quantity"),
    perVisitorLimit: integer("per_visitor_limit").notNull().default(1),
    claimedCount: integer("claimed_count").notNull().default(0),
    redeemedCount: integer("redeemed_count").notNull().default(0),
    createdBy: uuid("created_by"),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("vouchers_event_idx").on(table.eventId),
    index("vouchers_tenant_idx").on(table.tenantId),
    index("vouchers_merchant_idx").on(table.merchantId),
    index("vouchers_event_status_idx").on(table.eventId, table.status),
  ],
);

export type Voucher = typeof vouchers.$inferSelect;
export type NewVoucher = typeof vouchers.$inferInsert;
