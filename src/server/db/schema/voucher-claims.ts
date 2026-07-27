import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { events } from "./events";
import { tenants } from "./tenants";
import { visitors } from "./visitors";
import { voucherCodes } from "./voucher-codes";
import { vouchers } from "./vouchers";
import type { VoucherClaimStatus } from "../../vouchers/status";

/**
 * A visitor's claim on a voucher (spec §8.8 "saved vouchers"). One claim owns
 * exactly one `voucher_codes` row (`unique(voucher_code_id)`).
 *
 * The per-visitor limit is **not** a unique index here, because
 * `per_visitor_limit` is configurable per voucher (it may be > 1). It is enforced
 * by counting inside the claim transaction, which holds a lock on the voucher row
 * — see `voucher.service`. The `(voucher_id, visitor_id)` index is what makes
 * that count cheap.
 */
export const voucherClaims = pgTable(
  "voucher_claims",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    voucherId: uuid("voucher_id")
      .notNull()
      .references(() => vouchers.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    visitorId: uuid("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    voucherCodeId: uuid("voucher_code_id")
      .notNull()
      .references(() => voucherCodes.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active").$type<VoucherClaimStatus>(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    unique("voucher_claims_code_uq").on(table.voucherCodeId),
    index("voucher_claims_voucher_visitor_idx").on(table.voucherId, table.visitorId),
    index("voucher_claims_visitor_event_idx").on(table.visitorId, table.eventId),
    index("voucher_claims_tenant_idx").on(table.tenantId),
  ],
);

export type VoucherClaim = typeof voucherClaims.$inferSelect;
export type NewVoucherClaim = typeof voucherClaims.$inferInsert;
