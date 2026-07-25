"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "@/config/env";
import { AppError, isAppError } from "@/lib/api/errors";
import { requirePermission } from "@/server/policies/require-user";
import { revokeMerchantInvitation } from "@/server/db/repositories/merchant-members.repository";
import { AUDIT_ACTIONS, recordAudit } from "@/server/services/audit.service";
import {
  createCategory,
  createMerchant,
  deleteMerchant,
  inviteMerchantContact,
  setMerchantStatus,
  updateMerchant,
} from "@/server/services/merchant.service";
import { addParticipation, reviewParticipation } from "@/server/services/participation.service";
import { featureMerchant, unfeatureMerchant } from "@/server/services/featured.service";
import { isParticipationStatus, permissionForReview } from "@/server/merchants/status";

import { categorySchema, inviteMerchantSchema, merchantSchema } from "./schemas";
import type { MerchantFormState } from "./state";

/**
 * Organizer-side merchant actions. Each is gated by the matching `merchant.*`
 * permission via `requirePermission` — the UI is never the access control (§14).
 */

function errorState(error: unknown): MerchantFormState {
  if (isAppError(error) || error instanceof AppError) {
    return { status: "error", message: error.message };
  }
  return { status: "error", message: "Something went wrong. Please try again." };
}

function orNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function appOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : env.NEXT_PUBLIC_APP_URL;
}

export async function createMerchantAction(
  _prev: MerchantFormState,
  formData: FormData,
): Promise<MerchantFormState> {
  const parsed = merchantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  let merchantId: string;
  try {
    const ctx = await requirePermission("merchant.create");
    const d = parsed.data;
    const merchant = await createMerchant(ctx, {
      name: d.name,
      slug: orNull(d.slug) ?? undefined,
      categoryId: orNull(d.categoryId),
      description: orNull(d.description),
      contactName: orNull(d.contactName),
      contactEmail: orNull(d.contactEmail),
      contactPhone: orNull(d.contactPhone),
      website: orNull(d.website),
    });
    merchantId = merchant.id;
  } catch (error) {
    return errorState(error);
  }

  revalidatePath("/dashboard/merchants");
  redirect(`/dashboard/merchants/${merchantId}`);
}

export async function updateMerchantAction(
  _prev: MerchantFormState,
  formData: FormData,
): Promise<MerchantFormState> {
  const merchantId = formData.get("merchantId")?.toString() ?? "";
  const parsed = merchantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const ctx = await requirePermission("merchant.update");
    const d = parsed.data;
    await updateMerchant(ctx, merchantId, {
      name: d.name,
      slug: orNull(d.slug) ?? undefined,
      categoryId: orNull(d.categoryId),
      description: orNull(d.description),
      contactName: orNull(d.contactName),
      contactEmail: orNull(d.contactEmail),
      contactPhone: orNull(d.contactPhone),
      website: orNull(d.website),
    });
  } catch (error) {
    return errorState(error);
  }

  revalidatePath(`/dashboard/merchants/${merchantId}`);
  return { status: "success", message: "Saved." };
}

export async function suspendMerchantAction(formData: FormData): Promise<void> {
  const merchantId = formData.get("merchantId")?.toString() ?? "";
  const suspend = formData.get("suspend")?.toString() === "true";
  const ctx = await requirePermission("merchant.update");
  await setMerchantStatus(ctx, merchantId, suspend);
  revalidatePath(`/dashboard/merchants/${merchantId}`);
}

export async function deleteMerchantAction(formData: FormData): Promise<void> {
  const merchantId = formData.get("merchantId")?.toString() ?? "";
  const ctx = await requirePermission("merchant.delete");
  await deleteMerchant(ctx, merchantId);
  revalidatePath("/dashboard/merchants");
  redirect("/dashboard/merchants");
}

