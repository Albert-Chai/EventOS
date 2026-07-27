import { AppError } from "@/lib/api/errors";
import { generateShortCode } from "@/lib/short-code";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import { getEventSettings } from "@/server/db/repositories/event-config.repository";
import { insertUsageRecord } from "@/server/db/repositories/usage-records.repository";
import {
  findRedeemableCode,
  insertRedemption,
  listClaimedVoucherIds,
  listClaimsForVisitor,
  listRecentRedemptions,
  type ClaimedVoucherCard,
  type RedeemableCode,
} from "@/server/db/repositories/voucher-claims.repository";
import {
  claimVoucherTx,
  findPublicVoucher,
  findVoucherById,
  incrementRedeemedCount,
  insertVoucher,
  listPublicVouchers,
  listVouchersForEvent,
  listVouchersForMerchant,
  updateVoucher,
  voucherPerformance,
  type PublicVoucherCard,
  type VoucherRow,
} from "@/server/db/repositories/vouchers.repository";
import type { AuthenticatedContext, TenantScopedContext } from "@/server/context";
import type { Voucher } from "@/server/db/schema";
import {
  canTransitionVoucher,
  describeDiscount,
  isClaimable,
  type VoucherStatus,
  type VoucherType,
} from "@/server/vouchers/status";
import { captureRequestSignals, recordAnalyticsEvent } from "./analytics.service";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";
import { requirePlanFeature } from "./usage.service";
import { getVisitorForRead, resolveVisitorForClaim } from "./visitor.service";

/**
 * Vouchers: creation and lifecycle (organizer), claiming (anonymous visitor), and
 * redemption (merchant or organizer checker) — spec §34 Phase 8.
 *
 * The public claim path follows the §1/§6 seam exactly like Phase 5/7: the tenant
 * and event are resolved from the **URL slugs**, the visitor from the
 * `eventos_vid` cookie. A voucher id is the only client-supplied value, and it is
 * validated against the resolved public event before anything is written.
 */

// --- Organizer ---------------------------------------------------------------

export type CreateVoucherInput = {
  eventId: string;
  title: string;
  description?: string | null;
  terms?: string | null;
  voucherType: VoucherType;
  discountPercent?: number | null;
  discountAmountCents?: number | null;
  minSpendCents?: number | null;
  merchantId?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  totalQuantity?: number | null;
  perVisitorLimit?: number;
};

export async function createVoucher(
  ctx: TenantScopedContext,
  input: CreateVoucherInput,
): Promise<Voucher> {
  // Vouchers are a paid entitlement (Phase 6 defined it; this is its first use).
  await requirePlanFeature(ctx.tenant.id, "vouchers");

  const voucher = await insertVoucher({
    tenantId: ctx.tenant.id,
    eventId: input.eventId,
    merchantId: input.merchantId ?? null,
    title: input.title,
    description: input.description ?? null,
    terms: input.terms ?? null,
    voucherType: input.voucherType,
    discountPercent: input.discountPercent ?? null,
    discountAmountCents: input.discountAmountCents ?? null,
    minSpendCents: input.minSpendCents ?? null,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    totalQuantity: input.totalQuantity ?? null,
    perVisitorLimit: input.perVisitorLimit ?? 1,
    createdBy: ctx.user.id,
  });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.VOUCHER_CREATED,
    resourceType: "voucher",
    resourceId: voucher.id,
    after: { title: voucher.title, eventId: voucher.eventId, type: voucher.voucherType },
  });
  return voucher;
}

export async function listEventVouchers(
  ctx: TenantScopedContext,
  eventId: string,
): Promise<VoucherRow[]> {
  return listVouchersForEvent(ctx.tenant.id, eventId);
}

export async function changeVoucherStatus(
  ctx: TenantScopedContext,
  voucherId: string,
  to: VoucherStatus,
): Promise<Voucher> {
  const voucher = await findVoucherById(ctx.tenant.id, voucherId);
  if (!voucher) throw new AppError("VOUCHER_NOT_FOUND");

  if (!canTransitionVoucher(voucher.status, to)) {
    throw new AppError("INVALID_STATE_TRANSITION", {
      message: `A ${voucher.status} voucher cannot become ${to}.`,
    });
  }

  const updated = await updateVoucher(ctx.tenant.id, voucherId, { status: to });
  if (!updated) throw new AppError("VOUCHER_NOT_FOUND");

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.VOUCHER_STATUS_CHANGED,
    resourceType: "voucher",
    resourceId: voucherId,
    before: { status: voucher.status },
    after: { status: to },
  });
  return updated;
}

