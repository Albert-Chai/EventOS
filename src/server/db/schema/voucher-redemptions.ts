import { index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId } from "./_shared";
import { events } from "./events";
import { merchants } from "./merchants";
import { tenants } from "./tenants";
import { visitors } from "./visitors";
import { voucherClaims } from "./voucher-claims";
import { voucherCodes } from "./voucher-codes";
import { vouchers } from "./vouchers";

/**
 * A redeemed voucher code (spec §34 Phase 8). **Append-only** (no `updated_at`
 * or trigger, like `qr_scan_events`) — a redemption is a historical fact.
 *
 * `unique(voucher_code_id)` is the load-bearing constraint of the whole module:
 * it makes a double redemption impossible **at the database level**, not merely
 * unlikely. The service checks first for a friendly error; this catches the race
 * two concurrent scans would otherwise win.
 *
 * `redeemed_by_user_id` (the organizer/checker who redeemed) gets its
 * `auth.users` FK in the hand-written migration; `redeemed_by_merchant_id`
 * records a merchant-portal redemption instead.
 */
export const voucherRedemptions = pgTable(
  "voucher_redemptions",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    voucherId: uuid("voucher_id")
      .notNull()
      .references(() => vouchers.id, { onDelete: "cascade" }),
    voucherCodeId: uuid("voucher_code_id")
      .notNull()
      .references(() => voucherCodes.id, { onDelete: "cascade" }),
    claimId: uuid("claim_id").references(() => voucherClaims.id, { onDelete: "set null" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").references(() => merchants.id, { onDelete: "set null" }),
    visitorId: uuid("visitor_id").references(() => visitors.id, { onDelete: "set null" }),
    redeemedByUserId: uuid("redeemed_by_user_id"),
    redeemedByMerchantId: uuid("redeemed_by_merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    amountCents: integer("amount_cents"),
    notes: text("notes"),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("voucher_redemptions_code_uq").on(table.voucherCodeId),
    index("voucher_redemptions_voucher_idx").on(table.voucherId),
    index("voucher_redemptions_event_idx").on(table.eventId),
    index("voucher_redemptions_tenant_idx").on(table.tenantId),
  ],
);

export type VoucherRedemption = typeof voucherRedemptions.$inferSelect;
export type NewVoucherRedemption = typeof voucherRedemptions.$inferInsert;
