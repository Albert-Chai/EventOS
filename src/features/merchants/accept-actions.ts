"use server";

import { redirect } from "next/navigation";

import { AppError, isAppError } from "@/lib/api/errors";
import { requireUser } from "@/server/policies/require-user";
import { acceptMerchantInvitation } from "@/server/services/merchant.service";

import type { AcceptMerchantState } from "./state";

/**
 * Accept a merchant claim invitation. Requires the invitee to be signed in
 * (the page routes them through sign-in first) and enforces the email match in
 * the service. On success, lands them in their new merchant's portal.
 */
export async function acceptMerchantInvitationAction(
  _prev: AcceptMerchantState,
  formData: FormData,
): Promise<AcceptMerchantState> {
  const token = formData.get("token")?.toString() ?? "";

  let merchantId: string;
  try {
    const ctx = await requireUser();
    const result = await acceptMerchantInvitation(ctx, token);
    merchantId = result.merchantId;
  } catch (error) {
    if (isAppError(error) || error instanceof AppError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "Could not accept the invitation." };
  }

  redirect(`/merchant/${merchantId}`);
}
