import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  merchants,
  voucherClaims,
  voucherCodes,
  voucherRedemptions,
  vouchers,
  type NewVoucher,
  type Voucher,
} from "@/server/db/schema";
import type { VoucherStatus } from "@/server/vouchers/status";

/**
 * Vouchers (spec §34 Phase 8). Organizer reads are tenant-scoped; the public read
 * filters by *public status* under an already-resolved public event, the same
 * filter-don't-scope shape as `findPublicEvent` (CLAUDE §1 rule 6).
 *
 * The claim transaction lives here rather than in the service because it needs
 * `SELECT … FOR UPDATE` — raw SQL belongs in the repository layer.
 */

// --- Organizer (tenant-scoped) --------------------------------------------

export async function insertVoucher(row: NewVoucher): Promise<Voucher> {
  const [created] = await db.insert(vouchers).values(row).returning();
  return created!;
}

export async function findVoucherById(tenantId: string, id: string): Promise<Voucher | null> {
  const [row] = await db
    .select()
    .from(vouchers)
    .where(and(eq(vouchers.id, id), eq(vouchers.tenantId, tenantId), isNull(vouchers.deletedAt)))
    .limit(1);
  return row ?? null;
}

export type VoucherRow = Voucher & { merchantName: string | null };

export async function listVouchersForEvent(
  tenantId: string,
  eventId: string,
): Promise<VoucherRow[]> {
  const rows = await db
    .select({ voucher: vouchers, merchantName: merchants.name })
    .from(vouchers)
    .leftJoin(merchants, eq(merchants.id, vouchers.merchantId))
    .where(
      and(eq(vouchers.tenantId, tenantId), eq(vouchers.eventId, eventId), isNull(vouchers.deletedAt)),
    )
    .orderBy(desc(vouchers.createdAt));
  return rows.map((r) => ({ ...r.voucher, merchantName: r.merchantName }));
}

/** Vouchers attached to one merchant's listings — the merchant-portal read. */
export async function listVouchersForMerchant(merchantId: string): Promise<Voucher[]> {
  return db
    .select()
    .from(vouchers)
    .where(and(eq(vouchers.merchantId, merchantId), isNull(vouchers.deletedAt)))
    .orderBy(desc(vouchers.createdAt));
}

export async function updateVoucher(
  tenantId: string,
  id: string,
  patch: Partial<
    Pick<
      Voucher,
      | "title"
      | "description"
      | "terms"
      | "voucherType"
      | "discountPercent"
      | "discountAmountCents"
      | "minSpendCents"
      | "status"
      | "startsAt"
      | "endsAt"
      | "totalQuantity"
      | "perVisitorLimit"
      | "merchantId"
      | "imageFileId"
    >
  >,
): Promise<Voucher | null> {
  const [row] = await db
    .update(vouchers)
    .set(patch)
    .where(and(eq(vouchers.id, id), eq(vouchers.tenantId, tenantId), isNull(vouchers.deletedAt)))
    .returning();
  return row ?? null;
}

export async function countVouchersForEvent(tenantId: string, eventId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(vouchers)
    .where(
      and(eq(vouchers.tenantId, tenantId), eq(vouchers.eventId, eventId), isNull(vouchers.deletedAt)),
    );
  return row?.value ?? 0;
}

// --- Public (anonymous visitor) -------------------------------------------

export type PublicVoucherCard = {
  id: string;
  title: string;
  description: string | null;
  terms: string | null;
  voucherType: Voucher["voucherType"];
  discountPercent: number | null;
  discountAmountCents: number | null;
  currency: string;
  minSpendCents: number | null;
  status: VoucherStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  totalQuantity: number | null;
  claimedCount: number;
  perVisitorLimit: number;
  merchantId: string | null;
  merchantName: string | null;
  merchantSlug: string | null;
};

const publicVoucherColumns = {
  id: vouchers.id,
  title: vouchers.title,
  description: vouchers.description,
  terms: vouchers.terms,
  voucherType: vouchers.voucherType,
  discountPercent: vouchers.discountPercent,
  discountAmountCents: vouchers.discountAmountCents,
  currency: vouchers.currency,
  minSpendCents: vouchers.minSpendCents,
  status: vouchers.status,
  startsAt: vouchers.startsAt,
  endsAt: vouchers.endsAt,
  totalQuantity: vouchers.totalQuantity,
  claimedCount: vouchers.claimedCount,
  perVisitorLimit: vouchers.perVisitorLimit,
  merchantId: vouchers.merchantId,
  merchantName: merchants.name,
  merchantSlug: merchants.slug,
};

/**
 * Vouchers a visitor may see for a (already public-resolved) event. Only `active`
 * vouchers are ever returned — a draft, paused, or archived voucher is
 * indistinguishable from "not there", exactly like a draft event.
 */
export async function listPublicVouchers(eventId: string): Promise<PublicVoucherCard[]> {
  return db
    .select(publicVoucherColumns)
    .from(vouchers)
    .leftJoin(merchants, eq(merchants.id, vouchers.merchantId))
    .where(
      and(eq(vouchers.eventId, eventId), eq(vouchers.status, "active"), isNull(vouchers.deletedAt)),
    )
    .orderBy(asc(vouchers.endsAt), desc(vouchers.createdAt));
}

