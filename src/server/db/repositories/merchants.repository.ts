import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  merchantCategories,
  merchantMembers,
  merchants,
  type Merchant,
  type NewMerchant,
} from "@/server/db/schema";

/**
 * Merchants.
 *
 * Reached on two axes, each scoped independently (see docs/phase-3-plan.md §3):
 *  - **Organizer** functions take a `tenantId` from `ctx.tenant.id` and lead every
 *    predicate with it.
 *  - **Merchant** functions (`findMerchantForMember`, `listMerchantsForUser`) key
 *    on the authenticated `userId` via `merchant_members` — the one place a
 *    merchant id is *produced* from membership rather than required as input.
 */

// --- Organizer (tenant-scoped) --------------------------------------------

export type MerchantListItem = Merchant & { categoryName: string | null };

export async function listMerchantsForTenant(
  tenantId: string,
  options?: { search?: string },
): Promise<MerchantListItem[]> {
  const search = options?.search?.trim();
  return db
    .select({
      ...merchantColumns(),
      categoryName: merchantCategories.name,
    })
    .from(merchants)
    .leftJoin(merchantCategories, eq(merchantCategories.id, merchants.categoryId))
    .where(
      and(
        eq(merchants.tenantId, tenantId),
        isNull(merchants.deletedAt),
        search
          ? or(ilike(merchants.name, `%${search}%`), ilike(merchants.slug, `%${search}%`))
          : undefined,
      ),
    )
    .orderBy(desc(merchants.createdAt));
}

export async function findMerchantById(tenantId: string, id: string): Promise<Merchant | null> {
  const [row] = await db
    .select()
    .from(merchants)
    .where(and(eq(merchants.id, id), eq(merchants.tenantId, tenantId), isNull(merchants.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function findMerchantBySlug(tenantId: string, slug: string): Promise<Merchant | null> {
  const [row] = await db
    .select()
    .from(merchants)
    .where(
      and(
        eq(merchants.tenantId, tenantId),
        eq(sql`lower(${merchants.slug})`, slug.toLowerCase()),
        isNull(merchants.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function merchantSlugExists(
  tenantId: string,
  slug: string,
  exceptId?: string,
): Promise<boolean> {
  const existing = await findMerchantBySlug(tenantId, slug);
  if (!existing) return false;
  return exceptId ? existing.id !== exceptId : true;
}

export async function insertMerchant(input: NewMerchant): Promise<Merchant> {
  const [row] = await db
    .insert(merchants)
    .values({ ...input, slug: input.slug.toLowerCase() })
    .returning();
  return row;
}

export async function updateMerchant(
  tenantId: string,
  id: string,
  patch: Partial<
    Pick<
      Merchant,
      | "name"
      | "slug"
      | "registrationNumber"
      | "description"
      | "categoryId"
      | "contactName"
      | "contactEmail"
      | "contactPhone"
      | "website"
      | "status"
      | "logoFileId"
      | "coverFileId"
    >
  >,
): Promise<Merchant | null> {
  const [row] = await db
    .update(merchants)
    .set({ ...patch, ...(patch.slug ? { slug: patch.slug.toLowerCase() } : {}) })
    .where(and(eq(merchants.id, id), eq(merchants.tenantId, tenantId), isNull(merchants.deletedAt)))
    .returning();
  return row ?? null;
}

export async function softDeleteMerchant(tenantId: string, id: string): Promise<Merchant | null> {
  const [row] = await db
    .update(merchants)
    .set({ deletedAt: new Date() })
    .where(and(eq(merchants.id, id), eq(merchants.tenantId, tenantId), isNull(merchants.deletedAt)))
    .returning();
  return row ?? null;
}

// --- Merchant (membership-scoped) -----------------------------------------

/** A merchant the given user actively manages, or null. The `merchant_id` seam. */
export async function findMerchantForMember(
  userId: string,
  merchantId: string,
): Promise<Merchant | null> {
  const [row] = await db
    .select({ ...merchantColumns() })
    .from(merchants)
    .innerJoin(merchantMembers, eq(merchantMembers.merchantId, merchants.id))
    .where(
      and(
        eq(merchants.id, merchantId),
        eq(merchantMembers.userId, userId),
        eq(merchantMembers.status, "active"),
        isNull(merchants.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type ManagedMerchant = {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  status: string;
};

/** Every merchant the user actively manages — powers the `/merchant` portal index. */
export async function listMerchantsForUser(userId: string): Promise<ManagedMerchant[]> {
  return db
    .select({
      id: merchants.id,
      tenantId: merchants.tenantId,
      name: merchants.name,
      slug: merchants.slug,
      status: merchants.status,
    })
    .from(merchants)
    .innerJoin(merchantMembers, eq(merchantMembers.merchantId, merchants.id))
    .where(
      and(
        eq(merchantMembers.userId, userId),
        eq(merchantMembers.status, "active"),
        isNull(merchants.deletedAt),
      ),
    )
    .orderBy(asc(merchants.name));
}

// Explicit column list so the membership joins don't return join noise.
function merchantColumns() {
  return {
    id: merchants.id,
    tenantId: merchants.tenantId,
    name: merchants.name,
    slug: merchants.slug,
    registrationNumber: merchants.registrationNumber,
    description: merchants.description,
    categoryId: merchants.categoryId,
    contactName: merchants.contactName,
    contactEmail: merchants.contactEmail,
    contactPhone: merchants.contactPhone,
    website: merchants.website,
    logoFileId: merchants.logoFileId,
    coverFileId: merchants.coverFileId,
    status: merchants.status,
    createdBy: merchants.createdBy,
    createdAt: merchants.createdAt,
    updatedAt: merchants.updatedAt,
    deletedAt: merchants.deletedAt,
  };
}
