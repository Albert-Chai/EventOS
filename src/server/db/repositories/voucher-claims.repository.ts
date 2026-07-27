import { and, desc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  merchants,
  voucherClaims,
  voucherCodes,
  voucherRedemptions,
  vouchers,
  type NewVoucherRedemption,
  type VoucherClaim,
} from "@/server/db/schema";
import type { VoucherType } from "@/server/vouchers/status";

/**
 * Claimed codes, and the redemption path (spec §34 Phase 8).
 *
 * `findRedeemableCode` is the merchant/checker seam: it resolves a **code
 * string** — the capability the visitor presents, like a QR short code — and
 * returns the row plus its tenant/event/merchant so the caller can verify the
 * redeemer is entitled to it. The code itself is never enough; the service still
 * checks scope.
 */

export type ClaimedVoucherCard = {
  claimId: string;
  voucherId: string;
  code: string;
  codeStatus: string;
  claimedAt: Date;
  expiresAt: Date | null;
  title: string;
  description: string | null;
  terms: string | null;
  voucherType: VoucherType;
  discountPercent: number | null;
  discountAmountCents: number | null;
  currency: string;
  merchantName: string | null;
  redeemedAt: Date | null;
};

/** A visitor's claimed vouchers for one event — the "my vouchers" surface. */
export async function listClaimsForVisitor(
  visitorId: string,
  eventId: string,
): Promise<ClaimedVoucherCard[]> {
  return db
    .select({
      claimId: voucherClaims.id,
      voucherId: vouchers.id,
      code: voucherCodes.code,
      codeStatus: voucherCodes.status,
      claimedAt: voucherClaims.claimedAt,
      expiresAt: voucherCodes.expiresAt,
      title: vouchers.title,
      description: vouchers.description,
      terms: vouchers.terms,
      voucherType: vouchers.voucherType,
      discountPercent: vouchers.discountPercent,
      discountAmountCents: vouchers.discountAmountCents,
      currency: vouchers.currency,
      merchantName: merchants.name,
      redeemedAt: voucherRedemptions.redeemedAt,
    })
    .from(voucherClaims)
    .innerJoin(vouchers, eq(vouchers.id, voucherClaims.voucherId))
    .innerJoin(voucherCodes, eq(voucherCodes.id, voucherClaims.voucherCodeId))
    .leftJoin(merchants, eq(merchants.id, vouchers.merchantId))
    .leftJoin(voucherRedemptions, eq(voucherRedemptions.voucherCodeId, voucherCodes.id))
    .where(and(eq(voucherClaims.visitorId, visitorId), eq(voucherClaims.eventId, eventId)))
    .orderBy(desc(voucherClaims.claimedAt));
}

/** The voucher ids this visitor has already claimed, for the public list's state. */
export async function listClaimedVoucherIds(
  visitorId: string,
  eventId: string,
): Promise<string[]> {
  const rows = await db
    .select({ voucherId: voucherClaims.voucherId })
    .from(voucherClaims)
    .where(and(eq(voucherClaims.visitorId, visitorId), eq(voucherClaims.eventId, eventId)));
  return rows.map((r) => r.voucherId);
}

export type RedeemableCode = {
  codeId: string;
  code: string;
  codeStatus: string;
  expiresAt: Date | null;
  voucherId: string;
  tenantId: string;
  eventId: string;
  voucherMerchantId: string | null;
  claimId: string | null;
  visitorId: string | null;
  title: string;
  voucherType: VoucherType;
  discountPercent: number | null;
  discountAmountCents: number | null;
  currency: string;
  alreadyRedeemedAt: Date | null;
};

/**
 * Resolves a presented code string. Not tenant-scoped by argument — the code *is*
 * the capability (like a QR short code) — but it returns the owning tenant/event/
 * merchant so the caller can reject a code that isn't theirs to redeem.
 */
export async function findRedeemableCode(code: string): Promise<RedeemableCode | null> {
  const [row] = await db
    .select({
      codeId: voucherCodes.id,
      code: voucherCodes.code,
      codeStatus: voucherCodes.status,
      expiresAt: voucherCodes.expiresAt,
      voucherId: vouchers.id,
      tenantId: vouchers.tenantId,
      eventId: vouchers.eventId,
      voucherMerchantId: vouchers.merchantId,
      claimId: voucherClaims.id,
      visitorId: voucherClaims.visitorId,
      title: vouchers.title,
      voucherType: vouchers.voucherType,
      discountPercent: vouchers.discountPercent,
      discountAmountCents: vouchers.discountAmountCents,
      currency: vouchers.currency,
      alreadyRedeemedAt: voucherRedemptions.redeemedAt,
    })
    .from(voucherCodes)
    .innerJoin(vouchers, eq(vouchers.id, voucherCodes.voucherId))
    .leftJoin(voucherClaims, eq(voucherClaims.voucherCodeId, voucherCodes.id))
    .leftJoin(voucherRedemptions, eq(voucherRedemptions.voucherCodeId, voucherCodes.id))
    .where(eq(voucherCodes.code, code))
    .limit(1);
  return row ?? null;
}

/**
 * Records a redemption and flips the code + claim. The `unique(voucher_code_id)`
 * constraint on `voucher_redemptions` is what actually prevents a double
 * redemption under concurrency — this insert throws if another request won.
 */
export async function insertRedemption(row: NewVoucherRedemption): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(voucherRedemptions).values(row);
    await tx
      .update(voucherCodes)
      .set({ status: "redeemed" })
      .where(eq(voucherCodes.id, row.voucherCodeId));
    if (row.claimId) {
      await tx.update(voucherClaims).set({ status: "redeemed" }).where(eq(voucherClaims.id, row.claimId));
    }
  });
}

/** Recent redemptions for an event — the organizer/merchant activity list. */
export async function listRecentRedemptions(
  tenantId: string,
  eventId: string,
  limit = 20,
): Promise<
  { id: string; code: string; title: string; redeemedAt: Date; merchantName: string | null }[]
> {
  return db
    .select({
      id: voucherRedemptions.id,
      code: voucherCodes.code,
      title: vouchers.title,
      redeemedAt: voucherRedemptions.redeemedAt,
      merchantName: merchants.name,
    })
    .from(voucherRedemptions)
    .innerJoin(voucherCodes, eq(voucherCodes.id, voucherRedemptions.voucherCodeId))
    .innerJoin(vouchers, eq(vouchers.id, voucherRedemptions.voucherId))
    .leftJoin(merchants, eq(merchants.id, voucherRedemptions.merchantId))
    .where(
      and(eq(voucherRedemptions.tenantId, tenantId), eq(voucherRedemptions.eventId, eventId)),
    )
    .orderBy(desc(voucherRedemptions.redeemedAt))
    .limit(limit);
}

export async function findClaimById(id: string): Promise<VoucherClaim | null> {
  const [row] = await db.select().from(voucherClaims).where(eq(voucherClaims.id, id)).limit(1);
  return row ?? null;
}
