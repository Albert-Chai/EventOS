import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  files,
  merchantCategories,
  merchantEventParticipations,
  merchants,
  visitorRecentViews,
  type NewVisitorRecentView,
} from "@/server/db/schema";
import type { VisitorMerchantCard } from "./visitor-favourites.repository";

/**
 * A visitor's recently-viewed merchants (spec §8.8). `viewed_at` is bumped on a
 * re-view (upsert) so the merchant moves to the top rather than duplicating.
 */

const boothNumberSql = sql<
  string | null
>`(select b.booth_number from booth_assignments ba join booths b on b.id = ba.booth_id where ba.participation_id = ${merchantEventParticipations.id} and ba.status <> 'cancelled' limit 1)`;

/** Records (or refreshes) a view. Idempotent per (visitor, participation). */
export async function upsertRecentView(input: NewVisitorRecentView): Promise<void> {
  await db
    .insert(visitorRecentViews)
    .values(input)
    .onConflictDoUpdate({
      target: [visitorRecentViews.visitorId, visitorRecentViews.participationId],
      set: { viewedAt: new Date() },
    });
}

/** The visitor's recently-viewed merchants for an event, most recent first. */
export async function listRecentViewCards(
  visitorId: string,
  eventId: string,
  limit = 8,
): Promise<VisitorMerchantCard[]> {
  return db
    .select({
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
    })
    .from(visitorRecentViews)
    .innerJoin(
      merchantEventParticipations,
      eq(merchantEventParticipations.id, visitorRecentViews.participationId),
    )
    .innerJoin(merchants, eq(merchants.id, merchantEventParticipations.merchantId))
    .leftJoin(merchantCategories, eq(merchantCategories.id, merchants.categoryId))
    .leftJoin(files, eq(files.id, merchants.logoFileId))
    .where(
      and(
        eq(visitorRecentViews.visitorId, visitorId),
        eq(visitorRecentViews.eventId, eventId),
        eq(merchantEventParticipations.approvalStatus, "approved"),
        eq(merchants.status, "active"),
        isNull(merchants.deletedAt),
      ),
    )
    .orderBy(desc(visitorRecentViews.viewedAt))
    .limit(limit);
}
