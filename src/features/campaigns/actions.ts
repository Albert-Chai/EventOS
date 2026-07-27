"use server";

import { revalidatePath } from "next/cache";

import { isAppError } from "@/lib/api/errors";
import { requirePermission } from "@/server/policies/require-user";
import { createCampaign, sendCampaign } from "@/server/services/campaign.service";

import { createCampaignSchema, sendCampaignSchema } from "./schemas";
import type { CampaignFormState } from "./state";

/**
 * Campaign Server Actions, each re-checking `campaign.manage` (spec §14).
 * Sending is gated again in the service by the campaign status machine, so a
 * double-submit can't send twice.
 */

export async function createCampaignAction(
  _prev: CampaignFormState,
  formData: FormData,
): Promise<CampaignFormState> {
  const parsed = createCampaignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const ctx = await requirePermission("campaign.manage");
    await createCampaign(ctx, parsed.data);
  } catch (error) {
    return {
      status: "error",
      message: isAppError(error) ? error.message : "Couldn’t create that campaign.",
    };
  }

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/campaigns`);
  return { status: "success", message: "Campaign created." };
}

export async function sendCampaignAction(
  _prev: CampaignFormState,
  formData: FormData,
): Promise<CampaignFormState> {
  const parsed = sendCampaignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Invalid request." };

  try {
    const ctx = await requirePermission("campaign.manage");
    const { recipients, sent, simulated } = await sendCampaign(ctx, parsed.data.campaignId);
    revalidatePath("/dashboard/events", "layout");
    return {
      status: "success",
      message: simulated
        ? `Recorded ${sent} of ${recipients} deliveries (simulated — no provider configured).`
        : `Sent to ${sent} of ${recipients} recipients.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: isAppError(error) ? error.message : "Couldn’t send that campaign.",
    };
  }
}