/** Claim/redemption totals per voucher — the organizer's voucher report. */
export async function getVoucherPerformance(ctx: TenantScopedContext, eventId: string) {
  const [vouchers, performance, recent] = await Promise.all([
    listVouchersForEvent(ctx.tenant.id, eventId),
    voucherPerformance(ctx.tenant.id, eventId),
    listRecentRedemptions(ctx.tenant.id, eventId),
  ]);
  const byId = new Map(performance.map((p) => [p.voucherId, p]));
  return {
    vouchers: vouchers.map((v) => ({
      ...v,
      claims: byId.get(v.id)?.claims ?? 0,
      redemptions: byId.get(v.id)?.redemptions ?? 0,
    })),
    recent,
  };
}

export async function listMerchantVouchers(merchantId: string): Promise<Voucher[]> {
  return listVouchersForMerchant(merchantId);
}

// --- Public: browsing + claiming --------------------------------------------

type PublicRef = { tenantSlug: string; eventSlug: string };

/** Resolves the public event, enforcing the per-event `enable_vouchers` toggle. */
async function resolveVoucherEvent(ref: PublicRef) {
  const event = await findPublicEvent(ref.tenantSlug, ref.eventSlug);
  if (!event) throw new AppError("EVENT_NOT_FOUND");
  const settings = await getEventSettings(event.tenantId, event.id);
  if (settings && !settings.enableVouchers) {
    throw new AppError("EVENT_NOT_FOUND", { message: "Vouchers are not available for this event." });
  }
  return event;
}

export type PublicVoucherView = PublicVoucherCard & { claimable: boolean; claimed: boolean };

/** The public voucher list, with each card's claimable/claimed state resolved. */
export async function listPublicVouchersForRead(
  ref: PublicRef,
): Promise<{ vouchers: PublicVoucherView[]; enabled: boolean }> {
  const event = await findPublicEvent(ref.tenantSlug, ref.eventSlug);
  if (!event) return { vouchers: [], enabled: false };
  const settings = await getEventSettings(event.tenantId, event.id);
  if (settings && !settings.enableVouchers) return { vouchers: [], enabled: false };

  const [cards, visitor] = await Promise.all([listPublicVouchers(event.id), getVisitorForRead()]);
  const claimedIds = visitor ? new Set(await listClaimedVoucherIds(visitor.id, event.id)) : new Set<string>();
  const now = new Date();

  return {
    enabled: true,
    vouchers: cards.map((card) => ({
      ...card,
      claimable: isClaimable(card, now),
      claimed: claimedIds.has(card.id),
    })),
  };
}

/** A visitor's claimed codes for the event — the "my vouchers" surface. */
export async function listMyVouchers(ref: PublicRef): Promise<ClaimedVoucherCard[]> {
  const event = await findPublicEvent(ref.tenantSlug, ref.eventSlug);
  if (!event) return [];
  const visitor = await getVisitorForRead();
  if (!visitor) return [];
  return listClaimsForVisitor(visitor.id, event.id);
}

/**
 * Claims a voucher for the cookie visitor. The heavy lifting (locking, limits,
 * code minting) is one transaction in the repository; this layer resolves the
 * public target, maps outcomes to error codes, and records the side effects
 * (analytics + the §22 usage ledger).
 */
export async function claimVoucher(
  ref: PublicRef & { voucherId: string },
): Promise<{ code: string; title: string }> {
  const event = await resolveVoucherEvent(ref);

  const card = await findPublicVoucher(event.id, ref.voucherId);
  if (!card) throw new AppError("VOUCHER_NOT_FOUND");

  // A visitor row is required to own the claim, so this is the one public path
  // that materialises one (unlike browsing, which still writes nothing).
  const visitor = await resolveVisitorForClaim();

  const outcome = await claimVoucherTx({
    voucherId: card.id,
    visitorId: visitor.id,
    eventId: event.id,
    now: new Date(),
    generateCode: () => generateShortCode(10).toUpperCase(),
  });

  if (!outcome.ok) {
    if (outcome.reason === "sold_out") throw new AppError("VOUCHER_SOLD_OUT");
    if (outcome.reason === "limit_reached") throw new AppError("VOUCHER_LIMIT_REACHED");
    throw new AppError("VOUCHER_NOT_CLAIMABLE");
  }

  // Best-effort side effects — the claim itself is already committed.
  try {
    const signals = await captureRequestSignals();
    await recordAnalyticsEvent({
      tenantId: event.tenantId,
      eventId: event.id,
      merchantId: card.merchantId,
      visitorId: visitor.id,
      anonymousId: visitor.anonymousId,
      name: "voucher_claimed",
      deviceType: signals.deviceType,
      browser: signals.browser,
      referrer: signals.referrer,
      source: signals.source,
      props: { voucherId: card.id },
    });
    await recordUsageForTenant(event.tenantId, event.id, "voucher_claims");
  } catch {
    // Tracking must never fail a claim the visitor already made.
  }

  return { code: outcome.code, title: card.title };
}

