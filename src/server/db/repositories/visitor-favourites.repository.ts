import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  files,
  merchantCategories,
  merchantEventParticipations,
  merchants,
  visitorFavourites,
  type NewVisitorFavourite,
} from "@/server/db/schema";

/**
 * A visitor's saved merchants (spec §8.8). Reads only return currently-public
 * listings (approved + active merchant) — a merchant later unapproved silently
 * drops from the list. The visitor id is derived from the cookie by the service,
 * never a client value.
 */

/** Card shape shared by the directory, favourites, and recent-views surfaces. */
export type VisitorMerchantCard = {
  participationId: string;
  merchantId: string;
  merchantSlug: string;
  merchantName: string;
  listingTitle: string | null;
  listingDescription: string | null;
  categoryName: string | null;
  logoBucket: string | null;
  logoPath: string | null;
  boothNumber: string | null;
};

const boothNumberSql = sql<
  string | null
>`(select b.booth_number from booth_assignments ba join booths b on b.id = ba.booth_id where ba.participation_id = ${merchantEventParticipations.id} and ba.status <> 'cancelled' limit 1)`;

function cardColumns() {
  return {
    participationId: merchantEventParticipations.id,
    merchantId: merchants.id,
    merchantSlug: merchants.slug,
    merchantName: merchants.name,
    listingTitle: merchantEventParticipations.listingTitle,
    listingDescription: merchantEventParticipations.listingDescription,
    categoryName: merchantCategories.name,
    logoBucket: files.bucket,
    logoPath: files.path,
    boothNumber: boothNumberSql,
  };
}

export async function addFavourite(input: NewVisitorFavourite): Promise<boolean> {
  const rows = await db
    .insert(visitorFavourites)
    .values(input)
    .onConflictDoNothing({
      target: [visitorFavourites.visitorId, visitorFavourites.participationId],
    })
    .returning({ id: visitorFavourites.id });
  return rows.length > 0;
}

export async function removeFavourite(
  visitorId: string,
  participationId: string,
): Promise<boolean> {
  const rows = await db
    .delete(visitorFavourites)
    .where(
      and(
        eq(visitorFavourites.visitorId, visitorId),
        eq(visitorFavourites.participationId, participationId),
      ),
    )
    .returning({ id: visitorFavourites.id });
  return rows.length > 0;
}

/** The participation ids a visitor has favourited in an event — to mark cards. */
export async function listFavouriteParticipationIds(
  visitorId: string,
  eventId: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: visitorFavourites.participationId })
    .from(visitorFavourites)
    .where(
      and(eq(visitorFavourites.visitorId, visitorId), eq(visitorFavourites.eventId, eventId)),
    );
  return rows.map((r) => r.id);
}

/** The visitor's favourited merchants for an event, newest first. */
export async function listFavouriteCards(
  visitorId: string,
  eventId: string,
): Promise<VisitorMerchantCard[]> {
  return db
    .select(cardColumns())
    .from(visitorFavourites)
    .innerJoin(
      merchantEventParticipations,
      eq(merchantEventParticipations.id, visitorFavourites.participationId),
    )
    .innerJoin(merchants, eq(merchants.id, merchantEventParticipations.merchantId))
    .leftJoin(merchantCategories, eq(merchantCategories.id, merchants.categoryId))
    .leftJoin(files, eq(files.id, merchants.logoFileId))
    .where(
      and(
        eq(visitorFavourites.visitorId, visitorId),
        eq(visitorFavourites.eventId, eventId),
        eq(merchantEventParticipations.approvalStatus, "approved"),
        eq(merchants.status, "active"),
        isNull(merchants.deletedAt),
      ),
    )
    .orderBy(desc(visitorFavourites.createdAt));
}
