import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { tenants } from "./tenants";
import { vouchers } from "./vouchers";
import type { VoucherCodeStatus } from "../../vouchers/status";

/**
 * One code per claim (the Phase 8 decision): claiming mints a globally unique
 * base62 code the visitor shows as text or a QR. The code carries its own
 * lifecycle, independent of the voucher's — a code stays valid (and redeemable)
 * after its voucher is paused, which is what an organizer expects for promises
 * already made to visitors.
 *
 * Mutable (status flips on redeem), so it carries the `updated_at` trigger.
 */
export const voucherCodes = pgTable(
  "voucher_codes",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    voucherId: uuid("voucher_id")
      .notNull()
      .references(() => vouchers.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    status: text("status").notNull().default("issued").$type<VoucherCodeStatus>(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("voucher_codes_code_uq").on(table.code),
    index("voucher_codes_voucher_idx").on(table.voucherId),
    index("voucher_codes_tenant_idx").on(table.tenantId),
  ],
);

export type VoucherCode = typeof voucherCodes.$inferSelect;
export type NewVoucherCode = typeof voucherCodes.$inferInsert;
