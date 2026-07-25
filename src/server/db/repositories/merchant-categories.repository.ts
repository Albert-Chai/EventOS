import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { merchantCategories, type MerchantCategory } from "@/server/db/schema";

/**
 * Per-tenant merchant categories. Tenant-scoped: every predicate leads with
 * `tenant_id` derived from `ctx.tenant.id`.
 */

export async function listCategoriesForTenant(tenantId: string): Promise<MerchantCategory[]> {
  return db
    .select()
    .from(merchantCategories)
    .where(eq(merchantCategories.tenantId, tenantId))
    .orderBy(asc(merchantCategories.sortOrder), asc(merchantCategories.name));
}

export async function findCategoryById(
  tenantId: string,
  id: string,
): Promise<MerchantCategory | null> {
  const [row] = await db
    .select()
    .from(merchantCategories)
    .where(and(eq(merchantCategories.id, id), eq(merchantCategories.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

export async function categorySlugExists(tenantId: string, slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: merchantCategories.id })
    .from(merchantCategories)
    .where(
      and(
        eq(merchantCategories.tenantId, tenantId),
        eq(sql`lower(${merchantCategories.slug})`, slug.toLowerCase()),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function insertCategory(input: {
  tenantId: string;
  name: string;
  slug: string;
  sortOrder?: number;
}): Promise<MerchantCategory> {
  const [row] = await db
    .insert(merchantCategories)
    .values({ ...input, slug: input.slug.toLowerCase() })
    .returning();
  return row;
}
