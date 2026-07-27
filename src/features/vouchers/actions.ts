"use server";

import { revalidatePath } from "next/cache";

import { isAppError } from "@/lib/api/errors";
import { requireMerchantMember } from "@/server/policies/require-merchant";
import { requirePermission } from "@/server/policies/require-user";
import {
  changeVoucherStatus,
  claimVoucher,
  createVoucher,
  redeemVoucher,
} from "@/server/services/voucher.service";

import { claimVoucherSchema, createVoucherSchema, redeemCodeSchema, voucherStatusSchema } from "./schemas";
import type { ClaimResult, RedeemState, VoucherFormState } from "./state";

/**
 * Voucher Server Actions. Organizer actions re-check `voucher.manage` /
 * `voucher.redeem` and merchant actions re-check merchant membership — hiding a
 * control is never the access control (spec §14). The claim action is public: the
 * tenant + event come from the URL slugs inside the service, never the client.
 */

function errorMessage(error: unknown, fallback: string): string {
  return isAppError(error) ? error.message : fallback;
}

export async function createVoucherAction(
  _prev: VoucherFormState,
  formData: FormData,
): Promise<VoucherFormState> {
  const parsed = createVoucherSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const ctx = await requirePermission("voucher.manage");
    const { discountAmount, ...rest } = parsed.data;
    await createVoucher(ctx, { ...rest, discountAmountCents: discountAmount });
  } catch (error) {
    return { status: "error", message: errorMessage(error, "Couldn’t create that voucher.") };
  }

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/vouchers`);
  return { status: "success", message: "Voucher created." };
}

export async function changeVoucherStatusAction(formData: FormData): Promise<void> {
  const parsed = voucherStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const ctx = await requirePermission("voucher.manage");
  const voucher = await changeVoucherStatus(ctx, parsed.data.voucherId, parsed.data.status);
  revalidatePath(`/dashboard/events/${voucher.eventId}/vouchers`);
}

/** Public: claim a voucher for the cookie visitor. */
export async function claimVoucherAction(input: unknown): Promise<ClaimResult> {
  const parsed = claimVoucherSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };

  try {
    const { code, title } = await claimVoucher(parsed.data);
    revalidatePath(`/${parsed.data.tenantSlug}/${parsed.data.eventSlug}/vouchers`);
    return { ok: true, code, title };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "Couldn’t claim that voucher.") };
  }
}

/** Merchant portal redemption — gated by merchant membership. */
export async function redeemAsMerchantAction(
  _prev: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const parsed = redeemCodeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Enter a valid voucher code." };
  }
  if (!parsed.data.merchantId) {
    return { status: "error", message: "Missing merchant." };
  }

  try {
    const ctx = await requireMerchantMember(parsed.data.merchantId);
    const result = await redeemVoucher(ctx, {
      tenantId: ctx.merchant.tenantId,
      code: parsed.data.code,
      merchantId: ctx.merchant.id,
      notes: parsed.data.notes ?? null,
    });
    return {
      status: "success",
      code: result.code,
      title: result.title,
      discountLabel: result.discountLabel,
      redeemedAt: result.redeemedAt.toISOString(),
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error, "Couldn’t redeem that code.") };
  }
}

/** Organizer-side redemption — the `voucher.redeem` (checker) screen. */
export async function redeemAsOrganizerAction(
  _prev: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const parsed = redeemCodeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Enter a valid voucher code." };
  }

  try {
    const ctx = await requirePermission("voucher.redeem");
    const result = await redeemVoucher(ctx, {
      tenantId: ctx.tenant.id,
      code: parsed.data.code,
      notes: parsed.data.notes ?? null,
    });
    return {
      status: "success",
      code: result.code,
      title: result.title,
      discountLabel: result.discountLabel,
      redeemedAt: result.redeemedAt.toISOString(),
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error, "Couldn’t redeem that code.") };
  }
}