/** One public voucher, or null — the claim path's resolution seam. */
export async function findPublicVoucher(
  eventId: string,
  voucherId: string,
): Promise<PublicVoucherCard | null> {
  const [row] = await db
    .select(publicVoucherColumns)
    .from(vouchers)
    .leftJoin(merchants, eq(merchants.id, vouchers.merchantId))
    .where(
      and(
        eq(vouchers.id, voucherId),
        eq(vouchers.eventId, eventId),
        eq(vouchers.status, "active"),
        isNull(vouchers.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

// --- The claim transaction -------------------------------------------------

export type ClaimOutcome =
  | { ok: true; code: string; codeId: string; claimId: string }
  | { ok: false; reason: "not_claimable" | "sold_out" | "limit_reached" };

/**
 * Claims a voucher for a visitor, atomically.
 *
 * The voucher row is locked (`SELECT … FOR UPDATE`) *before* the quantity and
 * per-visitor counts are read, so two concurrent claims can't both see the last
 * remaining voucher and both succeed. Everything — the counts, the code, the
 * claim, and the counter bump — happens inside that one transaction.
 *
 * `generateCode` is injected so the (crypto) code generator stays in `lib` and
 * this module keeps no dependency on it.
 */
export async function claimVoucherTx(input: {
  voucherId: string;
  visitorId: string;
  eventId: string;
  now: Date;
  generateCode: () => string;
}): Promise<ClaimOutcome> {
  return db.transaction(async (tx) => {
    const [voucher] = await tx
      .select()
      .from(vouchers)
      .where(and(eq(vouchers.id, input.voucherId), isNull(vouchers.deletedAt)))
      .for("update")
      .limit(1);

    if (!voucher || voucher.eventId !== input.eventId || voucher.status !== "active") {
      return { ok: false, reason: "not_claimable" };
    }
    if (voucher.startsAt && input.now < voucher.startsAt) {
      return { ok: false, reason: "not_claimable" };
    }
    if (voucher.endsAt && input.now >= voucher.endsAt) {
      return { ok: false, reason: "not_claimable" };
    }
    if (voucher.totalQuantity !== null && voucher.claimedCount >= voucher.totalQuantity) {
      return { ok: false, reason: "sold_out" };
    }

    const [mine] = await tx
      .select({ value: count() })
      .from(voucherClaims)
      .where(
        and(
          eq(voucherClaims.voucherId, input.voucherId),
          eq(voucherClaims.visitorId, input.visitorId),
        ),
      );
    if ((mine?.value ?? 0) >= voucher.perVisitorLimit) {
      return { ok: false, reason: "limit_reached" };
    }

    const [code] = await tx
      .insert(voucherCodes)
      .values({
        tenantId: voucher.tenantId,
        voucherId: voucher.id,
        code: input.generateCode(),
        expiresAt: voucher.endsAt,
      })
      .returning();

    const [claim] = await tx
      .insert(voucherClaims)
      .values({
        tenantId: voucher.tenantId,
        voucherId: voucher.id,
        eventId: voucher.eventId,
        visitorId: input.visitorId,
        voucherCodeId: code!.id,
      })
      .returning();

    await tx
      .update(vouchers)
      .set({ claimedCount: sql`${vouchers.claimedCount} + 1` })
      .where(eq(vouchers.id, voucher.id));

    return { ok: true, code: code!.code, codeId: code!.id, claimId: claim!.id };
  });
}

/** Bumps the denormalized redeemed counter (redemption rows stay authoritative). */
export async function incrementRedeemedCount(voucherId: string): Promise<void> {
  await db
    .update(vouchers)
    .set({ redeemedCount: sql`${vouchers.redeemedCount} + 1` })
    .where(eq(vouchers.id, voucherId));
}

/** Per-voucher claim/redemption totals for the organizer's voucher report. */
export async function voucherPerformance(
  tenantId: string,
  eventId: string,
): Promise<{ voucherId: string; claims: number; redemptions: number }[]> {
  const claims = await db
    .select({ voucherId: voucherClaims.voucherId, value: count() })
    .from(voucherClaims)
    .where(and(eq(voucherClaims.tenantId, tenantId), eq(voucherClaims.eventId, eventId)))
    .groupBy(voucherClaims.voucherId);

  const redemptions = await db
    .select({ voucherId: voucherRedemptions.voucherId, value: count() })
    .from(voucherRedemptions)
    .where(and(eq(voucherRedemptions.tenantId, tenantId), eq(voucherRedemptions.eventId, eventId)))
    .groupBy(voucherRedemptions.voucherId);

  const map = new Map<string, { voucherId: string; claims: number; redemptions: number }>();
  for (const c of claims) map.set(c.voucherId, { voucherId: c.voucherId, claims: c.value, redemptions: 0 });
  for (const r of redemptions) {
    const entry = map.get(r.voucherId) ?? { voucherId: r.voucherId, claims: 0, redemptions: 0 };
    entry.redemptions = r.value;
    map.set(r.voucherId, entry);
  }
  return [...map.values()];
}