/**
 * The §22 ledger write for a public (context-free) path. `recordUsage` takes a
 * `TenantScopedContext` for organizer actions; a visitor claim has no such
 * context, so the tenant comes from the resolved public event.
 */
async function recordUsageForTenant(
  tenantId: string,
  eventId: string,
  metric: "voucher_claims" | "voucher_redemptions",
): Promise<void> {
  await insertUsageRecord({ tenantId, eventId, metric, quantity: 1, source: "voucher" });
}

// --- Redemption --------------------------------------------------------------

export type RedeemResult = {
  code: string;
  title: string;
  discountLabel: string;
  redeemedAt: Date;
};

/** Validates a presented code without redeeming — the "check" step in the UI. */
export async function lookupCode(
  scope: { tenantId: string; merchantId?: string },
  code: string,
): Promise<RedeemableCode> {
  const row = await findRedeemableCode(code.trim().toUpperCase());
  if (!row) throw new AppError("VOUCHER_CODE_NOT_FOUND");

  // Cross-tenant codes are a 403, never a 404 that leaks existence (CLAUDE §5).
  if (row.tenantId !== scope.tenantId) throw new AppError("TENANT_MISMATCH");

  // A merchant may only redeem vouchers scoped to it (or event-wide ones).
  if (scope.merchantId && row.voucherMerchantId && row.voucherMerchantId !== scope.merchantId) {
    throw new AppError("FORBIDDEN", {
      message: "That voucher belongs to another merchant.",
    });
  }
  return row;
}

/**
 * Redeems a code. `unique(voucher_code_id)` on `voucher_redemptions` is the real
 * guarantee against a double redeem under concurrency; the pre-checks here exist
 * to produce a friendly error in the common case.
 */
export async function redeemVoucher(
  ctx: AuthenticatedContext,
  input: {
    tenantId: string;
    code: string;
    merchantId?: string;
    notes?: string | null;
  },
): Promise<RedeemResult> {
  const row = await lookupCode({ tenantId: input.tenantId, merchantId: input.merchantId }, input.code);

  if (row.alreadyRedeemedAt || row.codeStatus === "redeemed") {
    throw new AppError("VOUCHER_ALREADY_REDEEMED");
  }
  if (row.codeStatus === "void") throw new AppError("VOUCHER_CODE_NOT_FOUND");
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    throw new AppError("VOUCHER_EXPIRED");
  }

  const redeemedAt = new Date();
  try {
    await insertRedemption({
      tenantId: row.tenantId,
      voucherId: row.voucherId,
      voucherCodeId: row.codeId,
      claimId: row.claimId,
      eventId: row.eventId,
      merchantId: row.voucherMerchantId,
      visitorId: row.visitorId,
      redeemedByUserId: ctx.user.id,
      redeemedByMerchantId: input.merchantId ?? null,
      notes: input.notes ?? null,
      redeemedAt,
    });
  } catch (error) {
    // The unique constraint fired: another scan won the race.
    throw new AppError("VOUCHER_ALREADY_REDEEMED", { cause: error });
  }

  await incrementRedeemedCount(row.voucherId);

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.VOUCHER_REDEEMED,
    resourceType: "voucher_code",
    resourceId: row.codeId,
    tenantId: row.tenantId,
    after: { voucherId: row.voucherId, code: row.code, merchantId: input.merchantId ?? null },
  });

  try {
    await recordAnalyticsEvent({
      tenantId: row.tenantId,
      eventId: row.eventId,
      merchantId: row.voucherMerchantId,
      visitorId: row.visitorId,
      name: "voucher_redeemed",
      source: "redeem",
      props: { voucherId: row.voucherId },
    });
    await recordUsageForTenant(row.tenantId, row.eventId, "voucher_redemptions");
  } catch {
    // Never fail a completed redemption because telemetry hiccuped.
  }

  return {
    code: row.code,
    title: row.title,
    discountLabel: describeDiscount({
      voucherType: row.voucherType,
      discountPercent: row.discountPercent,
      discountAmountCents: row.discountAmountCents,
      currency: row.currency,
    }),
    redeemedAt,
  };
}
