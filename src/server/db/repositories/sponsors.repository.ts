import { and, asc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { type NewSponsor, type Sponsor, sponsors } from "@/server/db/schema";

/**
 * Sponsors (advertisers). Every function is tenant-scoped on a `tenantId` the
 * caller derived from `ctx.tenant.id` — never a client value (§1 rule 3).
 */

export async function insertSponsor(input: NewSponsor): Promise<Sponsor> {
  const [row] = await db.insert(sponsors).values(input).returning();
  return row;
}

export async function listSponsors(tenantId: string): Promise<Sponsor[]> {
  return db
    .select()
    .from(sponsors)
    .where(eq(sponsors.tenantId, tenantId))
    .orderBy(asc(sponsors.name));
}

export async function findSponsorById(tenantId: string, id: string): Promise<Sponsor | null> {
  const [row] = await db
    .select()
    .from(sponsors)
    .where(and(eq(sponsors.tenantId, tenantId), eq(sponsors.id, id)))
    .limit(1);
  return row ?? null;
}

export async function updateSponsor(
  tenantId: string,
  id: string,
  patch: Partial<NewSponsor>,
): Promise<Sponsor | null> {
  const [row] = await db
    .update(sponsors)
    .set(patch)
    .where(and(eq(sponsors.tenantId, tenantId), eq(sponsors.id, id)))
    .returning();
  return row ?? null;
}

export async function countSponsors(tenantId: string): Promise<number> {
  const rows = await db.select({ id: sponsors.id }).from(sponsors).where(eq(sponsors.tenantId, tenantId));
  return rows.length;
}
