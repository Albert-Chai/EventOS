import { AppError } from "@/lib/api/errors";
import type { MerchantScopedContext } from "@/server/context";
import {
  countItemsForParticipation,
  deleteItemInParticipation,
  findItemInParticipation,
  insertItem,
  updateItemInParticipation,
} from "@/server/db/repositories/listing-items.repository";
import { findParticipationForMerchant } from "@/server/db/repositories/participations.repository";
import type { ListingItem, MerchantEventParticipation } from "@/server/db/schema";
import type { ItemAvailability } from "@/server/merchants/status";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";

/**
 * Listing items are merchant-managed (spec §8.5). Every operation resolves the
 * participation through the merchant membership first
 * (`findParticipationForMerchant`), so a merchant can only ever touch items on
 * their own listing, and only while the listing is editable.
 */

export type ListingItemInput = {
  name: string;
  description?: string | null;
  price?: string | null;
  promoPrice?: string | null;
  currency?: string;
  dietaryTags?: string[];
  isHalal?: boolean;
  availability?: ItemAvailability;
};

function assertEditable(p: MerchantEventParticipation): void {
  if (p.approvalStatus !== "draft" && p.approvalStatus !== "changes_requested") {
    throw new AppError("CONFLICT", {
      message: "Items can't be changed while the listing is under review or approved.",
    });
  }
}

async function requireEditableParticipation(
  ctx: MerchantScopedContext,
  participationId: string,
): Promise<MerchantEventParticipation> {
  const participation = await findParticipationForMerchant(ctx.merchant.id, participationId);
  if (!participation) throw new AppError("NOT_FOUND", { message: "Listing not found." });
  assertEditable(participation);
  return participation;
}

export async function addItem(
  ctx: MerchantScopedContext,
  participationId: string,
  input: ListingItemInput,
): Promise<ListingItem> {
  const participation = await requireEditableParticipation(ctx, participationId);
  const name = input.name.trim();
  if (name.length < 1) throw new AppError("VALIDATION_ERROR", { message: "Give the item a name." });

  const order = await countItemsForParticipation(participationId);
  const item = await insertItem({
    tenantId: participation.tenantId,
    participationId,
    merchantId: ctx.merchant.id,
    eventId: participation.eventId,
    name,
    description: input.description?.trim() || null,
    price: input.price || null,
    promoPrice: input.promoPrice || null,
    currency: input.currency || "MYR",
    dietaryTags: input.dietaryTags ?? [],
    isHalal: input.isHalal ?? false,
    availability: input.availability ?? "available",
    displayOrder: order,
  });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.LISTING_ITEM_CREATED,
    resourceType: "listing_item",
    resourceId: item.id,
    tenantId: ctx.merchant.tenantId,
    after: { name: item.name },
  });
  return item;
}

export async function updateItem(
  ctx: MerchantScopedContext,
  participationId: string,
  itemId: string,
  input: ListingItemInput,
): Promise<ListingItem> {
  await requireEditableParticipation(ctx, participationId);
  const existing = await findItemInParticipation(participationId, itemId);
  if (!existing) throw new AppError("NOT_FOUND", { message: "Item not found." });

  const name = input.name.trim();
  if (name.length < 1) throw new AppError("VALIDATION_ERROR", { message: "Give the item a name." });

  const updated = await updateItemInParticipation(participationId, itemId, {
    name,
    description: input.description?.trim() || null,
    price: input.price || null,
    promoPrice: input.promoPrice || null,
    currency: input.currency || "MYR",
    dietaryTags: input.dietaryTags ?? [],
    isHalal: input.isHalal ?? false,
    availability: input.availability ?? "available",
  });
  if (!updated) throw new AppError("NOT_FOUND", { message: "Item not found." });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.LISTING_ITEM_UPDATED,
    resourceType: "listing_item",
    resourceId: itemId,
    tenantId: ctx.merchant.tenantId,
    after: { name: updated.name },
  });
  return updated;
}

export async function deleteItem(
  ctx: MerchantScopedContext,
  participationId: string,
  itemId: string,
): Promise<void> {
  await requireEditableParticipation(ctx, participationId);
  const removed = await deleteItemInParticipation(participationId, itemId);
  if (!removed) throw new AppError("NOT_FOUND", { message: "Item not found." });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.LISTING_ITEM_DELETED,
    resourceType: "listing_item",
    resourceId: itemId,
    tenantId: ctx.merchant.tenantId,
  });
}
