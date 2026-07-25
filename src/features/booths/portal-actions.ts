"use server";

import { revalidatePath } from "next/cache";

import { AppError, isAppError } from "@/lib/api/errors";
import { requireMerchantMember } from "@/server/policies/require-merchant";
import { confirmBoothAsMerchant } from "@/server/services/booth-assignment.service";

import type { BoothFormState } from "./state";

/**
 * Merchant-portal booth action: confirming the booth the organizer assigned
 * (spec §7 step 7). Gated by `requireMerchantMember(merchantId)` — the merchant
 * id comes from the route but is verified against membership before anything
 * happens, and the assignment is re-scoped to the merchant in the service.
 */

function errorState(error: unknown): BoothFormState {
  if (isAppError(error) || error instanceof AppError) {
    return { status: "error", message: error.message };
  }
  return { status: "error", message: "Something went wrong. Please try again." };
}

export async function confirmBoothAction(
  _prev: BoothFormState,
  formData: FormData,
): Promise<BoothFormState> {
  const merchantId = formData.get("merchantId")?.toString() ?? "";
  const participationId = formData.get("participationId")?.toString() ?? "";
  const assignmentId = formData.get("assignmentId")?.toString() ?? "";
  try {
    const ctx = await requireMerchantMember(merchantId);
    await confirmBoothAsMerchant(ctx, assignmentId);
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(`/merchant/${merchantId}/listings/${participationId}`);
  return { status: "success", message: "Booth confirmed." };
}
