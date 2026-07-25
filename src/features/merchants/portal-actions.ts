"use server";

import { revalidatePath } from "next/cache";

import { AppError, isAppError } from "@/lib/api/errors";
import { requireMerchantMember } from "@/server/policies/require-merchant";
import { parseImageChange } from "@/server/services/entity-media.service";
import {
  addItem,
  deleteItem,
  setItemImage,
  updateItem,
} from "@/server/services/listing-item.service";
import { setMerchantImageAsMember } from "@/server/services/merchant.service";
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

/** Sets or clears an item's photo (the media pass). */
export async function setItemImageAction(
  _prev: MerchantFormState,
  formData: FormData,
): Promise<MerchantFormState> {
  const merchantId = formData.get("merchantId")?.toString() ?? "";
  const participationId = formData.get("participationId")?.toString() ?? "";
  const itemId = formData.get("itemId")?.toString() ?? "";
  const change = parseImageChange(formData, "image");
  if (!change) return { status: "idle" };
  try {
    const ctx = await requireMerchantMember(merchantId);
    await setItemImage(ctx, participationId, itemId, change);
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(`${listingPath(merchantId, participationId)}/products`);
  return { status: "success", message: "Photo saved." };
}

/** Sets or clears the merchant's logo or cover (the media pass). */
export async function setMerchantImageAction(
  _prev: MerchantFormState,
  formData: FormData,
): Promise<MerchantFormState> {
  const merchantId = formData.get("merchantId")?.toString() ?? "";
  const kind = formData.get("kind")?.toString() === "cover" ? "cover" : "logo";
  const change = parseImageChange(formData, kind);
  if (!change) return { status: "idle" };
  try {
    const ctx = await requireMerchantMember(merchantId);
    await setMerchantImageAsMember(ctx, kind, change);
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(`/merchant/${merchantId}`);
  return { status: "success", message: `${kind === "logo" ? "Logo" : "Cover"} saved.` };
}
