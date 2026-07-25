import { and, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { tenants, type NewTenant, type Tenant } from "@/server/db/schema";

/**
 * Tenants.
 *
 * Platform-level: reads and writes here are gated by `requirePlatformAdmin` in
 * the service layer, not by a tenant predicate — the platform admin operates
 * across tenants by definition. Tenant-scoped reads of a *single* tenant the
 * user belongs to go through `findTenantForMember`.
 */

export async function findTenantById(id: string): Promise<Tenant | null> {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.id, id), isNull(tenants.deletedAt)))
    .limit(1);
  return tenant ?? null;
}

export async function findTenantBySlug(slug: string): Promise<Tenant | null> {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(and(eq(sql`lower(${tenants.slug})`, slug.toLowerCase()), isNull(tenants.deletedAt)))
    .limit(1);
  return tenant ?? null;
}

export async function slugExists(slug: string): Promise<boolean> {
  return (await findTenantBySlug(slug)) !== null;
}

export type TenantListItem = Tenant & { memberCount: number };

export async function listTenants(options?: { search?: string }): Promise<Tenant[]> {
  const search = options?.search?.trim();
  const where = search
    ? and(
        isNull(tenants.deletedAt),
        or(ilike(tenants.name, `%${search}%`), ilike(tenants.slug, `%${search}%`)),
      )
    : isNull(tenants.deletedAt);

  return db.select().from(tenants).where(where).orderBy(desc(tenants.createdAt));
}

export async function countTenants(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(tenants).where(isNull(tenants.deletedAt));
  return row?.value ?? 0;
}

export async function insertTenant(input: NewTenant): Promise<Tenant> {
  const [tenant] = await db
    .insert(tenants)
    .values({ ...input, slug: input.slug.toLowerCase() })
    .returning();
  return tenant;
}

export async function updateTenant(
  id: string,
  patch: Partial<
    Pick<Tenant, "name" | "status" | "contactEmail" | "contactPhone" | "customDomain">
  >,
): Promise<Tenant | null> {
  const [tenant] = await db.update(tenants).set(patch).where(eq(tenants.id, id)).returning();
  return tenant ?? null;
}
