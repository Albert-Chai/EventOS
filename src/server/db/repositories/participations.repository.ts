import { and, asc, count, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  events,
  merchantCategories,
  merchantEventParticipations,
  merchants,
  tenants,
  type MerchantEventParticipation,
  type NewMerchantEventParticipation,
} from "@/server/db/schema";

/**
 * A merchant's participation in an event — the unit the approval workflow runs
 * on. Reached by the organizer (scoped by `tenant_id`), by the merchant (scoped
 * by `merchant_id` from membership), and publicly (approved only, under a public
 * event).
 */

// --- Organizer (tenant-scoped) --------------------------------------------

export async function findParticipationById(
  tenantId: string,
  id: string,
): Promise<MerchantEventParticipation | null> {
  const [row] = await db
    .select()
    .from(merchantEventParticipations)
    .where(
      and(
        eq(merchantEventParticipations.id, id),
        eq(merchantEventParticipations.tenantId, tenantId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findParticipationByEventMerchant(
  tenantId: string,
  eventId: string,
  merchantId: string,
): Promise<MerchantEventParticipation | null> {
  const [row] = await db
    .select()
    .from(merchantEventParticipations)
    .where(
      and(
        eq(merchantEventParticipations.tenantId, tenantId),
        eq(merchantEventParticipations.eventId, eventId),
        eq(merchantEventParticipations.merchantId, merchantId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type EventParticipationRow = MerchantEventParticipation & {
  merchantName: string;
  merchantSlug: string;
  merchantStatus: string;
};

/** Every merchant participating in an event, for the organizer's review screen. */
export async function listParticipationsForEvent(
  tenantId: string,
  eventId: string,
): Promise<EventParticipationRow[]> {
  return db
    .select({
      ...participationColumns(),
      merchantName: merchants.name,
      merchantSlug: merchants.slug,
      merchantStatus: merchants.status,
    })
    .from(merchantEventParticipations)
    .innerJoin(merchants, eq(merchants.id, merchantEventParticipations.merchantId))
    .where(
      and(
        eq(merchantEventParticipations.tenantId, tenantId),
        eq(merchantEventParticipations.eventId, eventId),
      ),
    )
    .orderBy(asc(merchants.name));
}

export async function insertParticipation(
  input: NewMerchantEventParticipation,
): Promise<MerchantEventParticipation> {
  const [row] = await db.insert(merchantEventParticipations).values(input).returning();
  return row;
}

export async function updateParticipation(
  tenantId: string,
  id: string,
  patch: Partial<
    Pick<
      MerchantEventParticipation,
      | "listingTitle"
      | "listingDescription"
      | "approvalStatus"
      | "submittedAt"
      | "approvedAt"
      | "reviewedBy"
      | "reviewNote"
    >
  >,
): Promise<MerchantEventParticipation | null> {
  const [row] = await db
    .update(merchantEventParticipations)
    .set(patch)
    .where(
      and(
        eq(merchantEventParticipations.id, id),
        eq(merchantEventParticipations.tenantId, tenantId),
      ),
    )
    .returning();
  return row ?? null;
}

// --- Merchant (membership-scoped) -----------------------------------------

export type MerchantParticipationRow = MerchantEventParticipation & {
  eventName: string;
  eventSlug: string;
  eventStatus: string;
  tenantSlug: string;
};

/** Participations for a merchant, with the event context, for the portal. */
export async function listParticipationsForMerchant(
  merchantId: string,
): Promise<MerchantParticipationRow[]> {
  return db
    .select({
      ...participationColumns(),
      eventName: events.name,
      eventSlug: events.slug,
      eventStatus: events.status,
      tenantSlug: tenants.slug,
    })
    .from(merchantEventParticipations)
    .innerJoin(events, eq(events.id, merchantEventParticipations.eventId))
    .innerJoin(tenants, eq(tenants.id, merchantEventParticipations.tenantId))
    .where(and(eq(merchantEventParticipations.merchantId, merchantId), isNull(events.deletedAt)))
    .orderBy(asc(events.startAt));
}

/** One participation, scoped to the merchant that owns it — the merchant seam. */
export async function findParticipationForMerchant(
  merchantId: string,
  id: string,
): Promise<MerchantEventParticipation | null> {
  const [row] = await db
    .select()
    .from(merchantEventParticipations)
    .where(
      and(
        eq(merchantEventParticipations.id, id),
        eq(merchantEventParticipations.merchantId, merchantId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function updateParticipationForMerchant(
  merchantId: string,
  id: string,
  patch: Partial<
    Pick<
      MerchantEventParticipation,
      "listingTitle" | "listingDescription" | "approvalStatus" | "submittedAt"
    >
  >,
): Promise<MerchantEventParticipation | null> {
  const [row] = await db
    .update(merchantEventParticipations)
    .set(patch)
    .where(
      and(
        eq(merchantEventParticipations.id, id),
        eq(merchantEventParticipations.merchantId, merchantId),
      ),
    )
    .returning();
  return row ?? null;
}

// --- Public (anonymous visitor) -------------------------------------------

export type PublicMerchantCard = {
  participationId: string;
  merchantId: string;
  merchantName: string;
  merchantSlug: string;
  listingTitle: string | null;
  listingDescription: string | null;
  categoryName: string | null;
};

/**
 * Approved merchants for a public event page. Filters on `approved` status and a
 * non-suspended merchant — the caller has already resolved the event via
 * `findPublicEvent`, so event visibility is enforced upstream.
 */
export async function listPublicParticipations(eventId: string): Promise<PublicMerchantCard[]> {
  return db
    .select({
      participationId: merchantEventParticipations.id,
      merchantId: merchants.id,
      merchantName: merchants.name,
      merchantSlug: merchants.slug,
      listingTitle: merchantEventParticipations.listingTitle,
      listingDescription: merchantEventParticipations.listingDescription,
      categoryName: merchantCategories.name,
    })
    .from(merchantEventParticipations)
    .innerJoin(merchants, eq(merchants.id, merchantEventParticipations.merchantId))
    .leftJoin(merchantCategories, eq(merchantCategories.id, merchants.categoryId))
    .where(
      and(
        eq(merchantEventParticipations.eventId, eventId),
        eq(merchantEventParticipations.approvalStatus, "approved"),
        eq(merchants.status, "active"),
        isNull(merchants.deletedAt),
      ),
    )
    .orderBy(asc(merchants.name));
}

export type PublicMerchantListing = {
  participationId: string;
  merchant: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    website: string | null;
    logoFileId: string | null;
    coverFileId: string | null;
  };
  listingTitle: string | null;
  listingDescription: string | null;
};

/** A single approved merchant listing under a (already-public) event. */
export async function findPublicParticipationByMerchantSlug(
  eventId: string,
  merchantSlug: string,
): Promise<PublicMerchantListing | null> {
  const [row] = await db
    .select({
      participationId: merchantEventParticipations.id,
      merchantId: merchants.id,
      merchantName: merchants.name,
      merchantSlug: merchants.slug,
      merchantDescription: merchants.description,
      merchantWebsite: merchants.website,
      merchantLogoFileId: merchants.logoFileId,
      merchantCoverFileId: merchants.coverFileId,
      listingTitle: merchantEventParticipations.listingTitle,
      listingDescription: merchantEventParticipations.listingDescription,
    })
    .from(merchantEventParticipations)
    .innerJoin(merchants, eq(merchants.id, merchantEventParticipations.merchantId))
    .where(
      and(
        eq(merchantEventParticipations.eventId, eventId),
        eq(sql`lower(${merchants.slug})`, merchantSlug.toLowerCase()),
        eq(merchantEventParticipations.approvalStatus, "approved"),
        eq(merchants.status, "active"),
        isNull(merchants.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    participationId: row.participationId,
    merchant: {
      id: row.merchantId,
      name: row.merchantName,
      slug: row.merchantSlug,
      description: row.merchantDescription,
      website: row.merchantWebsite,
      logoFileId: row.merchantLogoFileId,
      coverFileId: row.merchantCoverFileId,
    },
    listingTitle: row.listingTitle,
    listingDescription: row.listingDescription,
  };
}

function participationColumns() {
  return {
    id: merchantEventParticipations.id,
    tenantId: merchantEventParticipations.tenantId,
    eventId: merchantEventParticipations.eventId,
    merchantId: merchantEventParticipations.merchantId,
    listingTitle: merchantEventParticipations.listingTitle,
    listingDescription: merchantEventParticipations.listingDescription,
    approvalStatus: merchantEventParticipations.approvalStatus,
    featuredRank: merchantEventParticipations.featuredRank,
    submittedAt: merchantEventParticipations.submittedAt,
    approvedAt: merchantEventParticipations.approvedAt,
    reviewedBy: merchantEventParticipations.reviewedBy,
    reviewNote: merchantEventParticipations.reviewNote,
    createdAt: merchantEventParticipations.createdAt,
    updatedAt: merchantEventParticipations.updatedAt,
  };
}

/** How many merchants are attached to an event — the per-event plan limit (§22). */
export async function countParticipationsForEvent(eventId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(merchantEventParticipations)
    .where(eq(merchantEventParticipations.eventId, eventId));
  return row?.value ?? 0;
}

/** Sets (or clears) a participation's featured rank — the directory boost (§8.7). */
export async function setParticipationFeaturedRank(
  tenantId: string,
  id: string,
  featuredRank: number | null,
): Promise<void> {
  await db
    .update(merchantEventParticipations)
    .set({ featuredRank })
    .where(
      and(
        eq(merchantEventParticipations.id, id),
        eq(merchantEventParticipations.tenantId, tenantId),
      ),
    );
}

/** The busiest event's merchant count for a tenant — the per-event limit's binding value. */
export async function maxParticipationsForTenant(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<string>`coalesce(max(c), 0)` })
    .from(
      db
        .select({ c: sql<number>`count(*)`.as("c") })
        .from(merchantEventParticipations)
        .where(eq(merchantEventParticipations.tenantId, tenantId))
        .groupBy(merchantEventParticipations.eventId)
        .as("per_event"),
    );
  return Number(row?.value ?? 0);
}
