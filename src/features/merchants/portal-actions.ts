"use server";

import { revalidatePath } from "next/cache";

import { AppError, isAppError } from "@/lib/api/errors";
import { requireMerchantMember } from "@/server/policies/require-merchant";
import { addItem, deleteItem, updateItem } from "@/server/services/listing-item.service";
import {
  setParticipationStatusAsMerchant,
  updateListingAsMerchant,
} from "@/server/services/participation.service";
import { isParticipationStatus } from "@/server/merchants/status";

import { listingItemSchema, listingSchema } from "./schemas";
import type { MerchantFormState } from "./state";

/**
 * Merchant-portal actions. Gated by `requireMerchantMember(merchantId)` — the
 * merchantId arrives from the route but is *verified against membership* before
 * anything happens, so it is derived authority, not a trusted client value.
 */

function errorState(error: unknown): MerchantFormState {
  if (isAppError(error) || error instanceof AppError) {
    return { status: "error", message: error.message };
  }
  return { status: "error", message: "Something went wrong. Please try again." };
}

function splitTags(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function listingPath(merchantId: string, participationId: string): string {
  return `/merchant/${merchantId}/listings/${participationId}`;
}

export async function updateListingAction(
  _prev: MerchantFormState,
  formData: FormData,
): Promise<MerchantFormState> {
  const merchantId = formData.get("merchantId")?.toString() ?? "";
  const participationId = formData.get("participationId")?.toString() ?? "";
  const parsed = listingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Check the highlighted fields." };
  }

  try {
    const ctx = await requireMerchantMember(merchantId);
    await updateListingAsMerchant(ctx, participationId, {
      listingTitle: parsed.data.listingTitle ?? null,
      listingDescription: parsed.data.listingDescription ?? null,
    });
  } catch (error) {
    return errorState(error);
  }

  revalidatePath(listingPath(merchantId, participationId));
  return { status: "success", message: "Listing saved." };
}

export async function setListingStatusAction(
  _prev: MerchantFormState,
  formData: FormData,
): Promise<MerchantFormState> {
  const merchantId = formData.get("merchantId")?.toString() ?? "";
  const participationId = formData.get("participationId")?.toString() ?? "";
  const to = formData.get("to")?.toString() ?? "";
  if (!isParticipationStatus(to)) return { status: "error", message: "Unknown action." };

  try {
    const ctx = await requireMerchantMember(merchantId);
    await setParticipationStatusAsMerchant(ctx, participationId, to);
  } catch (error) {
    return errorState(error);
  }

  revalidatePath(listingPath(merchantId, participationId));
  return { status: "success", message: `Listing ${to.replace(/_/g, " ")}.` };
}

export async function addItemAction(
  _prev: MerchantFormState,
  formData: FormData,
): Promise<MerchantFormState> {
  const merchantId = formData.get("merchantId")?.toString() ?? "";
  const participationId = formData.get("participationId")?.toString() ?? "";
  const parsed = listingItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const ctx = await requireMerchantMember(merchantId);
    const d = parsed.data;
    await addItem(ctx, participationId, {
      name: d.name,
      description: d.description ?? null,
      price: d.price || null,
      promoPrice: d.promoPrice || null,
      currency: d.currency || "MYR",
      isHalal: Boolean(d.isHalal),
      availability: d.availability ?? "available",
      dietaryTags: splitTags(d.dietaryTags),
    });
  } catch (error) {
    return errorState(error);
  }

  revalidatePath(`${listingPath(merchantId, participationId)}/products`);
  return { status: "success", message: "Item added." };
}

export async function updateItemAction(
  _prev: MerchantFormState,
  formData: FormData,
): Promise<MerchantFormState> {
  const merchantId = formData.get("merchantId")?.toString() ?? "";
  const participationId = formData.get("participationId")?.toString() ?? "";
  const itemId = formData.get("itemId")?.toString() ?? "";
  const parsed = listingItemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const ctx = await requireMerchantMember(merchantId);
    const d = parsed.data;
    await updateItem(ctx, participationId, itemId, {
      name: d.name,
      description: d.description ?? null,
      price: d.price || null,
      promoPrice: d.promoPrice || null,
      currency: d.currency || "MYR",
      isHalal: Boolean(d.isHalal),
      availability: d.availability ?? "available",
      dietaryTags: splitTags(d.dietaryTags),
    });
  } catch (error) {
    return errorState(error);
  }

  revalidatePath(`${listingPath(merchantId, participationId)}/products`);
  return { status: "success", message: "Item saved." };
}

export async function deleteItemAction(formData: FormData): Promise<void> {
  const merchantId = formData.get("merchantId")?.toString() ?? "";
  const participationId = formData.get("participationId")?.toString() ?? "";
  const itemId = formData.get("itemId")?.toString() ?? "";
  const ctx = await requireMerchantMember(merchantId);
  await deleteItem(ctx, participationId, itemId);
  revalidatePath(`${listingPath(merchantId, participationId)}/products`);
}
