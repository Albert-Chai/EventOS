import { redirect } from "next/navigation";

import { AppError } from "@/lib/api/errors";
import type { MerchantContext, MerchantScopedContext } from "@/server/context";
import { findMerchantForMember } from "@/server/db/repositories/merchants.repository";
import type { Merchant } from "@/server/db/schema";
import { requireUser, requireUserOrRedirect } from "./require-user";

/**
 * The merchant authority axis (spec §8.4). A user reaches a merchant only through
 * an active `merchant_members` row — the `merchant_id` is *derived* from that
 * membership here, never taken from the request. This is the exact analogue of
 * `requireTenant`, on the second axis.
 *
 * Merchants have no sub-roles in Phase 3: managing the merchant is the whole
 * grant, so there is no `requireMerchantPermission`.
 */

function toMerchantContext(merchant: Merchant): MerchantContext {
  return {
    id: merchant.id,
    tenantId: merchant.tenantId,
    name: merchant.name,
    slug: merchant.slug,
  };
}

export async function requireMerchantMember(merchantId: string): Promise<MerchantScopedContext> {
  const ctx = await requireUser();
  const merchant = await findMerchantForMember(ctx.user.id, merchantId);
  if (!merchant) {
    throw new AppError("FORBIDDEN", { message: "You do not manage this merchant." });
  }
  return { ...ctx, merchant: toMerchantContext(merchant) };
}

export async function requireMerchantMemberOrRedirect(
  merchantId: string,
  returnTo: string,
): Promise<MerchantScopedContext> {
  const ctx = await requireUserOrRedirect(returnTo);
  const merchant = await findMerchantForMember(ctx.user.id, merchantId);
  // Not a member → back to the portal index rather than a 403 body.
  if (!merchant) redirect("/merchant");
  return { ...ctx, merchant: toMerchantContext(merchant) };
}
