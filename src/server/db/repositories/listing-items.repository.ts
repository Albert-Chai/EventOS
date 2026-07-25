import { and, asc, count, eq, ne } from "drizzle-orm";

import { db } from "@/server/db";
import { listingItems, type ListingItem, type NewListingItem } from "@/server/db/schema";

/**
 * Listing items (products / menu). Every operation is scoped by
 * `participation_id` — the caller has already authorized that participation
 * (organizer via tenant, merchant via membership), so scoping the items to it is
 * the guard that a merchant can't touch another listing's items.
 */

export async function listItemsForParticipation(participationId: string): Promise<ListingItem[]> {
  return db
    .select()
    .from(listingItems)
    .where(eq(listingItems.participationId, participationId))
    .orderBy(asc(listingItems.displayOrder), asc(listingItems.createdAt));
}

/** Publicly-visible items (anything not explicitly hidden), for the listing page. */
export async function listPublicItemsForParticipation(
  participationId: string,
): Promise<ListingItem[]> {
  return db
    .select()
    .from(listingItems)
    .where(
      and(
        eq(listingItems.participationId, participationId),
        ne(listingItems.availability, "hidden"),
      ),
    )
    .orderBy(asc(listingItems.displayOrder), asc(listingItems.createdAt));
}

export async function findItemInParticipation(
  participationId: string,
  itemId: string,
): Promise<ListingItem | null> {
  const [row] = await db
    .select()
    .from(listingItems)
    .where(and(eq(listingItems.id, itemId), eq(listingItems.participationId, participationId)))
    .limit(1);
  return row ?? null;
}

export async function countItemsForParticipation(participationId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(listingItems)
    .where(eq(listingItems.participationId, participationId));
  return row?.value ?? 0;
}

export async function insertItem(input: NewListingItem): Promise<ListingItem> {
  const [row] = await db.insert(listingItems).values(input).returning();
  return row;
}

export async function updateItemInParticipation(
  participationId: string,
  itemId: string,
  patch: Partial<
    Pick<
      ListingItem,
      | "name"
      | "description"
      | "price"
      | "promoPrice"
      | "currency"
      | "dietaryTags"
      | "isHalal"
      | "availability"
      | "displayOrder"
    >
  >,
): Promise<ListingItem | null> {
  const [row] = await db
    .update(listingItems)
    .set(patch)
    .where(and(eq(listingItems.id, itemId), eq(listingItems.participationId, participationId)))
    .returning();
  return row ?? null;
}

export async function deleteItemInParticipation(
  participationId: string,
  itemId: string,
): Promise<boolean> {
  const [row] = await db
    .delete(listingItems)
    .where(and(eq(listingItems.id, itemId), eq(listingItems.participationId, participationId)))
    .returning({ id: listingItems.id });
  return Boolean(row);
}