export async function inviteMerchantAction(
  _prev: MerchantFormState,
  formData: FormData,
): Promise<MerchantFormState> {
  const merchantId = formData.get("merchantId")?.toString() ?? "";
  const parsed = inviteMerchantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Enter a valid email address." };
  }

  try {
    const ctx = await requirePermission("merchant.update");
    const { token, email } = await inviteMerchantContact(ctx, merchantId, parsed.data.email);
    revalidatePath(`/dashboard/merchants/${merchantId}`);
    return {
      status: "success",
      message: `Invitation created for ${email}. Share this link — it expires in 14 days.`,
      inviteUrl: `${await appOrigin()}/merchant/invitations/${token}`,
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function revokeMerchantInvitationAction(formData: FormData): Promise<void> {
  const merchantId = formData.get("merchantId")?.toString() ?? "";
  const invitationId = formData.get("invitationId")?.toString() ?? "";
  const ctx = await requirePermission("merchant.update");
  const revoked = await revokeMerchantInvitation(ctx.tenant.id, invitationId);
  if (revoked) {
    await recordAudit(ctx, {
      action: AUDIT_ACTIONS.MERCHANT_INVITATION_REVOKED,
      resourceType: "merchant",
      resourceId: merchantId,
      after: { invitationId },
    });
  }
  revalidatePath(`/dashboard/merchants/${merchantId}`);
}

export async function createCategoryAction(
  _prev: MerchantFormState,
  formData: FormData,
): Promise<MerchantFormState> {
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Enter a category name." };
  }

  try {
    const ctx = await requirePermission("merchant.create");
    await createCategory(ctx, parsed.data.name);
  } catch (error) {
    return errorState(error);
  }

  revalidatePath("/dashboard/merchants/categories");
  return { status: "success", message: "Category added." };
}

export async function addParticipationAction(formData: FormData): Promise<void> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const merchantId = formData.get("merchantId")?.toString() ?? "";
  const ctx = await requirePermission("merchant.create");
  await addParticipation(ctx, eventId, merchantId);
  revalidatePath(`/dashboard/events/${eventId}/merchants`);
}

export async function reviewParticipationAction(
  _prev: MerchantFormState,
  formData: FormData,
): Promise<MerchantFormState> {
  const participationId = formData.get("participationId")?.toString() ?? "";
  const eventId = formData.get("eventId")?.toString() ?? "";
  const to = formData.get("to")?.toString() ?? "";
  const note = formData.get("note")?.toString() ?? "";
  if (!isParticipationStatus(to)) return { status: "error", message: "Unknown review action." };

  try {
    const ctx = await requirePermission(permissionForReview(to));
    await reviewParticipation(ctx, participationId, to, note);
  } catch (error) {
    return errorState(error);
  }

  revalidatePath(`/dashboard/events/${eventId}/merchants`);
  return { status: "success", message: `Listing ${to.replace(/_/g, " ")}.` };
}

/**
 * Feature / unfeature a merchant in an event (spec §8.7). Gated by
 * `merchant.feature`; `featureMerchant` additionally enforces the plan's
 * `featured_listings` entitlement and audits. Featuring sets the participation's
 * `featured_rank`, so the public directory boosts it.
 */
export async function featureMerchantAction(formData: FormData): Promise<void> {
  const participationId = formData.get("participationId")?.toString() ?? "";
  const eventId = formData.get("eventId")?.toString() ?? "";
  const ctx = await requirePermission("merchant.feature");
  await featureMerchant(ctx, { eventId, participationId });
  revalidatePath(`/dashboard/events/${eventId}/merchants`);
}

export async function unfeatureMerchantAction(formData: FormData): Promise<void> {
  const participationId = formData.get("participationId")?.toString() ?? "";
  const eventId = formData.get("eventId")?.toString() ?? "";
  const ctx = await requirePermission("merchant.feature");
  await unfeatureMerchant(ctx, { participationId });
  revalidatePath(`/dashboard/events/${eventId}/merchants`);
}
